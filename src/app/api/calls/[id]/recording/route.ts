import { NextResponse } from "next/server";

import { canAccessBusiness, getAccessScope } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { fetchCallRecording } from "@/lib/cartesia/client";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

// Vercel caps a function's response near 4.5 MB and a minute of WAV is about 7.5 MB, so
// the player gets the recording in pieces; browsers ask for the next one as they play.
const PIECE_BYTES = 2 * 1024 * 1024;

/**
 * Streams a call's recording to the business that owns the call, or to staff. With
 * ?download=1 the whole file is sent as an attachment.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: attempt } = await supabase
    .from("call_attempts")
    .select("business_id, attempt_id, interaction_id, created_at")
    .eq("id", (await params).id)
    .maybeSingle();
  // Not found and not yours look the same, so other businesses' call ids cannot be probed.
  if (!attempt || !canAccessBusiness(await getAccessScope(supabase, session), attempt.business_id)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const audio = await fetchCallRecording(attempt.interaction_id ?? attempt.attempt_id).catch(() => null);
  if (!audio) return NextResponse.json({ error: "Recording not available" }, { status: 404 });

  const total = audio.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  if (new URL(request.url).searchParams.get("download")) {
    const day = attempt.created_at.slice(0, 10);
    return new NextResponse(new Blob([audio]).stream(), {
      headers: { ...headers, "Content-Length": String(total), "Content-Disposition": `attachment; filename="call-${day}.wav"` },
    });
  }

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  const start = range?.[1] ? Number(range[1]) : 0;
  if (start >= total) {
    return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
  }
  const askedEnd = range?.[2] ? Number(range[2]) : total - 1;
  const end = Math.min(askedEnd, start + PIECE_BYTES - 1, total - 1);

  return new NextResponse(audio.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${total}` },
  });
}

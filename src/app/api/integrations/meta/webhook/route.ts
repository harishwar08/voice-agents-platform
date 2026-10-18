import { after, NextResponse } from "next/server";

import { getMetaConfig, signatureMatches } from "@/lib/meta/graph";
import { processLeadgen, type LeadgenChange } from "@/lib/meta/process-lead";
import { createAdminClient } from "@/lib/supabase/admin";

/** Meta calls this once when the webhook is set up, to prove we own the URL. */
export async function GET(request: Request) {
  const config = getMetaConfig();
  const params = new URL(request.url).searchParams;

  if (
    config &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === config.verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type WebhookBody = {
  object?: string;
  entry?: Array<{ changes?: Array<{ field?: string; value?: LeadgenChange }> }>;
};

export async function POST(request: Request) {
  const config = getMetaConfig();
  if (!config) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  // The signature covers the exact bytes, so read raw text before parsing.
  const raw = await request.text();
  if (!signatureMatches(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changes = (body.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === "leadgen" && change.value)
    .map((change) => change.value!);

  const supabase = createAdminClient();
  if (changes.length && supabase) {
    // Meta retries anything not acknowledged quickly, so fetch and call after replying.
    after(async () => {
      for (const change of changes) {
        try {
          await processLeadgen(supabase, config, change);
        } catch (err) {
          console.error("[Meta leads] Failed to process", change.leadgen_id, err);
        }
      }
    });
  }

  return NextResponse.json({ received: true });
}

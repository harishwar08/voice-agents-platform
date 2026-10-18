import { NextResponse } from "next/server";

import { canManageBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { formatE164PhoneNumber } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

/** Blocks a number from every current and future campaign of the owner's business. */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const businessId = primaryBusinessId(await getAccessScope(supabase, session));
  if (!businessId || !(await canManageBusiness(supabase, session, businessId))) {
    return NextResponse.json({ error: "Only the business owner can change this." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const phone = formatE164PhoneNumber(String(body?.phone ?? ""));
  if (!/^\+\d{8,15}$/.test(phone)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  await supabase.from("do_not_call").upsert(
    { business_id: businessId, phone, reason: typeof body?.reason === "string" ? body.reason.slice(0, 200) : null },
    { onConflict: "business_id,phone" }
  );
  // Pull it from queues right away; a call already ringing is left to finish.
  await supabase
    .from("campaign_contacts")
    .update({ status: "do_not_call" })
    .eq("business_id", businessId)
    .eq("phone", phone)
    .eq("status", "queued");

  return NextResponse.json({ blocked: phone });
}

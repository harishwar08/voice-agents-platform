import { NextResponse } from "next/server";

import { canManageBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { checkContacts, MAX_CONTACTS, type ContactInput } from "@/lib/campaigns/contacts";
import { readCallingSettings, SHORT_RETRIES_OFF } from "@/lib/campaigns/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const businessId = primaryBusinessId(await getAccessScope(supabase, session));
  if (!businessId || !(await canManageBusiness(supabase, session, businessId))) {
    return NextResponse.json({ error: "Only the business owner can create campaigns." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "Give the campaign a name." }, { status: 400 });

  const calling = readCallingSettings(body);
  if ("error" in calling) return NextResponse.json({ error: calling.error }, { status: 400 });

  const raw: ContactInput[] = Array.isArray(body?.contacts) ? body.contacts.slice(0, MAX_CONTACTS + 1) : [];
  if (raw.length > MAX_CONTACTS) {
    return NextResponse.json({ error: `Upload up to ${MAX_CONTACTS} contacts per campaign.` }, { status: 400 });
  }
  const { valid } = checkContacts(
    raw.map((c) => ({ name: String(c?.name ?? ""), phone: String(c?.phone ?? ""), notes: c?.notes ? String(c.notes) : undefined }))
  );
  if (!valid.length) return NextResponse.json({ error: "No valid phone numbers in the list." }, { status: 400 });

  const { data: blocked } = await supabase
    .from("do_not_call")
    .select("phone")
    .eq("business_id", businessId)
    .in("phone", valid.map((c) => c.phone));
  const blockedPhones = new Set((blocked ?? []).map((row) => row.phone));

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      business_id: businessId,
      name,
      ...calling.settings,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error?.code === "23514" && calling.settings.retry_after_minutes < 15) {
    return NextResponse.json({ error: SHORT_RETRIES_OFF }, { status: 400 });
  }
  if (error || !campaign) return NextResponse.json({ error: "Could not create the campaign." }, { status: 500 });

  // Rows from one insert would all share now(), leaving the calling order (next_attempt_at)
  // and the listed order (created_at) to chance; a millisecond apart keeps the owner's order.
  const start = Date.now();
  const rows = valid.map((c, i) => {
    const at = new Date(start + i).toISOString();
    return {
      campaign_id: campaign.id,
      business_id: businessId,
      name: c.name,
      phone: c.phone,
      notes: c.notes ?? null,
      status: blockedPhones.has(c.phone) ? ("do_not_call" as const) : ("queued" as const),
      created_at: at,
      next_attempt_at: at,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase.from("campaign_contacts").insert(rows.slice(i, i + 500));
    if (insertError) {
      await supabase.from("campaigns").delete().eq("id", campaign.id);
      return NextResponse.json({ error: "Could not save the contacts." }, { status: 500 });
    }
  }

  return NextResponse.json(
    { id: campaign.id, contacts: rows.length, doNotCall: blockedPhones.size },
    { status: 201 }
  );
}

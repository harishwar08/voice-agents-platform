import { NextResponse } from "next/server";

import { canAccessBusiness, getAccessScope } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

/**
 * Every call to one campaign contact, oldest first, with summary, transcript and call
 * details. The campaign page loads this when the owner opens a contact, so the list
 * itself never carries transcripts.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { id, contactId } = await params;
  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select("business_id, lead_id")
    .eq("id", contactId)
    .eq("campaign_id", id)
    .maybeSingle();
  // Not found and not yours look the same, so other businesses' ids cannot be probed.
  if (!contact || !canAccessBusiness(await getAccessScope(supabase, session), contact.business_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!contact.lead_id) return NextResponse.json({ calls: [] });

  const { data: calls, error } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("lead_id", contact.lead_id)
    .order("created_at");
  if (error) return NextResponse.json({ error: "Could not load the calls." }, { status: 500 });

  return NextResponse.json({ calls: calls ?? [] });
}

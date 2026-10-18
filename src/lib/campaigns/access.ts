import { canManageBusiness } from "@/lib/auth/access";
import type { SessionContext } from "@/lib/auth/session";
import type { Campaign } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/** Returns the campaign only if the caller may manage it; otherwise null, so ids cannot be probed. */
export async function loadManageableCampaign(session: SessionContext, id: string) {
  const supabase = createAdminClient();
  if (!supabase) return { supabase: null, campaign: null };

  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle<Campaign>();
  if (!campaign || !(await canManageBusiness(supabase, session, campaign.business_id))) {
    return { supabase, campaign: null };
  }
  return { supabase, campaign };
}

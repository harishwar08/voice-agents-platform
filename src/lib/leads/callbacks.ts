import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { placeCallForLead } from "@/lib/leads/create-lead";

type AdminClient = SupabaseClient<Database>;

// Calls placed per scheduler run; the rest wait for the next minute.
const BATCH = 10;
// A callback this late (the scheduler was down, say) is no longer what the customer asked for.
const STALE_MS = 24 * 60 * 60 * 1000;

type DueLead = {
  id: string;
  business_id: string;
  ai_employee_id: string | null;
  name: string;
  phone: string;
  enquiry: string | null;
  callback_at: string;
  businesses: { timezone: string | null } | null;
};

/**
 * Calls every lead whose requested callback time has come, from the scheduler
 * (/api/campaigns/tick). Each lead is claimed first, so two runs at once never call
 * the same person twice. A callback the customer asks for on that call is scheduled
 * again by the call's result, as on any other call.
 */
export async function runDueCallbacks(supabase: AdminClient, now = new Date()) {
  const { data, error } = await supabase
    .from("leads")
    .select("id, business_id, ai_employee_id, name, phone, enquiry, callback_at, businesses(timezone)")
    .eq("callback_status", "scheduled")
    .lte("callback_at", now.toISOString())
    .order("callback_at", { ascending: true })
    .limit(BATCH);
  // Before the phase 21 migration there is nothing to call back.
  if (error) return [];

  const results: { leadId: string; ok: boolean; error?: string }[] = [];
  for (const lead of (data ?? []) as unknown as DueLead[]) {
    const { data: claimed } = await supabase
      .from("leads")
      .update({ callback_status: "calling" })
      .eq("id", lead.id)
      .eq("callback_status", "scheduled")
      .select("id");
    if (!claimed?.length) continue;

    if (now.getTime() - Date.parse(lead.callback_at) > STALE_MS) {
      await supabase.from("leads").update({ callback_status: "failed" }).eq("id", lead.id);
      results.push({ leadId: lead.id, ok: false, error: "Callback time passed more than a day ago" });
      continue;
    }

    const asked = new Date(lead.callback_at).toLocaleString("en-IN", {
      timeZone: lead.businesses?.timezone || "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    const placed = await placeCallForLead(supabase, {
      leadId: lead.id,
      businessId: lead.business_id,
      aiEmployeeId: lead.ai_employee_id,
      name: lead.name,
      phone: lead.phone,
      enquiry: lead.enquiry,
      callContext: `This is the callback the customer asked for at ${asked}. Say you are calling back as promised, then continue from where the last call left off.`,
    });

    // Only from "calling": the new call's result may already have scheduled another callback.
    await supabase
      .from("leads")
      .update({ callback_status: placed.ok ? "done" : "failed" })
      .eq("id", lead.id)
      .eq("callback_status", "calling");
    results.push({ leadId: lead.id, ok: placed.ok, ...(placed.ok ? {} : { error: placed.error }) });
  }
  return results;
}

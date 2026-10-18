import type { SupabaseClient } from "@supabase/supabase-js";

import { canPlaceCall } from "@/lib/billing/credits";
import type { Database } from "@/lib/database.types";
import type { Attribution } from "@/lib/leads/attribution";
import { recordCallFailure } from "@/lib/voice/call-failures";
import { dispatchLeadCall } from "@/lib/voice/dispatch-lead-call";

type AdminClient = SupabaseClient<Database>;

export type NewLead = {
  businessId: string;
  /** Untrusted when it comes from a browser; only used if it belongs to the business. */
  aiEmployeeId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  enquiry?: string | null;
  source: string;
  utm: Attribution;
  ipHash?: string | null;
  /** Platform id (e.g. a Meta leadgen id) so a redelivered lead is not called twice. */
  externalId?: string | null;
};

export type CreateLeadResult =
  | { ok: true; leadId: string; called: boolean; duplicate?: false }
  | { ok: true; leadId: string; called: false; duplicate: true }
  | { ok: false; error: string };

/** The employee that answers for a business: the requested one if it is theirs, else their first. */
export async function resolveEmployeeId(
  supabase: AdminClient,
  businessId: string,
  requested?: string | null
): Promise<string | null> {
  if (requested) {
    const { data } = await supabase
      .from("ai_employees")
      .select("id")
      .eq("id", requested)
      .eq("business_id", businessId)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data } = await supabase
    .from("ai_employees")
    .select("id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The one path every lead takes — hosted form, client site or Meta lead ad —
 * so saving, calling and status tracking can never drift between sources.
 * Callers validate and throttle first; this assumes the input is clean.
 */
export async function createLeadAndCall(
  supabase: AdminClient,
  input: NewLead
): Promise<CreateLeadResult> {
  if (input.externalId) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("business_id", input.businessId)
      .eq("external_id", input.externalId)
      .maybeSingle();
    if (existing) return { ok: true, leadId: existing.id, called: false, duplicate: true };
  }

  const aiEmployeeId = await resolveEmployeeId(supabase, input.businessId, input.aiEmployeeId);

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      business_id: input.businessId,
      ai_employee_id: aiEmployeeId,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      enquiry: input.enquiry ?? null,
      source: input.source,
      utm: input.utm,
      ip_hash: input.ipHash ?? null,
      external_id: input.externalId ?? null,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError || !lead) {
    // A concurrent redelivery can win the race to the unique index; treat it as the duplicate it is.
    if (insertError?.code === "23505" && input.externalId) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("business_id", input.businessId)
        .eq("external_id", input.externalId)
        .maybeSingle();
      if (existing) return { ok: true, leadId: existing.id, called: false, duplicate: true };
    }
    return { ok: false, error: "Could not record the lead." };
  }

  const called = await placeCallForLead(supabase, {
    leadId: lead.id,
    businessId: input.businessId,
    aiEmployeeId,
    name: input.name,
    phone: input.phone,
    enquiry: input.enquiry,
  });
  return { ok: true, leadId: lead.id, called: called.ok };
}

export type CallTarget = {
  leadId: string;
  businessId: string;
  aiEmployeeId: string | null;
  name: string;
  phone: string;
  enquiry?: string | null;
  /** Why this call, passed to the agent; set for callbacks. */
  callContext?: string;
};

/**
 * Dials an already-saved lead and records the attempt. Campaign retries come
 * straight here so a second try adds a call to the same lead, not a new lead.
 */
export async function placeCallForLead(
  supabase: AdminClient,
  target: CallTarget
): Promise<{ ok: true; attemptId: string } | { ok: false; error: string }> {
  const failed = async (error: string) => {
    // Callers don't surface this (the hosted form only says whether a call was placed), so
    // log it and record it for the staff alerts in /admin.
    console.error("[Lead call] Could not call lead", target.leadId, error);
    await recordCallFailure(supabase, {
      businessId: target.businessId,
      aiEmployeeId: target.aiEmployeeId,
      leadId: target.leadId,
      error,
    });
    return { ok: false as const, error };
  };

  // Out of credit is not the lead's fault: leave it "new" so the owner can still call by hand.
  const allowed = await canPlaceCall(supabase, target.businessId);
  if (!allowed.ok) return failed(allowed.error);

  const result = await dispatchLeadCall({
    aiEmployeeId: target.aiEmployeeId,
    customerName: target.name,
    phoneNumber: target.phone,
    reason: target.enquiry ?? undefined,
    leadId: target.leadId,
    callContext: target.callContext,
  });

  if (!result.success || !result.attemptId) {
    // No call was placed (e.g. the voice account is out of balance), so the lead keeps its status:
    // "unreachable" would tell the owner the customer did not answer. They can still call by hand.
    return failed(result.success ? "No call id returned" : result.error);
  }

  await supabase.from("call_attempts").insert({
    lead_id: target.leadId,
    business_id: target.businessId,
    attempt_id: result.attemptId,
    status: "dispatched",
  });
  await supabase.from("leads").update({ status: "calling" }).eq("id", target.leadId);
  return { ok: true, attemptId: result.attemptId };
}

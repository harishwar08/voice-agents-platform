import type { SupabaseClient } from "@supabase/supabase-js";

import { OUT_OF_CREDITS } from "@/lib/billing/credits";
import type { CallFailure, Database } from "@/lib/database.types";

export type CallFailureReason = CallFailure["reason"];

/** What each reason means for staff, and what fixes it. */
export const CALL_FAILURE_INFO: Record<CallFailureReason, { label: string; action: string }> = {
  no_credits: {
    label: "Client is out of call credits",
    action: "Top up this client's credits under Manage call credits.",
  },
  no_balance: {
    label: "Cartesia account is out of credits",
    action: "Add credits in Cartesia (play.cartesia.ai, Billing). Every client's calls stop until then.",
  },
  agent: {
    label: "Problem with the Cartesia agent",
    action: "Check that CARTESIA_AGENT_ID names a live agent in play.cartesia.ai.",
  },
  number: {
    label: "Number or connection rejected",
    action:
      "Check that CARTESIA_FROM_NUMBER_ID is a phone number on the Cartesia account that can call this country, and that the customer's number is valid.",
  },
  auth: {
    label: "Cartesia rejected our API key",
    action: "Check CARTESIA_API_KEY in Vercel's environment settings (a new key from play.cartesia.ai, API Keys).",
  },
  settings: {
    label: "Voice calling is not fully set up",
    action:
      "Fill in the CARTESIA_ setting named in the message, in Vercel's environment settings (or .env.local locally), then redeploy.",
  },
  network: {
    label: "Could not reach Cartesia",
    action: "Usually brief. If it keeps happening, check status.cartesia.ai.",
  },
  other: {
    label: "Cartesia refused the call",
    action: "Read Cartesia's message below for the cause.",
  },
};

/**
 * Sorts an error from placing a call into a reason staff can act on. The messages come
 * from our credit check, our Cartesia client's own setting checks, or Cartesia's API
 * (which our client prefixes with "Cartesia API error").
 */
export function classifyCallError(message: string): CallFailureReason {
  if (message === OUT_OF_CREDITS) return "no_credits";
  if (/CARTESIA_[A-Z_]+ is not set/.test(message)) return "settings";
  if (/\(402\)|insufficient|credits|balance|quota/i.test(message)) return "no_balance";
  if (/\((401|403)\)|api key|unauthori[sz]ed|forbidden/i.test(message)) return "auth";
  if (/agent/i.test(message)) return "agent";
  if (/number|phone|e\.164|destination|concurrency/i.test(message)) return "number";
  if (/could not reach|fetch failed|timed? ?out|ECONN|ENOTFOUND/i.test(message)) return "network";
  return "other";
}

/**
 * Records a call that never went out. Never throws: a missing table (before the phase 16
 * migration) or a failed insert must not turn one failure into two.
 */
export async function recordCallFailure(
  supabase: SupabaseClient<Database>,
  failure: { businessId: string; aiEmployeeId: string | null; leadId: string | null; error: string }
): Promise<void> {
  try {
    const { error } = await supabase.from("call_failures").insert({
      business_id: failure.businessId,
      ai_employee_id: failure.aiEmployeeId,
      lead_id: failure.leadId,
      reason: classifyCallError(failure.error),
      message: failure.error.slice(0, 2000),
    });
    if (error) console.warn("[Call failures] Could not record:", error.message);
  } catch (err) {
    console.warn("[Call failures] Could not record:", (err as Error).message);
  }
}

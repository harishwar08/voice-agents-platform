import { GENERIC_ENQUIRY } from "@/lib/voice/agent-settings";
import type { CallBrief } from "@/lib/voice/dispatch-lead-call";

export const CARTESIA_API = "https://api.cartesia.ai";
const CARTESIA_VERSION = "2026-08-14";

/** The dynamic variable that carries our lead id, so the webhook can find a call by it. */
export const LEAD_ID_VARIABLE = "platform_lead_id";

/** The headers every Cartesia API request needs. Throws when the key is not set. */
export function cartesiaHeaders(): Record<string, string> {
  return {
    "X-API-Key": requireSetting("CARTESIA_API_KEY"),
    "Cartesia-Version": CARTESIA_VERSION,
    "Content-Type": "application/json",
  };
}

function requireSetting(name: string): string {
  const value = process.env[name]?.trim();
  // classifyCallError reads "<NAME> is not set" as a settings problem.
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * The values a Cartesia agent can use as {{name}} in its instructions and greeting.
 * The agent is trained in Cartesia's console; a call only sends this lead's details and
 * the knowledge base, which reaches the agent only if its instructions include
 * {{business_description}}. Empty values are left out so they never blank a default.
 */
export function toCartesiaVariables(brief: CallBrief, leadId?: string, callContext?: string): Record<string, string> {
  const v = brief.values;
  const vars: Record<string, string> = {
    name: v.lead_name,
    customer_name: v.lead_name,
    lead_name: v.lead_name,
    lead_phone: v.lead_phone,
    lead_enquiry: v.lead_enquiry,
    interested_in: v.lead_enquiry === GENERIC_ENQUIRY ? "" : v.lead_enquiry,
    business_name: v.business_name,
    business_type: v.business_type,
    business_description: brief.knowledge,
    // Why this call, e.g. the callback the customer asked for; usable as {{call_context}}.
    call_context: callContext ?? "",
    [LEAD_ID_VARIABLE]: leadId ?? "",
  };
  return Object.fromEntries(Object.entries(vars).filter(([, value]) => value?.trim()));
}

/**
 * Places one outbound call. Uses CARTESIA_AGENT_ID unless an agent is given, and calls
 * from CARTESIA_FROM_NUMBER_ID. The returned call id comes back on the webhook.
 */
export async function placeCartesiaCall(call: {
  toNumber: string;
  variables: Record<string, string>;
  agentId?: string;
}): Promise<{ success: true; callId: string } | { success: false; error: string }> {
  let headers: Record<string, string>;
  let agentId: string;
  let fromNumberId: string;
  try {
    headers = cartesiaHeaders();
    agentId = call.agentId || requireSetting("CARTESIA_AGENT_ID");
    fromNumberId = requireSetting("CARTESIA_FROM_NUMBER_ID");
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  let res: Response;
  try {
    res = await fetch(`${CARTESIA_API}/agents/calls`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agent_id: agentId,
        from_number_id: fromNumberId,
        outbound_calls: [{ to_number: call.toNumber, dynamic_variables: call.variables }],
      }),
    });
  } catch (err) {
    return { success: false, error: `Could not reach Cartesia: ${(err as Error).message}` };
  }

  const body = (await res.json().catch(() => null)) as {
    message?: string;
    title?: string;
    calls?: { agent_call_id?: string; error?: unknown }[];
  } | null;
  if (!res.ok) {
    return { success: false, error: `Cartesia API error (${res.status}): ${body?.message || body?.title || res.statusText}` };
  }

  // Each destination succeeds or fails on its own; we send one.
  const placed = body?.calls?.[0];
  if (placed?.agent_call_id) return { success: true, callId: placed.agent_call_id };
  const reason = typeof placed?.error === "string" ? placed.error : JSON.stringify(placed?.error ?? body);
  return { success: false, error: `Cartesia API error: ${reason.slice(0, 500)}` };
}

/**
 * A call's recording as WAV bytes, or null when Cartesia has none. Cartesia always sends
 * the whole file (it ignores Range), so a few recent ones are kept in memory: the player
 * asks for a recording piece by piece, and each piece would otherwise download it again.
 */
export async function fetchCallRecording(callId: string): Promise<ArrayBuffer | null> {
  const cached = recordingCache.get(callId);
  if (cached) return cached;

  const res = await fetch(`${CARTESIA_API}/agents/calls/${encodeURIComponent(callId)}/audio`, {
    headers: cartesiaHeaders(),
  });
  if (!res.ok) return null;
  const audio = await res.arrayBuffer();

  recordingCache.set(callId, audio);
  if (recordingCache.size > RECORDINGS_KEPT) recordingCache.delete(recordingCache.keys().next().value!);
  return audio;
}

const RECORDINGS_KEPT = 4;
const recordingCache = new Map<string, ArrayBuffer>();


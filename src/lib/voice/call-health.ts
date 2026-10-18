import type { SupabaseClient } from "@supabase/supabase-js";

import type { CallAttempt, CallFailure, Database } from "@/lib/database.types";
import { CALL_FAILURE_INFO } from "@/lib/voice/call-failures";

type AdminClient = SupabaseClient<Database>;

export type CallProblem = {
  id: string;
  at: string;
  businessId: string;
  businessName: string;
  leadName: string | null;
  leadPhone: string | null;
  // "refused": the call never went out. "not_connected": the provider placed it but it failed to connect.
  kind: "refused" | "not_connected";
  label: string;
  action: string;
  message: string;
};

export type CallHealth = {
  // False until the phase 16 migration creates call_failures.
  ready: boolean;
  problems: CallProblem[];
  // Clients whose calls are failing right now: their latest call never went out, or their
  // last few all failed to connect. A call that goes through again clears them.
  failing: CallProblem[];
};

const DAY = 24 * 60 * 60 * 1000;
// One unconnected call is usually the customer's phone; this many in a row points at our setup.
const NOT_CONNECTED_STREAK = 3;

const NOT_CONNECTED = {
  label: "Placed, but did not connect",
  action:
    "One of these is usually the customer's phone (switched off or out of range). If every call does this, check the calling number in the voice provider's console.",
};

/** Everything the staff call alerts show: recent problems and who is failing now. */
export async function loadCallHealth(supabase: AdminClient): Promise<CallHealth> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY).toISOString();

  const [failuresRes, { data: attempts }, { data: businesses }] = await Promise.all([
    supabase.from("call_failures").select("*").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(100),
    // "*" so the page still loads before the phase 16 column exists.
    supabase.from("call_attempts").select("*").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(500),
    supabase.from("businesses").select("id, name"),
  ]);

  const failures: CallFailure[] = failuresRes.error ? [] : (failuresRes.data ?? []);
  const recent: CallAttempt[] = attempts ?? [];
  const nameOf = new Map((businesses ?? []).map((b) => [b.id, b.name]));

  const leadIds = [
    ...new Set([...failures.map((f) => f.lead_id), ...recent.filter((a) => a.status === "failed").map((a) => a.lead_id)]),
  ].filter((id): id is string => Boolean(id));
  const { data: leads } = leadIds.length
    ? await supabase.from("leads").select("id, name, phone").in("id", leadIds)
    : { data: [] };
  const leadOf = new Map((leads ?? []).map((l) => [l.id, l]));

  const base = (businessId: string, leadId: string | null) => ({
    businessId,
    businessName: nameOf.get(businessId) ?? "Unknown client",
    leadName: (leadId && leadOf.get(leadId)?.name) || null,
    leadPhone: (leadId && leadOf.get(leadId)?.phone) || null,
  });

  const problems: CallProblem[] = [
    ...failures.map((f) => ({
      id: f.id,
      at: f.created_at,
      ...base(f.business_id, f.lead_id),
      kind: "refused" as const,
      ...(CALL_FAILURE_INFO[f.reason] ?? CALL_FAILURE_INFO.other),
      message: f.message,
    })),
    ...recent
      .filter((a) => a.status === "failed")
      .map((a) => ({
        id: a.id,
        at: a.created_at,
        ...base(a.business_id, a.lead_id),
        kind: "not_connected" as const,
        ...NOT_CONNECTED,
        message: a.failure_reason || "The voice provider gave no reason.",
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const failing: CallProblem[] = [];
  for (const businessId of new Set([...problems.map((p) => p.businessId), ...recent.map((a) => a.business_id)])) {
    const placed = recent.filter((a) => a.business_id === businessId); // newest first
    const refused = problems.find((p) => p.businessId === businessId && p.kind === "refused");
    const lastPlaced = placed[0];

    const latestRefusalIsNewest = refused && (!lastPlaced || refused.at > lastPlaced.created_at);
    const streak = placed.slice(0, NOT_CONNECTED_STREAK);
    const failingToConnect = streak.length === NOT_CONNECTED_STREAK && streak.every((a) => a.status === "failed");
    if (latestRefusalIsNewest && now - Date.parse(refused.at) < DAY) {
      failing.push(refused);
    } else if (failingToConnect && now - Date.parse(streak[0].created_at) < DAY) {
      failing.push(problems.find((p) => p.id === streak[0].id)!);
    }
  }

  return { ready: !failuresRes.error, problems: problems.slice(0, 40), failing };
}

import type { CallAttempt } from "@/lib/database.types";

/** Where a lead stands after its calls, one answer per lead, for badges, filters and counts. */
export type LeadResult =
  | "interested"
  | "not_interested"
  | "callback"
  | "wrong_number"
  | "unclear"
  | "calling"
  | "not_reached"
  | "not_called";

type CallLike = Pick<CallAttempt, "status" | "outcome" | "created_at">;

/** In the order owners act on them: the filters and the source table follow it. */
export const LEAD_RESULTS: { value: LeadResult; label: string; badge: string }[] = [
  { value: "interested", label: "Interested", badge: "bg-accent text-white" },
  { value: "not_interested", label: "Not interested", badge: "bg-danger/10 text-danger" },
  { value: "callback", label: "Wants a callback", badge: "bg-amber-100 text-amber-900" },
  { value: "unclear", label: "Unclear", badge: "bg-border/50 text-foreground" },
  { value: "wrong_number", label: "Wrong number", badge: "bg-border/50 text-muted" },
  { value: "not_reached", label: "Not reached", badge: "bg-border/50 text-muted" },
  { value: "calling", label: "Calling now", badge: "bg-accent-soft text-accent" },
  { value: "not_called", label: "Not called yet", badge: "border border-border text-muted" },
];

export const LEAD_RESULT = Object.fromEntries(LEAD_RESULTS.map((r) => [r.value, r])) as Record<
  LeadResult,
  (typeof LEAD_RESULTS)[number]
>;

/**
 * A lead who said yes on any call counts as interested, as in every count on the
 * dashboard. Otherwise the latest picked-up call decides, so "call me later" followed
 * by "not interested" reads as not interested. Without a picked-up call, the lead is
 * being called, was not reached, or has not been called yet.
 */
export function leadResult(calls: CallLike[] | null | undefined): LeadResult {
  if (!calls?.length) return "not_called";
  if (calls.some((c) => c.outcome === "interested")) return "interested";

  const latest = calls
    .filter((c) => c.status === "connected")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest) {
    if (latest.outcome === "not_interested") return "not_interested";
    if (latest.outcome === "callback_requested") return "callback";
    if (latest.outcome === "wrong_number") return "wrong_number";
    return "unclear";
  }
  return calls.some((c) => c.status === "dispatched") ? "calling" : "not_reached";
}

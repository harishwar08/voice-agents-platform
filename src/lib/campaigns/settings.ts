import type { Campaign } from "@/lib/database.types";

/** When a campaign calls, how many at once, and how it retries: what owners set and change. */
export type CallingSettingsRow = Pick<Campaign, "window_start" | "window_end" | "max_concurrent" | "max_attempts" | "retry_after_minutes">;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A database without phase 23 still refuses retries under 15 minutes (check violation 23514). */
export const SHORT_RETRIES_OFF = "Retries under 15 minutes aren't switched on yet. Pick 30 minutes or more for now.";

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * The calling settings in a create or edit request, with the defaults for anything left
 * out. Hours must sit inside TRAI's telemarketing hours; the database enforces the same.
 */
export function readCallingSettings(body: Record<string, unknown> | null): { settings: CallingSettingsRow } | { error: string } {
  const start = String(body?.windowStart ?? "");
  const end = String(body?.windowEnd ?? "");
  const windowStart = TIME.test(start) ? start : "10:00";
  const windowEnd = TIME.test(end) ? end : "19:00";
  if (windowStart < "09:00" || windowEnd > "21:00" || windowEnd <= windowStart) {
    return { error: "Calling hours must be between 09:00 and 21:00, with the end after the start." };
  }
  return {
    settings: {
      window_start: windowStart,
      window_end: windowEnd,
      max_concurrent: intIn(body?.maxConcurrent, 1, 20, 3),
      max_attempts: intIn(body?.maxAttempts, 1, 5, 2),
      retry_after_minutes: intIn(body?.retryAfterMinutes, 5, 1440, 120),
    },
  };
}

/**
 * What a voice provider reports about a call beyond its transcript, in our own terms,
 * stored on call_attempts.call_details (phase 20). Each provider's webhook mapping fills it.
 */
export type CallDetails = {
  /** The provider's machine-readable reason, e.g. "client_hangup". */
  endReason: string | null;
  errorMessage: string | null;
  channel: "web" | "phone" | null;
  from: string | null;
  to: string | null;
  /** Average time from the caller finishing to the agent's voice starting, in milliseconds. */
  avgResponseMs: number | null;
  turns: number;
  interruptions: number;
  /** Whether the provider keeps a recording we can stream. */
  hasRecording: boolean;
};

const END_REASONS: Record<string, string> = {
  client_hangup: "Customer hung up",
  agent_hangup: "Agent ended the call",
  client_disconnected: "Customer disconnected",
  client_inactivity: "Timed out: no audio from the customer",
  call_inactivity: "Timed out: nobody spoke",
  max_duration: "Reached the maximum call length",
  voicemail_detected: "Went to voicemail",
  dial_no_answer: "No answer",
  dial_busy: "Line busy",
  dial_timeout: "Rang out",
  dial_failed: "Could not connect",
  api_cancelled: "Cancelled",
  concurrency_limit: "Too many calls at once",
  agent_error: "Agent error",
  network_error: "Network error",
  config_error: "Agent setup error",
  error: "Error",
};

/** A short, plain explanation of why the call ended. */
export function endReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return END_REASONS[reason] ?? reason.replace(/_/g, " ");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

/** The stored details, or null when there are none (calls saved before phase 20). */
export function sanitizeCallDetails(value: unknown): CallDetails | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const avg = raw.avgResponseMs;
  return {
    endReason: text(raw.endReason),
    errorMessage: text(raw.errorMessage),
    channel: raw.channel === "web" || raw.channel === "phone" ? raw.channel : null,
    from: text(raw.from),
    to: text(raw.to),
    avgResponseMs: typeof avg === "number" && Number.isFinite(avg) && avg >= 0 ? Math.round(avg) : null,
    turns: count(raw.turns),
    interruptions: count(raw.interruptions),
    hasRecording: raw.hasRecording === true,
  };
}

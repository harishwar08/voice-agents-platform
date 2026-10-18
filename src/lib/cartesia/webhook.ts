import { timingSafeEqual } from "crypto";

import type { CallTranscriptTurn } from "@/lib/database.types";
import type { CallDetails } from "@/lib/voice/call-details";
import type { CallResult } from "@/lib/voice/call-result";

/**
 * Whether a request from Cartesia carries our secret: the webhook sends it in
 * x-webhook-secret, and the knowledge tool is set up to send the same header.
 * With no secret configured, nothing is accepted.
 */
export function hasCartesiaSecret(request: Request): boolean {
  const expected = process.env.CARTESIA_WEBHOOK_SECRET;
  const received = request.headers.get("x-webhook-secret");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The parts of Cartesia's call event we use (see docs.cartesia.ai observability#webhooks). */
export type CartesiaCall = {
  id?: string;
  agent_id?: string;
  status?: "started" | "completed" | "failed";
  start_time?: string;
  end_time?: string;
  end_reason?: string;
  // Cartesia also sends "system" turns (tool calls, events); only the two speakers are kept.
  transcript?: {
    role?: string;
    text?: string;
    start_timestamp?: number;
    tts_ttfb?: number;
    was_interrupted?: boolean;
  }[];
  error_message?: string;
  dynamic_variables?: Record<string, unknown>;
  /** "from" is the caller's number on inbound calls, or "websocket" for a browser preview. */
  telephony_params?: { from?: string; to?: string; direction?: string; connection_type?: string };
};

export type CartesiaWebhookEvent = {
  type?: string;
  call_id?: string;
  agent_id?: string;
  end_reason?: string;
  call?: CartesiaCall;
};

/** The events that carry a finished call. call_started, call_turn and post_call_analysis are ignored. */
export const FINISHED_CALL_EVENTS = new Set(["call_completed", "call_failed"]);

// End reasons where nobody was reached. Every other reason on a completed call means it connected.
const NOT_REACHED: Record<string, CallResult["status"]> = {
  dial_no_answer: "no_answer",
  dial_timeout: "no_answer",
  voicemail_detected: "no_answer",
  dial_busy: "busy",
  dial_failed: "failed",
};

/** A finished Cartesia call in our own terms, for recordCallResult. */
export function toCallResult(event: CartesiaWebhookEvent): CallResult {
  const call = event.call ?? {};
  const endReason = call.end_reason ?? event.end_reason ?? "";
  const spoken = (call.transcript ?? []).filter(
    (turn) => (turn.role === "assistant" || turn.role === "user") && turn.text?.trim()
  );
  const transcript: CallTranscriptTurn[] = spoken.map((turn) => ({
    role: turn.role === "assistant" ? "agent" : "user",
    en_text: turn.text!.trim(),
    ...(typeof turn.start_timestamp === "number" ? { at: Math.max(0, Math.round(turn.start_timestamp)) } : {}),
  }));

  // Cartesia reports a call that ends on inactivity as failed even after a conversation;
  // if the customer said anything, they were reached.
  const customerSpoke = transcript.some((turn) => turn.role === "user");
  const failed = event.type === "call_failed" || call.status === "failed";
  const status = NOT_REACHED[endReason] ?? (failed && !customerSpoke ? "failed" : "connected");

  const start = Date.parse(call.start_time ?? "");
  const end = Date.parse(call.end_time ?? "");
  // Only a connected call is billed, so only its length is kept.
  const duration = status === "connected" && start && end ? Math.max(0, Math.round((end - start) / 1000)) : null;

  return {
    status,
    duration,
    failureReason: status === "connected" ? null : call.error_message || endReason || null,
    interactionId: call.id ?? event.call_id ?? null,
    transcript: transcript.length ? transcript : null,
    finalVariables: call.dynamic_variables ?? null,
    details: callDetails(call, endReason, spoken),
    startedAt: call.start_time ?? null,
  };
}

function callDetails(call: CartesiaCall, endReason: string, spoken: NonNullable<CartesiaCall["transcript"]>): CallDetails {
  const telephony = call.telephony_params ?? {};
  const web = telephony.connection_type === "websocket" || telephony.from === "websocket";
  const agentTurns = spoken.filter((turn) => turn.role === "assistant");
  const ttfb = agentTurns.map((turn) => turn.tts_ttfb).filter((v): v is number => typeof v === "number" && v >= 0);
  return {
    endReason: endReason || null,
    errorMessage: call.error_message ?? null,
    channel: web ? "web" : telephony.from || telephony.to ? "phone" : null,
    from: web ? "Browser" : (telephony.from ?? null),
    to: telephony.to ?? null,
    avgResponseMs: ttfb.length ? Math.round((ttfb.reduce((a, b) => a + b, 0) / ttfb.length) * 1000) : null,
    turns: spoken.length,
    interruptions: agentTurns.filter((turn) => turn.was_interrupted).length,
    // Cartesia keeps a recording of every call it connected, playable through /agents/calls/{id}/audio.
    hasRecording: Boolean(call.id) && spoken.length > 0,
  };
}

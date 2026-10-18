import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { ChatVertexAI } from "@langchain/google-vertexai";

import { getChatGroq } from "@/lib/rag/qa-engine";

/** A chat model for reading calls: Gemini on Vertex AI when configured, Groq otherwise or as its fallback. */
export type AnalysisModel = Runnable<BaseLanguageModelInput, BaseMessage>;

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

/**
 * The service-account key from GOOGLE_VERTEX_CREDENTIALS, pasted either as the JSON file's
 * contents or base64 of it (easier to keep on one line in Vercel).
 */
function vertexServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_VERTEX_CREDENTIALS?.trim();
  if (!raw) return null;
  try {
    const key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    if (key?.client_email && key?.private_key && key?.project_id) return key as ServiceAccount;
  } catch {
    // Reported below; a broken key must not stop calls being saved.
  }
  console.warn("[AI] GOOGLE_VERTEX_CREDENTIALS is not a service-account key; using Groq.");
  return null;
}

/**
 * The model behind call summaries, verdicts, callback times and transcript translations,
 * which run after every call. Groq's free tier refuses these when several calls end together;
 * Vertex AI is billed per use, so it takes the load, and Groq still answers if Gemini fails.
 */
export function getAnalysisModel(maxTokens = 1500): AnalysisModel | null {
  const groq = getChatGroq(undefined, undefined, maxTokens);
  const account = vertexServiceAccount();
  if (!account) return groq;

  const gemini = new ChatVertexAI({
    // Flash-Lite answers in about 2s with the same outcomes and callback times; gemini-3.8-flash took
    // 10-60s (it thinks first), and Cartesia's webhook waits on this analysis before it is answered.
    model: process.env.GOOGLE_VERTEX_MODEL?.trim() || "gemini-3.5-flash-lite",
    location: process.env.GOOGLE_VERTEX_LOCATION?.trim() || "global",
    temperature: 0.2,
    // Gemini's thinking counts against this limit; the room keeps the JSON answer from being cut off.
    maxOutputTokens: Math.max(maxTokens, 8192),
    maxRetries: 2,
    authOptions: {
      credentials: { client_email: account.client_email, private_key: account.private_key },
      projectId: account.project_id,
    },
  });
  return groq ? gemini.withFallbacks([groq]) : gemini;
}

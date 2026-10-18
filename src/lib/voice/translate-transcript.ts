import { StringOutputParser } from "@langchain/core/output_parsers";

import type { CallTranscriptTurn } from "@/lib/database.types";
import { getAnalysisModel, type AnalysisModel } from "@/lib/voice/analysis-model";
import { extractJson } from "@/lib/voice/summarize-call";

type Versions = Pick<CallTranscriptTurn, "script" | "latin" | "english">;
type Llm = AnalysisModel;

// Turns per request, so each answer stays well inside the token limit; batches run side by side.
const BATCH = 12;
const MAX_VERSION_LENGTH = 2000;

function version(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_VERSION_LENGTH) : undefined;
}

async function rewriteBatch(llm: Llm, turns: CallTranscriptTurn[]): Promise<Versions[]> {
  const lines = turns.map((turn, i) => `${i} ${turn.role === "agent" ? "Agent" : "Customer"}: ${turn.en_text}`);
  const prompt = `A phone call between a voice agent and a customer in India, written down turn by
turn. The agent's lines are usually in English letters and the customer's in their
language's own script; either may mix in English words.

For every turn give three versions of exactly what was said:
- "script": in the call's Indian language, written in that language's own script (for a
  Telugu call, Telugu script). Write English words the speaker used in that script too,
  as they sound.
- "latin": the same words in English letters, the way people type the language in chats
  (for Telugu: "meeru property chustunnara?"). Keep English words in English.
- "english": what the turn means, in natural English.
If the call is only in English, all three are the English text.
Do not add, drop, correct or summarise anything. Keep names, numbers and times as said.
Speech-to-text sometimes garbles a word in the customer's lines; tell what was meant from
the turns around it rather than guessing a new word.

Return ONLY a JSON object with one entry per turn:
{"turns": [{"i": <turn number>, "script": "...", "latin": "...", "english": "..."}]}

Turns:
${lines.join("\n")}

JSON:`;

  try {
    const parsed = extractJson(await llm.pipe(new StringOutputParser()).invoke(prompt));
    const entries: unknown[] = Array.isArray(parsed?.turns) ? parsed.turns : [];
    const byIndex = new Map<number, Record<string, unknown>>();
    for (const entry of entries) {
      if (entry && typeof entry === "object" && typeof (entry as { i?: unknown }).i === "number") {
        byIndex.set((entry as { i: number }).i, entry as Record<string, unknown>);
      }
    }
    return turns.map((_, i) => {
      const entry = byIndex.get(i);
      if (!entry) return {};
      const versions: Versions = {
        script: version(entry.script),
        latin: version(entry.latin),
        english: version(entry.english),
      };
      // Absent rather than undefined, so the stored turn carries only what was made.
      return Object.fromEntries(Object.entries(versions).filter(([, text]) => text)) as Versions;
    });
  } catch (err) {
    console.warn("[Transcript versions] Batch left as said:", err);
    return turns.map(() => ({}));
  }
}

/**
 * Adds three readable versions to each turn of a finished call: the call's language in its
 * own script, the same words in English letters, and English. The agent's model writes its
 * lines in English letters while the provider writes the customer's speech in Telugu script,
 * so neither form alone reads evenly. What was said (en_text) is never changed, and a turn
 * the model could not rewrite simply has no versions.
 */
export async function addTranscriptVersions(
  transcript: CallTranscriptTurn[] | null
): Promise<CallTranscriptTurn[] | null> {
  if (!transcript?.length) return transcript;
  const llm = getAnalysisModel(4096);
  if (!llm) return transcript;

  const batches: CallTranscriptTurn[][] = [];
  for (let start = 0; start < transcript.length; start += BATCH) batches.push(transcript.slice(start, start + BATCH));
  const versions = (await Promise.all(batches.map((batch) => rewriteBatch(llm, batch)))).flat();
  return transcript.map((turn, i) => ({ ...turn, ...versions[i] }));
}

/** Whether every turn already has its versions, so a resync can skip the call. */
export function hasTranscriptVersions(transcript: CallTranscriptTurn[] | null): boolean {
  return !transcript?.length || transcript.every((turn) => turn.script && turn.latin && turn.english);
}

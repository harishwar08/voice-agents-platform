import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import type { CallOutcomeLabel, CallTranscriptTurn } from "@/lib/database.types";
import { getAnalysisModel } from "@/lib/voice/analysis-model";
import type { CaptureField, CapturedValue } from "@/lib/voice/capture-fields";

export type CallAnalysis = {
  summary: string;
  visitRequested: boolean | null;
  preferredVisitAt: string | null;
  outcome: CallOutcomeLabel | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  unansweredQuestions: string[];
  topics: string[];
  captured: CapturedValue[];
  /** When the customer asked to be called back, as an ISO date-time; null when they did not. */
  callbackAt: string | null;
};

/** When the call happened and where, so "call me at nine thirty" can become an exact time. */
export type CallTimeContext = { startedAt?: string | null; timeZone?: string | null };

const OUTCOMES: CallOutcomeLabel[] = [
  "interested",
  "not_interested",
  "callback_requested",
  "wrong_number",
  "no_answer",
  "unclear",
];
const SENTIMENTS = ["positive", "neutral", "negative"] as const;

type LeadQuality = "good" | "bad" | "unclear";
const LEAD_QUALITY_LABEL: Record<LeadQuality, string> = {
  good: "Good lead",
  bad: "Bad lead",
  unclear: "Unclear lead",
};
// An outcome this clear decides the verdict, so the summary never contradicts the outcome.
const QUALITY_BY_OUTCOME: Partial<Record<CallOutcomeLabel, LeadQuality>> = {
  interested: "good",
  callback_requested: "good",
  not_interested: "bad",
  wrong_number: "bad",
};

const TRUTHY = new Set(["true", "yes", "y", "1", "interested", "confirmed"]);
const FALSY = new Set(["false", "no", "n", "0", "not_interested", "declined"]);

function transcriptToText(transcript: CallTranscriptTurn[]): string {
  return transcript
    .map((turn) => `${turn.role === "agent" ? "Agent" : "Customer"}: ${turn.en_text}`)
    .join("\n");
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
  }
  return null;
}

function coerceDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function readVisitIntent(finalVariables: Record<string, any> | null) {
  return {
    visitRequested: coerceBoolean(
      finalVariables?.visit_requested ?? finalVariables?.wants_visit
    ),
    preferredVisitAt: coerceDate(
      finalVariables?.preferred_visit_at ?? finalVariables?.preferred_date
    ),
  };
}

function coerceCaptured(field: CaptureField, value: unknown): CapturedValue["value"] {
  if (value === null || value === undefined || value === "") return null;

  switch (field.type) {
    case "yes_no":
      return coerceBoolean(value);
    case "number": {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      const text = String(value).trim();
      // Only plain figures become numbers; "around 20 thousand" stays as words rather than becoming 20.
      return /^[₹\s\d,.-]+$/.test(text) && /\d/.test(text)
        ? Number(text.replace(/[^\d.-]/g, ""))
        : text.slice(0, 200);
    }
    case "date":
      return coerceDate(value) ?? String(value).slice(0, 200);
    default:
      return String(value).trim().slice(0, 200) || null;
  }
}

/** Every configured field gets an entry, null when the call never covered it. */
function readCaptured(fields: CaptureField[], raw: unknown): CapturedValue[] {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    value: coerceCaptured(field, source[field.key]),
  }));
}

function captureInstructions(fields: CaptureField[]): string {
  if (!fields.length) return "";
  const lines = fields.map((f) => {
    const shape =
      f.type === "yes_no" ? "true or false" : f.type === "number" ? "a number" : f.type === "date" ? "an ISO 8601 date-time" : "short text";
    return `  - "${f.key}": ${f.label}${f.hint ? ` (${f.hint})` : ""} — ${shape}`;
  });
  return `- "captured": an object with exactly these keys. Use null for anything the
  customer did not clearly say:
${lines.join("\n")}`;
}

function toStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
export function extractJson(raw: string): Record<string, any> | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * The owner reads the verdict first: "Good lead: <why>. Next step: <what>." then the call
 * itself. It lives only in the summary text, so nothing else about the call changes.
 */
function withLeadVerdict(
  summary: string,
  outcome: CallOutcomeLabel | null,
  parsed: Record<string, unknown>
): string {
  const asked = typeof parsed.lead_quality === "string" ? parsed.lead_quality.trim().toLowerCase() : "";
  const quality: LeadQuality =
    (outcome && QUALITY_BY_OUTCOME[outcome]) ||
    (asked === "good" || asked === "bad" || asked === "unclear" ? asked : "unclear");
  const sentence = (value: unknown) => {
    const text = typeof value === "string" ? value.trim().replace(/[.\s]+$/, "") : "";
    return text ? `${text}.` : "";
  };
  const reason = sentence(parsed.lead_reason);
  const nextStep = sentence(parsed.next_step);
  const verdict = [`${LEAD_QUALITY_LABEL[quality]}${reason ? `: ${reason}` : "."}`, nextStep && `Next step: ${nextStep}`]
    .filter(Boolean)
    .join(" ");
  return `${verdict} ${summary}`;
}

const MAX_CALLBACK_DAYS = 30;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// When a callback asked for by part of day alone ("call me in the evening") goes out.
const PART_OF_DAY_HOUR: Record<string, number> = { morning: 10, afternoon: 14, evening: 18, night: 20 };
// Hours a bare "call me at 10" is taken to mean when it could be either AM or PM.
const WAKING_FROM = 7;
const WAKING_UNTIL = 22;
// A night-time reading this close is kept: "10:52" said at 10:49 PM means tonight.
const IMMINENT_MS = 60 * 60 * 1000;

/** "+05:30" for Asia/Kolkata at that moment, so a local time is anchored correctly. */
function utcOffset(at: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-]\d{2}:\d{2})/.exec(name ?? "");
  return match ? match[1] : "+00:00";
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** The calendar date `days` after the call in the business's zone, as YYYY-MM-DD. */
function localDate(calledAt: Date, timeZone: string, days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(calledAt);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The 24-hour readings of an hour as said: "10" is 10:00 or 22:00 unless the part of day settles it. */
function hourReadings(hour: number, partOfDay: string | null): number[] {
  if (hour === 0 || hour >= 13) return [hour];
  const am = hour % 12;
  const pm = am + 12;
  if (partOfDay === "morning") return [am];
  if (partOfDay === "afternoon" || partOfDay === "evening") return [pm];
  // "Night one o'clock" is 1 AM; "night nine" is 9 PM.
  if (partOfDay === "night") return [hour >= 5 && hour !== 12 ? pm : am];
  return [am, pm];
}

function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at));
}

/**
 * When to call back, worked out here from the time the customer said, so the model only has
 * to read "ten fifty two" as 10 and 52 (it is unreliable at turning that into a date). With
 * AM/PM unknown, waking hours win: "tomorrow at 10" is 10 AM, and a bare "10" said at 11 AM
 * is 10 AM tomorrow, not 10 PM tonight, unless the night-time reading is within the hour.
 * Kept only within a month after the call.
 */
export function resolveCallbackAt(raw: unknown, calledAt: Date, timeZone: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const words = raw as Record<string, unknown>;
  const offset = utcOffset(calledAt, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const at = (days: number, hour: number, minute: number) =>
    new Date(`${localDate(calledAt, timeZone, days)}T${pad(hour)}:${pad(minute)}:00${offset}`);

  const candidates: Date[] = [];
  // A bare hour on no named day, either AM or PM.
  let ambiguous = false;
  const inMinutes = wholeNumber(words.in_minutes, 1, MAX_CALLBACK_DAYS * 24 * 60);
  if (inMinutes) {
    candidates.push(new Date(calledAt.getTime() + inMinutes * 60_000));
  } else {
    const partOfDay = typeof words.part_of_day === "string" ? words.part_of_day.trim().toLowerCase() : null;
    const dayWord = typeof words.day === "string" ? words.day.trim().toLowerCase() : "";
    const hour = wholeNumber(words.hour, 0, 23);
    const minute = hour === null ? 0 : (wholeNumber(words.minute, 0, 59) ?? 0);

    const weekday = WEEKDAYS.indexOf(dayWord);
    const todayWeekday = new Date(`${localDate(calledAt, timeZone, 0)}T12:00:00Z`).getUTCDay();
    // Days after the call; a weekday named on that same day may mean today or next week.
    const weekdayAhead = (weekday - todayWeekday + 7) % 7;
    const days =
      dayWord === "today" ? [0] : dayWord === "tomorrow" ? [1] : weekday >= 0 ? [weekdayAhead, weekdayAhead + 7] : null;

    let hours =
      hour !== null
        ? hourReadings(hour, partOfDay)
        : partOfDay && partOfDay in PART_OF_DAY_HOUR
          ? [PART_OF_DAY_HOUR[partOfDay]]
          : days
            ? [10]
            : [];
    if (days && days[0] > 0 && hours.length > 1) {
      const waking = hours.filter((h) => h >= WAKING_FROM && h < WAKING_UNTIL);
      if (waking.length) hours = waking;
    }
    ambiguous = !days && hours.length > 1;
    for (const day of days ?? [0, 1]) for (const h of hours) candidates.push(at(day, h, minute));
  }

  const upcoming = candidates
    .filter((c) => !Number.isNaN(c.getTime()) && c.getTime() > calledAt.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const awake = (c: Date) => localHour(c, timeZone) >= WAKING_FROM && localHour(c, timeZone) < WAKING_UNTIL;
  let next = upcoming[0];
  if (next && ambiguous && !awake(next) && next.getTime() - calledAt.getTime() > IMMINENT_MS) {
    next = upcoming.find(awake) ?? next;
  }
  return next && next.getTime() - calledAt.getTime() < MAX_CALLBACK_DAYS * 24 * 60 * 60 * 1000 ? next.toISOString() : null;
}

function fallbackSummary(text: string): string {
  const condensed = text.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 400) + (condensed.length > 400 ? "..." : "");
}

function emptyAnalysis(
  summary: string,
  intent: ReturnType<typeof readVisitIntent>,
  fields: CaptureField[]
): CallAnalysis {
  return {
    summary,
    ...intent,
    outcome: null,
    sentiment: null,
    unansweredQuestions: [],
    topics: [],
    captured: readCaptured(fields, null),
    callbackAt: null,
  };
}

export async function analyzeCall(
  transcript: CallTranscriptTurn[] | null,
  finalVariables: Record<string, any> | null,
  captureFields: CaptureField[] = [],
  time: CallTimeContext = {}
): Promise<CallAnalysis> {
  const intent = readVisitIntent(finalVariables);
  const calledAt = time.startedAt && !Number.isNaN(Date.parse(time.startedAt)) ? new Date(time.startedAt) : new Date();
  const timeZone = time.timeZone || "Asia/Kolkata";

  if (!transcript?.length) {
    return {
      ...emptyAnalysis("No conversation was recorded for this call.", intent, captureFields),
      outcome: "no_answer",
    };
  }

  const text = transcriptToText(transcript);
  const llm = getAnalysisModel();
  if (!llm) return emptyAnalysis(fallbackSummary(text), intent, captureFields);

  try {
    const prompt = PromptTemplate.fromTemplate(`
You are analysing a sales call so the business can improve its voice agent and
follow up with the right prospects. The transcript may be in Telugu, Hindi or
English, often written in Latin letters; always answer in English.

Return ONLY a JSON object with these keys:
- "summary": 2-4 short sentences for the business owner covering what the
  customer asked, what they were told, and any follow-up agreed.
- "lead_quality": one of good, bad, unclear. Judge only from what the CUSTOMER
  said and agreed to:
    good = they showed interest: asked about price, availability, location or
    details, agreed to a visit, an order, a callback or to receive information.
    bad = they said they are not interested, it is the wrong person, they asked
    not to be called, or they are clearly not a buyer.
    unclear = the call ended before they showed either.
- "lead_reason": one short sentence saying what the customer said that shows
  this, e.g. "Asked for prices and wants the catalogue on WhatsApp".
- "next_step": the follow-up agreed on the call, or the best next action for
  the business if none was agreed, e.g. "Call back on Saturday with the price list".
- "callback": null unless the customer asked to be called back at a time or
  after a while. Otherwise an object read from the CUSTOMER's own words. The
  agent sometimes mishears numbers, so if it repeated back a different time,
  ignore its version even when the customer then said "ok"; use a time the
  agent offered only if the customer gave none and agreed to it.
    "said": the customer's words for the time, copied from the transcript.
    "in_minutes": for a delay ("after two hours" = 120, "in 5 minutes" = 5),
      else null.
    "day": "today", "tomorrow" or a weekday such as "monday"; null if not said.
    "hour", "minute": the clock time exactly as said, as numbers ("ten fifty
      two" = 10 and 52, "nine thirty" = 9 and 30, "at 7" = 7 and 0); null if
      no clock time was said. Do not convert to 24-hour or guess AM/PM.
    "part_of_day": "morning", "afternoon", "evening" or "night" if the
      customer (or the agent) said one, or AM/PM, else null.
  Use the customer's time, not the agent's, in "next_step" and "summary".
- "outcome": one of {outcomes}.
- "sentiment": one of positive, neutral, negative.
- "unanswered_questions": array of questions the CUSTOMER asked that the agent
  failed to answer, answered vaguely, or said it did not know. Quote them close
  to how the customer put them. Empty array if the agent answered everything.
- "topics": array of up to 5 short topic labels, e.g. "pricing", "delivery".
{capture}

Only use what is in the transcript. Do not invent details.

Transcript:
"""
{text}
"""

JSON:
`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const response = await chain.invoke({
      text: text.slice(0, 8000),
      outcomes: OUTCOMES.join(", "),
      capture: captureInstructions(captureFields),
    });

    const parsed = extractJson(response);
    if (!parsed) return emptyAnalysis(fallbackSummary(text), intent, captureFields);

    const outcome = OUTCOMES.includes(parsed.outcome) ? parsed.outcome : null;
    const sentiment = SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : null;

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallbackSummary(text);

    return {
      summary: withLeadVerdict(summary, outcome, parsed),
      ...intent,
      outcome,
      sentiment,
      unansweredQuestions: toStringList(parsed.unanswered_questions, 10),
      topics: toStringList(parsed.topics, 5),
      captured: readCaptured(captureFields, parsed.captured),
      callbackAt: resolveCallbackAt(parsed.callback, calledAt, timeZone),
    };
  } catch (err) {
    console.warn("[analyzeCall] Falling back to raw transcript:", err);
    return emptyAnalysis(fallbackSummary(text), intent, captureFields);
  }
}

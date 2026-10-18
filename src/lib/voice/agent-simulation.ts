import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";

import { getChatGroq } from "@/lib/rag/qa-engine";
import {
  AGENT_LANGUAGES,
  AGENT_VOICES,
  BACKGROUND_SOUND_LABELS,
  mergeAgentSettings,
  sanitizeAgentSettings,
  type AgentSettings,
} from "@/lib/voice/agent-settings";
import type { AgentTest, TestRun, TranscriptLine } from "@/lib/voice/agent-tests";
import type { CallBrief } from "@/lib/voice/dispatch-lead-call";

/**
 * Text simulations of an agent, run on our own model rather than the voice
 * provider. They use the same brief a real call gets, so the test chat, the
 * automated tests and Genie all work while no provider is connected.
 */

const MAX_CALLER_TURNS = 6;
const END = "[END]";

function clean(raw: unknown): string {
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p?.text ?? "").join("") : "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function extractJson(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function complete(messages: BaseMessage[]): Promise<string> {
  const llm = getChatGroq();
  if (!llm) throw new Error("The AI model is not configured (GROQ_API_KEY).");
  const res = await llm.invoke(messages);
  return clean(res.content);
}

function agentSystemPrompt(brief: CallBrief, settings: AgentSettings): string {
  const knowledgeInline = settings.instructions.includes("{{business_description}}");
  return [
    brief.instructions,
    knowledgeInline ? "" : `BUSINESS KNOWLEDGE:\n${brief.knowledge}`,
    `LANGUAGE (follow this exactly): ${brief.languageRules}`,
    "This is a live phone call. Reply with only the words you would say aloud: one to three short sentences, no lists, no stage directions.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The agent's next line, given the conversation so far (which always opens with its greeting). */
export async function agentReply(
  brief: CallBrief,
  settings: AgentSettings,
  transcript: TranscriptLine[]
): Promise<string> {
  const messages: BaseMessage[] = [new SystemMessage(agentSystemPrompt(brief, settings))];
  for (const line of transcript) {
    messages.push(line.role === "agent" ? new AIMessage(line.text) : new HumanMessage(line.text));
  }
  return (await complete(messages)) || "Sorry, could you say that again?";
}

async function callerReply(scenario: string, transcript: TranscriptLine[]): Promise<string> {
  const messages: BaseMessage[] = [
    new SystemMessage(
      `You are role-playing a person who has just picked up a phone call from a business's AI agent.\n` +
        `Who you are and what you want: ${scenario}\n` +
        `Stay in character. Reply with one or two short sentences, as spoken. When the conversation has ` +
        `naturally finished, or you would hang up, reply with exactly ${END}.`
    ),
  ];
  // From the caller's side the agent is the other speaker.
  for (const line of transcript) {
    messages.push(line.role === "caller" ? new AIMessage(line.text) : new HumanMessage(line.text));
  }
  return complete(messages);
}

async function judge(test: AgentTest, transcript: TranscriptLine[]): Promise<{ passed: boolean; reason: string }> {
  const text = transcript.map((l) => `${l.role === "agent" ? "Agent" : "Caller"}: ${l.text}`).join("\n");
  const raw = await complete([
    new SystemMessage(
      `You review a phone conversation between a business's AI agent and a caller, and decide whether the ` +
        `agent did what was expected. Be strict but fair; judge only the agent.\n` +
        `Return ONLY JSON: {"passed": true|false, "reason": "one or two sentences quoting the moment that decided it"}`
    ),
    new HumanMessage(`Expected behaviour: ${test.expected}\n\nConversation:\n${text}\n\nJSON:`),
  ]);
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed.passed !== "boolean") {
    return { passed: false, reason: "The reviewer could not reach a verdict; open the transcript and judge it yourself." };
  }
  return { passed: parsed.passed, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 600) : "" };
}

export async function runAgentTest(brief: CallBrief, settings: AgentSettings, test: AgentTest): Promise<TestRun> {
  const transcript: TranscriptLine[] = [{ role: "agent", text: brief.greeting }];

  for (let turn = 0; turn < MAX_CALLER_TURNS; turn++) {
    const said = await callerReply(test.scenario, transcript);
    if (!said || said.includes(END)) break;
    transcript.push({ role: "caller", text: said });
    transcript.push({ role: "agent", text: await agentReply(brief, settings, transcript) });
  }

  const verdict = await judge(test, transcript);
  return { ...verdict, transcript, ranAt: new Date().toISOString() };
}

/** Plain-language description of the editable fields, so Genie returns values we accept. */
const GENIE_SCHEMA = `{
  "instructions": string (the agent's full instructions; "" means the standard ones),
  "greeting": string (opening line; may use {{business_name}} and {{lead_name}}),
  "variables": [{"key": snake_case, "value": string, "description": string}],
  "voice": one of ${AGENT_VOICES.join(", ")},
  "speakingSpeed": 0.5-2.0 (1 is normal),
  "pitch": -0.75-0.75,
  "temperature": 0.1-0.9,
  "allowInterruptions": boolean,
  "eagerness": "patient" | "balanced" | "eager",
  "soundSensitivity": "low" | "medium" | "high",
  "backgroundSound": ${Object.keys(BACKGROUND_SOUND_LABELS).map((k) => `"${k}"`).join(" | ")},
  "backgroundVolume": 0-1,
  "startingLanguage": one of ${AGENT_LANGUAGES.join(", ")},
  "allowedLanguages": array of those languages,
  "switchLanguageDuringCall": boolean,
  "autoDetectLanguage": boolean,
  "indicNumbers": boolean,
  "nudges": {"enabled": boolean, "messages": [{"text": string, "afterSeconds": number}], "hangUpAfter": boolean},
  "voicemail": {"enabled": boolean, "message": string},
  "callForwarding": {"enabled": boolean, "number": string},
  "maxCallMinutes": 1-60
}`;

export type GenieResult = { reply: string; name: string; settings: AgentSettings };

/**
 * Turns an owner's request ("switch to Hindi and slow down") into edits. The
 * result is a draft for the owner to review and save, never written directly.
 */
export async function genieEdit(
  request: string,
  current: { name: string; settings: AgentSettings },
  history: { role: "user" | "genie"; text: string }[]
): Promise<GenieResult> {
  const { instructions, ...rest } = current.settings;
  const messages: BaseMessage[] = [
    new SystemMessage(
      `You are Genie, an assistant that edits a business's AI phone agent for its owner.\n` +
        `Agent name: ${current.name}\n` +
        `Current settings: ${JSON.stringify(rest)}\n` +
        `Current instructions: ${instructions ? JSON.stringify(instructions) : "(the standard instructions)"}\n\n` +
        `Editable fields:\n${GENIE_SCHEMA}\n\n` +
        `Return ONLY JSON: {"reply": "what you changed, in one or two plain sentences", "name": "new agent name, only if asked", "changes": {only the fields to change}}.\n` +
        `Voices are not tied to a language: every voice speaks every language. A request for a language ` +
        `changes "startingLanguage" (and adds it to "allowedLanguages"), not the voice. ` +
        `Lists you change must be sent in full. If the request needs something you cannot change here ` +
        `(knowledge, phone numbers, billing), make no changes and say where the owner can do it. ` +
        `Never invent business facts such as prices.`
    ),
  ];
  for (const turn of history.slice(-6)) {
    messages.push(turn.role === "user" ? new HumanMessage(turn.text) : new AIMessage(turn.text));
  }
  messages.push(new HumanMessage(request));

  const parsed = extractJson(await complete(messages));
  if (!parsed) {
    return { reply: "Sorry, I couldn't work out that change. Try saying it another way.", ...current };
  }

  const changes = parsed.changes && typeof parsed.changes === "object" ? parsed.changes : {};
  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 60) : current.name;
  return {
    reply: typeof parsed.reply === "string" ? parsed.reply.slice(0, 600) : "Done.",
    name,
    settings: mergeAgentSettings(current.settings, changes),
  };
}

/**
 * Drafts a new agent from one sentence ("call people who filled our site-visit
 * form"). Falls back to the standard agent if the model is unavailable.
 */
export async function draftAgentFromDescription(
  description: string,
  businessName: string
): Promise<{ name: string; settings: AgentSettings }> {
  const fallback = { name: "New agent", settings: sanitizeAgentSettings({}) };
  try {
    const parsed = extractJson(
      await complete([
        new SystemMessage(
          `You set up AI phone agents for Indian businesses. The business is "${businessName}".\n` +
            `From the owner's description, return ONLY JSON:\n` +
            `{"name": "a short agent name, 1-3 words", "greeting": "the opening line, using {{business_name}} and {{lead_name}}", ` +
            `"instructions": "complete instructions for the agent: its goal, the questions to ask one at a time, how to qualify and close, ` +
            `and to never invent prices or policies. Refer to {{business_name}}, {{lead_name}} and {{preferred_language}} where useful.", ` +
            `"startingLanguage": one of ${AGENT_LANGUAGES.join(", ")}}`
        ),
        new HumanMessage(description),
      ])
    );
    if (!parsed) return fallback;
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 60) : fallback.name,
      settings: sanitizeAgentSettings({
        instructions: parsed.instructions,
        greeting: parsed.greeting,
        startingLanguage: parsed.startingLanguage,
      }),
    };
  } catch {
    return fallback;
  }
}

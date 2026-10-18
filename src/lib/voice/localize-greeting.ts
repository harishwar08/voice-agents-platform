import { getChatGroq } from "@/lib/rag/qa-engine";
import type { AgentLanguage } from "@/lib/voice/agent-settings";

const INDIC_SCRIPTS = /[ऀ-ൿ]/;

const SCRIPT_OF: Record<Exclude<AgentLanguage, "English">, RegExp> = {
  Hindi: /[ऀ-ॿ]/,
  Marathi: /[ऀ-ॿ]/,
  Bengali: /[ঀ-৿]/,
  Punjabi: /[਀-੿]/,
  Gujarati: /[઀-૿]/,
  Odia: /[଀-୿]/,
  Tamil: /[஀-௿]/,
  Telugu: /[ఀ-౿]/,
  Kannada: /[ಀ-೿]/,
  Malayalam: /[ഀ-ൿ]/,
};

const TIMEOUT_MS = 8000;

function writtenIn(text: string, language: AgentLanguage): boolean {
  return language === "English" ? !INDIC_SCRIPTS.test(text) : SCRIPT_OF[language].test(text);
}

/**
 * The opening line in the starting language. Owners usually write the greeting
 * once, in English, and the provider reads it out verbatim, so a Telugu agent
 * would open in English. Falls back to the original if translation fails: a
 * call in the wrong language beats no call.
 */
export async function localizeGreeting(greeting: string, language: AgentLanguage): Promise<string> {
  if (!greeting.trim() || writtenIn(greeting, language)) return greeting;

  const llm = getChatGroq();
  if (!llm) return greeting;

  try {
    const res = await Promise.race([
      llm.invoke([
        [
          "system",
          `Translate the user's phone greeting into natural spoken ${language}, written in ${language}'s own script. ` +
            "Keep people's names, business names and brand names exactly as they are. Reply with only the translation.",
        ],
        ["human", greeting],
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const raw = typeof res.content === "string" ? res.content : "";
    const translated = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim().replace(/^["'“]|["'”]$/g, "");
    return translated && writtenIn(translated, language) ? translated : greeting;
  } catch (err) {
    console.warn("[Greeting] Could not translate to", language, err);
    return greeting;
  }
}

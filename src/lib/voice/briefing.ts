import { fillTemplate } from "@/lib/voice/agent-settings";
import type { CallBrief } from "@/lib/voice/dispatch-lead-call";

/**
 * The instructions, language rules and knowledge as one text, for providers that
 * take the agent's briefing through a single prompt variable. The instructions
 * are filled again without the knowledge, so a {{business_description}} in the
 * owner's text does not paste the knowledge in twice. Language rules are left
 * out when the agent's own language setup in the provider's console should stand.
 */
export function composeBriefing(brief: CallBrief, instructions: string, withLanguageRules = true): string {
  const sections: string[] = [];
  if (instructions.trim()) {
    const filled = fillTemplate(instructions, {
      ...brief.values,
      business_description: "the business knowledge below",
    });
    sections.push("INSTRUCTIONS FROM THE BUSINESS (follow these over any general guidance):", filled);
  }
  if (withLanguageRules) {
    sections.push("LANGUAGE (follow this exactly, over any other guidance):", brief.languageRules);
  }
  sections.push("BUSINESS KNOWLEDGE:", brief.knowledge);
  return sections.join("\n\n");
}

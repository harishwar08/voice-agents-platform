import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { SupabaseVectorStore } from "@/lib/rag/vector-store";

type AdminClient = SupabaseClient<Database>;

export type AgentOwner = { employeeId: string; employeeName: string; businessId: string };

/**
 * The client a Cartesia agent belongs to, as linked by staff in /admin. Null for an
 * unlinked agent, including the shared CARTESIA_AGENT_ID: it serves no single client.
 */
export async function findAgentOwner(supabase: AdminClient, agentId: string | undefined): Promise<AgentOwner | null> {
  if (!agentId) return null;
  const { data } = await supabase
    .from("ai_employees")
    .select("id, name, business_id")
    .eq("cartesia_agent_id", agentId)
    .maybeSingle();
  return data ? { employeeId: data.id, employeeName: data.name, businessId: data.business_id } : null;
}

// Cartesia hands a tool at most 4,096 bytes and cuts the rest. Telugu is about three bytes a
// character, so the reply is measured in bytes, with room left for the closing line.
const REPLY_BYTES = 3800;
const OVERVIEW_QUESTION = "business overview, products, projects, prices and offers";

/**
 * What the agent hears back when it asks about the business mid-call: the knowledge-base
 * passages closest to the caller's question, in plain text for the model to read.
 */
export async function answerFromKnowledge(
  supabase: AdminClient,
  owner: AgentOwner,
  question: string
): Promise<string> {
  const { data: business } = await supabase
    .from("businesses")
    .select("name, industry")
    .eq("id", owner.businessId)
    .maybeSingle();

  const results = await new SupabaseVectorStore().similaritySearch(question.trim() || OVERVIEW_QUESTION, 6, {
    aiEmployeeId: owner.employeeId,
    businessId: owner.businessId,
    threshold: 0.1,
  });

  const header = `Business: ${business?.name ?? "this business"}${business?.industry ? ` (${business.industry})` : ""}.`;
  const closing = results.length
    ? "Answer only from these facts. If the answer is not here, say you will check and have the team call back. Never guess prices."
    : "The knowledge base has nothing on this. Say you will check and have the team call back. Never guess prices.";

  let reply = `${header}\nFacts from the knowledge base:`;
  results.forEach((result, index) => {
    const line = `\n${index + 1}. ${result.content.replace(/\s+/g, " ").trim()}`;
    if (Buffer.byteLength(reply + line + closing, "utf8") < REPLY_BYTES) reply += line;
  });
  return `${reply}\n\n${closing}`;
}

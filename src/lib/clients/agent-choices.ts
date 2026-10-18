import type { SupabaseClient } from "@supabase/supabase-js";

import { listAccountAgents, type AccountAgent } from "@/lib/cartesia/account";
import type { Database } from "@/lib/database.types";

export type AgentOption = AccountAgent & {
  /** The client this agent already answers for; an agent serves one client. */
  takenBy: string | null;
};

export type AgentChoices = {
  agents: AgentOption[];
  /** Why the list is empty when Cartesia could not be asked. */
  error: string | null;
  /** CARTESIA_AGENT_ID, preferred when it is free. */
  defaultAgentId: string | null;
};

/** The Cartesia account's agents for staff to pick from, each with the client already using it. */
export async function loadAgentChoices(supabase: SupabaseClient<Database> | null): Promise<AgentChoices> {
  const [listed, employees, businesses] = await Promise.all([
    listAccountAgents(),
    supabase ? supabase.from("ai_employees").select("business_id, cartesia_agent_id") : null,
    supabase ? supabase.from("businesses").select("id, name") : null,
  ]);

  const nameOf = new Map((businesses?.data ?? []).map((b) => [b.id, b.name]));
  const holderOf = new Map(
    (employees?.data ?? [])
      .filter((e) => e.cartesia_agent_id)
      .map((e) => [e.cartesia_agent_id as string, nameOf.get(e.business_id) ?? "another client"])
  );

  return {
    agents: "error" in listed ? [] : listed.agents.map((a) => ({ ...a, takenBy: holderOf.get(a.id) ?? null })),
    error: "error" in listed ? listed.error : null,
    defaultAgentId: process.env.CARTESIA_AGENT_ID?.trim() || null,
  };
}

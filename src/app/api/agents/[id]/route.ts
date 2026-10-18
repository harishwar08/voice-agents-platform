import { NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { mergeAgentSettings, sanitizeAgentSettings, type AgentSettings } from "@/lib/voice/agent-settings";

type RouteContext = { params: Promise<{ id: string }> };

/** Saves the agent's name and/or a partial settings edit. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { supabase, employee } = loaded;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const update: { name?: string; agent_settings?: AgentSettings } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: "Give the agent a name." }, { status: 400 });
    update.name = name;
  }
  if (body.settings && typeof body.settings === "object") {
    update.agent_settings = mergeAgentSettings(sanitizeAgentSettings(employee.agent_settings), body.settings);
  }

  const { data, error } = await supabase
    .from("ai_employees")
    .update(update)
    .eq("id", employee.id)
    .select("name, agent_settings, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({
    name: data.name,
    settings: sanitizeAgentSettings(data.agent_settings),
    updatedAt: data.updated_at,
  });
}

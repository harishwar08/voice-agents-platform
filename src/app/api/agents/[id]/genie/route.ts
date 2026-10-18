import { NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { sanitizeAgentSettings } from "@/lib/voice/agent-settings";
import { genieEdit } from "@/lib/voice/agent-simulation";

type RouteContext = { params: Promise<{ id: string }> };

type Turn = { role: "user" | "genie"; text: string };

function readHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is Turn => !!t && typeof (t as Turn).text === "string")
    .map((t): Turn => ({ role: t.role === "genie" ? "genie" : "user", text: t.text.slice(0, 1000) }));
}

/** Genie proposes edits to the editor's current draft; nothing is saved here. */
export async function POST(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;

  const body = await request.json().catch(() => ({}));
  const ask = typeof body?.request === "string" ? body.request.trim().slice(0, 1000) : "";
  if (!ask) return NextResponse.json({ error: "Tell Genie what to change." }, { status: 400 });

  try {
    const result = await genieEdit(
      ask,
      {
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : loaded.employee.name,
        settings: sanitizeAgentSettings(body.settings ?? loaded.employee.agent_settings),
      },
      readHistory(body.history)
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

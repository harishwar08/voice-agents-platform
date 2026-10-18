import { NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { sanitizeAgentSettings } from "@/lib/voice/agent-settings";
import { agentReply } from "@/lib/voice/agent-simulation";
import type { TranscriptLine } from "@/lib/voice/agent-tests";
import { prepareCallBrief, resolveEmployeeContext } from "@/lib/voice/dispatch-lead-call";

type RouteContext = { params: Promise<{ id: string }> };

function readTranscript(value: unknown): TranscriptLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is TranscriptLine => !!l && typeof (l as TranscriptLine).text === "string")
    .map((l): TranscriptLine => ({ role: l.role === "agent" ? "agent" : "caller", text: l.text.slice(0, 1000) }))
    .slice(-30);
}

/**
 * "Test agent": a text conversation with the agent as it stands in the editor,
 * unsaved changes included. With no transcript it returns the greeting.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;

  const body = await request.json().catch(() => ({}));
  const context = await resolveEmployeeContext(loaded.employee.id);
  if (body?.settings) context.settings = sanitizeAgentSettings(body.settings);

  const brief = await prepareCallBrief(context, { name: "Test Caller", phone: "+910000000000" });
  const transcript = readTranscript(body?.transcript);
  if (!transcript.length) return NextResponse.json({ reply: brief.greeting });

  try {
    return NextResponse.json({ reply: await agentReply(brief, context.settings, transcript) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

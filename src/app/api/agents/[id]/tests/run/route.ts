import { NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { sanitizeAgentSettings } from "@/lib/voice/agent-settings";
import { runAgentTest } from "@/lib/voice/agent-simulation";
import { sanitizeTests } from "@/lib/voice/agent-tests";
import { prepareCallBrief, resolveEmployeeContext } from "@/lib/voice/dispatch-lead-call";

type RouteContext = { params: Promise<{ id: string }> };

// One run is about a dozen model calls back to back.
export const maxDuration = 120;

/** Runs one saved test against the editor's current draft and stores the result. */
export async function POST(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { supabase, employee } = loaded;

  const body = await request.json().catch(() => ({}));
  const tests = sanitizeTests(employee.agent_tests);
  const test = tests.find((t) => t.id === body?.testId);
  if (!test) return NextResponse.json({ error: "Save the test before running it." }, { status: 404 });
  if (!test.scenario || !test.expected) {
    return NextResponse.json({ error: "Describe the caller and what should happen first." }, { status: 400 });
  }

  const context = await resolveEmployeeContext(employee.id);
  if (body?.settings) context.settings = sanitizeAgentSettings(body.settings);
  const brief = await prepareCallBrief(context, { name: "Test Caller", phone: "+910000000000" });

  try {
    const run = await runAgentTest(brief, context.settings, test);
    // Re-read so a test edited while this ran is not overwritten.
    const { data: fresh } = await supabase.from("ai_employees").select("agent_tests").eq("id", employee.id).single();
    const updated = sanitizeTests(fresh?.agent_tests).map((t) =>
      t.id === test.id && t.scenario === test.scenario && t.expected === test.expected ? { ...t, lastRun: run } : t
    );
    await supabase.from("ai_employees").update({ agent_tests: updated }).eq("id", employee.id);
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

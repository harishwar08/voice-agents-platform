import { NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { MAX_TESTS, sanitizeTests } from "@/lib/voice/agent-tests";

type RouteContext = { params: Promise<{ id: string }> };

/** Saves the agent's test cases. Past runs come from storage, never from the client. */
export async function PUT(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { supabase, employee } = loaded;

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.tests) || body.tests.length > MAX_TESTS) {
    return NextResponse.json({ error: `Send up to ${MAX_TESTS} tests.` }, { status: 400 });
  }

  const stored = new Map(sanitizeTests(employee.agent_tests).map((t) => [t.id, t]));
  const tests = sanitizeTests(body.tests).map((t) => {
    const before = stored.get(t.id);
    // A result only stays while the test it came from is unchanged.
    const unchanged = before && before.scenario === t.scenario && before.expected === t.expected;
    return { ...t, lastRun: unchanged ? before.lastRun : null };
  });

  const { error } = await supabase.from("ai_employees").update({ agent_tests: tests }).eq("id", employee.id);
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ tests });
}

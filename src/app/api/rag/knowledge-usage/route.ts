import { NextResponse } from "next/server";

import { loadAccessibleEmployee } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEmployeeContext } from "@/lib/voice/dispatch-lead-call";

/**
 * How much of the per-call knowledge limit an AI employee's knowledge base uses,
 * and which items a call cuts off. Built by the same code that places calls, so
 * it is exactly what the agent receives.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });

  const aiEmployeeId = new URL(request.url).searchParams.get("aiEmployeeId") ?? "";
  const employee = await loadAccessibleEmployee(supabase, session, aiEmployeeId);
  if (!employee) return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });

  const context = await resolveEmployeeContext(employee.id);
  return NextResponse.json({ usage: context.knowledgeUsage });
}

import { NextResponse } from "next/server";

import { canManageBusiness } from "@/lib/auth/access";
import { getSessionContext, type SessionContext } from "@/lib/auth/session";
import type { AiEmployee } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

type Loaded = {
  supabase: NonNullable<ReturnType<typeof createAdminClient>>;
  session: SessionContext;
  employee: AiEmployee;
};

/**
 * Shared guard for /api/agents/[id] routes: signed in, and allowed to manage the
 * agent's business. Missing and not-yours both 404, so other tenants' ids cannot be probed.
 */
export async function loadManagedAgent(id: string): Promise<Loaded | NextResponse> {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: employee } = await supabase.from("ai_employees").select("*").eq("id", id).maybeSingle();
  if (!employee || !(await canManageBusiness(supabase, session, employee.business_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return { supabase, session, employee: employee as AiEmployee };
}

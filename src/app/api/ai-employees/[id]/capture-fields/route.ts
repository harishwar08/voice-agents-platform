import { NextResponse } from "next/server";

import { canManageBusiness } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_CAPTURE_FIELDS, sanitizeCaptureFields } from "@/lib/voice/capture-fields";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { id } = await params;
  const { data: employee } = await supabase
    .from("ai_employees")
    .select("id, business_id")
    .eq("id", id)
    .maybeSingle();

  // Same 404 for missing and not-yours, so other tenants' ids cannot be probed.
  if (!employee || !(await canManageBusiness(supabase, session, employee.business_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.fields) || body.fields.length > MAX_CAPTURE_FIELDS) {
    return NextResponse.json({ error: `Send up to ${MAX_CAPTURE_FIELDS} fields.` }, { status: 400 });
  }

  const fields = sanitizeCaptureFields(body.fields);
  const { error } = await supabase
    .from("ai_employees")
    .update({ capture_fields: fields })
    .eq("id", employee.id);

  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ fields });
}

import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import { loadManageableTarget } from "@/lib/delivery/access";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase, target } = await loadManageableTarget(session, (await params).id);
  if (!supabase || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false." }, { status: 400 });
  }

  const { data: updated } = await supabase
    .from("delivery_targets")
    .update({ enabled: body.enabled })
    .eq("id", target.id)
    .select("*")
    .single();

  return NextResponse.json({ target: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase, target } = await loadManageableTarget(session, (await params).id);
  if (!supabase || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("delivery_targets").delete().eq("id", target.id);
  return NextResponse.json({ deleted: true });
}

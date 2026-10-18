import { NextResponse } from "next/server";

import { canManageBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { isDeliveryKind, validateDestination } from "@/lib/delivery/destinations";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TARGETS = 10;

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  const destination = typeof body?.destination === "string" ? body.destination.trim() : "";

  if (!isDeliveryKind(kind)) {
    return NextResponse.json({ error: "Choose email, Google Sheet or webhook." }, { status: 400 });
  }
  const invalid = validateDestination(kind, destination);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const businessId = primaryBusinessId(await getAccessScope(supabase, session));
  if (!businessId || !(await canManageBusiness(supabase, session, businessId))) {
    return NextResponse.json({ error: "Only the business owner can add destinations." }, { status: 403 });
  }

  const { count } = await supabase
    .from("delivery_targets")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if ((count ?? 0) >= MAX_TARGETS) {
    return NextResponse.json({ error: `You can add up to ${MAX_TARGETS} destinations.` }, { status: 400 });
  }

  const { data: target, error } = await supabase
    .from("delivery_targets")
    .insert({ business_id: businessId, kind, destination })
    .select("*")
    .single();

  if (error || !target) {
    return NextResponse.json({ error: "Could not save the destination." }, { status: 500 });
  }
  return NextResponse.json({ target }, { status: 201 });
}

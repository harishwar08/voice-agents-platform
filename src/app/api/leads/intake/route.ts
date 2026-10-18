import { NextResponse } from "next/server";

import { formatE164PhoneNumber } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAttribution, sourceFromAttribution } from "@/lib/leads/attribution";
import { createLeadAndCall } from "@/lib/leads/create-lead";
import { checkSubmissionAllowed, clientIpFrom, hashIp } from "@/lib/leads/rate-limit";

const MAX_FIELD_LENGTH = 500;

// Client sites post from their own domains, so the browser preflights first.
// Safe to allow any origin: the endpoint takes no cookies and reads no session.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed || undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return json({ error: "Invalid request body." }, 400);
    }

    // Bots fill every field they find; real browsers leave the hidden one empty.
    // Answer 202 anyway so they get no signal that the submission was dropped.
    if (clean(body.company_website)) {
      return json({ accepted: true }, 202);
    }

    const businessId = clean(body.businessId);
    const name = clean(body.name);
    const rawPhone = clean(body.phone);

    if (!businessId || !name || !rawPhone) {
      return json({ error: "businessId, name and phone are required." }, 400);
    }

    const phone = formatE164PhoneNumber(rawPhone);
    if (!/^\+\d{8,15}$/.test(phone)) {
      return json({ error: "Enter a valid phone number." }, 400);
    }

    const ipHash = hashIp(clientIpFrom(request));

    const verdict = await checkSubmissionAllowed(phone, ipHash);
    if (!verdict.allowed) {
      return json({ error: verdict.reason }, 429);
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return json({ error: "Service unavailable." }, 503);
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .maybeSingle();

    if (!business) {
      return json({ error: "Unknown business." }, 404);
    }

    const utm = sanitizeAttribution(body.utm);

    const result = await createLeadAndCall(supabase, {
      businessId,
      aiEmployeeId: clean(body.aiEmployeeId),
      name,
      phone,
      email: clean(body.email),
      enquiry: clean(body.enquiry),
      // Client sites posting directly may send tags without naming a source.
      source: clean(body.source)?.slice(0, 50) ?? sourceFromAttribution(utm) ?? "ad_form",
      utm,
      ipHash,
    });

    if (!result.ok) {
      return json({ error: "Could not record your request." }, 500);
    }
    return json({ accepted: true, called: result.called, leadId: result.leadId }, 202);
  } catch {
    return json({ error: "Could not process your request." }, 500);
  }
}

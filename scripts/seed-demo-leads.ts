/**
 * Populates the leads and appointments screens with realistic finished calls
 * so a demo has something to show before (or instead of) a live call.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-demo-leads.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SAMPLES = [
  {
    name: "Anjali Sharma",
    phone: "+919812345001",
    enquiry: "Looking for a phone under ₹20,000 with a good camera",
    status: "contacted" as const,
    minutesAgo: 12,
    duration: 96,
    visitRequested: true,
    visitInHours: 26,
    outcome: "interested" as const,
    sentiment: "positive" as const,
    topics: ["camera", "pricing", "exchange offer"],
    unansweredQuestions: ["Do you offer EMI without a credit card?"],
    summary:
      "Anjali asked about camera-focused phones under ₹20,000 and was told about two models in that range, both in stock. She was quoted an exchange value for her current handset and sounded keen on the higher-spec option. She agreed to visit the store tomorrow evening to compare them in person.",
    transcript: [
      { role: "agent", en_text: "Hello! I'm calling from Sri Mobile about your enquiry. Am I speaking with Anjali?" },
      { role: "user", en_text: "Yes, that's me." },
      { role: "agent", en_text: "You mentioned looking for a phone under twenty thousand with a good camera. We have two strong options in stock right now." },
      { role: "user", en_text: "What's the difference between them?" },
      { role: "agent", en_text: "One has a better main sensor, the other has longer battery life. Both are within your budget, and we can offer an exchange on your current phone." },
      { role: "user", en_text: "Can I come and see them? Maybe tomorrow evening?" },
      { role: "agent", en_text: "Absolutely, tomorrow evening works. I'll note that down and we'll have both ready for you." },
    ],
  },
  {
    name: "Rohit Menon",
    phone: "+919812345002",
    enquiry: "Does the exchange offer apply to older models?",
    status: "contacted" as const,
    minutesAgo: 47,
    duration: 64,
    visitRequested: false,
    visitInHours: null,
    outcome: "callback_requested" as const,
    sentiment: "neutral" as const,
    topics: ["exchange offer", "pricing"],
    unansweredQuestions: [
      "Do you offer EMI without a credit card?",
      "How long is the warranty on exchanged phones?",
    ],
    summary:
      "Rohit wanted to know whether the exchange programme covers older handsets. He was told it does, with the value depending on condition, and that an on-the-spot quote is available in store. He said he would think it over and did not commit to a visit.",
    transcript: [
      { role: "agent", en_text: "Hi Rohit, calling from Sri Mobile regarding your enquiry about the exchange offer." },
      { role: "user", en_text: "Yes, my phone is about four years old. Does it still qualify?" },
      { role: "agent", en_text: "It does. Older models are accepted, and the value depends on the condition. We can give you an exact quote in store." },
      { role: "user", en_text: "Okay, let me think about it and I'll get back to you." },
    ],
  },
  {
    name: "Priyanka Nair",
    phone: "+919812345003",
    enquiry: "Need a phone for my father, simple to use",
    status: "unreachable" as const,
    minutesAgo: 90,
    duration: null,
    visitRequested: null,
    visitInHours: null,
    outcome: "no_answer" as const,
    sentiment: null,
    topics: [],
    unansweredQuestions: [],
    summary: "No conversation was recorded for this call.",
    transcript: null,
  },
];

async function main() {
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (!business) {
    console.error("No business found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const { data: employee } = await supabase
    .from("ai_employees")
    .select("id")
    .eq("business_id", business.id)
    .limit(1)
    .maybeSingle();

  console.log(`Seeding demo leads for ${business.name}...\n`);

  for (const sample of SAMPLES) {
    const createdAt = new Date(Date.now() - sample.minutesAgo * 60_000).toISOString();

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        business_id: business.id,
        ai_employee_id: employee?.id ?? null,
        name: sample.name,
        phone: sample.phone,
        enquiry: sample.enquiry,
        source: "demo_seed",
        status: sample.status,
        created_at: createdAt,
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      console.error(`  Failed to insert ${sample.name}: ${leadError?.message}`);
      continue;
    }

    const { error: callError } = await supabase.from("call_attempts").insert({
      lead_id: lead.id,
      business_id: business.id,
      attempt_id: `demo-${lead.id}`,
      status: sample.duration ? "connected" : "no_answer",
      duration: sample.duration,
      transcript: sample.transcript,
      summary: sample.summary,
      visit_requested: sample.visitRequested,
      preferred_visit_at: sample.visitInHours
        ? new Date(Date.now() + sample.visitInHours * 3_600_000).toISOString()
        : null,
      outcome: sample.outcome,
      sentiment: sample.sentiment,
      topics: sample.topics,
      unanswered_questions: sample.unansweredQuestions,
      created_at: createdAt,
    });

    if (callError) {
      console.error(`  Lead saved but call failed for ${sample.name}: ${callError.message}`);
      continue;
    }

    const marker = sample.visitRequested ? " (visit requested)" : "";
    console.log(`  ${sample.name} — ${sample.status}${marker}`);
  }

  console.log("\nDone. Check /dashboard/leads and /dashboard/appointments.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { notFound } from "next/navigation";

import { LeadCaptureForm } from "@/components/leads/LeadCaptureForm";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HIGHLIGHTS = [
  { title: "Instant callback", body: "A specialist calls you within seconds of submitting." },
  { title: "Straight answers", body: "Real pricing, availability and options on the call." },
  { title: "No waiting", body: "No queues, no callbacks scheduled for next week." },
];

type PageProps = { params: Promise<{ businessId: string }> };

async function loadBusiness(businessId: string) {
  if (!UUID.test(businessId)) return null;

  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, industry, status")
    .eq("id", businessId)
    .maybeSingle();

  if (!business || business.status === "inactive") return null;

  const { data: employee } = await supabase
    .from("ai_employees")
    .select("id, name")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { business, employee };
}

export async function generateMetadata({ params }: PageProps) {
  const { businessId } = await params;
  const loaded = await loadBusiness(businessId);

  return {
    title: loaded ? `${loaded.business.name} — Request a callback` : "Request a callback",
    // Ad landing pages should not compete with the client's own site in search.
    robots: { index: false, follow: false },
  };
}

export default async function BusinessLeadFormPage({ params }: PageProps) {
  const { businessId } = await params;
  const loaded = await loadBusiness(businessId);

  if (!loaded) notFound();

  const { business, employee } = loaded;

  return (
    <main className="relative min-h-full bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_0%_0%,#daf0e8_0%,transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_100%,#e7eee9_0%,transparent_50%)]"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 md:py-16">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            {business.name}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            Enquiries open now
          </span>
        </header>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Talk to us today
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
              Tell us what you need. We&apos;ll call you straight back.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
              Leave your details and someone from {business.name} will call within
              seconds to answer your questions, talk through pricing and check
              what&apos;s available.
            </p>

            <dl className="mt-10 grid gap-5 sm:grid-cols-3">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className="border-t border-border pt-4">
                  <dt className="text-sm font-semibold text-ink">{item.title}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-muted">{item.body}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-10 text-xs text-muted">
              {business.industry ? `${business.industry} · ` : ""}Your details are used
              only to respond to this enquiry.
            </p>
          </div>

          <LeadCaptureForm
            businessId={business.id}
            aiEmployeeId={employee?.id ?? null}
            employeeName={employee?.name ?? "Our team"}
          />
        </div>
      </div>
    </main>
  );
}

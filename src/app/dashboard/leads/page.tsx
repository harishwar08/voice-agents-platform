import Link from "next/link";

import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { SourceBreakdownTable } from "@/components/owner/SourceBreakdownTable";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getBusinessLeads, latestAttempt, sourceBreakdown } from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { LEAD_RESULT, LEAD_RESULTS, leadResult, type LeadResult } from "@/lib/leads/result";
import { ownerPages } from "@/lib/pages";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Shown even at zero, since they answer the first question about any list; the rest appear once they happen.
const ALWAYS_SHOWN: LeadResult[] = ["interested", "not_interested"];

export default async function LeadsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const leads = workspace.primaryBusiness
    ? await getBusinessLeads(workspace.primaryBusiness.id)
    : [];
  const breakdown = sourceBreakdown(leads);

  const withResult = leads.map((lead) => ({ lead, result: leadResult(lead.call_attempts) }));
  const counts = new Map<LeadResult, number>();
  for (const { result } of withResult) counts.set(result, (counts.get(result) ?? 0) + 1);
  const selected = LEAD_RESULTS.find((r) => r.value === query.result)?.value ?? null;
  const shown = selected ? withResult.filter((item) => item.result === selected) : withResult;
  const chips = LEAD_RESULTS.filter((r) => ALWAYS_SHOWN.includes(r.value) || counts.get(r.value));

  const chip = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
      active ? "border-ink bg-ink text-surface" : "border-border bg-surface text-foreground hover:border-accent"
    }`;
  const countStyle = (active: boolean) => `tabular-nums text-xs ${active ? "text-surface/70" : "text-muted"}`;

  return (
    <AppSectionPage meta={ownerPages.leads} showEmpty={leads.length === 0}>
      {leads.length > 0 ? (
        <div className="mt-6 space-y-10">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Where your leads come from
            </h2>
            <p className="mt-1 text-sm text-muted">
              Each ad you run shows up as its own row.{" "}
              <Link href="/dashboard/settings" className="font-semibold text-accent hover:underline">
                Get a tagged ad link
              </Link>{" "}
              so new ads are tracked too.
            </p>
            <div className="mt-4">
              <SourceBreakdownTable rows={breakdown} />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {selected ? `${LEAD_RESULT[selected].label} leads` : "All leads"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Each lead is marked with how their calls went. Interested if they said yes on any call, otherwise what
              they said on the latest call they picked up.
            </p>
            <nav aria-label="Filter leads by result" className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/leads" scroll={false} aria-current={!selected ? "page" : undefined} className={chip(!selected)}>
                All <span className={countStyle(!selected)}>{leads.length}</span>
              </Link>
              {chips.map((r) => {
                const active = selected === r.value;
                return (
                  <Link
                    key={r.value}
                    href={`/dashboard/leads?result=${r.value}`}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={chip(active)}
                  >
                    {r.label} <span className={countStyle(active)}>{counts.get(r.value) ?? 0}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-5 space-y-4">
              {shown.length ? (
                shown.map(({ lead }) => <LeadCallCard key={lead.id} lead={lead} attempt={latestAttempt(lead)} />)
              ) : (
                <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
                  No {selected ? LEAD_RESULT[selected].label.toLowerCase() : ""} leads yet.{" "}
                  <Link href="/dashboard/leads" scroll={false} className="font-semibold text-accent hover:underline">
                    Show all leads
                  </Link>
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </AppSectionPage>
  );
}

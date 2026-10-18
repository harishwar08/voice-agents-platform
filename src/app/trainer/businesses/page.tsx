import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { AddClientForm } from "@/components/trainer/AddClientForm";
import { BusinessCreditsRow } from "@/components/trainer/BusinessCreditsRow";
import { requireTrainerAccess } from "@/lib/auth/session";
import { formatRupees, isBillingEnforced } from "@/lib/billing/credits";
import { loadAgentChoices } from "@/lib/clients/agent-choices";
import { trainerPages } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function TrainerBusinessesPage() {
  await requireTrainerAccess();
  const supabase = createAdminClient();

  const [[{ data: businesses }, { data: balances }], choices] = await Promise.all([
    supabase
      ? Promise.all([
          supabase.from("businesses").select("id, name, rate_per_minute_paise").order("name"),
          supabase.from("business_balances").select("business_id, balance_paise"),
        ])
      : Promise.resolve([{ data: null }, { data: null }] as const),
    loadAgentChoices(supabase),
  ]);

  const balanceOf = new Map((balances ?? []).map((b) => [b.business_id, Number(b.balance_paise)]));
  const list = businesses ?? [];

  return (
    <AppSectionPage meta={{ ...trainerPages.businesses, comingInPhase: undefined }} showEmpty={list.length === 0}>
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Clients</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Create a client&apos;s login, business and AI employee, then send them the login details.
        </p>
        <AddClientForm choices={choices} />
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Call credits</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Add credit after a business pays you (UPI, bank transfer), and set its per-minute rate.
          Billing enforcement is <strong>{isBillingEnforced() ? "on" : "off"}</strong>
          {isBillingEnforced()
            ? ": businesses with less than one minute of credit stop calling."
            : ": calls are charged and recorded, but nobody is blocked for low balance (set BILLING_ENFORCED=true to switch it on)."}
        </p>
        {list.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {list.map((b) => {
              const balance = balanceOf.get(b.id) ?? 0;
              return (
                <BusinessCreditsRow
                  key={b.id}
                  businessId={b.id}
                  name={b.name}
                  balanceLabel={formatRupees(balance)}
                  ratePaise={b.rate_per_minute_paise ?? 300}
                  low={balance < (b.rate_per_minute_paise ?? 300) * 10}
                />
              );
            })}
          </ul>
        ) : null}
      </section>
    </AppSectionPage>
  );
}

import Link from "next/link";

import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { AddClientForm } from "@/components/trainer/AddClientForm";
import { CallProblemsPanel } from "@/components/trainer/CallAlerts";
import { ClientAgentField } from "@/components/trainer/ClientAgentField";
import { ClientTrainingEditor } from "@/components/trainer/ClientTrainingEditor";
import { DeleteClientButton } from "@/components/trainer/DeleteClientButton";
import { ResetClientPassword } from "@/components/trainer/ResetClientPassword";
import { requireTrainerAccess } from "@/lib/auth/session";
import { loadAgentChoices } from "@/lib/clients/agent-choices";
import { clientLogins, type ClientLogin } from "@/lib/clients/delete-client";
import type { PageMeta } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAgentTraining, type AgentTraining } from "@/lib/voice/agent-training";

const meta: PageMeta = {
  title: "Add clients",
  description: "Create a client's login and business, then send them the login details.",
  breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Add clients" }],
};

type ClientRow = {
  id: string;
  name: string;
  createdAt: string;
  owners: { id: string; email: string }[];
  /** Everyone with access, and whether deleting the client deletes their login. */
  logins: ClientLogin[];
  counts: { leads: number; calls: number; campaigns: number };
  employee: { id: string; name: string; cartesiaAgentId: string | null; training: AgentTraining | null } | null;
};

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

/** What deleting a client would remove, shown before an admin confirms. */
async function countClientData(supabase: AdminClient, businessId: string) {
  const count = (table: "leads" | "call_attempts" | "campaigns") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("business_id", businessId).then((r) => r.count ?? 0);
  const [leads, calls, campaigns] = await Promise.all([count("leads"), count("call_attempts"), count("campaigns")]);
  return { leads, calls, campaigns };
}

async function loadClients(): Promise<ClientRow[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  // Plain reads joined here: the embedded-select typing has no relationships to follow.
  const [{ data: businesses }, { data: members }, { data: profiles }, { data: employees }] = await Promise.all([
    supabase.from("businesses").select("id, name, created_at").order("created_at", { ascending: false }),
    supabase.from("business_members").select("business_id, user_id, role"),
    supabase.from("profiles").select("id, email, platform_role"),
    // "*" rather than naming agent_training or cartesia_agent_id, so the page still loads before phases 15 and 19.
    supabase.from("ai_employees").select("*").order("created_at", { ascending: true }),
  ]);

  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const counts = await Promise.all((businesses ?? []).map((b) => countClientData(supabase, b.id)));
  return (businesses ?? []).map((b, index) => {
    const employee = (employees ?? []).find((e) => e.business_id === b.id);
    const owners = (members ?? []).filter((m) => m.business_id === b.id && m.role === "owner").map((m) => ({ id: m.user_id, email: emailOf.get(m.user_id) ?? "—" }));
    return {
      id: b.id,
      name: b.name,
      createdAt: b.created_at,
      owners,
      logins: clientLogins(b.id, members ?? [], profiles ?? []),
      counts: counts[index]!,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            cartesiaAgentId: employee.cartesia_agent_id ?? null,
            training: sanitizeAgentTraining(employee.agent_training),
          }
        : null,
    };
  });
}

export default async function AdminPage() {
  const session = await requireTrainerAccess();
  const [clients, choices] = await Promise.all([loadClients(), loadAgentChoices(createAdminClient())]);
  // Trainers manage clients too, but only admins may delete one.
  const canDelete = session.profile.platform_role === "admin";

  return (
    <AppSectionPage meta={meta} showEmpty={false}>
      <AddClientForm startOpen choices={choices} />

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Clients ({clients.length})</h2>
          <Link href="/trainer/businesses" className="text-sm font-semibold text-accent hover:underline">
            Manage call credits
          </Link>
        </div>
        {clients.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {clients.map((client) => (
              <li key={client.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{client.name}</p>
                  {client.owners.length ? (
                    client.owners.map((o) => (
                      <ResetClientPassword key={o.id} userId={o.id} email={o.email} businessName={client.name} />
                    ))
                  ) : (
                    <p className="text-sm text-muted">No owner login</p>
                  )}
                </div>
                <div className="text-right text-sm">
                  {client.employee ? (
                    <ClientAgentField
                      employeeId={client.employee.id}
                      employeeName={client.employee.name}
                      cartesiaAgentId={client.employee.cartesiaAgentId}
                      agents={choices.agents}
                    />
                  ) : (
                    <p className="text-foreground">No agent yet</p>
                  )}
                  <p className="text-xs text-muted">
                    Added{" "}
                    {new Date(client.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </div>
                {client.employee ? (
                  <div className="w-full space-y-1">
                    <p className="text-sm">
                      {/* A plain link: a route handler sets the staff view, then opens the dashboard. */}
                      <a href={`/api/trainer/view?businessId=${client.id}`} className="font-semibold text-accent hover:underline">
                        View dashboard
                      </a>
                      <span className="text-muted"> · </span>
                      <Link
                        href={`/trainer/knowledge?employee=${client.employee.id}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        Knowledge base
                      </Link>
                    </p>
                    <ClientTrainingEditor
                      employeeId={client.employee.id}
                      employeeName={client.employee.name}
                      training={client.employee.training}
                    />
                  </div>
                ) : null}
                {canDelete ? (
                  <div className="w-full border-t border-border pt-3">
                    <DeleteClientButton
                      businessId={client.id}
                      businessName={client.name}
                      counts={client.counts}
                      logins={client.logins}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No clients yet. Add your first one above.</p>
        )}
      </section>

      <CallProblemsPanel />
    </AppSectionPage>
  );
}

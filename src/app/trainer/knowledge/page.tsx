import Link from "next/link";

import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { StaffKnowledgePanel } from "@/components/trainer/StaffKnowledgePanel";
import { requireTrainerAccess } from "@/lib/auth/session";
import { trainerPages } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

type Agent = { id: string; name: string; businessName: string };

async function loadAgents(): Promise<Agent[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];
  const [{ data: businesses }, { data: employees }] = await Promise.all([
    supabase.from("businesses").select("id, name").order("name", { ascending: true }),
    supabase.from("ai_employees").select("id, name, business_id").order("created_at", { ascending: true }),
  ]);
  const nameOf = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  return (employees ?? [])
    .map((e) => ({ id: e.id, name: e.name, businessName: nameOf.get(e.business_id) ?? "Unknown client" }))
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
}

export default async function TrainerKnowledgePage({ searchParams }: PageProps) {
  await requireTrainerAccess();
  const agents = await loadAgents();
  const requested = (await searchParams).employee;
  const selected = agents.find((a) => a.id === requested) ?? agents[0];

  return (
    <AppSectionPage meta={trainerPages.knowledge} showEmpty={false}>
      {selected ? (
        <div className="space-y-6">
          <nav aria-label="Clients" className="flex flex-wrap gap-2">
            {agents.map((a) => (
              <Link
                key={a.id}
                href={`/trainer/knowledge?employee=${a.id}`}
                aria-current={a.id === selected.id ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  a.id === selected.id
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-ink hover:border-accent"
                }`}
              >
                {a.businessName} <span className={a.id === selected.id ? "text-white/80" : "text-muted"}>· {a.name}</span>
              </Link>
            ))}
          </nav>
          <StaffKnowledgePanel key={selected.id} aiEmployeeId={selected.id} employeeName={selected.name} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          No clients yet.{" "}
          <Link href="/admin" className="font-semibold text-accent hover:underline">
            Add a client
          </Link>{" "}
          first.
        </p>
      )}
    </AppSectionPage>
  );
}

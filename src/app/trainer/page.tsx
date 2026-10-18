import Link from "next/link";

import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireTrainerAccess } from "@/lib/auth/session";
import { getTrainerOverview } from "@/lib/data/workspace";
import { trainerPages } from "@/lib/pages";

export default async function TrainerPage() {
  const session = await requireTrainerAccess();
  const overview = await getTrainerOverview();

  return (
    <div>
      <PageHeader
        title={trainerPages.dashboard.title}
        description={trainerPages.dashboard.description}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Businesses" value={String(overview.businessCount)} />
        <StatCard label="AI employees" value={String(overview.aiEmployeeCount)} />
        <StatCard label="Live employees" value={String(overview.liveCount)} />
        <StatCard label="Knowledge gaps" value="—" hint="Phase 14" />
      </div>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Trainer workflows
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Businesses", href: "/trainer/businesses", desc: "Onboard and manage" },
            { label: "Test Lab", href: "/trainer/test-lab", desc: "Run scenario tests" },
            { label: "Knowledge Gaps", href: "/trainer/knowledge-gaps", desc: "Fix failures" },
            { label: "Versions", href: "/trainer/versions", desc: "Approve and deploy" },
            { label: "Conversations", href: "/trainer/conversations", desc: "Review calls" },
            { label: "Deployment", href: "/trainer/deployment", desc: "Go live safely" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border border-border bg-surface px-5 py-4 transition hover:border-accent"
            >
              <p className="font-medium text-ink">{item.label}</p>
              <p className="mt-1 text-sm text-muted">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-8 text-sm text-muted">
        Signed in as {session.profile.full_name ?? session.email} ({session.profile.platform_role})
      </p>
    </div>
  );
}

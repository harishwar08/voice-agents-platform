import Link from "next/link";

import type { AiEmployee } from "@/lib/database.types";

type AiEmployeeStatusCardProps = {
  employee: AiEmployee | null;
  businessName?: string;
};

const statusLabel: Record<AiEmployee["status"], string> = {
  draft: "Draft",
  testing: "Testing",
  live: "Active",
  paused: "Paused",
};

const statusColor: Record<AiEmployee["status"], string> = {
  draft: "bg-muted/20 text-muted",
  testing: "bg-warn/15 text-warn",
  live: "bg-accent-soft text-accent",
  paused: "bg-border text-muted",
};

export function AiEmployeeStatusCard({ employee, businessName }: AiEmployeeStatusCardProps) {
  if (!employee) {
    return (
      <div className="border border-border bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          AI Employee
        </p>
        <p className="mt-2 font-display text-xl font-semibold text-ink">Not configured</p>
        <p className="mt-2 text-sm text-muted">
          Run <code className="rounded bg-background px-1">npm run db:seed</code> or ask your
          trainer to set up an AI employee.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            AI Employee
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-ink">{employee.name}</p>
          {businessName ? (
            <p className="mt-1 text-sm text-muted">{businessName}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusColor[employee.status]}`}
        >
          {statusLabel[employee.status]}
        </span>
      </div>
      {employee.description ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">{employee.description}</p>
      ) : null}
      <Link
        href="/dashboard/ai-employee"
        className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
      >
        View details →
      </Link>
    </div>
  );
}

import Link from "next/link";

import { formatTrainingDate, type AgentTraining } from "@/lib/voice/agent-training";

type Props = { training: AgentTraining | null };

/**
 * The training staff did for this agent in the voice provider's console, as they recorded it.
 * Read-only: the owner changes facts through the knowledge base instead.
 */
export function TrainingSection({ training }: Props) {
  if (!training) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
        Your agent&apos;s training has not been added here yet. Once our team trains it, you will see its greeting, language,
        voice and full prompt on this page.
      </div>
    );
  }

  const facts = [
    { label: "Greeting", value: training.greeting },
    { label: "Language", value: training.language },
    // Providers often give voice ids in lowercase ("pooja"); shown as a name.
    { label: "Voice", value: training.voice.charAt(0).toUpperCase() + training.voice.slice(1) },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Last updated {formatTrainingDate(training.updatedAt)}. Our team trains your agent and keeps this page up to date. To
        change prices, projects or other facts, edit your{" "}
        <Link href="/dashboard/ai-employee" className="text-accent hover:underline">
          knowledge base
        </Link>
        .
      </p>

      <dl className="grid gap-3 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-background p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{f.label}</dt>
            <dd className="mt-1 break-words text-sm text-ink">{f.value || "Not set"}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Prompt</p>
        {training.prompt ? (
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground">
            {training.prompt}
          </pre>
        ) : (
          <p className="text-sm text-muted">Not added yet.</p>
        )}
      </div>

      {training.changes.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Change history</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {training.changes.map((c) => (
              <li key={`${c.at}-${c.note}`} className="flex flex-wrap gap-x-4 gap-y-1 p-3 text-sm">
                <span className="shrink-0 text-muted">{formatTrainingDate(c.at)}</span>
                <span className="min-w-0 text-foreground">{c.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

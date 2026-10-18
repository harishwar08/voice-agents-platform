"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { ClientLogin } from "@/lib/clients/delete-client";

type Props = {
  businessId: string;
  businessName: string;
  counts: { leads: number; calls: number; campaigns: number };
  logins: ClientLogin[];
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Deletes a client and everything it owns, after the admin has seen what goes and
 * typed the client's name. The list refreshes without the client afterwards.
 */
export function DeleteClientButton({ businessId, businessName, counts, logins }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const goes = logins.filter((l) => l.deleted);
  const stays = logins.filter((l) => !l.deleted);

  async function run() {
    const tallies = [
      { label: counts.leads === 1 ? "Lead" : "Leads", value: counts.leads },
      { label: counts.calls === 1 ? "Call" : "Calls", value: counts.calls },
      { label: counts.campaigns === 1 ? "Campaign" : "Campaigns", value: counts.campaigns },
    ];
    const confirmed = await confirm({
      title: `Delete ${businessName}?`,
      message: (
        <div className="space-y-4">
          <p>
            Everything in this client is deleted for good. <span className="font-semibold text-ink">This can&apos;t be undone.</span>
          </p>

          <div className="overflow-hidden rounded-xl border border-border">
            <dl className="grid grid-cols-3 divide-x divide-border bg-background">
              {tallies.map((t) => (
                <div key={t.label} className="px-2 py-2.5 text-center">
                  <dd className={`font-display text-xl font-semibold leading-tight ${t.value ? "text-danger" : "text-ink"}`}>
                    {t.value}
                  </dd>
                  <dt className="text-xs text-muted">{t.label}</dt>
                </div>
              ))}
            </dl>
            <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
              Plus its AI employee, call transcripts, call credits, knowledge base and settings.
            </p>
          </div>

          {goes.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {goes.length === 1 ? "Login deleted" : `${plural(goes.length, "login")} deleted`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {goes.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm font-medium break-all text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20a7 7 0 0 1 14 0" />
                    </svg>
                    {l.email}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {stays.length ? (
            <p className="text-xs">
              Kept, because staff or another client use them: <span className="text-ink">{stays.map((l) => l.email).join(", ")}</span>
            </p>
          ) : null}

          <p className="flex items-start gap-2 rounded-lg bg-accent-soft/60 px-3 py-2 text-xs leading-relaxed text-ink">
            <svg viewBox="0 0 24 24" className="mt-px h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8v.01" />
            </svg>
            The Cartesia voice agent stays in your account, free to link to another client.
          </p>
        </div>
      ),
      confirmLabel: "Delete client",
      tone: "danger",
      typeToConfirm: businessName,
    });
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trainer/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, confirmName: businessName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete the client.");
      if (data.failedLogins?.length) {
        await confirm({
          title: `${businessName} was deleted`,
          message: `These logins could not be deleted, so they can still sign in: ${data.failedLogins.join(", ")}. Remove them in Supabase under Authentication → Users.`,
          confirmLabel: "OK",
        });
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {error ? <span className="text-sm text-danger">{error}</span> : null}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete client"}
      </button>
    </div>
  );
}

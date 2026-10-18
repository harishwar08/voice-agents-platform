"use client";

import { useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { DeliveryKind, DeliveryTarget } from "@/lib/database.types";
import { KIND_LABELS, validateDestination } from "@/lib/delivery/destinations";

const PLACEHOLDERS: Record<DeliveryKind, string> = {
  email: "you@yourbusiness.com",
  sheet: "https://script.google.com/macros/s/…/exec",
  webhook: "https://your-crm.example.com/hooks/leads",
};

const HINTS: Record<DeliveryKind, string> = {
  email: "An email with the summary arrives after every call.",
  sheet: "A new row is added to your sheet after every call. Follow the 3 steps below first.",
  webhook: "We POST the full result as JSON to your URL — for CRMs, Zapier, Make or your own system.",
};

// Pasted into the owner's sheet: header row on first use, then one row per call,
// matched by column name so the owner can reorder or add columns freely.
const SHEET_SCRIPT = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var row = JSON.parse(e.postData.contents);
  if (sheet.getLastRow() === 0) sheet.appendRow(Object.keys(row));
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(function (h) { return row[h] !== undefined ? row[h] : ""; }));
  return ContentService.createTextOutput("ok");
}`;

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function StatusLine({ target }: { target: DeliveryTarget }) {
  if (!target.last_status || !target.last_sent_at) {
    return <span className="text-muted">Nothing sent yet</span>;
  }
  if (target.last_status === "sent") {
    return <span className="text-accent">✓ Last sent {formatWhen(target.last_sent_at)}</span>;
  }
  return (
    <span className="text-warn">
      ✕ Failed {formatWhen(target.last_sent_at)}
      {target.last_error ? ` — ${target.last_error}` : ""}
    </span>
  );
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

type Props = {
  initialTargets: DeliveryTarget[];
  canManage: boolean;
  emailConfigured: boolean;
};

export function DeliverySettings({ initialTargets, canManage, emailConfigured }: Props) {
  const confirm = useConfirm();
  const [targets, setTargets] = useState(initialTargets);
  const [kind, setKind] = useState<DeliveryKind>("email");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function replace(updated: DeliveryTarget) {
    setTargets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const invalid = validateDestination(kind, destination);
    if (invalid) return setError(invalid);

    setBusy("add");
    setError("");
    try {
      const { target } = await api("/api/delivery-targets", "POST", { kind, destination });
      setTargets((list) => [...list, target]);
      setDestination("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(target: DeliveryTarget) {
    setBusy(target.id);
    try {
      const { target: updated } = await api(`/api/delivery-targets/${target.id}`, "PATCH", {
        enabled: !target.enabled,
      });
      replace(updated);
    } finally {
      setBusy(null);
    }
  }

  async function test(target: DeliveryTarget) {
    setBusy(target.id);
    try {
      const result = await api(`/api/delivery-targets/${target.id}/test`, "POST");
      replace({
        ...target,
        last_status: result.ok ? "sent" : "failed",
        last_error: result.ok ? null : result.error,
        last_sent_at: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(target: DeliveryTarget) {
    const confirmed = await confirm({
      title: `Stop sending results to ${target.destination}?`,
      message: "New call results won't be sent here. You can add it again later.",
      confirmLabel: "Stop sending",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(target.id);
    try {
      await api(`/api/delivery-targets/${target.id}`, "DELETE");
      setTargets((list) => list.filter((t) => t.id !== target.id));
    } finally {
      setBusy(null);
    }
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(SHEET_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const button =
    "rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:opacity-50";

  return (
    <div className="space-y-4">
      {!emailConfigured ? (
        <p className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          Email sending isn&apos;t switched on for this platform yet, so email destinations will show
          as failed until it is. Google Sheets and webhooks work now.
        </p>
      ) : null}

      {targets.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {targets.map((target) => (
            <li key={target.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    {KIND_LABELS[target.kind]}
                    {target.enabled ? "" : " · paused"}
                  </p>
                  <p className="mt-1 break-all text-sm font-medium text-ink">{target.destination}</p>
                  <p className="mt-1 text-xs">
                    <StatusLine target={target} />
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={button} disabled={busy === target.id} onClick={() => test(target)}>
                      Send test
                    </button>
                    <button type="button" className={button} disabled={busy === target.id} onClick={() => toggle(target)}>
                      {target.enabled ? "Pause" : "Resume"}
                    </button>
                    <button type="button" className={button} disabled={busy === target.id} onClick={() => remove(target)}>
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>

              {target.kind === "webhook" && canManage ? (
                <div className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">
                  Each request carries an <code className="text-ink">X-Voice-Agent-Signature</code>{" "}
                  header: <code className="text-ink">sha256=</code> HMAC of the body with your secret.{" "}
                  {revealed === target.id ? (
                    <code className="break-all text-ink">{target.secret}</code>
                  ) : (
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setRevealed(target.id)}>
                      Show secret
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
          Results only appear on your dashboard for now. Add an email, Google Sheet or webhook to get
          them where you work.
        </p>
      )}

      {canManage ? (
        <form onSubmit={add} className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-ink">Add a destination</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as DeliveryKind);
                setError("");
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
            >
              {(Object.keys(KIND_LABELS) as DeliveryKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type={kind === "email" ? "email" : "url"}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={PLACEHOLDERS[kind]}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy === "add" || !destination.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {busy === "add" ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">{HINTS[kind]}</p>
          {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}

          {kind === "sheet" ? (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                Open your Google Sheet, then <strong>Extensions → Apps Script</strong>. Replace
                everything there with this code:
                <div className="mt-2 rounded-lg bg-background p-3">
                  <pre className="overflow-x-auto text-xs text-ink">{SHEET_SCRIPT}</pre>
                  <button type="button" onClick={copyScript} className="mt-2 text-xs font-semibold text-accent hover:underline">
                    {copied ? "Copied" : "Copy code"}
                  </button>
                </div>
              </li>
              <li>
                Click <strong>Deploy → New deployment</strong>, choose type <strong>Web app</strong>,
                set &ldquo;Who has access&rdquo; to <strong>Anyone</strong>, and deploy.
              </li>
              <li>Copy the Web app URL (ending in /exec), paste it above, then press Send test.</li>
            </ol>
          ) : null}
        </form>
      ) : (
        <p className="text-xs text-muted">Only the business owner can change where results are sent.</p>
      )}
    </div>
  );
}

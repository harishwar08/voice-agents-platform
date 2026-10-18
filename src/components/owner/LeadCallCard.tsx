import type { CallAttempt, Lead } from "@/lib/database.types";
import { secondsToFirstCall, type LeadWithCalls } from "@/lib/data/leads";
import { formatRupees } from "@/lib/billing/credits";
import { CallDetailsPanel } from "@/components/owner/CallDetailsPanel";
import { formatSeconds } from "@/lib/format";
import { campaignOf, sourceLabel } from "@/lib/leads/attribution";
import { LEAD_RESULT, leadResult, type LeadResult } from "@/lib/leads/result";
import { formatCapturedValue, sanitizeCaptured } from "@/lib/voice/capture-fields";

const STATUS_STYLES: Record<Lead["status"], string> = {
  new: "bg-border/40 text-foreground",
  calling: "bg-accent-soft text-accent",
  contacted: "bg-accent-soft text-accent",
  unreachable: "bg-border/40 text-muted",
  converted: "bg-accent text-white",
  closed: "bg-border/40 text-muted",
};

const CALLBACK_BADGE: Record<NonNullable<Lead["callback_status"]>, { text: string; style: string }> = {
  scheduled: { text: "Callback", style: "bg-amber-100 text-amber-900" },
  calling: { text: "Calling back now", style: "bg-accent-soft text-accent" },
  done: { text: "Called back", style: "bg-border/40 text-muted" },
  failed: { text: "Callback failed: call by hand", style: "bg-red-50 text-red-700" },
};

// A coloured edge for the results an owner acts on, so a long list can be scanned by eye.
const RESULT_EDGE: Partial<Record<LeadResult, string>> = {
  interested: "border-l-4 border-l-accent",
  not_interested: "border-l-4 border-l-danger",
  callback: "border-l-4 border-l-amber-400",
};

function callbackTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type LeadCallCardProps = {
  lead: LeadWithCalls;
  attempt: CallAttempt | null;
};

export function LeadCallCard({ lead, attempt }: LeadCallCardProps) {
  const visitAt = formatDateTime(attempt?.preferred_visit_at ?? null);
  const campaign = campaignOf(lead.utm);
  const waited = secondsToFirstCall(lead);
  const result = leadResult(lead.call_attempts);
  const captured = sanitizeCaptured(attempt?.captured)
    .map((item) => ({ label: item.label, value: formatCapturedValue(item) }))
    .filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <article className={`rounded-xl border border-border bg-surface p-5 ${RESULT_EDGE[result] ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{lead.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {lead.phone}
            {lead.email ? ` · ${lead.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${LEAD_RESULT[result].badge}`}>
            {LEAD_RESULT[result].label}
          </span>
          {lead.callback_status ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CALLBACK_BADGE[lead.callback_status].style}`}>
              {CALLBACK_BADGE[lead.callback_status].text}
              {lead.callback_status === "scheduled" && lead.callback_at ? `: ${callbackTime(lead.callback_at)}` : ""}
            </span>
          ) : null}
          {attempt?.visit_requested ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-white">
              Appointment requested
            </span>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[lead.status]}`}
          >
            {lead.status}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
          <span className="text-muted">Source: </span>
          {sourceLabel(lead.source)}
        </span>
        {campaign ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
            <span className="text-muted">Campaign: </span>
            {campaign}
          </span>
        ) : null}
        {waited !== null ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
            <span className="text-muted">Called in: </span>
            {formatSeconds(waited)}
          </span>
        ) : null}
      </div>

      {lead.enquiry ? (
        <p className="mt-3 text-sm text-foreground">
          <span className="text-muted">Enquiry: </span>
          {lead.enquiry}
        </p>
      ) : null}

      {attempt?.summary ? (
        <div className="mt-4 rounded-lg bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Call summary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{attempt.summary}</p>
        </div>
      ) : null}

      {captured.length > 0 ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {captured.map((item) => (
            <div key={item.label} className="flex gap-2">
              <dt className="shrink-0 text-muted">{item.label}:</dt>
              <dd className="text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {visitAt ? (
        <p className="mt-3 text-sm text-accent">Preferred time: {visitAt}</p>
      ) : null}

      {attempt && attempt.status !== "dispatched" ? <CallDetailsPanel attempt={attempt} /> : null}

      <p className="mt-4 text-xs text-muted">
        {formatDateTime(lead.created_at)}
        {attempt?.duration ? ` · call lasted ${attempt.duration}s` : ""}
        {attempt?.charge_paise ? ` · ${attempt.billed_minutes} min, ${formatRupees(attempt.charge_paise)}` : ""}
        {attempt?.failure_reason ? ` · ${attempt.failure_reason}` : ""}
      </p>
    </article>
  );
}

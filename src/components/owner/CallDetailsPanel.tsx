import { TranscriptTurns } from "@/components/owner/TranscriptTurns";
import type { CallAttempt } from "@/lib/database.types";
import { formatPhone, formatSeconds } from "@/lib/format";
import { endReasonLabel, sanitizeCallDetails } from "@/lib/voice/call-details";

type Tone = "good" | "neutral" | "bad";

const STATUS: Record<CallAttempt["status"], { label: string; tone: Tone; explain?: string }> = {
  connected: { label: "Completed", tone: "good" },
  no_answer: { label: "No answer", tone: "neutral", explain: "The phone rang, but nobody picked up." },
  busy: {
    label: "Busy",
    tone: "neutral",
    explain: "The number was busy, or the person declined the call. If the phone never rang, the phone line may have refused it.",
  },
  failed: {
    label: "Failed",
    tone: "bad",
    explain: "The call could not be placed. This is usually the number or the phone line, not the customer.",
  },
  dispatched: { label: "In progress", tone: "neutral" },
};

// Reasons that say more than the status alone; the status explains the rest.
const EXPLAIN_BY_REASON: Record<string, string> = {
  dial_timeout: "The phone rang until it timed out, and nobody picked up.",
  voicemail_detected: "The call went to voicemail, so the agent hung up.",
  concurrency_limit: "Too many calls were running at once, so this one was not placed.",
};

const TONE: Record<Tone, { icon: string; title: string }> = {
  good: { icon: "bg-accent-soft text-accent", title: "text-ink" },
  neutral: { icon: "bg-border/50 text-muted", title: "text-ink" },
  bad: { icon: "bg-danger/10 text-danger", title: "text-danger" },
};

function PhoneIcon({ missed }: { missed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      {missed ? <path d="m16 2 6 6M22 2l-6 6" /> : null}
    </svg>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * A finished call as the voice provider saw it. A call that never connected is one short
 * row saying why in plain words, with the provider's own message folded away; a connected
 * call adds who spoke, the agent's speed, then the transcript and the recording.
 */
export function CallDetailsPanel({ attempt, transcriptOpen = false }: { attempt: CallAttempt; transcriptOpen?: boolean }) {
  const details = sanitizeCallDetails(attempt.call_details);
  const transcript = attempt.transcript ?? [];
  const customerSpoke = transcript.some((turn) => turn.role === "user");
  const status = STATUS[attempt.status];
  const tone = TONE[status.tone];
  const connected = attempt.status === "connected";
  const ended = endReasonLabel(details?.endReason ?? null);
  const explain = (details?.endReason ? EXPLAIN_BY_REASON[details.endReason] : undefined) ?? status.explain;
  const recordingUrl = `/api/calls/${attempt.id}/recording`;
  // Each number stays on one line; a narrow screen wraps at the arrow instead.
  const route =
    details?.from || details?.to ? (
      <>
        <span className="whitespace-nowrap">{details.from ? formatPhone(details.from) : "—"}</span> →{" "}
        <span className="whitespace-nowrap">{details.to ? formatPhone(details.to) : "—"}</span>
      </>
    ) : null;
  const channel = details?.channel ? (details.channel === "web" ? "Web call" : "Phone call") : null;
  // "Busy" with "Line busy" says the same thing twice; the reason is shown only when it adds something.
  const title = ended && ended.toLowerCase() !== status.label.toLowerCase() && !connected ? ended : status.label;

  const header = (
    <div className="flex items-start gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
        <PhoneIcon missed={!connected} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className={`text-sm font-semibold ${tone.title}`}>{title}</p>
          <p className="text-xs text-muted">
            {[channel, connected && attempt.duration ? formatSeconds(attempt.duration) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {connected ? (
          ended ? <p className="mt-0.5 text-sm text-muted">{ended}</p> : null
        ) : explain ? (
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{explain}</p>
        ) : null}
        {route ? <p className="mt-2 text-xs text-muted tabular-nums">{route}</p> : null}
        {details?.errorMessage ? (
          <details className="group mt-2" open={status.tone === "bad"}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <svg viewBox="0 0 24 24" className="h-3 w-3 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 6 6 6-6 6" />
              </svg>
              Technical details
            </summary>
            <p
              className={`mt-1.5 rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed break-words ${
                status.tone === "bad" ? "bg-danger/5 text-danger" : "bg-background text-muted"
              }`}
            >
              {details.errorMessage}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );

  if (!connected) {
    return <div className="mt-4 rounded-lg border border-border bg-background/50 p-4">{header}</div>;
  }

  const facts = [
    { label: "Customer spoke", value: customerSpoke ? "Yes" : "No" },
    details?.avgResponseMs !== null && details?.avgResponseMs !== undefined
      ? { label: "Agent response time", value: `${(details.avgResponseMs / 1000).toFixed(2)} s average` }
      : null,
    details?.turns ? { label: "Turns", value: `${details.turns}${details.interruptions ? ` · ${details.interruptions} interrupted` : ""}` } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      {header}

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </dl>

      {transcript.length || details?.hasRecording ? (
        <details className="mt-4" open={transcriptOpen}>
          <summary className="cursor-pointer text-sm font-semibold text-accent">
            Transcript{details?.hasRecording ? " and recording" : ""}
          </summary>

          {details?.hasRecording ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* preload="none": nothing downloads until the owner presses play. */}
              <audio controls preload="none" src={recordingUrl} className="h-10 max-w-full flex-1">
                Your browser cannot play this recording.
              </audio>
              <a href={`${recordingUrl}?download=1`} className="text-sm font-semibold text-accent hover:underline">
                Download
              </a>
            </div>
          ) : null}

          {transcript.length ? <TranscriptTurns transcript={transcript} /> : null}
        </details>
      ) : null}
    </div>
  );
}

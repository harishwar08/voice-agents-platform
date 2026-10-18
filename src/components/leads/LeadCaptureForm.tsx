"use client";

import { useState } from "react";

import { attributionFromSearch, sourceFromAttribution } from "@/lib/leads/attribution";

type Phase = "idle" | "submitting" | "done" | "error";

export function LeadCaptureForm({
  businessId,
  aiEmployeeId,
  employeeName,
}: {
  businessId: string;
  aiEmployeeId: string | null;
  employeeName: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [enquiry, setEnquiry] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [called, setCalled] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPhase("submitting");

    // Read at submit time: the ad's tags only live in the landing URL.
    const utm = attributionFromSearch(window.location.search);

    try {
      const res = await fetch("/api/leads/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          aiEmployeeId,
          name,
          phone,
          enquiry,
          source: sourceFromAttribution(utm) ?? "hosted_form",
          utm,
          company_website: honeypot,
        }),
      });

      const data = await res.json();

      if (res.ok && data.accepted) {
        setPhase("done");
        setCalled(Boolean(data.called));
        setMessage(
          data.called
            ? `${employeeName} is calling ${phone} right now. Please pick up.`
            : "We have your details and will be in touch shortly."
        );
      } else {
        setPhase("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setPhase("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-accent bg-accent-soft p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-white">
          ✓
        </div>
        <h3 className="mt-4 font-display text-2xl font-semibold text-ink">
          Thanks, {name.split(" ")[0] || "there"}!
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-accent">{message}</p>
        {called ? <p className="mt-4 text-xs text-muted">Typically connects within 30 seconds.</p> : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_rgba(7,26,20,0.08)]"
    >
      <h3 className="font-display text-xl font-semibold text-ink">Request a callback</h3>
      <p className="mt-1 text-xs text-muted">
        Fill this in and we&apos;ll call you within seconds.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Your name</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ravi Kumar"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Phone number</span>
          <input
            required
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 90000 00000"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            What are you looking for?
          </span>
          <textarea
            value={enquiry}
            onChange={(event) => setEnquiry(event.target.value)}
            rows={3}
            placeholder="Tell us briefly what you need"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </label>

        {/* Hidden from people, filled by bots; the server drops any submission that sets it. */}
        <input
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          className="hidden"
          aria-hidden
        />

        {phase === "error" ? <p className="text-sm text-red-700">{message}</p> : null}

        <button
          type="submit"
          disabled={phase === "submitting"}
          className="w-full rounded-lg bg-ink px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60"
        >
          {phase === "submitting" ? "Connecting…" : "Call me now"}
        </button>

        <p className="text-center text-xs text-muted">
          By submitting you agree to receive a call about your enquiry.
        </p>
      </div>
    </form>
  );
}

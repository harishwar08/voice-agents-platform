"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CallingSettings, settingsOf, type CampaignSettings } from "@/components/campaigns/CallingSettings";
import type { Campaign } from "@/lib/database.types";

const INSIDE_HINT: Record<Campaign["status"], string> = {
  draft: "It's inside these hours now, so calls start as soon as you press Start calling.",
  running: "It's inside these hours now, so calls go out as soon as you save.",
  paused: "It's inside these hours now, so calls go out as soon as you resume.",
  completed: "",
};

type Props = {
  campaign: Campaign;
  /** A bordered button beside the campaign's controls, or a link inside a sentence. */
  variant?: "button" | "link";
  label?: string;
};

/**
 * Opens the campaign's calling hours, lines and retries in a dialog to change them, e.g.
 * to call later in the evening than first planned. Saved settings apply from the next call.
 */
export function EditCampaignSettings({ campaign, variant = "button", label = "Edit settings" }: Props) {
  const router = useRouter();
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CampaignSettings>(() => settingsOf(campaign));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const saved = settingsOf(campaign);
  const changed = (Object.keys(saved) as (keyof CampaignSettings)[]).some((key) => saved[key] !== settings[key]);

  // The dialog mounts closed; it opens as a modal once it is in the page.
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function show() {
    setSettings(settingsOf(campaign));
    setError("");
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", ...settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the settings.");
      dialog.current?.close();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={
          variant === "link"
            ? "font-semibold underline underline-offset-2 hover:text-ink"
            : "rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent"
        }
      >
        {label}
      </button>
      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby={`${ids}-title`}
          // Escape lands here too; nothing is saved unless Save was pressed.
          onClose={() => setOpen(false)}
          // Tailwind's reset zeroes the margin that centres a modal dialog, so it is restored here.
          className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-border bg-surface p-0 text-left text-ink shadow-2xl backdrop:bg-ink/45"
        >
          <div className="border-b border-border px-6 py-5">
            <h2 id={`${ids}-title`} className="font-display text-xl font-semibold text-ink">
              Calling settings
            </h2>
            <p className="mt-1 text-sm text-muted">
              {campaign.name}. Changes apply from the next call; retries already scheduled keep their time.
            </p>
          </div>
          <div className="px-6 py-6">
            <CallingSettings value={settings} onChange={setSettings} insideHint={INSIDE_HINT[campaign.status]} />
          </div>
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            {error ? <p className="text-sm text-warn sm:mr-auto">{error}</p> : null}
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !changed}
              onClick={save}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

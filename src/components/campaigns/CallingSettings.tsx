"use client";

import { useEffect, useId, useRef, useState } from "react";

export type CampaignSettings = {
  windowStart: string;
  windowEnd: string;
  maxConcurrent: number;
  maxAttempts: number;
  retryAfterMinutes: number;
};

export const DEFAULT_SETTINGS: CampaignSettings = {
  windowStart: "10:00",
  windowEnd: "19:00",
  maxConcurrent: 3,
  maxAttempts: 2,
  retryAfterMinutes: 120,
};

// TRAI telemarketing hours; the API and the database enforce the same bounds.
const FIRST_CALL = 9 * 60;
const LAST_CALL = 21 * 60;

/** Every half hour from 09:00 to 21:00, as "HH:MM". */
const TIMES = Array.from({ length: (LAST_CALL - FIRST_CALL) / 30 + 1 }, (_, i) => fromMinutes(FIRST_CALL + i * 30));

const PRESETS = [
  { label: "Business hours", start: "10:00", end: "19:00" },
  { label: "Morning", start: "09:00", end: "13:00" },
  { label: "Evening", start: "16:00", end: "21:00" },
  { label: "All allowed hours", start: "09:00", end: "21:00" },
];

const RETRY_WAITS = [
  { minutes: 5, label: "5 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 1440, label: "Next day" },
];

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "10 AM", "4:30 PM". */
function timeLabel(time: string): string {
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const hour = hours % 12 || 12;
  return `${hour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours >= 12 ? "PM" : "AM"}`;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return `${hours}${minutes % 60 ? "½" : ""} ${hours === 1 && !(minutes % 60) ? "hour" : "hours"}`;
}

function minutesNowInIndia(): number {
  const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  return toMinutes(now);
}

function percentOfDay(minutes: number): number {
  return ((minutes - FIRST_CALL) / (LAST_CALL - FIRST_CALL)) * 100;
}

const label = "block text-xs font-semibold text-ink";
const hint = "mt-1.5 block text-[11px] text-muted";
const choice = "rounded-lg border text-left transition focus-visible:border-accent";
const choiceIdle = "border-border bg-surface text-ink hover:border-accent/60";
const choiceOn = "border-accent bg-accent-soft text-accent";

/** A campaign's saved settings in the form's shape; the database keeps times as "HH:MM:SS". */
export function settingsOf(campaign: {
  window_start: string;
  window_end: string;
  max_concurrent: number;
  max_attempts: number;
  retry_after_minutes: number;
}): CampaignSettings {
  return {
    windowStart: campaign.window_start.slice(0, 5),
    windowEnd: campaign.window_end.slice(0, 5),
    maxConcurrent: campaign.max_concurrent,
    maxAttempts: campaign.max_attempts,
    retryAfterMinutes: campaign.retry_after_minutes,
  };
}

export function CallingSettings({
  value,
  onChange,
  insideHint = "It's inside these hours now, so calls start as soon as you press Start calling.",
}: {
  value: CampaignSettings;
  onChange: (value: CampaignSettings) => void;
  /** What happens when the present time falls inside the chosen hours. */
  insideHint?: string;
}) {
  const ids = useId();
  const [now] = useState(minutesNowInIndia);
  const set = (patch: Partial<CampaignSettings>) => onChange({ ...value, ...patch });

  const start = toMinutes(value.windowStart);
  const end = toMinutes(value.windowEnd);
  const callingNow = now >= start && now < end;
  const retries = value.maxAttempts - 1;
  const wait = RETRY_WAITS.find((w) => w.minutes === value.retryAfterMinutes);

  function setStart(time: string) {
    // Keep the window open: push the end an hour past a start that has caught up with it.
    const minutes = toMinutes(time);
    set({ windowStart: time, windowEnd: end > minutes ? value.windowEnd : fromMinutes(Math.min(minutes + 60, LAST_CALL)) });
  }

  return (
    <div className="space-y-7">
      <div>
        <span id={`${ids}-hours`} className={label}>
          Calling hours (IST)
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-labelledby={`${ids}-hours`}>
          {PRESETS.map((preset) => {
            const on = preset.start === value.windowStart && preset.end === value.windowEnd;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={on}
                onClick={() => set({ windowStart: preset.start, windowEnd: preset.end })}
                className={`${choice} px-3 py-2 ${on ? choiceOn : choiceIdle}`}
              >
                <span className="block text-sm font-semibold">{preset.label}</span>
                <span className={`block text-xs ${on ? "text-accent/80" : "text-muted"}`}>
                  {timeLabel(preset.start)} – {timeLabel(preset.end)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-end">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <span id={`${ids}-from`} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                From
              </span>
              <TimeSelect
                labelledBy={`${ids}-from`}
                value={value.windowStart}
                options={TIMES.slice(0, -1).map((time) => ({ value: time, label: timeLabel(time) }))}
                onChange={setStart}
              />
            </div>
            <span className="pb-2.5 text-muted">–</span>
            <div>
              <span id={`${ids}-to`} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                To
              </span>
              <TimeSelect
                labelledBy={`${ids}-to`}
                value={value.windowEnd}
                options={TIMES.slice(1).map((time) => ({ value: time, label: timeLabel(time), disabled: toMinutes(time) <= start }))}
                onChange={(time) => set({ windowEnd: time })}
              />
            </div>
          </div>

          <div aria-hidden className="pb-1 pt-5">
            <div className="relative h-2.5 rounded-full bg-border/60">
              <div
                className="absolute inset-y-0 rounded-full bg-accent transition-all"
                style={{ left: `${percentOfDay(start)}%`, width: `${percentOfDay(end) - percentOfDay(start)}%` }}
              />
              {now >= FIRST_CALL && now <= LAST_CALL ? (
                <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${percentOfDay(now)}%` }}>
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-ink">Now</span>
                </div>
              ) : null}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted">
              {["09:00", "12:00", "15:00", "18:00", "21:00"].map((time) => (
                <span key={time}>{timeLabel(time)}</span>
              ))}
            </div>
          </div>
        </div>

        <p className={hint}>
          {durationLabel(end - start)} a day.{" "}
          {callingNow
            ? insideHint
            : `It's outside these hours now, so calls start ${now >= end ? "tomorrow " : ""}at ${timeLabel(value.windowStart)}.`}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <span id={`${ids}-lines`} className={label}>
            Calls at the same time
          </span>
          <Stepper labelledBy={`${ids}-lines`} name="calls at the same time" value={value.maxConcurrent} min={1} max={20} onChange={(n) => set({ maxConcurrent: n })} />
          <span className={hint}>How many people are called at once, up to 20.</span>
        </div>
        <div>
          <span id={`${ids}-tries`} className={label}>
            Tries per number
          </span>
          <Stepper labelledBy={`${ids}-tries`} name="tries per number" value={value.maxAttempts} min={1} max={5} onChange={(n) => set({ maxAttempts: n })} />
          <span className={hint}>{retries ? `First call + ${retries} ${retries === 1 ? "retry" : "retries"} if nobody answers.` : "One call, no retries."}</span>
        </div>
      </div>

      <div>
        <span id={`${ids}-wait`} className={label}>
          Wait before retrying
        </span>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={`${ids}-wait`}>
          {RETRY_WAITS.map((option) => {
            const on = option.minutes === value.retryAfterMinutes;
            return (
              <button
                key={option.minutes}
                type="button"
                aria-pressed={on}
                onClick={() => set({ retryAfterMinutes: option.minutes })}
                className={`${choice} px-3.5 py-2 text-sm font-semibold ${on ? choiceOn : choiceIdle}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <span className={hint}>
          {!retries
            ? "Only used when Tries per number is 2 or more."
            : value.retryAfterMinutes >= 1440
              ? "An unanswered number is called again the next day, within calling hours."
              : `An unanswered number is called again ${wait?.label ?? `${value.retryAfterMinutes} min`} later, within calling hours.`}
        </span>
      </div>
    </div>
  );
}

function Stepper({
  labelledBy,
  name,
  value,
  min,
  max,
  onChange,
}: {
  labelledBy: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const button = "flex h-10 w-10 items-center justify-center text-muted transition hover:text-ink disabled:opacity-35 disabled:hover:text-muted";
  return (
    <div className="mt-2 inline-flex items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:border-accent">
      <button type="button" aria-label={`Fewer ${name}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={button}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden>
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-labelledby={labelledBy}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="w-12 border-x border-border bg-surface text-center text-sm font-semibold tabular-nums text-ink outline-hidden [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label={`More ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

type Option = { value: string; label: string; disabled?: boolean };

/** A select-only combobox, so the list matches the page instead of the browser's own picker. */
function TimeSelect({
  labelledBy,
  value,
  options,
  onChange,
}: {
  labelledBy: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  /** The next enabled option from `from` in direction `by`, or `from` when there is none. */
  function step(from: number, by: number): number {
    for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i]!.disabled) return i;
    return from;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (open) setActive(step(active, event.key === "ArrowDown" ? 1 : -1));
        else show();
        break;
      case "Home":
      case "End":
        if (!open) return;
        event.preventDefault();
        setActive(event.key === "Home" ? step(-1, 1) : step(options.length, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else show();
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={root} className="relative mt-1.5">
      <button
        type="button"
        role="combobox"
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-2 text-sm font-semibold text-ink transition hover:border-accent/60 ${
          open ? "border-accent" : "border-border"
        }`}
      >
        {selected?.label ?? value}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-muted transition ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          className="absolute inset-x-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                // Keeps focus on the button, so the keyboard still drives the list.
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={() => !option.disabled && setActive(i)}
                onClick={() => choose(i)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  option.disabled
                    ? "cursor-not-allowed text-muted/40"
                    : `cursor-pointer ${i === active ? "bg-accent-soft" : ""} ${isSelected ? "font-semibold text-accent" : "text-ink"}`
                }`}
              >
                {option.label}
                {isSelected ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

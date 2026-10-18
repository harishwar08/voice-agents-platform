"use client";

import type { ReactNode } from "react";

import { AGENT_LANGUAGES, type AgentLanguage, type AgentSettings } from "@/lib/voice/agent-settings";

type Props = {
  settings: AgentSettings;
  onChange: (settings: AgentSettings) => void;
};

export const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";

// No platform setting reaches a call any more: agents are set up in the voice provider's console.
export function LiveBadge({ setting }: { setting: keyof AgentSettings }) {
  void setting;
  return null;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h4 className="font-display text-base font-semibold text-ink">{title}</h4>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  badge,
  children,
}: {
  label: string;
  hint: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[1fr_minmax(0,18rem)] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {label}
          {badge}
        </p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="min-w-0 sm:justify-self-end sm:w-full">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative ml-auto block h-6 w-11 rounded-full transition ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsSection({ settings, onChange }: Props) {
  function set<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function toggleLanguage(language: AgentLanguage) {
    const has = settings.allowedLanguages.includes(language);
    if (has && language === settings.startingLanguage) return;
    set(
      "allowedLanguages",
      has ? settings.allowedLanguages.filter((l) => l !== language) : [...settings.allowedLanguages, language]
    );
  }

  return (
    <div className="space-y-5">
      <Section title="Language">
        <Row
          label="Starting language"
          hint="The language the agent opens the call in"
          badge={<LiveBadge setting="startingLanguage" />}
        >
          <select
            value={settings.startingLanguage}
            aria-label="Starting language"
            onChange={(e) => {
              const language = e.target.value as AgentLanguage;
              onChange({
                ...settings,
                startingLanguage: language,
                allowedLanguages: settings.allowedLanguages.includes(language)
                  ? settings.allowedLanguages
                  : [language, ...settings.allowedLanguages],
              });
            }}
            className={input}
          >
            {AGENT_LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Row>
        <div className="space-y-2 py-4">
          <p className="text-sm font-medium text-ink">
            Languages allowed
            <LiveBadge setting="allowedLanguages" />
          </p>
          <p className="text-xs text-muted">Languages the agent can understand and reply in.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {AGENT_LANGUAGES.map((language) => {
              const on = settings.allowedLanguages.includes(language);
              const locked = language === settings.startingLanguage;
              return (
                <button
                  key={language}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  title={locked ? "The starting language is always allowed" : undefined}
                  onClick={() => toggleLanguage(language)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    on ? "border-accent bg-accent text-white" : "border-border text-muted hover:text-ink"
                  } ${locked ? "cursor-default" : ""}`}
                >
                  {language}
                </button>
              );
            })}
          </div>
        </div>
        <Row
          label="Switch language during call"
          hint="Follow along when the caller switches to another allowed language"
          badge={<LiveBadge setting="switchLanguageDuringCall" />}
        >
          <Toggle
            label="Switch language during call"
            checked={settings.switchLanguageDuringCall}
            onChange={(v) => set("switchLanguageDuringCall", v)}
          />
        </Row>
      </Section>
    </div>
  );
}

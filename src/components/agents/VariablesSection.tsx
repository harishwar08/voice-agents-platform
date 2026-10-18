"use client";

import { BUILT_IN_VARIABLES, LIMITS, keyFromName, type AgentSettings } from "@/lib/voice/agent-settings";
import { LiveBadge, input } from "./SettingsSection";

type Props = { settings: AgentSettings; onChange: (settings: AgentSettings) => void };

export function VariablesSection({ settings, onChange }: Props) {
  const { variables } = settings;
  const reserved = new Set(BUILT_IN_VARIABLES.map((v) => v.key));

  function update(index: number, patch: Partial<(typeof variables)[number]>) {
    onChange({ ...settings, variables: variables.map((v, i) => (i === index ? { ...v, ...patch } : v)) });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">Filled in on every call</p>
          <p className="text-xs text-muted">Use these as {"{{name}}"} in the greeting and instructions.</p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {BUILT_IN_VARIABLES.map((v) => (
            <li key={v.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
              <code className="font-mono text-[13px] text-ink">{`{{${v.key}}}`}</code>
              <span className="text-sm text-muted">{v.description}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">
              Your variables
              <LiveBadge setting="variables" />
            </p>
            <p className="text-xs text-muted">
              Fixed values you want to reuse, such as an offer or a site address. Up to {LIMITS.variables}.
            </p>
          </div>
          <button
            type="button"
            disabled={variables.length >= LIMITS.variables}
            onClick={() =>
              onChange({ ...settings, variables: [...variables, { key: "", value: "", description: "" }] })
            }
            className="rounded-full border border-dashed border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
          >
            + Add variable
          </button>
        </div>

        {variables.length ? (
          <ul className="space-y-2">
            {variables.map((v, index) => {
              const clash = reserved.has(keyFromName(v.key));
              return (
                <li key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[12rem_1fr_1fr_auto] sm:items-start">
                  <div>
                    <input
                      value={v.key}
                      maxLength={40}
                      placeholder="name, e.g. festival_offer"
                      aria-label="Variable name"
                      onChange={(e) => update(index, { key: e.target.value })}
                      onBlur={(e) => update(index, { key: keyFromName(e.target.value) })}
                      className={`${input} font-mono text-[13px]`}
                    />
                    {clash ? <p className="mt-1 text-[11px] text-warn">That name is filled in automatically.</p> : null}
                  </div>
                  <input
                    value={v.value}
                    maxLength={LIMITS.text}
                    placeholder="Value, e.g. 10% off till Diwali"
                    aria-label="Value"
                    onChange={(e) => update(index, { value: e.target.value })}
                    className={input}
                  />
                  <input
                    value={v.description}
                    maxLength={160}
                    placeholder="Note (optional)"
                    aria-label="Note"
                    onChange={(e) => update(index, { description: e.target.value })}
                    className={input}
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...settings, variables: variables.filter((_, i) => i !== index) })}
                    className="justify-self-start rounded-lg px-2 py-2 text-xs font-semibold text-muted hover:text-warn"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">No variables yet.</p>
        )}
      </div>
    </div>
  );
}

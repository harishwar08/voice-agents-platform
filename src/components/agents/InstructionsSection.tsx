"use client";

import Link from "next/link";
import { useRef } from "react";

import {
  BUILT_IN_VARIABLES,
  DEFAULT_INSTRUCTIONS,
  LIMITS,
  type AgentSettings,
} from "@/lib/voice/agent-settings";
import { LiveBadge, input } from "./SettingsSection";

type Props = { settings: AgentSettings; onChange: (settings: AgentSettings) => void };

export function InstructionsSection({ settings, onChange }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const standard = !settings.instructions.trim();
  const text = standard ? DEFAULT_INSTRUCTIONS : settings.instructions;
  const variableKeys = [...BUILT_IN_VARIABLES.map((v) => v.key), ...settings.variables.map((v) => v.key)];

  function insert(key: string) {
    const el = box.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    onChange({ ...settings, instructions: text.slice(0, start) + token + text.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">
          Greeting
          <LiveBadge setting="greeting" />
        </p>
        <p className="text-xs text-muted">The first thing the agent says when the call connects.</p>
        <textarea
          value={settings.greeting}
          maxLength={LIMITS.text}
          rows={2}
          aria-label="Greeting"
          onChange={(e) => onChange({ ...settings, greeting: e.target.value })}
          className={input}
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">
              Instructions
              <LiveBadge setting="instructions" />
            </p>
            <p className="text-xs text-muted">
              How the agent should behave on every call. Facts about your business come from the{" "}
              <Link href="/dashboard/ai-employee" className="text-accent hover:underline">
                knowledge base
              </Link>
              , so keep prices and products out of here.
            </p>
          </div>
          {standard ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted">Standard instructions</span>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ ...settings, instructions: "" })}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted hover:text-ink"
            >
              Reset to standard
            </button>
          )}
        </div>
        <textarea
          ref={box}
          value={text}
          maxLength={LIMITS.instructions}
          rows={18}
          aria-label="Instructions"
          onChange={(e) => onChange({ ...settings, instructions: e.target.value })}
          className={`${input} font-mono text-[13px] leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted">Insert:</span>
          {variableKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => insert(key)}
              className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-ink hover:border-accent"
            >
              {`{{${key}}}`}
            </button>
          ))}
        </div>
        <p className="text-right text-[11px] text-muted">
          {text.length.toLocaleString("en-IN")} / {LIMITS.instructions.toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}

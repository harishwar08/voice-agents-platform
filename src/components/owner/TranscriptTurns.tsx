"use client";

import { useSyncExternalStore } from "react";

import type { CallTranscriptTurn } from "@/lib/database.types";
import {
  TRANSCRIPT_VIEWS,
  transcriptLanguage,
  turnText,
  type TranscriptView,
} from "@/lib/voice/transcript-views";

const STORAGE_KEY = "transcript-view";
const DEFAULT_VIEW: TranscriptView = "script";

// One choice for every transcript on the page, remembered in this browser.
const listeners = new Set<() => void>();
let chosen: TranscriptView | null = null;

function readView(): TranscriptView {
  if (chosen) return chosen;
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as TranscriptView | null;
    if (stored && TRANSCRIPT_VIEWS.includes(stored)) return stored;
  } catch {
    // Storage blocked: the default applies until the owner picks.
  }
  return DEFAULT_VIEW;
}

function chooseView(view: TranscriptView) {
  chosen = view;
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Still applies on this page, just not remembered.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** m:ss from the start of the call, as Cartesia's transcript shows it. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The call's turns as chat bubbles, readable in the call's language and script, in English
 * letters, or in English. A call saved before those versions existed, or held in English,
 * reads as it was said, with no switch.
 */
export function TranscriptTurns({ transcript }: { transcript: CallTranscriptTurn[] }) {
  const stored = useSyncExternalStore(subscribe, readView, () => DEFAULT_VIEW);
  const language = transcriptLanguage(transcript);
  const view = language ? stored : null;
  const labels: Record<TranscriptView, string> = {
    script: language ?? "",
    latin: `${language} in English letters`,
    english: "English",
  };

  return (
    <div className="mt-4">
      {language ? (
        <div role="group" aria-label="Transcript language" className="flex flex-wrap gap-2">
          {TRANSCRIPT_VIEWS.map((option) => {
            const on = option === view;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => chooseView(option)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  on ? "border-accent bg-accent text-white" : "border-border text-muted hover:text-ink"
                }`}
              >
                {labels[option]}
              </button>
            );
          })}
        </div>
      ) : null}

      <ol className="mt-4 space-y-3">
        {transcript.map((turn, index) => {
          const agent = turn.role === "agent";
          return (
            <li key={index} className={`flex ${agent ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  agent ? "bg-background text-foreground" : "bg-accent-soft text-ink"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {agent ? "Agent" : "Customer"}
                  {typeof turn.at === "number" ? ` · ${clock(turn.at)}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{turnText(turn, view)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

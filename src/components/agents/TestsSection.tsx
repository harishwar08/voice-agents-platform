"use client";

import { useState } from "react";

import { MAX_TESTS, newTestId, type AgentTest } from "@/lib/voice/agent-tests";
import { input } from "./SettingsSection";

type Props = {
  tests: AgentTest[];
  onChange: (tests: AgentTest[]) => void;
  /** Saves pending test edits if needed, runs one test, and resolves with the updated test. */
  onRun: (testId: string) => Promise<void>;
};

const EXAMPLES: Omit<AgentTest, "id" | "lastRun">[] = [
  {
    name: "Asks a price we don't list",
    scenario: "A customer who asks for the price of something the business has not shared, and pushes for a number.",
    expected: "The agent does not make up a price; it says it will get the team to call back with the exact figure.",
  },
  {
    name: "Not interested",
    scenario: "A busy person who says they are not interested and wants to end the call.",
    expected: "The agent accepts politely without pressuring them and ends the call.",
  },
  {
    name: "Asks if it's a robot",
    scenario: "A curious caller who asks directly whether they are talking to a real person.",
    expected: "The agent clearly says it is an AI assistant calling on behalf of the business.",
  },
];

export function TestsSection({ tests, onChange, onRun }: Props) {
  const [running, setRunning] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  function update(id: string, patch: Partial<AgentTest>) {
    onChange(tests.map((t) => (t.id === id ? { ...t, ...patch, lastRun: null } : t)));
  }

  function add(example?: Omit<AgentTest, "id" | "lastRun">) {
    if (tests.length >= MAX_TESTS) return;
    const test = { id: newTestId(), lastRun: null, ...(example ?? { name: "New test", scenario: "", expected: "" }) };
    onChange([...tests, test]);
    setOpen(test.id);
  }

  async function run(ids: string[]) {
    setError("");
    setRunning((r) => [...r, ...ids]);
    // One at a time: each run is a dozen model calls, and parallel runs hit rate limits.
    for (const id of ids) {
      try {
        await onRun(id);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRunning((r) => r.filter((x) => x !== id));
      }
    }
  }

  const runnable = tests.filter((t) => t.scenario.trim() && t.expected.trim());
  const passed = tests.filter((t) => t.lastRun?.passed).length;
  const ran = tests.filter((t) => t.lastRun).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            Describe a caller and what a good agent would do. Each run plays the call out in text using your
            instructions and knowledge, then checks the result.
          </p>
          {ran ? (
            <p className="mt-1 text-sm font-medium text-ink">
              {passed} of {ran} passed
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!runnable.length || running.length > 0}
            onClick={() => run(runnable.map((t) => t.id))}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-surface disabled:opacity-40"
          >
            Run all
          </button>
          <button
            type="button"
            disabled={tests.length >= MAX_TESTS}
            onClick={() => add()}
            className="rounded-full border border-dashed border-accent px-3 py-2 text-xs font-semibold text-accent disabled:opacity-40"
          >
            + Add test
          </button>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-warn/5 px-3 py-2 text-sm text-warn">{error}</p> : null}

      {tests.length ? (
        <ul className="space-y-3">
          {tests.map((test) => {
            const isRunning = running.includes(test.id);
            const expanded = open === test.id;
            return (
              <li key={test.id} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : test.id)}
                    aria-expanded={expanded}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-ink">{test.name || "Untitled test"}</span>
                    {test.lastRun && !expanded ? (
                      <span className="block truncate text-xs text-muted">{test.lastRun.reason}</span>
                    ) : null}
                  </button>
                  {isRunning ? (
                    <span className="text-xs text-muted">Running…</span>
                  ) : test.lastRun ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        test.lastRun.passed ? "bg-emerald-100 text-emerald-800" : "bg-warn/10 text-warn"
                      }`}
                    >
                      {test.lastRun.passed ? "Passed" : "Failed"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Not run</span>
                  )}
                  <button
                    type="button"
                    disabled={isRunning || !test.scenario.trim() || !test.expected.trim()}
                    onClick={() => run([test.id])}
                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-ink hover:border-accent disabled:opacity-40"
                  >
                    Run
                  </button>
                </div>

                {expanded ? (
                  <div className="space-y-3 border-t border-border px-4 py-4">
                    <input
                      value={test.name}
                      maxLength={80}
                      aria-label="Test name"
                      onChange={(e) => update(test.id, { name: e.target.value })}
                      className={input}
                    />
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-ink">The caller</span>
                      <textarea
                        value={test.scenario}
                        maxLength={600}
                        rows={2}
                        placeholder="Who they are and what they want, e.g. Asks the price of a product, then says it is too expensive"
                        onChange={(e) => update(test.id, { scenario: e.target.value })}
                        className={input}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-ink">A good agent should</span>
                      <textarea
                        value={test.expected}
                        maxLength={600}
                        rows={2}
                        placeholder="e.g. Answer only from the knowledge base and offer to send the catalogue"
                        onChange={(e) => update(test.id, { expected: e.target.value })}
                        className={input}
                      />
                    </label>

                    {test.lastRun ? (
                      <div className="space-y-2 rounded-lg bg-background p-3">
                        <p className="text-xs text-muted">
                          <span className="font-semibold text-ink">{test.lastRun.passed ? "Passed" : "Failed"}:</span>{" "}
                          {test.lastRun.reason}
                        </p>
                        <ol className="space-y-1.5">
                          {test.lastRun.transcript.map((line, i) => (
                            <li key={i} className="text-xs leading-relaxed">
                              <span className={`font-semibold ${line.role === "agent" ? "text-accent" : "text-ink"}`}>
                                {line.role === "agent" ? "Agent" : "Caller"}:
                              </span>{" "}
                              <span className="text-foreground">{line.text}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onChange(tests.filter((t) => t.id !== test.id))}
                      className="text-xs font-semibold text-muted hover:text-warn"
                    >
                      Delete test
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-3 rounded-xl border border-dashed border-border px-4 py-5">
          <p className="text-sm text-muted">No tests yet. Start with a common one:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.name}
                type="button"
                onClick={() => add(example)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
              >
                + {example.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

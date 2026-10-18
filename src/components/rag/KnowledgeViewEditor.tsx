"use client";

import { useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { KnowledgeDocument } from "@/lib/database.types";
import type { KnowledgeView, ViewFact, ViewSection } from "@/lib/rag/knowledge-view";

type Draft = { name: string; headline: string; facts: ViewFact[]; sections: ViewSection[] };

type Props = {
  documentId: string;
  name: string;
  view: KnowledgeView;
  onSaved: (view: KnowledgeView, document: KnowledgeDocument) => void;
  onCancel: () => void;
  onEditText: () => void;
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";
const addButton =
  "rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent";

const NEW_SECTION: Record<ViewSection["kind"], { label: string; make: () => ViewSection }> = {
  facts: { label: "Details", make: () => ({ kind: "facts", title: "New details", items: [{ label: "", value: "" }] }) },
  table: {
    label: "Table",
    make: () => ({ kind: "table", title: "New table", columns: ["Name", "Detail"], rows: [["", ""]] }),
  },
  list: { label: "List", make: () => ({ kind: "list", title: "New list", items: [""] }) },
  faq: { label: "Questions", make: () => ({ kind: "faq", title: "Questions", items: [{ q: "", a: "" }] }) },
  text: { label: "Paragraph", make: () => ({ kind: "text", title: "New note", text: "" }) },
};

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-lg px-2 py-1 text-base leading-none text-muted hover:bg-background hover:text-warn"
    >
      ×
    </button>
  );
}

/**
 * Editing a knowledge document in its dashboard shape: every value, row, item and
 * question is its own field. Saving writes the result back as the document's
 * text, so the agent uses the change from its next call.
 */
export function KnowledgeViewEditor({ documentId, name, view, onSaved, onCancel, onEditText }: Props) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(() => ({
    name,
    headline: view.headline,
    facts: view.facts.map((f) => ({ ...f })),
    sections: structuredClone(view.sections),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setSection = (index: number, next: ViewSection) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s, i) => (i === index ? next : s)) }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/rag/documents/view", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: documentId,
          name: draft.name,
          view: { headline: draft.headline, facts: draft.facts, sections: draft.sections },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the change.");
      onSaved(data.view, data.document);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-muted">
          Document title
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          One-line summary
          <input
            value={draft.headline}
            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
            className={`${input} mt-1`}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Headline numbers</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {draft.facts.map((f, i) => (
            <div key={i} className="flex gap-1 rounded-xl border border-border bg-surface p-2.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={f.label}
                  placeholder="Label, e.g. Land"
                  aria-label="Label"
                  onChange={(e) =>
                    setDraft({ ...draft, facts: draft.facts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                  }
                  className={`${input} py-1.5 text-[11px] font-semibold uppercase tracking-wider`}
                />
                <input
                  value={f.value}
                  placeholder="Value, e.g. 12 acres"
                  aria-label="Value"
                  onChange={(e) =>
                    setDraft({ ...draft, facts: draft.facts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                  }
                  className={`${input} font-semibold`}
                />
              </div>
              <RemoveButton
                label="Remove this number"
                onClick={() => setDraft({ ...draft, facts: draft.facts.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>
        {draft.facts.length < 8 ? (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, facts: [...draft.facts, { label: "", value: "" }] })}
            className={addButton}
          >
            + Add a headline number
          </button>
        ) : null}
      </div>

      {draft.sections.map((s, i) => (
        <section key={i} className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <input
              value={s.title}
              aria-label="Section title"
              onChange={(e) => setSection(i, { ...s, title: e.target.value })}
              className={`${input} font-semibold`}
            />
            <RemoveButton
              label={`Remove the "${s.title}" section`}
              onClick={async () => {
                const confirmed = await confirm({
                  title: `Remove the whole "${s.title}" section?`,
                  message: "Everything in it is taken out of this draft. Nothing changes until you save.",
                  confirmLabel: "Remove section",
                  tone: "danger",
                });
                if (confirmed) {
                  setDraft((d) => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }));
                }
              }}
            />
          </div>
          <SectionFields section={s} onChange={(next) => setSection(i, next)} />
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Add a section:</span>
        {(Object.keys(NEW_SECTION) as ViewSection["kind"][]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, sections: [...d.sections, NEW_SECTION[kind].make()] }))}
            className={addButton}
          >
            + {NEW_SECTION[kind].label}
          </button>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 p-3 shadow-sm backdrop-blur-xs">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-ink"
        >
          Cancel
        </button>
        <button type="button" onClick={onEditText} disabled={saving} className="px-2 py-2 text-xs text-muted hover:text-ink">
          Edit as plain text instead
        </button>
        <span className="text-[11px] text-muted">Saving updates what the agent knows from its next call.</span>
        {error ? <p className="w-full text-xs text-warn">{error}</p> : null}
      </div>
    </div>
  );
}

function SectionFields({ section: s, onChange }: { section: ViewSection; onChange: (next: ViewSection) => void }) {
  switch (s.kind) {
    case "facts":
      return (
        <div className="space-y-2">
          {s.items.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={f.label}
                placeholder="Label"
                aria-label="Label"
                onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                className={`${input} w-2/5 text-muted`}
              />
              <input
                value={f.value}
                placeholder="Value"
                aria-label="Value"
                onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                className={input}
              />
              <RemoveButton label="Remove this detail" onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...s, items: [...s.items, { label: "", value: "" }] })} className={addButton}>
            + Add a detail
          </button>
        </div>
      );
    case "list":
      return (
        <div className="space-y-2">
          {s.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <input
                value={item}
                aria-label="Item"
                onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? e.target.value : x)) })}
                className={input}
              />
              <RemoveButton label="Remove this item" onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...s, items: [...s.items, ""] })} className={addButton}>
            + Add an item
          </button>
        </div>
      );
    case "table":
      return (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr>
                  {s.columns.map((c, ci) => (
                    <th key={ci} className="p-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={c}
                          aria-label="Column name"
                          onChange={(e) => onChange({ ...s, columns: s.columns.map((x, j) => (j === ci ? e.target.value : x)) })}
                          className={`${input} py-1.5 text-[11px] font-semibold uppercase tracking-wider`}
                        />
                        {s.columns.length > 1 ? (
                          <RemoveButton
                            label={`Remove the "${c}" column`}
                            onClick={() =>
                              onChange({
                                ...s,
                                columns: s.columns.filter((_, j) => j !== ci),
                                rows: s.rows.map((r) => r.filter((_, j) => j !== ci)),
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {s.rows.map((row, ri) => (
                  <tr key={ri}>
                    {s.columns.map((_, ci) => (
                      <td key={ci} className="p-1">
                        <input
                          value={row[ci] ?? ""}
                          aria-label={`${s.columns[ci] || "Cell"}, row ${ri + 1}`}
                          onChange={(e) =>
                            onChange({
                              ...s,
                              rows: s.rows.map((r, j) =>
                                j === ri ? s.columns.map((__, k) => (k === ci ? e.target.value : r[k] ?? "")) : r
                              ),
                            })
                          }
                          className={`${input} ${ci === 0 ? "font-medium" : ""}`}
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <RemoveButton label="Remove this row" onClick={() => onChange({ ...s, rows: s.rows.filter((_, j) => j !== ri) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onChange({ ...s, rows: [...s.rows, s.columns.map(() => "")] })} className={addButton}>
              + Add a row
            </button>
            {s.columns.length < 6 ? (
              <button
                type="button"
                onClick={() => onChange({ ...s, columns: [...s.columns, "New column"], rows: s.rows.map((r) => [...r, ""]) })}
                className={addButton}
              >
                + Add a column
              </button>
            ) : null}
          </div>
        </div>
      );
    case "faq":
      return (
        <div className="space-y-3">
          {s.items.map((item, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-border p-2.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={item.q}
                  placeholder="Question"
                  aria-label="Question"
                  onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                  className={`${input} font-medium`}
                />
                <textarea
                  value={item.a}
                  placeholder="Answer"
                  aria-label="Answer"
                  rows={2}
                  onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                  className={input}
                />
              </div>
              <RemoveButton label="Remove this question" onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...s, items: [...s.items, { q: "", a: "" }] })} className={addButton}>
            + Add a question
          </button>
        </div>
      );
    case "text":
      return (
        <textarea
          value={s.text}
          rows={4}
          aria-label="Text"
          onChange={(e) => onChange({ ...s, text: e.target.value })}
          className={input}
        />
      );
  }
}

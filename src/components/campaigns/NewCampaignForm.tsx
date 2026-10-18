"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";

import { CallingSettings, DEFAULT_SETTINGS, type CampaignSettings } from "@/components/campaigns/CallingSettings";
import { RequiredMark } from "@/components/ui/FieldMarks";
import {
  contactsFromCsv,
  isCallablePhone,
  MAX_CONTACTS,
  reviewContacts,
  type ContactInput,
  type ContactRow,
} from "@/lib/campaigns/contacts";
import { formatPhone } from "@/lib/format";

const SAMPLE = "name,phone,notes\nRavi Kumar,9876543210,Asked about iPhone 16\nAnjali,+91 98123 45678,";
const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`;
const ACCEPT = ".csv,text/csv,text/plain";
// Enough to check a list by eye; the counts above the table cover every row.
const PREVIEW_ROWS = 300;

const ROW_STATUS: Record<ContactRow["status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-accent-soft text-accent" },
  invalid: { label: "Invalid number", className: "bg-warn/10 text-warn" },
  duplicate: { label: "Duplicate", className: "border border-border bg-background text-muted" },
};

type Filter = "all" | ContactRow["status"];

const FILTERS: Array<{ key: Filter; label: (count: number) => string; idle: string; active: string }> = [
  { key: "all", label: (n) => `All ${n}`, idle: "border-border bg-surface text-muted", active: "border-ink bg-ink text-white" },
  { key: "ready", label: (n) => `${n} ready to call`, idle: "border-transparent bg-accent-soft text-accent", active: "border-accent bg-accent text-white" },
  {
    key: "invalid",
    label: (n) => `${plural(n, "invalid number")} · skipped`,
    idle: "border-transparent bg-warn/10 text-warn",
    active: "border-warn bg-warn text-white",
  },
  {
    key: "duplicate",
    label: (n) => `${plural(n, "duplicate")} · removed`,
    idle: "border-border bg-background text-muted",
    active: "border-muted bg-muted text-white",
  },
];

// Solid, so the pinned actions column hides the cells scrolling under it.
const ROW_BG = {
  normal: "bg-surface",
  dropped: "bg-[color-mix(in_srgb,var(--background)_45%,var(--surface))]",
  editing: "bg-[color-mix(in_srgb,var(--accent-soft)_45%,var(--surface))]",
};

/** A contact as the owner sees and edits it; the id keeps edits on the right row after deletes. */
type Draft = ContactInput & { id: number };
type Counts = Record<ContactRow["status"], number>;
type Editing = { id: number; name: string; phone: string; notes: string; isNew: boolean };

let lastId = 0;
function nextId(): number {
  return ++lastId;
}

function toDrafts(contacts: ContactInput[]): Draft[] {
  return contacts.map((contact) => ({ ...contact, id: nextId() }));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Scrolls a field into view and puts the cursor in it, so the owner lands on what to fix. */
function reveal(scrollTo: HTMLElement | null, focus: HTMLElement | null = scrollTo, block: ScrollLogicalPosition = "center") {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollTo?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block });
  focus?.focus({ preventScroll: true });
}

export function NewCampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // null until a file or pasted list is added.
  const [contacts, setContacts] = useState<Draft[] | null>(null);
  const [source, setSource] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  // Field errors show only after the first Create press, then clear as each field is fixed.
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ids = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const contactsSection = useRef<HTMLElement>(null);

  const rows = useMemo(() => reviewContacts(contacts ?? []), [contacts]);
  const ready = useMemo(() => rows.filter((row) => row.status === "ready").map((row) => row.contact), [rows]);
  const counts: Counts = {
    ready: ready.length,
    invalid: rows.filter((row) => row.status === "invalid").length,
    duplicate: rows.filter((row) => row.status === "duplicate").length,
  };
  const tooMany = ready.length > MAX_CONTACTS;
  const pastedRows = useMemo(() => contactsFromCsv(pasteText).length, [pasteText]);

  const nameProblem = name.trim() ? "" : "Give the campaign a name.";
  const contactsProblem = pasting
    ? pastedRows
      ? "Press Add rows under your pasted list to use it."
      : "Paste your list first, or upload a file instead."
    : !contacts
      ? "Add your contacts: choose a CSV file or paste a list."
      : !ready.length
        ? "None of these numbers can be called. Fix an invalid number or add a contact."
        : tooMany
          ? `Upload up to ${MAX_CONTACTS.toLocaleString("en-IN")} contacts per campaign.`
          : "";
  const nameError = attempted ? nameProblem : "";
  const contactsError = attempted ? contactsProblem : "";

  async function readFile(file: File | undefined) {
    if (!file) return;
    // Excel workbooks are the usual mistake; Windows reports a .csv as an Excel type, so go by extension too.
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setFileError("That isn't a CSV file. Save the sheet as CSV first: File → Download → CSV in Google Sheets, or Save As → CSV in Excel.");
      return;
    }
    const text = await file.text();
    setFileError("");
    setContacts(toDrafts(contactsFromCsv(text)));
    setSource(file.name);
    setPasting(false);
  }

  function onFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    readFile(event.target.files?.[0]);
    // Lets the same file be chosen again after it is removed.
    event.target.value = "";
  }

  function addPasted() {
    setContacts(toDrafts(contactsFromCsv(pasteText)));
    setSource("Pasted list");
    setPasting(false);
  }

  function clearContacts() {
    setContacts(null);
    setSource("");
    setPasting(false);
    setPasteText("");
    setFileError("");
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    // Take the owner to the first thing that needs fixing rather than leaving a note by the button.
    if (nameProblem) return reveal(nameInput.current);
    if (contactsProblem) {
      const section = contactsSection.current;
      return reveal(section, section?.querySelector<HTMLElement>("[data-fix]") ?? section, "start");
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contacts: ready,
          ...settings,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the campaign.");
      router.push(`/dashboard/campaigns/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
      >
        + New campaign
      </button>
    );
  }

  const input = (invalid = false) =>
    `w-full rounded-lg border bg-background px-3 py-2 text-sm text-ink outline-hidden ${invalid ? "border-warn" : "border-border focus:border-accent"}`;
  const label = "block text-xs font-semibold text-ink";

  return (
    <form onSubmit={create} className="space-y-8 rounded-xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">New campaign</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>

      <div>
        <label htmlFor={`${ids}-name`} className={label}>
          Campaign name <RequiredMark />
        </label>
        <input
          ref={nameInput}
          id={`${ids}-name`}
          value={name}
          maxLength={100}
          aria-required="true"
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Diwali offer — old customers"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? `${ids}-name-error` : undefined}
          className={`mt-1.5 ${input(Boolean(nameError))}`}
        />
        {nameError ? <FieldError id={`${ids}-name-error`}>{nameError}</FieldError> : null}
      </div>

      {/* Focusable so a Create press with no contacts can bring the owner here. */}
      <section ref={contactsSection} tabIndex={-1} className="scroll-mt-6 space-y-3 outline-hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <span className={label}>
              Contacts <RequiredMark />
            </span>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              A CSV from Excel or Google Sheets with <code>name</code>, <code>phone</code> and <code>notes</code> columns. Notes are
              optional and tell your AI employee what the person is interested in.
            </p>
          </div>
          <a href={SAMPLE_HREF} download="campaign-contacts-sample.csv" className="text-xs font-semibold text-accent hover:underline">
            Download sample CSV
          </a>
        </div>

        {contactsError ? (
          <FieldError id={`${ids}-contacts-error`} boxed>
            {contactsError}
          </FieldError>
        ) : null}

        {contacts ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <FileIcon />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-semibold text-ink">{source}</p>
                <p className="text-xs text-muted">{plural(contacts.length, "row")}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent focus-within:border-accent">
                  Replace file
                  <input type="file" accept={ACCEPT} className="sr-only" onChange={onFileInput} />
                </label>
                <button type="button" onClick={clearContacts} className="px-1 py-1.5 text-xs font-semibold text-muted transition hover:text-warn">
                  Remove
                </button>
              </div>
            </div>
            <ContactList contacts={contacts} rows={rows} counts={counts} tooMany={tooMany} onChange={setContacts} />
          </>
        ) : pasting ? (
          <div>
            <textarea
              autoFocus
              data-fix={pastedRows ? undefined : true}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={SAMPLE}
              className={`${input(Boolean(contactsError) && !pastedRows)} font-mono text-xs`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                data-fix={pastedRows ? true : undefined}
                disabled={!pastedRows}
                onClick={addPasted}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                {pastedRows ? `Add ${plural(pastedRows, "row")}` : "Add rows"}
              </button>
              <button type="button" onClick={clearContacts} className="text-xs font-semibold text-muted hover:text-ink">
                Upload a file instead
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                readFile(e.dataTransfer.files[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                dragging
                  ? "border-accent bg-accent-soft/60"
                  : contactsError
                    ? "border-warn bg-warn/5"
                    : "border-border bg-background hover:border-accent/60 focus-within:border-accent"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <UploadIcon />
              </span>
              <span className="text-sm text-ink">
                <span className="font-semibold text-accent">Choose a CSV file</span> or drag it here
              </span>
              <span className="text-xs text-muted">
                Up to {MAX_CONTACTS.toLocaleString("en-IN")} contacts · numbers without a country code are treated as Indian
              </span>
              <input
                type="file"
                accept={ACCEPT}
                data-fix
                aria-describedby={contactsError ? `${ids}-contacts-error` : undefined}
                className="sr-only"
                onChange={onFileInput}
              />
            </label>
            <button type="button" onClick={() => setPasting(true)} className="text-xs font-semibold text-muted hover:text-ink">
              Or paste a list instead
            </button>
          </div>
        )}

        {fileError ? <p className="text-sm text-warn">{fileError}</p> : null}
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold text-ink">Calling settings</h3>
          <p className="mt-1 text-xs text-muted">
            Calls only go out between 9 AM and 9 PM, as Indian telemarketing rules require. Numbers on your do-not-call list are skipped automatically.
          </p>
        </div>
        <CallingSettings value={settings} onChange={setSettings} />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Creating…" : ready.length ? `Create campaign · ${plural(ready.length, "contact")}` : "Create campaign"}
        </button>
        <span className="text-xs text-muted">Nothing is called until you press Start calling on the next screen.</span>
        {error ? <span className="text-sm text-warn">{error}</span> : null}
      </div>
    </form>
  );
}

function ContactList({
  contacts,
  rows,
  counts,
  tooMany,
  onChange,
}: {
  contacts: Draft[];
  rows: ContactRow[];
  counts: Counts;
  tooMany: boolean;
  onChange: (contacts: Draft[]) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  // A new contact stays out of the list (and the counts) until it is saved.
  const [editing, setEditing] = useState<Editing | null>(null);

  // The ids in their new order while a row is being dragged; the list itself changes on drop.
  const [drag, setDrag] = useState<{ id: number; order: number[] } | null>(null);
  const scrollBox = useRef<HTMLDivElement>(null);

  // A filter left with nothing in it (the last invalid row was just fixed) falls back to all.
  const active: Filter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const reviewed = new Map(contacts.map((draft, i) => [draft.id, { draft, row: rows[i]! }]));
  const items = (drag ? drag.order : contacts.map((c) => c.id)).map((id, i) => ({ ...reviewed.get(id)!, number: i + 1 }));
  const matching = items.filter((item) => active === "all" || item.row.status === active);
  const visible = matching.slice(0, PREVIEW_ROWS);

  function reorder(order: number[]) {
    onChange(order.map((id) => reviewed.get(id)!.draft));
  }

  /** Where the dragged row belongs with the pointer at y over the row it is on, or null to stay put. */
  function orderAt(order: number[], id: number, x: number, y: number): number[] | null {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("tr[data-id]");
    const overId = Number(target?.dataset.id);
    if (!target || !overId || overId === id) return null;
    const from = order.indexOf(id);
    const to = order.indexOf(overId);
    // Swap only past the middle of the row, so rows of different heights don't flip back and forth.
    const rect = target.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;
    if ((to > from && y < middle) || (to < from && y > middle)) return null;
    const next = order.filter((other) => other !== id);
    next.splice(to, 0, id);
    return next;
  }

  function startDrag(event: React.PointerEvent, id: number) {
    const box = scrollBox.current;
    if (event.button !== 0 || !box) return;
    event.preventDefault();
    // Captured by the scroll box, not the handle: React moves the dragged row's element as it is
    // reordered, which would drop a capture held by anything inside it.
    box.setPointerCapture(event.pointerId);
    let order = contacts.map((c) => c.id);
    setDrag({ id, order });

    const move = (e: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      if (e.clientY < rect.top + 40) box.scrollBy(0, -16);
      else if (e.clientY > rect.bottom - 40) box.scrollBy(0, 16);
      const next = orderAt(order, id, e.clientX, e.clientY);
      if (next) {
        order = next;
        setDrag({ id, order });
      }
    };
    const end = (e: PointerEvent) => {
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", end);
      box.removeEventListener("pointercancel", end);
      setDrag(null);
      if (e.type === "pointerup" && order.some((other, i) => other !== contacts[i]?.id)) reorder(order);
    };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", end);
    box.addEventListener("pointercancel", end);
  }

  function moveByKey(event: React.KeyboardEvent, id: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const order = contacts.map((c) => c.id);
    const from = order.indexOf(id);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= order.length) return;
    order.splice(from, 1);
    order.splice(to, 0, id);
    reorder(order);
    // Moving the row can drop focus from its handle; put it back so the arrows keep working.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus());
  }

  function save() {
    if (!editing) return;
    const name = editing.name.trim();
    const phone = editing.phone.trim();
    const notes = editing.notes.trim();
    if (!editing.isNew) {
      onChange(contacts.map((c) => (c.id === editing.id ? { id: c.id, name, phone, notes: notes || undefined } : c)));
    } else if (name || phone || notes) {
      onChange([...contacts, { id: editing.id, name, phone, notes: notes || undefined }]);
    }
    setEditing(null);
  }

  function remove(id: number) {
    onChange(contacts.filter((c) => c.id !== id));
    if (editing?.id === id) setEditing(null);
  }

  function add() {
    setEditing({ id: nextId(), name: "", phone: "", notes: "", isNew: true });
    setFilter("all");
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Enter would otherwise submit the whole form and create the campaign.
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
    }
  }

  const chip = "rounded-full border px-3 py-1 text-xs font-semibold transition";
  const thBase = "sticky top-0 bg-background py-2.5 font-semibold";
  const th = `${thBase} z-10 px-4 shadow-[inset_0_-1px_0_var(--border)]`;
  // Handle and row number share the first column; the number hides on phones.
  const lead = "w-px whitespace-nowrap pl-2 pr-0 sm:pl-3";
  // Columns folded into the first one on phones, so a row never needs sideways scrolling.
  const wide = "hidden sm:table-cell";
  const pinned = "sticky right-0 bg-inherit shadow-[inset_1px_0_0_var(--border)]";
  const cellInput = "w-full rounded-md border bg-surface px-2 py-1.5 text-sm text-ink outline-hidden focus:border-accent";
  const iconButton = "rounded-md p-1.5 text-muted transition hover:bg-background";

  function editRow(edit: Editing, number: number) {
    const badPhone = Boolean(edit.phone.trim()) && !isCallablePhone(edit.phone);
    const field = (key: "phone" | "notes") => ({
      value: edit[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEditing({ ...edit, [key]: e.target.value }),
      onKeyDown,
    });
    const phoneInput = (className: string) => (
      <input
        aria-label="Phone"
        aria-invalid={badPhone}
        inputMode="tel"
        placeholder="98765 43210"
        {...field("phone")}
        className={`${cellInput} tabular-nums ${badPhone ? "border-warn" : "border-border"} ${className}`}
      />
    );
    const notesInput = (className: string) => (
      <input aria-label="Notes" placeholder="What they're interested in" {...field("notes")} className={`${cellInput} border-border ${className}`} />
    );
    // mousedown is prevented so focus stays in the row and its blur does not save first.
    const keepFocus = (e: React.MouseEvent) => e.preventDefault();

    return (
      <tr
        key={edit.id}
        className={ROW_BG.editing}
        // Clicking or tabbing anywhere outside the row keeps what was typed.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) save();
        }}
      >
        <td className={`${lead} py-2 tabular-nums text-muted`}>
          {/* Lines up with the number beside the handle on other rows. */}
          <span className="hidden pl-7 sm:inline">{number}</span>
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              aria-label="Name"
              placeholder="Name"
              value={edit.name}
              onChange={(e) => setEditing({ ...edit, name: e.target.value })}
              onKeyDown={onKeyDown}
              className={`${cellInput} border-border sm:min-w-32`}
            />
            {phoneInput("sm:hidden")}
            {notesInput("sm:hidden")}
          </div>
        </td>
        <td className={`${wide} px-2 py-2`}>{phoneInput("min-w-36")}</td>
        <td className={`${wide} px-2 py-2`}>{notesInput("min-w-40")}</td>
        <td className={`${wide} px-4 py-2`}>
          {badPhone ? <StatusBadge status="invalid" /> : <span className="text-xs text-muted">{edit.isNew ? "New" : "Editing"}</span>}
        </td>
        <td className={`${pinned} px-3 py-2`}>
          <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={save}
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90"
            >
              Save
            </button>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => setEditing(null)}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show rows">
          {FILTERS.map(({ key, label, idle, active: on }) => {
            const count = key === "all" ? contacts.length : counts[key];
            if (key !== "all" && key !== "ready" && !count) return null;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active === key}
                onClick={() => setFilter(active === key ? "all" : key)}
                className={`${chip} ${active === key ? on : `${idle} hover:brightness-95`}`}
              >
                {label(count)}
              </button>
            );
          })}
          {tooMany ? <span className={`${chip} border-transparent bg-warn/10 text-warn`}>Over the {MAX_CONTACTS.toLocaleString("en-IN")} limit</span> : null}
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent"
        >
          <PlusIcon /> Add contact
        </button>
      </div>

      {items.length || editing?.isNew ? (
        <div ref={scrollBox} className="max-h-96 overflow-auto rounded-xl border border-border">
          <table className={`w-full text-sm sm:min-w-[46rem] ${drag ? "cursor-grabbing select-none" : ""}`}>
            <thead className="text-left text-xs uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className={`${thBase} ${lead} z-10 shadow-[inset_0_-1px_0_var(--border)]`}>
                  <span className="hidden pl-7 sm:inline">#</span>
                  <span className="sr-only sm:hidden">Order</span>
                </th>
                <th className={th}>
                  <span className="sm:hidden">Contact</span>
                  <span className="hidden sm:inline">Name</span>
                </th>
                <th className={`${th} ${wide}`}>Phone</th>
                <th className={`${th} ${wide}`}>Notes</th>
                <th className={`${th} ${wide}`}>Status</th>
                <th className={`${thBase} right-0 z-20 w-px px-4 shadow-[inset_1px_-1px_0_var(--border)]`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(({ draft, row, number }) => {
                if (editing?.id === draft.id) return editRow(editing, number);

                const dropped = row.status !== "ready";
                const phone = row.status === "invalid" ? draft.phone || "(empty)" : formatPhone(row.contact.phone);
                const phoneColor = row.status === "invalid" ? "text-warn" : dropped ? "text-muted" : "text-foreground";
                const label = draft.name || draft.phone || "row";
                const dragging = drag?.id === draft.id;
                return (
                  <tr key={draft.id} data-id={draft.id} className={dragging ? ROW_BG.editing : dropped ? ROW_BG.dropped : ROW_BG.normal}>
                    <td className={`${lead} py-2.5`}>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          data-handle={draft.id}
                          onPointerDown={(e) => startDrag(e, draft.id)}
                          onKeyDown={(e) => moveByKey(e, draft.id)}
                          aria-label={`Move ${label}. Use the up and down arrow keys.`}
                          title="Drag to change the order"
                          className={`touch-none rounded-md p-1 transition hover:bg-background hover:text-ink ${
                            dragging ? "cursor-grabbing text-accent" : "cursor-grab text-muted/70"
                          }`}
                        >
                          <GripIcon />
                        </button>
                        <span className="hidden min-w-5 tabular-nums text-muted sm:inline">{number}</span>
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 ${dropped ? "text-muted" : "font-medium text-ink"}`}>
                      {draft.name || <span className="font-normal text-muted">No name</span>}
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-normal sm:hidden">
                        <span className={`tabular-nums ${phoneColor}`}>{phone}</span>
                        <StatusBadge status={row.status} />
                      </span>
                      {draft.notes ? <span className="mt-0.5 block text-xs font-normal text-muted sm:hidden">{draft.notes}</span> : null}
                    </td>
                    <td className={`${wide} whitespace-nowrap px-4 py-2.5 tabular-nums ${phoneColor}`}>{phone}</td>
                    <td className={`${wide} px-4 py-2.5 text-muted`}>{draft.notes || "—"}</td>
                    <td className={`${wide} px-4 py-2.5`}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={`${pinned} px-3 py-2`}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing({ id: draft.id, name: draft.name, phone: draft.phone, notes: draft.notes ?? "", isNew: false })}
                          aria-label={`Edit ${label}`}
                          title="Edit"
                          className={`${iconButton} hover:text-accent`}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(draft.id)}
                          aria-label={`Delete ${label}`}
                          title="Delete"
                          className={`${iconButton} hover:text-warn`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {editing?.isNew ? editRow(editing, contacts.length + 1) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No contacts found. The file needs a phone column, or name, phone and notes in that order. You can also add contacts by hand.
        </p>
      )}

      {items.length > 1 ? (
        <p className="text-xs text-muted">
          Calls go out from the top of the list down. Drag a row by{" "}
          <span className="inline-block align-middle text-muted/70">
            <GripIcon />
          </span>{" "}
          to change the order.
        </p>
      ) : null}
      {matching.length > PREVIEW_ROWS ? (
        <p className="text-xs text-muted">
          Showing the first {PREVIEW_ROWS} of {matching.length.toLocaleString("en-IN")} rows. The counts above include every row.
        </p>
      ) : null}
      {counts.invalid || counts.duplicate ? (
        <p className="text-xs text-muted">
          Invalid and duplicate rows won&apos;t be called. Fix them with the pencil or delete them. Click a count above to see just those rows.
        </p>
      ) : null}
    </div>
  );
}

function FieldError({ id, boxed = false, children }: { id: string; boxed?: boolean; children: React.ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className={`flex items-start gap-1.5 text-xs font-semibold text-warn ${boxed ? "rounded-lg border border-warn/30 bg-warn/5 px-3 py-2" : "mt-1.5"}`}
    >
      <svg viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
      {children}
    </p>
  );
}

function StatusBadge({ status }: { status: ContactRow["status"] }) {
  const { label, className } = ROW_STATUS[status];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{label}</span>;
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...ICON}>
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...ICON}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...ICON}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...ICON}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" />
          <circle cx="15" cy={y} r="1.6" />
        </g>
      ))}
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...ICON} strokeWidth={2.25}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

import { formatE164PhoneNumber } from "@/lib/phone";

/** Shared by the upload preview (browser) and the API (server), so both count the same rows. */

export const MAX_CONTACTS = 2000;

export type ContactInput = { name: string; phone: string; notes?: string };

/** Minimal RFC 4180 parsing: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const HEADER_ALIASES = {
  name: ["name", "full name", "customer", "customer name", "contact"],
  phone: ["phone", "phone number", "mobile", "mobile number", "number", "contact number", "whatsapp"],
  notes: ["notes", "note", "enquiry", "inquiry", "comment", "comments", "interest"],
};

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
}

/** Uses a header row when there is one, otherwise assumes name, phone, notes. */
export function contactsFromCsv(text: string): ContactInput[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (!rows.length) return [];

  const headers = rows[0]!;
  const phoneCol = findColumn(headers, HEADER_ALIASES.phone);
  const hasHeader = phoneCol !== -1;
  const cols = hasHeader
    ? { name: findColumn(headers, HEADER_ALIASES.name), phone: phoneCol, notes: findColumn(headers, HEADER_ALIASES.notes) }
    : { name: 0, phone: 1, notes: 2 };

  return (hasHeader ? rows.slice(1) : rows).map((row) => {
    // A one-column list of numbers is common; treat the lone value as the phone.
    const single = !hasHeader && row.length === 1;
    return {
      name: (single ? "" : row[cols.name] ?? "").trim(),
      phone: (single ? row[0] : row[cols.phone] ?? "")!.trim(),
      notes: cols.notes >= 0 ? row[cols.notes]?.trim() || undefined : undefined,
    };
  });
}

export type CheckedContacts = {
  valid: ContactInput[];
  invalid: ContactInput[];
  duplicates: number;
};

const CALLABLE_PHONE = /^\+\d{8,15}$/;

export function isCallablePhone(phone: string): boolean {
  return CALLABLE_PHONE.test(formatE164PhoneNumber(phone));
}

export type ContactRow = { contact: ContactInput; status: "ready" | "invalid" | "duplicate" };

/** Every row in upload order with what happens to it, so the preview can show why a row is dropped. */
export function reviewContacts(contacts: ContactInput[]): ContactRow[] {
  const seen = new Set<string>();

  return contacts.map((contact) => {
    const phone = formatE164PhoneNumber(contact.phone ?? "");
    if (!CALLABLE_PHONE.test(phone)) return { contact, status: "invalid" };
    if (seen.has(phone)) return { contact: { ...contact, phone }, status: "duplicate" };
    seen.add(phone);
    return {
      contact: {
        name: contact.name?.slice(0, 200) || "Customer",
        phone,
        notes: contact.notes?.slice(0, 500) || undefined,
      },
      status: "ready",
    };
  });
}

/** Normalises numbers to E.164 and drops bad or repeated ones before anything is stored. */
export function checkContacts(contacts: ContactInput[]): CheckedContacts {
  const rows = reviewContacts(contacts);
  return {
    valid: rows.filter((row) => row.status === "ready").map((row) => row.contact),
    invalid: rows.filter((row) => row.status === "invalid").map((row) => row.contact),
    duplicates: rows.filter((row) => row.status === "duplicate").length,
  };
}

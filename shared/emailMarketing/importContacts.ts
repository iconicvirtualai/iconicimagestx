import { blankContact, isValidEmail, normalizeEmail, splitTags, uniqueTags } from "./contacts";
import type { MarketingContact } from "./types";

export const IMPORT_FIELDS = ["email", "firstName", "lastName", "company", "phone", "tags", "custom", "ignore"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export interface ColumnMapping {
  [header: string]: ImportField;
}

export interface ImportIssue {
  row: number;
  email: string;
  reason: string;
}

export interface ImportSummary {
  totalRows: number;
  invalid: ImportIssue[];
  duplicatesInFile: number;
  created: number;
  updated: number;
}

const HEADER_HINTS: { field: ImportField; hints: string[] }[] = [
  { field: "email", hints: ["email", "e-mail", "email address", "e mail"] },
  { field: "firstName", hints: ["first name", "firstname", "first", "given name"] },
  { field: "lastName", hints: ["last name", "lastname", "last", "surname"] },
  { field: "company", hints: ["company", "brokerage", "organization", "organisation", "office"] },
  { field: "phone", hints: ["phone", "mobile", "cell", "telephone"] },
  { field: "tags", hints: ["tags", "tag", "labels", "label"] },
];

export function parseCsv(text: string): ParsedTable {
  const input = text.replace(/^\uFEFF/, "");
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      matrix.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    matrix.push(row);
  }

  const filled = matrix.filter((line) => line.some((value) => value.length > 0));
  const width = filled.reduce((max, line) => Math.max(max, line.length), 0);
  const headers = (filled[0] || []).concat(Array(Math.max(0, width - (filled[0]?.length || 0))).fill("")).map((header, index) => header || `Column ${index + 1}`);
  const rows = filled.slice(1).map((line) => {
    const next = line.slice(0, headers.length);
    while (next.length < headers.length) next.push("");
    return next;
  });
  return { headers, rows };
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ImportField>();
  for (const header of headers) {
    const key = header.trim().toLowerCase();
    const match = HEADER_HINTS.find((hint) => hint.hints.includes(key) && !used.has(hint.field));
    if (match) {
      mapping[header] = match.field;
      used.add(match.field);
    } else {
      mapping[header] = "ignore";
    }
  }
  return mapping;
}

export interface MappedImportRow {
  row: number;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  tags: string[];
  custom: Record<string, string>;
}

export function mapTable(table: ParsedTable, mapping: ColumnMapping): MappedImportRow[] {
  return table.rows.map((row, index) => {
    const mapped: MappedImportRow = {
      row: index + 2,
      email: "",
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      tags: [],
      custom: {},
    };
    table.headers.forEach((header, column) => {
      const field = mapping[header] || "ignore";
      const value = row[column] || "";
      if (field === "ignore" || !value.trim()) return;
      if (field === "tags") mapped.tags = splitTags(value);
      else if (field === "custom") mapped.custom[header] = value.trim();
      else if (field === "email") mapped.email = normalizeEmail(value);
      else mapped[field] = value.trim();
    });
    return mapped;
  });
}

export function buildImportPlan(input: {
  rows: MappedImportRow[];
  existing: MarketingContact[];
  now: string;
  extraTags?: string[];
}): { summary: ImportSummary; upserts: MarketingContact[] } {
  const existing = new Map(input.existing.map((contact) => [contact.email, contact]));
  const planned = new Map<string, MarketingContact>();
  const invalid: ImportIssue[] = [];
  const seenInFile = new Set<string>();
  let duplicatesInFile = 0;
  let created = 0;
  let updated = 0;
  const extra = uniqueTags(input.extraTags || []);

  for (const row of input.rows) {
    if (!row.email) {
      invalid.push({ row: row.row, email: "", reason: "Missing email" });
      continue;
    }
    if (!isValidEmail(row.email)) {
      invalid.push({ row: row.row, email: row.email, reason: "Invalid email" });
      continue;
    }
    if (seenInFile.has(row.email)) duplicatesInFile += 1;
    seenInFile.add(row.email);

    const prior = planned.get(row.email) || existing.get(row.email);
    if (!prior) {
      const contact = blankContact(row.email, "import", input.now);
      contact.firstName = row.firstName;
      contact.lastName = row.lastName;
      contact.company = row.company;
      contact.phone = row.phone;
      contact.tags = uniqueTags([...row.tags, ...extra]);
      contact.custom = { ...row.custom };
      contact.emailVerified = false;
      planned.set(row.email, contact);
      created += 1;
      continue;
    }

    const next: MarketingContact = {
      ...prior,
      custom: { ...prior.custom },
      tags: uniqueTags([...prior.tags, ...row.tags, ...extra]),
      firstName: row.firstName || prior.firstName,
      lastName: row.lastName || prior.lastName,
      company: row.company || prior.company,
      phone: row.phone || prior.phone,
      updatedAt: input.now,
    };
    for (const [key, value] of Object.entries(row.custom)) next.custom[key] = value;
    if (!planned.has(row.email) && existing.has(row.email)) updated += 1;
    planned.set(row.email, next);
  }

  return {
    summary: {
      totalRows: input.rows.length,
      invalid,
      duplicatesInFile,
      created,
      updated,
    },
    upserts: [...planned.values()],
  };
}

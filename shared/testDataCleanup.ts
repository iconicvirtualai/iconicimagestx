/**
 * Staff test-data cleanup.
 * Dry run is the default. Apply archives only records with a clear test
 * signal, plus the child records of those orders. It does not hard-delete.
 * Nothing here sends email, SMS, Square, or a client notice.
 * Calendar holds are cancelled with sendUpdates "none" by the caller.
 */

import { DELIVERY_QA_CLIENT_EMAIL } from "./deliveryQaClient.ts";

export const CLEANUP_COLLECTIONS = [
  "orders",
  "invoices",
  "clients",
  "customers",
  "listings",
  "galleries",
  "orderRequests",
  "appointments",
  "editJobs",
  "mediaJobs",
  "vsaiJobs",
] as const;

export type CleanupCollection = (typeof CLEANUP_COLLECTIONS)[number];

/** Child records of a matched order are archived with it. Clients are not. */
const LINKED_ARCHIVE = new Set<string>([
  "invoices",
  "listings",
  "galleries",
  "orderRequests",
  "appointments",
  "editJobs",
  "mediaJobs",
  "vsaiJobs",
]);

const CANCEL_STATUS = new Set<string>([
  "orders",
  "invoices",
  "orderRequests",
  "appointments",
  "editJobs",
  "mediaJobs",
  "vsaiJobs",
]);

const KNOWN_ORDER_TOKENS = new Set([
  "#149",
  "149",
  "ord-l-74499",
  "ord-l-00000",
  "#155",
  "155",
  "#160",
  "160",
  "#161",
  "161",
  "#162",
  "162",
  "#169",
  "169",
  "#170",
  "170",
]);

const TEST_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.invalid",
  "test.com",
  "test.test",
  "mailinator.com",
  "guerrillamail.com",
  "yopmail.com",
  "sharklasers.com",
  "iconic.test",
  "playtest.invalid",
]);

const NUMBER_FIELDS = ["orderNumber", "invoiceNumber", "orderCode", "number"] as const;
const LINK_FIELDS = ["orderId", "orderRequestId", "invoiceId", "listingId", "galleryId", "clientId", "customerId"] as const;
const HOLD_EVENT_FIELDS = ["calendarEventId", "googleCalendarEventId"] as const;
const HOLD_CALENDAR_FIELDS = ["calendarId", "googleCalendarId"] as const;

export interface CleanupRecord {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export interface CleanupLink {
  collection: string;
  id: string;
  label: string;
}

export interface CleanupMatch {
  collection: string;
  id: string;
  label: string;
  reason: string;
  links: CleanupLink[];
  /** Included in apply. Borderline rows are never included. */
  archive: boolean;
}

export interface SquareInvoiceNote {
  collection: string;
  id: string;
  label: string;
  squareInvoiceId: string;
  orderId: string;
}

export interface CleanupReport {
  matched: CleanupMatch[];
  borderline: CleanupMatch[];
  squareInvoices: SquareInvoiceNote[];
  /** Records whose full JSON must be in the backup before apply. */
  backupRecords: CleanupRecord[];
  archiveRecords: CleanupRecord[];
}

export interface HoldCancelRequest {
  calendarId: string;
  eventId: string;
  sendUpdates: "none";
}

export interface CleanupBackup {
  runId: string;
  createdAt: string;
  createdBy: string;
  records: Array<{ collection: string; id: string; data: Record<string, unknown> }>;
  squareInvoices: SquareInvoiceNote[];
}

export interface ApplyCleanupResult {
  applied: boolean;
  error?: string;
  runId: string;
  archived: Array<{ collection: string; id: string }>;
  holds: HoldCancelRequest[];
  holdErrors: string[];
  squareInvoices: SquareInvoiceNote[];
  notificationsSent: [];
}

export interface CleanupArgs {
  apply: boolean;
  unarchive: string | null;
  unknown: string[];
}

export function parseCleanupArgs(argv: readonly string[]): CleanupArgs {
  let apply = false;
  let unarchive: string | null = null;
  const unknown: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--unarchive") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) unknown.push("--unarchive");
      else {
        unarchive = next;
        index += 1;
      }
      continue;
    }
    unknown.push(arg);
  }
  return { apply, unarchive, unknown };
}

export function classifyTestData(records: readonly CleanupRecord[]): CleanupReport {
  const clear = new Map<string, CleanupMatch>();
  const borderline = new Map<string, CleanupMatch>();

  for (const record of records) {
    const key = recordKey(record);
    const reason = clearReason(record);
    if (reason) {
      clear.set(key, rowFrom(record, reason, true));
      continue;
    }
    const soft = borderlineReason(record);
    if (soft) borderline.set(key, rowFrom(record, soft, false));
  }

  const byKey = new Map(records.map((record) => [recordKey(record), record]));
  let expanded = true;
  while (expanded) {
    expanded = false;
    const matchedIds = idsByCollection(clear);
    for (const record of records) {
      const key = recordKey(record);
      if (clear.has(key) || !LINKED_ARCHIVE.has(record.collection)) continue;
      const parent = linkedParent(record, matchedIds);
      if (!parent) continue;
      const reason = `linked to ${parent.collection}/${parent.id} (${parent.label})`;
      clear.set(key, {
        ...rowFrom(record, reason, true),
        links: [{ collection: parent.collection, id: parent.id, label: parent.label }],
      });
      borderline.delete(key);
      expanded = true;
    }
  }

  const archive: CleanupRecord[] = [];
  const backup: CleanupRecord[] = [];
  for (const record of records) {
    if (!clear.has(recordKey(record))) continue;
    archive.push(record);
    backup.push(record);
  }

  for (const row of clear.values()) {
    const record = byKey.get(`${row.collection}/${row.id}`);
    if (!record) continue;
    for (const field of ["clientId", "customerId"] as const) {
      const id = text(record.data[field]);
      if (!id) continue;
      const collection = field === "customerId" ? "customers" : "clients";
      const client = byKey.get(`${collection}/${id}`);
      if (!client) continue;
      const clientKey = recordKey(client);
      backup.push(client);
      if (clear.has(clientKey)) continue;
      borderline.set(clientKey, {
        ...rowFrom(client, `linked to test ${row.collection}/${row.id} but this client has no test signal`, false),
        links: [{ collection: row.collection, id: row.id, label: row.label }],
      });
    }
  }

  attachLinks(clear, records);
  attachLinks(borderline, records);

  return {
    matched: [...clear.values()].sort(byPath),
    borderline: [...borderline.values()].sort(byPath),
    squareInvoices: squareNotes([...archive]),
    backupRecords: dedupeRecords(backup),
    archiveRecords: dedupeRecords(archive),
  };
}

export function formatCleanupPlainList(report: CleanupReport): string {
  const lines = ["collection\tid\tlabel\treason"];
  for (const row of report.matched) {
    lines.push(`${row.collection}\t${row.id}\t${row.label}\t${row.reason}`);
  }
  if (report.matched.length === 0) lines.push("(no clear test records)");
  lines.push("");
  lines.push("needs a human look");
  lines.push("collection\tid\tlabel\treason");
  for (const row of report.borderline) {
    lines.push(`${row.collection}\t${row.id}\t${row.label}\t${row.reason}`);
  }
  if (report.borderline.length === 0) lines.push("(none)");
  if (report.squareInvoices.length > 0) {
    lines.push("");
    lines.push("square invoices to void by hand");
    for (const note of report.squareInvoices) {
      lines.push(`${note.collection}\t${note.id}\t${note.label}\t${note.squareInvoiceId}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function archivePatch(record: CleanupRecord, actor: string, at: string): Record<string, unknown> {
  const status = CANCEL_STATUS.has(record.collection) ? "cancelled" : "archived";
  const patch: Record<string, unknown> = {
    status,
    archivedAt: at,
    archivedBy: actor,
    testData: true,
  };
  if (holdEventId(record.data)) patch.calendarHold = "cancelled";
  return patch;
}

export function holdCancelRequests(records: readonly CleanupRecord[]): HoldCancelRequest[] {
  const seen = new Set<string>();
  const holds: HoldCancelRequest[] = [];
  for (const record of records) {
    const eventId = holdEventId(record.data);
    if (!eventId) continue;
    const calendarId = holdCalendarId(record.data);
    const key = `${calendarId}::${eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holds.push({ calendarId, eventId, sendUpdates: "none" });
  }
  return holds;
}

/**
 * Writes the backup first. If that write throws, no archive updates run.
 * removeHold is optional. It is only called with sendUpdates "none".
 * This function has no email, SMS, Square, or client-notice path.
 */
export async function applyTestDataCleanup(input: {
  records: readonly CleanupRecord[];
  actor: string;
  now?: string;
  runId: string;
  writeBackup: (backup: CleanupBackup) => Promise<void>;
  update: (collection: string, id: string, patch: Record<string, unknown>) => Promise<void>;
  removeHold?: (hold: HoldCancelRequest) => Promise<void>;
}): Promise<ApplyCleanupResult> {
  const report = classifyTestData(input.records);
  const now = input.now || new Date().toISOString();
  const backup: CleanupBackup = {
    runId: input.runId,
    createdAt: now,
    createdBy: input.actor,
    records: report.backupRecords.map((record) => ({
      collection: record.collection,
      id: record.id,
      data: jsonSafeRecord(record.data) as Record<string, unknown>,
    })),
    squareInvoices: report.squareInvoices,
  };
  const empty: ApplyCleanupResult = {
    applied: false,
    runId: input.runId,
    archived: [],
    holds: [],
    holdErrors: [],
    squareInvoices: report.squareInvoices,
    notificationsSent: [],
  };
  try {
    await input.writeBackup(backup);
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "Backup failed.",
    };
  }

  const archived: Array<{ collection: string; id: string }> = [];
  for (const record of report.archiveRecords) {
    await input.update(record.collection, record.id, archivePatch(record, input.actor, now));
    archived.push({ collection: record.collection, id: record.id });
  }

  const holds = holdCancelRequests(report.archiveRecords);
  const holdErrors: string[] = [];
  if (input.removeHold) {
    for (const hold of holds) {
      try {
        await input.removeHold({ ...hold, sendUpdates: "none" });
      } catch (err) {
        holdErrors.push(`${hold.calendarId || "(no calendar)"} ${hold.eventId}: ${err instanceof Error ? err.message : "cancel failed"}`);
      }
    }
  }

  return {
    applied: true,
    runId: input.runId,
    archived,
    holds,
    holdErrors,
    squareInvoices: report.squareInvoices,
    notificationsSent: [],
  };
}

export async function unarchiveTestData(input: {
  backup: CleanupBackup;
  replace: (collection: string, id: string, data: Record<string, unknown>) => Promise<void>;
}): Promise<{ restored: Array<{ collection: string; id: string }>; notificationsSent: [] }> {
  const restored: Array<{ collection: string; id: string }> = [];
  for (const record of input.backup.records) {
    await input.replace(record.collection, record.id, record.data);
    restored.push({ collection: record.collection, id: record.id });
  }
  return { restored, notificationsSent: [] };
}

export function jsonSafeRecord(value: unknown): unknown {
  if (value == null) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) return value.map((item) => jsonSafeRecord(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = jsonSafeRecord(item);
    }
    return out;
  }
  return value;
}

function clearReason(record: CleanupRecord): string | null {
  const data = record.data;
  if (data.playtest === true) return "playtest is true";
  if (data.qaOnly === true) return "qaOnly is true";
  if (data.testData === true) return "testData is true";
  const id = record.id.toLowerCase();
  if (id.startsWith("playtest-")) return "id starts with playtest-";
  if (id.includes("seed-delivery-qa") || id.includes("playtest-delivery-qa")) return "seeded delivery QA id";
  const known = knownOrderReason(record);
  if (known) return known;
  const email = recordEmail(data);
  if (email === DELIVERY_QA_CLIENT_EMAIL) return `test mailbox ${DELIVERY_QA_CLIENT_EMAIL}`;
  if (email && TEST_EMAIL_DOMAINS.has(emailDomain(email))) return `test email domain ${emailDomain(email)}`;
  if (email && (emailDomain(email).endsWith(".test") || emailDomain(email).endsWith(".invalid"))) {
    return `test email domain ${emailDomain(email)}`;
  }
  return null;
}

function borderlineReason(record: CleanupRecord): string | null {
  const data = record.data;
  const email = recordEmail(data);
  if (email && /\b(test|fake|dummy|qa|playtest)\b/i.test(email.split("@")[0] || "")) {
    return "email local-part looks like a test, domain is not a known test domain";
  }
  const label = recordLabel(record);
  if (/\b(test|fake|dummy|sample|playtest|qa)\b/i.test(label) && label !== record.id) {
    return "name or title looks like test data, no playtest/qaOnly flag";
  }
  const notes = `${text(data.notes)} ${text(data.internalNotes)} ${text(data.vibeNote)}`;
  if (/\b(test order|fake order|do not (use|invoice|count)|playtest)\b/i.test(notes)) {
    return "notes mention a test order";
  }
  return null;
}

function knownOrderReason(record: CleanupRecord): string | null {
  if (KNOWN_ORDER_TOKENS.has(normalizeToken(record.id))) {
    return `known test order ${record.id}`;
  }
  for (const field of NUMBER_FIELDS) {
    const value = text(record.data[field]);
    if (!value) continue;
    if (KNOWN_ORDER_TOKENS.has(normalizeToken(value))) return `known test order ${value}`;
  }
  return null;
}

function linkedParent(
  record: CleanupRecord,
  matchedIds: Map<string, Map<string, CleanupMatch>>,
): CleanupMatch | null {
  for (const field of LINK_FIELDS) {
    if (field === "clientId" || field === "customerId") continue;
    const id = text(record.data[field]);
    if (!id) continue;
    const collection = collectionForLink(field);
    const hit = matchedIds.get(collection)?.get(id);
    if (hit) return hit;
  }
  return null;
}

function collectionForLink(field: string): string {
  if (field === "orderId") return "orders";
  if (field === "orderRequestId") return "orderRequests";
  if (field === "invoiceId") return "invoices";
  if (field === "listingId") return "listings";
  if (field === "galleryId") return "galleries";
  return "";
}

function attachLinks(rows: Map<string, CleanupMatch>, records: readonly CleanupRecord[]) {
  const byKey = new Map(records.map((record) => [recordKey(record), record]));
  for (const row of rows.values()) {
    const record = byKey.get(`${row.collection}/${row.id}`);
    if (!record || row.links.length > 0) continue;
    const links: CleanupLink[] = [];
    for (const field of LINK_FIELDS) {
      const id = text(record.data[field]);
      if (!id) continue;
      const collection = field === "clientId" || field === "customerId"
        ? (field === "customerId" ? "customers" : "clients")
        : collectionForLink(field);
      const linked = byKey.get(`${collection}/${id}`);
      links.push({
        collection,
        id,
        label: linked ? recordLabel(linked) : id,
      });
    }
    row.links = links;
  }
}

function idsByCollection(rows: Map<string, CleanupMatch>): Map<string, Map<string, CleanupMatch>> {
  const out = new Map<string, Map<string, CleanupMatch>>();
  for (const row of rows.values()) {
    const bucket = out.get(row.collection) || new Map<string, CleanupMatch>();
    bucket.set(row.id, row);
    out.set(row.collection, bucket);
  }
  return out;
}

function squareNotes(records: readonly CleanupRecord[]): SquareInvoiceNote[] {
  const notes: SquareInvoiceNote[] = [];
  for (const record of records) {
    const squareInvoiceId = text(record.data.squareInvoiceId) || text(record.data.square_invoice_id);
    if (!squareInvoiceId) continue;
    notes.push({
      collection: record.collection,
      id: record.id,
      label: recordLabel(record),
      squareInvoiceId,
      orderId: text(record.data.orderId),
    });
  }
  return notes;
}

function rowFrom(record: CleanupRecord, reason: string, archive: boolean): CleanupMatch {
  return {
    collection: record.collection,
    id: record.id,
    label: recordLabel(record),
    reason,
    links: [],
    archive,
  };
}

function recordLabel(record: CleanupRecord): string {
  const data = record.data;
  return text(data.orderNumber)
    || text(data.invoiceNumber)
    || text(data.clientName)
    || text(data.name)
    || text(data.title)
    || recordEmail(data)
    || record.id;
}

function recordEmail(data: Record<string, unknown>): string {
  const raw = text(data.email) || text(data.clientEmail) || text(data.billingEmail);
  return raw.toLowerCase();
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function holdEventId(data: Record<string, unknown>): string {
  for (const field of HOLD_EVENT_FIELDS) {
    const value = text(data[field]);
    if (value) return value;
  }
  return "";
}

function holdCalendarId(data: Record<string, unknown>): string {
  for (const field of HOLD_CALENDAR_FIELDS) {
    const value = text(data[field]);
    if (value) return value;
  }
  return "";
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordKey(record: CleanupRecord): string {
  return `${record.collection}/${record.id}`;
}

function dedupeRecords(records: readonly CleanupRecord[]): CleanupRecord[] {
  const seen = new Set<string>();
  const out: CleanupRecord[] = [];
  for (const record of records) {
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function byPath(a: CleanupMatch, b: CleanupMatch): number {
  return `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`);
}

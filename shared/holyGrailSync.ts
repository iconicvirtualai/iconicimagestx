/**
 * Marketing Holy Grail column contract.
 * Website and HAR feeds may append the inbox (A–H, optional J) and may update
 * Contacts AH, AL, AM, and AN. Every other tab and column stays untouched.
 */

import { normalizePersonName } from "./emailMarketing/contacts";
import { matchSuppression } from "./emailMarketing/suppression";
import type { SuppressionEntry } from "./emailMarketing/types";

export const HOLY_GRAIL_SHEET_ID = "1kZWkEHWdH_2nsLHokPaTs4pRxpkgLcOWqIaXu9wGsX8";
export const HOLY_GRAIL_PAGE_LIMIT = 40;

export const HOLY_GRAIL_TABS = {
  dashboard: "🏠 Dashboard",
  howTo: "📖 How To",
  touchLog: "📞 Touch Log",
  startHere: "Start Here",
  inbox: "🆕 New Leads Inbox",
  topClients: "⭐ Top Clients",
  recurring: "🔁 Recurring",
  strays: "🌱 Strays & One-time",
  winBack: "💤 Win-Back",
  agentProspects: "🏡 Agent Prospects",
  seniorCommunities: "🏥 Senior Communities",
  apartmentComplexes: "🏢 Apartment Complexes",
  hospitality: "🏨 Hospitality",
  otherBusinesses: "🏪 Other Businesses",
  doNotContact: "⛔ Do Not Contact",
  contacts: "📇 Contacts",
  suppression: "⛔ Suppression",
  prospectsHospitality: "Prospects - Hospitality",
  campaignCalendar: "Campaign Calendar",
  ads: "Ads",
  ideasBank: "Ideas Bank",
  lists: "Lists & Segments",
  socialCalendar: "Social Calendar",
} as const;

/** Read-only. The sync never writes these tabs. */
export const HOLY_GRAIL_NEVER_WRITE_TABS = [
  HOLY_GRAIL_TABS.dashboard,
  HOLY_GRAIL_TABS.howTo,
  HOLY_GRAIL_TABS.touchLog,
  HOLY_GRAIL_TABS.startHere,
  HOLY_GRAIL_TABS.topClients,
  HOLY_GRAIL_TABS.recurring,
  HOLY_GRAIL_TABS.strays,
  HOLY_GRAIL_TABS.winBack,
  HOLY_GRAIL_TABS.agentProspects,
  HOLY_GRAIL_TABS.seniorCommunities,
  HOLY_GRAIL_TABS.apartmentComplexes,
  HOLY_GRAIL_TABS.hospitality,
  HOLY_GRAIL_TABS.otherBusinesses,
  HOLY_GRAIL_TABS.doNotContact,
  HOLY_GRAIL_TABS.suppression,
  HOLY_GRAIL_TABS.prospectsHospitality,
  HOLY_GRAIL_TABS.campaignCalendar,
  HOLY_GRAIL_TABS.ads,
  HOLY_GRAIL_TABS.ideasBank,
  HOLY_GRAIL_TABS.lists,
  HOLY_GRAIL_TABS.socialCalendar,
] as const;

export const INBOX_VALUE_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const INBOX_ACTION_COLUMN = "J";
export const INBOX_FORMULA_COLUMN = "I";
export const CONTACTS_WRITE_COLUMNS = ["AH", "AL", "AM", "AN"] as const;
export const CONTACTS_NEVER_WRITE_COLUMNS = ["A", "G", "K", "AI", "AJ", "AK"] as const;

export const ACTION_POSSIBLE_DUPE = "possible dupe" as const;
export const ACTION_SUPPRESSED = "suppressed" as const;

const ICONIC_CLIENT_ID = /^(IC-\d+|C\d+)$/i;
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const TEST_WORD = /\b(test|playtest|localhost|sandbox|fixture|testdata|test-data)\b/i;
const STAGING_FIXTURE = /staging/i;

export function holyGrailLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HOLY_GRAIL_SYNC_LIVE === "true";
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function columnIndex(letter: string): number {
  let n = 0;
  for (const char of letter.toUpperCase()) {
    if (char < "A" || char > "Z") return -1;
    n = n * 26 + (char.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function quoteTab(tab: string, a1: string): string {
  return `'${tab.replace(/'/g, "''")}'!${a1}`;
}

export function compactUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + "Z";
}

/** Trim, lowercase, and remove every space. Matching key for Contacts column R. */
export function normalizeSyncEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Digits only. An 11-digit NANP number that starts with 1 drops the country
 * code so +1 and a local number still match. Fewer than 7 digits do not match.
 */
export function normalizeSyncPhone(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : "";
}

export function sheetText(value: unknown, max = 400): string {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return FORMULA_LEAD.test(text) ? `'${text}` : text;
}

export function mapOrderStatus(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!value) return "";
  if (["cancelled", "canceled", "declined", "void", "voided", "expired_unpaid", "no_show"].includes(value)) return "Canceled";
  if (["delivered", "paid", "delivered_paid", "complete", "completed"].includes(value)) return "Delivered";
  if (["confirmed", "booked", "scheduled", "in_progress", "shooting", "editing"].includes(value)) return "Booked";
  if (["new", "pending", "awaiting", "draft", "quoted"].includes(value)) return "Pending";
  if (value === "archived") return "Archived";
  return "";
}

export function lastOrderLabel(orderNumber: string, day: string): string {
  const ref = sheetText(orderNumber, 80);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
  if (ref && date) return `${ref} · ${date}`;
  return ref || date;
}

export function sourceSyncedValue(source: "Website" | "HAR", nowMs: number, harListingId = ""): string {
  if (source === "HAR" && harListingId.trim()) return sheetText(`har:listing:${harListingId.trim()}`, 120);
  if (source === "HAR") return `har:${compactUtc(nowMs)}`;
  return `website:${compactUtc(nowMs)}`;
}

export function cityFromAddressText(label: string): string {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  const tail = parts[parts.length - 1];
  if (/^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(tail)) return parts[parts.length - 2];
  const embedded = tail.match(/^([A-Za-z .'-]+?)\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (embedded) return embedded[1].trim();
  return "";
}

export function isDncStatus(value: string): boolean {
  return /\bDNC\b/i.test(value) || value.includes("⛔ DNC");
}

export function isEmailOkNo(value: string): boolean {
  return value.trim().toUpperCase() === "NO";
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function sourceBlob(data: Record<string, unknown>, id: string): string {
  const tags = Array.isArray(data.tags) ? data.tags.map((tag) => asText(tag)).join(" ") : asText(data.tags);
  return [
    id,
    asText(data.source),
    asText(data.leadSource),
    asText(data.origin),
    asText(data.environment),
    asText(data.archivedFrom),
    asText(data.createdFrom),
    asText(data.fixtureName),
    tags,
  ].join(" ");
}

function emailHostIsTest(email: string): boolean {
  const host = normalizeSyncEmail(email).split("@")[1] || "";
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".test");
}

/** Skip test, playtest, localhost, staging fixtures, sandbox, and archived /admin/test-data rows. */
export function isTestRecord(id: string, data: Record<string, unknown>): boolean {
  if (data.playtest === true || data.sandbox === true || data.test === true || data.testData === true || data.fixture === true) {
    return true;
  }
  const email = asText(data.email) || asText(data.clientEmail);
  if (emailHostIsTest(email)) return true;
  if (id.toLowerCase().includes("playtest")) return true;
  const blob = sourceBlob(data, id);
  if (TEST_WORD.test(blob) || STAGING_FIXTURE.test(blob)) return true;
  if (/\/admin\/test-data/i.test(blob)) return true;
  const status = asText(data.status).toLowerCase();
  const archived = status === "archived" || data.archived === true;
  if (archived && /test-data|testdata|\/admin\/test-data/i.test(blob)) return true;
  return false;
}

export interface ChangeDoc {
  collection: "clients" | "orderRequests" | "orders";
  id: string;
  ms: number;
  data: Record<string, unknown>;
}

export interface HolyGrailLead {
  key: string;
  siteClientId: string;
  iconicClientId: string;
  name: string;
  email: string;
  phone: string;
  phoneRaw: string;
  company: string;
  city: string;
  notes: string;
  source: "Website" | "HAR";
  receivedAt: string;
  lastOrder: string;
  orderStatus: string;
  harListingId: string;
}

export interface HarLeadInput {
  listingId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  notes: string;
  receivedAtMs: number;
}

export function leadFromHar(input: HarLeadInput): HolyGrailLead | null {
  const email = normalizeSyncEmail(input.email);
  const phone = normalizeSyncPhone(input.phone);
  const record = {
    source: "HAR",
    leadSource: "HAR",
    email,
    playtest: false,
  };
  if (isTestRecord(input.listingId || "har", record)) return null;
  if (!email && !phone) return null;
  const received = Number.isFinite(input.receivedAtMs) ? input.receivedAtMs : Date.now();
  return {
    key: email ? `email:${email}` : `phone:${phone}`,
    siteClientId: input.listingId ? `har:${input.listingId}` : "",
    iconicClientId: "",
    name: sheetText(input.name, 120),
    email,
    phone,
    phoneRaw: sheetText(input.phone, 40),
    company: sheetText(input.company, 120),
    city: sheetText(input.city, 80),
    notes: sheetText(input.notes, 400),
    source: "HAR",
    receivedAt: compactUtc(received),
    lastOrder: "",
    orderStatus: "",
    harListingId: sheetText(input.listingId, 80),
  };
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object" && "seconds" in value) {
    const seconds = Number((value as { seconds: number }).seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dayFrom(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
  const ms = timestampMillis(value);
  return ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
}

function cityFromData(data: Record<string, unknown>): string {
  const direct = asText(data.city);
  if (direct) return direct;
  const address = data.address;
  if (address && typeof address === "object" && !Array.isArray(address)) {
    const city = asText((address as Record<string, unknown>).city);
    if (city) return city;
  }
  const label = asText(data.addressLabel) || (typeof address === "string" ? address.trim() : "");
  return cityFromAddressText(label);
}

function personName(data: Record<string, unknown>): string {
  const combined = `${asText(data.firstName)} ${asText(data.lastName)}`.trim();
  return combined || asText(data.clientName) || asText(data.name);
}

function iconicClientId(data: Record<string, unknown>): string {
  for (const key of ["iconicClientId", "crmClientId", "sheetClientId"]) {
    const value = asText(data[key]);
    if (ICONIC_CLIENT_ID.test(value)) return value.toUpperCase();
  }
  return "";
}

interface PersonNode {
  collection: ChangeDoc["collection"];
  id: string;
  ms: number;
  clientIds: string[];
  email: string;
  phone: string;
  phoneRaw: string;
  iconicClientId: string;
  name: string;
  company: string;
  city: string;
  leadSource: string;
  orderNumber: string;
  orderStatus: string;
  orderRank: number;
  orderMs: number;
  orderDay: string;
  receivedMs: number;
}

function nodeFromChange(doc: ChangeDoc): PersonNode | null {
  const data = doc.data;
  const email = normalizeSyncEmail(asText(data.email) || asText(data.clientEmail));
  const phoneRaw = asText(data.phone) || asText(data.clientPhone);
  const phone = normalizeSyncPhone(phoneRaw);
  const clientId = asText(data.clientId);
  const clientIds = doc.collection === "clients" ? [doc.id] : clientId ? [clientId] : [];
  if (!email && !phone && clientIds.length === 0 && !iconicClientId(data)) return null;
  const orderNumber = asText(data.orderNumber) || asText(data.orderCode);
  const orderStatus = mapOrderStatus(data.status);
  const orderRank = doc.collection === "orders" ? 2 : doc.collection === "orderRequests" ? 1 : 0;
  const received = timestampMillis(data.createdAt) ?? timestampMillis(data.submittedAt) ?? doc.ms;
  const orderDay = dayFrom(data.scheduledDate) || dayFrom(data.createdAt) || (orderRank > 0 ? dayFrom(doc.ms) : "");
  return {
    collection: doc.collection,
    id: doc.id,
    ms: doc.ms,
    clientIds,
    email,
    phone,
    phoneRaw,
    iconicClientId: iconicClientId(data),
    name: personName(data),
    company: asText(data.company) || asText(data.brokerage) || asText(data.companyName),
    city: cityFromData(data),
    leadSource: asText(data.leadSource),
    orderNumber,
    orderStatus,
    orderRank,
    orderMs: orderRank > 0 ? doc.ms : 0,
    orderDay,
    receivedMs: received,
  };
}

function preferText(current: string, next: string): string {
  return current || next;
}

export function leadsFromChanges(docs: ChangeDoc[]): HolyGrailLead[] {
  const nodes: PersonNode[] = [];
  for (const doc of docs) {
    if (isTestRecord(doc.id, doc.data)) continue;
    const node = nodeFromChange(doc);
    if (node) nodes.push(node);
  }

  const parent = nodes.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };

  const emailAt = new Map<string, number>();
  const clientAt = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (node.email) {
      const prev = emailAt.get(node.email);
      if (prev != null) union(prev, index);
      emailAt.set(node.email, index);
    }
    for (const id of node.clientIds) {
      const prev = clientAt.get(id);
      if (prev != null) union(prev, index);
      clientAt.set(id, index);
    }
  });

  const phoneRoots = new Map<string, number[]>();
  nodes.forEach((node, index) => {
    if (!node.phone) return;
    const root = find(index);
    const list = phoneRoots.get(node.phone) || [];
    if (!list.includes(root)) list.push(root);
    phoneRoots.set(node.phone, list);
  });
  for (const roots of phoneRoots.values()) {
    const emails = new Set(roots.map((root) => (
      nodes.filter((_, index) => find(index) === root).map((node) => node.email).find(Boolean) || ""
    )));
    if ([...emails].filter(Boolean).length > 1) continue;
    for (let index = 1; index < roots.length; index += 1) union(roots[0], roots[index]);
  }

  const groups = new Map<number, PersonNode[]>();
  nodes.forEach((node, index) => {
    const root = find(index);
    const list = groups.get(root) || [];
    list.push(node);
    groups.set(root, list);
  });

  const leads: HolyGrailLead[] = [];
  for (const group of groups.values()) {
    leads.push(mergeGroup(group));
  }
  return leads;
}

function mergeGroup(group: PersonNode[]): HolyGrailLead {
  const clientNode = group.find((node) => node.collection === "clients");
  const siteClientId = clientNode?.id
    || group.flatMap((node) => node.clientIds)[0]
    || `${group[0].collection}/${group[0].id}`;
  const iconicIds = [...new Set(group.map((node) => node.iconicClientId).filter(Boolean))];
  let email = "";
  let phone = "";
  let phoneRaw = "";
  let name = "";
  let company = "";
  let city = "";
  let leadSource = "";
  let receivedMs = group[0].receivedMs;
  let orderNumber = "";
  let orderStatus = "";
  let orderRank = 0;
  let orderMs = 0;
  let orderDay = "";
  for (const node of group) {
    email = preferText(email, node.email);
    phone = preferText(phone, node.phone);
    phoneRaw = preferText(phoneRaw, node.phoneRaw);
    name = preferText(name, node.name);
    company = preferText(company, node.company);
    city = preferText(city, node.city);
    leadSource = preferText(leadSource, node.leadSource);
    receivedMs = Math.min(receivedMs, node.receivedMs);
    if (node.orderRank > 0 && (node.orderRank > orderRank || (node.orderRank === orderRank && node.orderMs >= orderMs))) {
      orderRank = node.orderRank;
      orderMs = node.orderMs;
      orderNumber = node.orderNumber || orderNumber;
      orderStatus = node.orderStatus || orderStatus;
      orderDay = node.orderDay || orderDay;
    }
  }
  const notes = [
    orderNumber ? `Order ${orderNumber}` : "",
    orderStatus,
    leadSource && !isTestRecord("note", { leadSource }) ? leadSource : "",
  ].filter(Boolean).join(" · ");
  return {
    key: email ? `email:${email}` : phone ? `phone:${phone}` : `site:${siteClientId}`,
    siteClientId,
    iconicClientId: iconicIds.length === 1 ? iconicIds[0] : "",
    name: sheetText(name, 120),
    email,
    phone,
    phoneRaw: sheetText(phoneRaw, 40),
    company: sheetText(company, 120),
    city: sheetText(city, 80),
    notes: sheetText(notes, 400),
    source: "Website",
    receivedAt: compactUtc(receivedMs || group[0].ms),
    lastOrder: lastOrderLabel(orderNumber, orderDay || (orderMs ? new Date(orderMs).toISOString().slice(0, 10) : "")),
    orderStatus: sheetText(orderStatus, 40),
    harListingId: "",
  };
}

export interface ContactIndexRow {
  row: number;
  clientId: string;
  email: string;
  phone: string;
  liveStatus: string;
  emailOk: string;
}

export interface HolyGrailIndexes {
  contacts: ContactIndexRow[];
  suppressionEmails: string[];
  suppressionPhones: string[];
  suppressionNames: string[];
  marketingSuppression: SuppressionEntry[];
}

export function emailOkColumnFromHeader(header: string[]): string | null {
  const index = header.findIndex((cell) => cell.trim().toLowerCase() === "email ok");
  return index >= 0 ? columnLetter(index) : null;
}

export function buildContactIndex(input: {
  clientIds: string[];
  liveStatus: string[];
  emails: string[];
  phones: string[];
  emailOk?: string[];
}): ContactIndexRow[] {
  const length = Math.max(input.clientIds.length, input.liveStatus.length, input.emails.length, input.phones.length, input.emailOk?.length || 0);
  const rows: ContactIndexRow[] = [];
  for (let index = 1; index < length; index += 1) {
    const clientId = (input.clientIds[index] || "").trim();
    const email = normalizeSyncEmail(input.emails[index] || "");
    const phone = normalizeSyncPhone(input.phones[index] || "");
    if (!clientId && !email && !phone) continue;
    rows.push({
      row: index + 1,
      clientId: clientId.toUpperCase(),
      email,
      phone,
      liveStatus: (input.liveStatus[index] || "").trim(),
      emailOk: (input.emailOk?.[index] || "").trim(),
    });
  }
  return rows;
}

function headerIndexes(header: string[], names: string[]): number[] {
  const wanted = new Set(names);
  const indexes: number[] = [];
  header.forEach((cell, index) => {
    if (wanted.has(cell.trim().toLowerCase())) indexes.push(index);
  });
  return indexes;
}

export function suppressionFromGrid(rows: string[][]): { emails: string[]; phones: string[]; names: string[] } {
  const grid = rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  const header = (grid[0] || []).map((cell) => cell.toLowerCase());
  const emailCols = headerIndexes(header, ["email", "emails", "e-mail"]);
  const phoneCols = headerIndexes(header, ["phone", "phones", "mobile", "cell"]);
  const nameCols = headerIndexes(header, ["name", "names", "full name"]);
  const hasHeader = emailCols.length + phoneCols.length + nameCols.length > 0;
  const body = hasHeader ? grid.slice(1) : grid;
  const emails = new Set<string>();
  const phones = new Set<string>();
  const names = new Set<string>();
  const takeEmail = (cell: string) => {
    const email = normalizeSyncEmail(cell);
    if (email.includes("@")) emails.add(email);
  };
  const takePhone = (cell: string) => {
    const phone = normalizeSyncPhone(cell);
    if (phone) phones.add(phone);
  };
  for (const row of body) {
    if (hasHeader) {
      emailCols.forEach((index) => takeEmail(row[index] || ""));
      phoneCols.forEach((index) => takePhone(row[index] || ""));
      nameCols.forEach((index) => {
        const name = normalizePersonName(row[index] || "");
        if (name.includes(" ")) names.add(name);
      });
      row.forEach(takeEmail);
    } else {
      row.forEach((cell) => {
        takeEmail(cell);
        if (normalizeSyncPhone(cell).length >= 10) takePhone(cell);
      });
    }
  }
  return { emails: [...emails], phones: [...phones], names: [...names] };
}

export interface InboxCells {
  A: string;
  B: string;
  C: string;
  D: string;
  E: string;
  F: string;
  G: string;
  H: string;
}

export interface ContactCells {
  AH: string;
  AL?: string;
  AM?: string;
  AN: string;
}

export interface PlannedLead {
  key: string;
  siteClientId: string;
  disposition: "no-identity" | "unchanged" | "append" | "possible-dupe" | "suppressed" | "known";
  flag: "" | "possible dupe" | "suppressed";
  reason: string;
  inbox: InboxCells | null;
  action: "" | "possible dupe";
  contactRow: number | null;
  contactCells: ContactCells | null;
  fingerprint: string;
  inboxAppended: boolean;
}

export interface LeadMemory {
  fingerprint: string;
  inboxAppended: boolean;
  contactRow: number | null;
}

function inboxFromLead(lead: HolyGrailLead, notes: string): InboxCells {
  return {
    A: lead.receivedAt,
    B: lead.source,
    C: lead.name,
    D: lead.email,
    E: lead.phoneRaw || lead.phone,
    F: lead.company,
    G: lead.city,
    H: sheetText(notes || lead.notes, 400),
  };
}

function contactCells(lead: HolyGrailLead, nowMs: number): ContactCells {
  const cells: ContactCells = {
    AH: sourceSyncedValue(lead.source, nowMs, lead.harListingId),
    AN: sheetText(lead.siteClientId, 160),
  };
  if (lead.lastOrder) cells.AL = lead.lastOrder;
  if (lead.orderStatus) cells.AM = lead.orderStatus;
  return cells;
}

function fingerprintFor(plan: Pick<PlannedLead, "disposition" | "inbox" | "action" | "contactRow" | "contactCells">): string {
  return JSON.stringify({
    disposition: plan.disposition,
    inbox: plan.inbox,
    action: plan.action,
    contactRow: plan.contactRow,
    contactCells: plan.contactCells,
  });
}

function marketingBlocked(lead: HolyGrailLead, list: SuppressionEntry[]): boolean {
  if (!list.length) return false;
  const parts = lead.name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");
  return Boolean(matchSuppression({ email: lead.email, firstName, lastName }, list));
}

function sheetBlocked(lead: HolyGrailLead, index: HolyGrailIndexes): string {
  if (lead.email && index.suppressionEmails.includes(lead.email)) return "suppression list email";
  if (lead.phone && index.suppressionPhones.includes(lead.phone)) return "suppression list phone";
  const name = normalizePersonName(lead.name);
  if (name && index.suppressionNames.includes(name)) return "suppression list name";
  if (marketingBlocked(lead, index.marketingSuppression)) return "Firestore marketingSuppression";
  return "";
}

function rowBlocked(row: ContactIndexRow): string {
  if (isDncStatus(row.liveStatus)) return "Live Status DNC";
  if (isEmailOkNo(row.emailOk)) return "Email OK = NO";
  return "";
}

function classify(lead: HolyGrailLead, index: HolyGrailIndexes, nowMs: number): PlannedLead {
  const base = {
    key: lead.key,
    siteClientId: lead.siteClientId,
    inboxAppended: false,
  };
  if (!lead.email && !lead.phone && !lead.iconicClientId) {
    const plan = { ...base, disposition: "no-identity" as const, flag: "" as const, reason: "No email, phone, or Client ID.", inbox: null, action: "" as const, contactRow: null, contactCells: null };
    return { ...plan, fingerprint: fingerprintFor(plan) };
  }

  const emailHits = lead.email ? index.contacts.filter((row) => row.email === lead.email) : [];
  const phoneHits = lead.phone ? index.contacts.filter((row) => row.phone === lead.phone) : [];
  const idHits = lead.iconicClientId ? index.contacts.filter((row) => row.clientId === lead.iconicClientId) : [];
  const blockedOn = (rows: ContactIndexRow[]) => rows.map(rowBlocked).find(Boolean) || "";
  const listBlock = sheetBlocked(lead, index);

  const suppressed = (reason: string, rows: ContactIndexRow[]): PlannedLead => {
    const plan = {
      ...base,
      disposition: "suppressed" as const,
      flag: ACTION_SUPPRESSED,
      reason,
      inbox: null,
      action: "" as const,
      contactRow: rows[0]?.row ?? null,
      contactCells: null,
    };
    return { ...plan, fingerprint: fingerprintFor(plan) };
  };

  const possible = (reason: string): PlannedLead => {
    const note = sheetText(`Possible duplicate. ${reason}`, 400);
    const plan = {
      ...base,
      disposition: "possible-dupe" as const,
      flag: ACTION_POSSIBLE_DUPE,
      reason,
      inbox: inboxFromLead(lead, note),
      action: ACTION_POSSIBLE_DUPE,
      contactRow: null,
      contactCells: null,
    };
    return { ...plan, fingerprint: fingerprintFor(plan) };
  };

  const known = (row: ContactIndexRow, reason: string, flag: PlannedLead["flag"]): PlannedLead => {
    const plan = {
      ...base,
      disposition: "known" as const,
      flag,
      reason,
      inbox: null,
      action: "" as const,
      contactRow: row.row,
      contactCells: contactCells(lead, nowMs),
    };
    return { ...plan, fingerprint: fingerprintFor(plan) };
  };

  if (idHits.length > 1) {
    const reason = "Client ID matches more than one Contacts row.";
    return listBlock || blockedOn(idHits) ? suppressed(`${reason} ${listBlock || blockedOn(idHits)}`, idHits) : possible(reason);
  }
  if (idHits.length === 1) {
    const row = idHits[0];
    const emailConflict = emailHits.some((hit) => hit.row !== row.row);
    const phoneConflict = phoneHits.some((hit) => hit.row !== row.row);
    const sameRowPhoneConflict = Boolean(lead.phone && row.phone && lead.phone !== row.phone);
    if (emailConflict || phoneConflict || sameRowPhoneConflict) {
      const reason = "Client ID row does not agree with email or phone.";
      return listBlock || blockedOn([row, ...emailHits, ...phoneHits])
        ? suppressed(`${reason} ${listBlock || blockedOn([row, ...emailHits, ...phoneHits])}`, [row])
        : possible(reason);
    }
    const block = listBlock || rowBlocked(row);
    return known(row, block ? `Client ID match. ${block}` : "Client ID match.", block ? ACTION_SUPPRESSED : "");
  }

  const emailRows = [...new Set(emailHits.map((row) => row.row))];
  const phoneRows = [...new Set(phoneHits.map((row) => row.row))];
  if (emailRows.length > 1) {
    const reason = "Email matches more than one Contacts row.";
    return listBlock || blockedOn(emailHits) ? suppressed(`${reason} ${listBlock || blockedOn(emailHits)}`, emailHits) : possible(reason);
  }
  if (emailRows.length === 1) {
    const row = emailHits[0];
    const phoneOnOther = phoneHits.some((hit) => hit.row !== row.row);
    const phoneDisagrees = Boolean(lead.phone && row.phone && lead.phone !== row.phone);
    if (phoneOnOther || phoneDisagrees) {
      const reason = phoneOnOther
        ? "Email matches one contact and phone matches another."
        : "Email matches a contact with a different phone.";
      return listBlock || blockedOn([row, ...phoneHits])
        ? suppressed(`${reason} ${listBlock || blockedOn([row, ...phoneHits])}`, [row])
        : possible(reason);
    }
    const block = listBlock || rowBlocked(row);
    return known(row, block ? `Email match. ${block}` : "Email match.", block ? ACTION_SUPPRESSED : "");
  }

  if (phoneRows.length > 0) {
    const reason = phoneRows.length > 1
      ? "Phone matches more than one Contacts row and email does not."
      : "Phone matches a contact with a different or missing email.";
    return listBlock || blockedOn(phoneHits) ? suppressed(`${reason} ${listBlock || blockedOn(phoneHits)}`, phoneHits) : possible(reason);
  }

  if (listBlock) return suppressed(listBlock, []);

  const plan = {
    ...base,
    disposition: "append" as const,
    flag: "" as const,
    reason: "No Contacts match.",
    inbox: inboxFromLead(lead, lead.notes),
    action: "" as const,
    contactRow: null,
    contactCells: null,
  };
  return { ...plan, fingerprint: fingerprintFor(plan) };
}

export function planHolyGrailLead(
  lead: HolyGrailLead,
  index: HolyGrailIndexes,
  nowMs: number,
  memory?: LeadMemory | null,
): PlannedLead {
  const next = classify(lead, index, nowMs);
  if (!memory) return next;
  const alreadyAppended = memory.inboxAppended && (next.disposition === "append" || next.disposition === "possible-dupe");
  const sameWrite = memory.fingerprint === next.fingerprint && (next.disposition === "known" || next.disposition === "suppressed" || next.disposition === "no-identity");
  if (!alreadyAppended && !sameWrite) return next;
  const unchanged = {
    ...next,
    disposition: "unchanged" as const,
    inbox: null,
    action: "" as const,
    contactCells: null,
    inboxAppended: memory.inboxAppended,
    contactRow: memory.contactRow ?? next.contactRow,
    reason: alreadyAppended ? "Inbox row already appended." : "Already synced.",
  };
  return { ...unchanged, fingerprint: memory.fingerprint };
}

export function planHolyGrailBatch(
  leads: HolyGrailLead[],
  index: HolyGrailIndexes,
  nowMs: number,
  memory: Record<string, LeadMemory | undefined> = {},
): PlannedLead[] {
  return leads.map((lead) => planHolyGrailLead(lead, index, nowMs, memory[lead.key]));
}

export interface SheetCellWrite {
  range: string;
  value: string;
}

export function inboxAppendRange(): string {
  return quoteTab(HOLY_GRAIL_TABS.inbox, "A:H");
}

export function inboxActionRange(row: number): string {
  return quoteTab(HOLY_GRAIL_TABS.inbox, `J${row}`);
}

export function contactCellRange(column: keyof ContactCells, row: number): string {
  return quoteTab(HOLY_GRAIL_TABS.contacts, `${column}${row}`);
}

export function contactWrites(plan: PlannedLead): SheetCellWrite[] {
  if (plan.disposition !== "known" || plan.contactRow == null || !plan.contactCells) return [];
  const cells = plan.contactCells;
  const writes: SheetCellWrite[] = [
    { range: contactCellRange("AH", plan.contactRow), value: cells.AH },
    { range: contactCellRange("AN", plan.contactRow), value: cells.AN },
  ];
  if (cells.AL) writes.push({ range: contactCellRange("AL", plan.contactRow), value: cells.AL });
  if (cells.AM) writes.push({ range: contactCellRange("AM", plan.contactRow), value: cells.AM });
  return writes;
}

export function inboxRowValues(cells: InboxCells): string[] {
  return INBOX_VALUE_COLUMNS.map((column) => cells[column]);
}

interface ParsedRange {
  tab: string;
  startCol: number;
  endCol: number;
}

export function parseSheetRange(range: string): ParsedRange {
  const bang = range.lastIndexOf("!");
  if (bang < 0) throw new Error("Sheet range is missing a tab name.");
  let tab = range.slice(0, bang);
  if (tab.startsWith("'") && tab.endsWith("'")) tab = tab.slice(1, -1).replace(/''/g, "'");
  const a1 = range.slice(bang + 1).toUpperCase();
  const match = a1.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!match) throw new Error(`Sheet range ${a1} is not a cell or column range.`);
  const startCol = columnIndex(match[1]);
  const endCol = match[3] ? columnIndex(match[3]) : startCol;
  if (startCol < 0 || endCol < startCol) throw new Error(`Sheet range ${a1} is not ordered.`);
  return { tab, startCol, endCol };
}

export function assertAllowedSheetRange(range: string): void {
  const parsed = parseSheetRange(range);
  if (parsed.tab === HOLY_GRAIL_TABS.inbox) {
    for (let col = parsed.startCol; col <= parsed.endCol; col += 1) {
      if (col !== 9 && (col < 0 || col > 7)) {
        throw new Error(`Refusing to write ${HOLY_GRAIL_TABS.inbox} column ${columnLetter(col)}.`);
      }
    }
    return;
  }
  if (parsed.tab === HOLY_GRAIL_TABS.contacts) {
    for (let col = parsed.startCol; col <= parsed.endCol; col += 1) {
      const letter = columnLetter(col);
      if (!CONTACTS_WRITE_COLUMNS.includes(letter as typeof CONTACTS_WRITE_COLUMNS[number])) {
        throw new Error(`Refusing to write ${HOLY_GRAIL_TABS.contacts} column ${letter}.`);
      }
    }
    return;
  }
  throw new Error(`Refusing to write tab ${parsed.tab}.`);
}

export interface CollectionCursor {
  ms: number;
  seenIds: string[];
}

export function emptyCursor(ms: number): CollectionCursor {
  return { ms, seenIds: [] };
}

export function selectFresh<T extends { id: string; ms: number }>(
  previous: CollectionCursor,
  page: T[],
  limit: number,
): { fresh: T[]; next: CollectionCursor; stalled: boolean } {
  const seen = new Set(previous.seenIds);
  const fresh = page.filter((doc) => doc.ms > previous.ms || !seen.has(doc.id));
  if (fresh.length === 0) {
    if (page.length < limit) return { fresh, next: previous, stalled: false };
    return { fresh, next: { ms: previous.ms + 1, seenIds: [] }, stalled: true };
  }
  const max = fresh.reduce((top, doc) => Math.max(top, doc.ms), previous.ms);
  const seenIds = new Set<string>();
  for (const doc of page) if (doc.ms === max) seenIds.add(doc.id);
  for (const doc of fresh) if (doc.ms === max) seenIds.add(doc.id);
  return { fresh, next: { ms: max, seenIds: [...seenIds] }, stalled: false };
}

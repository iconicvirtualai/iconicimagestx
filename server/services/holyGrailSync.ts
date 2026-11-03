/**
 * One-way Firestore → Marketing Holy Grail sync.
 * Reads clients, orderRequests, and orders since a cursor in sheetSync/holyGrail.
 * Writes only the columns holyGrailSync.ts allows. Never emails or texts.
 */

import { google } from "googleapis";
import admin from "firebase-admin";
import { normalizePersonName } from "../../shared/emailMarketing/contacts";
import type { SuppressionEntry } from "../../shared/emailMarketing/types";
import { normalizeSyncEmail } from "../../shared/holyGrailSync";
import {
  HOLY_GRAIL_PAGE_LIMIT,
  HOLY_GRAIL_SHEET_ID,
  HOLY_GRAIL_TABS,
  assertAllowedSheetRange,
  buildContactIndex,
  contactWrites,
  emailOkColumnFromHeader,
  emptyCursor,
  holyGrailLive,
  inboxAppendRange,
  inboxActionRange,
  inboxRowValues,
  isTestRecord,
  leadFromHar,
  leadsFromChanges,
  planHolyGrailBatch,
  quoteTab,
  selectFresh,
  suppressionFromGrid,
  type ChangeDoc,
  type CollectionCursor,
  type ContactIndexRow,
  type HolyGrailIndexes,
  type HolyGrailLead,
  type InboxCells,
  type LeadMemory,
  type PlannedLead,
} from "../../shared/holyGrailSync";
import { resolveSheetsCredentials, type SheetsCredentials } from "./ownerSheets";
import { fetchHarLeads, HAR_STUB_REASON, type HarFetchResult } from "./holyGrailHar";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const STATE_DOC = "holyGrail";
const FORBIDDEN_LOG = "[HolyGrail] Sheets returned 403. Share spreadsheet 1kZWkEHWdH_2nsLHokPaTs4pRxpkgLcOWqIaXu9wGsX8 with the service account client_email in FIREBASE_SERVICE_ACCOUNT (or OWNER_SHEETS_SA_EMAIL if that fallback is in use). The cursor was not advanced.";

type CollectionName = "clients" | "orderRequests" | "orders";
const COLLECTIONS: CollectionName[] = ["clients", "orderRequests", "orders"];

export interface HolyGrailRunResult {
  ok: boolean;
  live: boolean;
  dryRun: boolean;
  wrote: boolean;
  configured: boolean;
  sheetsForbidden: boolean;
  anchored: boolean;
  stub?: boolean;
  scanned: Record<CollectionName, number>;
  append: number;
  possibleDupes: number;
  knownUpdates: number;
  suppressed: number;
  skippedTest: number;
  unchanged: number;
  message: string;
  preview?: unknown[];
  writes?: {
    inbox: string[];
    contacts: string[];
    never: string[];
  };
}

interface SyncState {
  exists: boolean;
  cursors: Record<CollectionName, CollectionCursor>;
  emailOkColumn: string | null;
}

let cachedEmailOkColumn: string | null = null;

function db() {
  if (!admin.apps.length) throw new Error("Firebase Admin is not configured.");
  return admin.firestore();
}

export function isSheetsForbidden(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const body = error as { code?: unknown; status?: unknown; response?: { status?: unknown }; message?: unknown };
  if ([body.code, body.status, body.response?.status].some((value) => String(value) === "403")) return true;
  const message = String(body.message || "");
  return message.includes("PERMISSION_DENIED") || message.includes("The caller does not have permission");
}

function emptyScan(): Record<CollectionName, number> {
  return { clients: 0, orderRequests: 0, orders: 0 };
}

function baseResult(partial: Partial<HolyGrailRunResult>): HolyGrailRunResult {
  return {
    ok: true,
    live: holyGrailLive(),
    dryRun: false,
    wrote: false,
    configured: true,
    sheetsForbidden: false,
    anchored: false,
    scanned: emptyScan(),
    append: 0,
    possibleDupes: 0,
    knownUpdates: 0,
    suppressed: 0,
    skippedTest: 0,
    unchanged: 0,
    message: "",
    ...partial,
  };
}

function contractWrites() {
  return {
    inbox: ["A", "B", "C", "D", "E", "F", "G", "H", "J"],
    contacts: ["AH", "AL", "AM", "AN"],
    never: ["I", "A", "G", "K", "AI", "AJ", "AK"],
  };
}

function memoryId(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 600);
}

function readCursor(value: unknown): CollectionCursor | null {
  if (!value || typeof value !== "object") return null;
  const ms = Number((value as { ms?: unknown }).ms);
  if (!Number.isFinite(ms)) return null;
  const seen = (value as { seenIds?: unknown }).seenIds;
  const seenIds = Array.isArray(seen) ? seen.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
  return { ms, seenIds };
}

async function loadState(): Promise<SyncState> {
  const snap = await db().collection("sheetSync").doc(STATE_DOC).get();
  if (!snap.exists) {
    return {
      exists: false,
      cursors: { clients: emptyCursor(0), orderRequests: emptyCursor(0), orders: emptyCursor(0) },
      emailOkColumn: cachedEmailOkColumn,
    };
  }
  const data = snap.data() || {};
  const stored = data.cursors && typeof data.cursors === "object" ? data.cursors as Record<string, unknown> : {};
  const now = Date.now();
  const cursors = {
    clients: readCursor(stored.clients) || emptyCursor(now),
    orderRequests: readCursor(stored.orderRequests) || emptyCursor(now),
    orders: readCursor(stored.orders) || emptyCursor(now),
  };
  const emailOkColumn = typeof data.emailOkColumn === "string" && data.emailOkColumn ? data.emailOkColumn : cachedEmailOkColumn;
  return { exists: true, cursors, emailOkColumn };
}

async function saveState(state: SyncState, anchoredAt?: string) {
  await db().collection("sheetSync").doc(STATE_DOC).set({
    cursors: state.cursors,
    emailOkColumn: state.emailOkColumn,
    ...(anchoredAt ? { anchoredAt } : {}),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

async function saveMemories(plans: PlannedLead[]) {
  const batch = db().batch();
  let writes = 0;
  for (const plan of plans) {
    if (plan.disposition === "unchanged" || plan.disposition === "no-identity") continue;
    const ref = db().collection("sheetSync").doc(STATE_DOC).collection("leads").doc(memoryId(plan.key));
    batch.set(ref, {
      fingerprint: plan.fingerprint,
      inboxAppended: plan.inboxAppended || plan.disposition === "append" || plan.disposition === "possible-dupe",
      contactRow: plan.contactRow,
      updatedAt: new Date().toISOString(),
    });
    writes += 1;
  }
  if (writes) await batch.commit();
}

async function loadMemories(keys: string[]): Promise<Record<string, LeadMemory | undefined>> {
  const unique = [...new Set(keys)];
  const memory: Record<string, LeadMemory | undefined> = {};
  for (let offset = 0; offset < unique.length; offset += 100) {
    const slice = unique.slice(offset, offset + 100);
    const refs = slice.map((key) => db().collection("sheetSync").doc(STATE_DOC).collection("leads").doc(memoryId(key)));
    const snaps = refs.length ? await db().getAll(...refs) : [];
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      const data = snap.data() || {};
      memory[slice[index]] = {
        fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : "",
        inboxAppended: data.inboxAppended === true,
        contactRow: typeof data.contactRow === "number" ? data.contactRow : null,
      };
    });
  }
  return memory;
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function readPage(name: CollectionName, cursor: CollectionCursor) {
  const snap = await db().collection(name)
    .where("updatedAt", ">=", admin.firestore.Timestamp.fromMillis(cursor.ms))
    .orderBy("updatedAt", "asc")
    .limit(HOLY_GRAIL_PAGE_LIMIT)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      ms: timestampMillis(data.updatedAt) ?? cursor.ms,
      collection: name,
      data,
    };
  });
}

function sheetsClient(credentials: SheetsCredentials) {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SHEETS_SCOPE],
  });
  return google.sheets({ version: "v4", auth });
}

function columnValues(rows: unknown[][] | null | undefined): string[] {
  return (rows || []).map((row) => (row?.[0] == null ? "" : String(row[0])));
}

function gridValues(rows: unknown[][] | null | undefined): string[][] {
  return (rows || []).map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
}

function isMissingTab(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  return /Unable to parse range/i.test(message);
}

async function loadIndexes(
  credentials: SheetsCredentials,
  emailOkColumn: string | null,
): Promise<{ indexes: HolyGrailIndexes; emailOkColumn: string | null } | { forbidden: true }> {
  const sheets = sheetsClient(credentials);
  const contactRanges = [
    quoteTab(HOLY_GRAIL_TABS.contacts, "A:A"),
    quoteTab(HOLY_GRAIL_TABS.contacts, "G:G"),
    quoteTab(HOLY_GRAIL_TABS.contacts, "R:R"),
    quoteTab(HOLY_GRAIL_TABS.contacts, "S:S"),
    quoteTab(HOLY_GRAIL_TABS.contacts, "A1:AN1"),
  ];
  if (emailOkColumn) contactRanges.push(quoteTab(HOLY_GRAIL_TABS.contacts, `${emailOkColumn}:${emailOkColumn}`));
  const withSuppression = [...contactRanges, quoteTab(HOLY_GRAIL_TABS.suppression, "A:H")];

  let ranges = withSuppression;
  let response;
  try {
    response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: HOLY_GRAIL_SHEET_ID,
      ranges,
      valueRenderOption: "FORMATTED_VALUE",
    });
  } catch (error) {
    if (isSheetsForbidden(error)) return { forbidden: true };
    if (!isMissingTab(error)) throw error;
    ranges = contactRanges;
    response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: HOLY_GRAIL_SHEET_ID,
      ranges,
      valueRenderOption: "FORMATTED_VALUE",
    });
  }

  const valueRanges = response.data.valueRanges || [];
  const byRange = new Map<string, unknown[][]>();
  ranges.forEach((range, index) => {
    byRange.set(range, (valueRanges[index]?.values || []) as unknown[][]);
  });
  const headerRow = gridValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.contacts, "A1:AN1")))[0] || [];
  let resolvedEmailOk = emailOkColumn;
  const discovered = emailOkColumnFromHeader(headerRow);
  if (discovered && discovered !== emailOkColumn && !["A", "G", "R", "S"].includes(discovered)) {
    const extra = await sheets.spreadsheets.values.get({
      spreadsheetId: HOLY_GRAIL_SHEET_ID,
      range: quoteTab(HOLY_GRAIL_TABS.contacts, `${discovered}:${discovered}`),
      valueRenderOption: "FORMATTED_VALUE",
    });
    byRange.set(quoteTab(HOLY_GRAIL_TABS.contacts, `${discovered}:${discovered}`), (extra.data.values || []) as unknown[][]);
    resolvedEmailOk = discovered;
    cachedEmailOkColumn = discovered;
  } else if (discovered) {
    resolvedEmailOk = discovered;
    cachedEmailOkColumn = discovered;
  }

  const emailOkValues = resolvedEmailOk
    ? columnValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.contacts, `${resolvedEmailOk}:${resolvedEmailOk}`)))
    : [];
  const contacts: ContactIndexRow[] = buildContactIndex({
    clientIds: columnValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.contacts, "A:A"))),
    liveStatus: columnValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.contacts, "G:G"))),
    emails: columnValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.contacts, "R:R"))),
    phones: columnValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.contacts, "S:S"))),
    emailOk: emailOkValues,
  });
  const suppression = suppressionFromGrid(gridValues(byRange.get(quoteTab(HOLY_GRAIL_TABS.suppression, "A:H"))));
  const marketingSuppression = await loadMarketingSuppression();
  return {
    emailOkColumn: resolvedEmailOk,
    indexes: {
      contacts,
      suppressionEmails: suppression.emails,
      suppressionPhones: suppression.phones,
      suppressionNames: suppression.names,
      marketingSuppression,
    },
  };
}

async function loadMarketingSuppression(): Promise<SuppressionEntry[]> {
  const snap = await db().collection("marketingSuppression").get();
  const entries: SuppressionEntry[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const kind = data.kind === "email" || data.kind === "domain" || data.kind === "name" ? data.kind : null;
    const value = typeof data.value === "string" ? data.value.trim() : "";
    if (!kind || !value) continue;
    const aliases = Array.isArray(data.aliases) ? data.aliases.map((item) => normalizePersonName(item)).filter(Boolean) : [];
    entries.push({
      id: doc.id,
      kind,
      value: kind === "name" ? normalizePersonName(value) : kind === "email" ? normalizeSyncEmail(value) : value.replace(/^@/, "").toLowerCase(),
      reason: "manual",
      hold: data.hold === "personal" ? "personal" : "",
      note: "",
      aliases,
      email: normalizeSyncEmail(data.email),
      source: "manual",
      createdAt: "",
      updatedAt: "",
    });
  }
  return entries;
}

function counts(plans: PlannedLead[]) {
  return {
    append: plans.filter((plan) => plan.disposition === "append").length,
    possibleDupes: plans.filter((plan) => plan.disposition === "possible-dupe").length,
    knownUpdates: plans.filter((plan) => plan.disposition === "known").length,
    suppressed: plans.filter((plan) => plan.disposition === "suppressed" || plan.flag === "suppressed").length,
    unchanged: plans.filter((plan) => plan.disposition === "unchanged").length,
  };
}

function previewRows(plans: PlannedLead[]) {
  return plans.slice(0, 100).map((plan) => {
    if ((plan.disposition === "append" || plan.disposition === "possible-dupe") && plan.inbox) {
      return {
        disposition: plan.disposition,
        flag: plan.flag,
        reason: plan.reason,
        tab: HOLY_GRAIL_TABS.inbox,
        cells: plan.inbox,
        action: plan.action ? { column: "J", value: plan.action } : null,
      };
    }
    if (plan.disposition === "known" && plan.contactCells) {
      return {
        disposition: plan.disposition,
        flag: plan.flag,
        reason: plan.reason,
        tab: HOLY_GRAIL_TABS.contacts,
        row: plan.contactRow,
        cells: plan.contactCells,
      };
    }
    return {
      disposition: plan.disposition,
      flag: plan.flag,
      reason: plan.reason,
      siteClientId: plan.siteClientId,
    };
  });
}

async function applyPlans(credentials: SheetsCredentials, plans: PlannedLead[]) {
  const appending = plans.filter((plan) => (plan.disposition === "append" || plan.disposition === "possible-dupe") && plan.inbox);
  const updates = plans.flatMap((plan) => contactWrites(plan));
  if (!appending.length && !updates.length) return;
  assertAllowedSheetRange(inboxAppendRange());
  const actionPending = appending.filter((plan) => plan.action);
  updates.forEach((update) => assertAllowedSheetRange(update.range));
  const sheets = sheetsClient(credentials);
  if (appending.length) {
    const appended = await sheets.spreadsheets.values.append({
      spreadsheetId: HOLY_GRAIL_SHEET_ID,
      range: inboxAppendRange(),
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appending.map((plan) => inboxRowValues(plan.inbox as InboxCells)) },
    });
    const updatedRange = appended.data.updates?.updatedRange || "";
    const match = updatedRange.match(/![A-Z]+(\d+)/i);
    const start = match ? Number(match[1]) : 0;
    if (actionPending.length) {
      if (!start) throw new Error("Inbox append did not return a row number, so column J was left untouched.");
      const actions = appending.flatMap((plan, index) => {
        if (!plan.action) return [];
        const range = inboxActionRange(start + index);
        assertAllowedSheetRange(range);
        return [{ range, values: [[plan.action]] }];
      });
      if (actions.length) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: HOLY_GRAIL_SHEET_ID,
          requestBody: { valueInputOption: "RAW", data: actions },
        });
      }
    }
  }
  for (let offset = 0; offset < updates.length; offset += 100) {
    const data = updates.slice(offset, offset + 100).map((update) => ({ range: update.range, values: [[update.value]] }));
    if (!data.length) continue;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: HOLY_GRAIL_SHEET_ID,
      requestBody: { valueInputOption: "RAW", data },
    });
  }
}

function sinceEnvMs(): number | null {
  const raw = process.env.HOLY_GRAIL_SYNC_SINCE;
  if (!raw || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export async function runHolyGrailSync(options: { dryRun: boolean; sinceMs?: number | null } = { dryRun: false }): Promise<HolyGrailRunResult> {
  const live = holyGrailLive();
  if (!options.dryRun && !live) {
    return baseResult({
      live: false,
      wrote: false,
      message: "HOLY_GRAIL_SYNC_LIVE is not true. No Firestore cursor movement and no sheet writes.",
    });
  }

  const state = await loadState();
  const now = Date.now();
  let cursors = state.cursors;
  if (!state.exists && options.sinceMs == null) {
    const backfill = !options.dryRun ? sinceEnvMs() : null;
    if (backfill == null) {
      if (!options.dryRun) {
        const anchored = emptyCursor(now);
        await saveState({
          exists: true,
          cursors: { clients: anchored, orderRequests: anchored, orders: anchored },
          emailOkColumn: state.emailOkColumn,
        }, new Date(now).toISOString());
      }
      return baseResult({
        dryRun: options.dryRun,
        live,
        anchored: !options.dryRun,
        configured: true,
        message: options.dryRun
          ? "No cursor is stored. Pass ?since= as an ISO timestamp to preview a window. The first live run anchors the cursor at now unless HOLY_GRAIL_SYNC_SINCE is set."
          : "No cursor was stored. Anchored at now so older clients are not backfilled. Set HOLY_GRAIL_SYNC_SINCE before the first live run to import a window.",
      });
    }
    const start = emptyCursor(backfill);
    cursors = { clients: start, orderRequests: start, orders: start };
  }
  if (options.sinceMs != null) {
    const start = emptyCursor(options.sinceMs);
    cursors = { clients: start, orderRequests: start, orders: start };
  }

  const scanned = emptyScan();
  const nextCursors = { ...cursors };
  const docs: ChangeDoc[] = [];
  let stalled = false;
  for (const name of COLLECTIONS) {
    const page = await readPage(name, cursors[name]);
    scanned[name] = page.length;
    const selected = selectFresh(cursors[name], page, HOLY_GRAIL_PAGE_LIMIT);
    nextCursors[name] = selected.next;
    if (selected.stalled) stalled = true;
    for (const doc of selected.fresh) docs.push(doc);
  }

  const skippedTest = docs.filter((doc) => isTestRecord(doc.id, doc.data)).length;
  const leads = leadsFromChanges(docs);
  if (!leads.length) {
    if (!options.dryRun && cursorsMoved(cursors, nextCursors)) {
      await saveState({ exists: true, cursors: nextCursors, emailOkColumn: state.emailOkColumn });
    }
    return baseResult({
      dryRun: options.dryRun,
      live,
      scanned,
      skippedTest,
      message: stalled ? "Cursor moved past a full page of rows it had already seen." : "No new people in this window.",
    });
  }

  const credentials = resolveSheetsCredentials();
  if (!credentials) {
    console.error("[HolyGrail] Sheets credentials are missing. Set FIREBASE_SERVICE_ACCOUNT or OWNER_SHEETS_SA_EMAIL and OWNER_SHEETS_SA_KEY.");
    return baseResult({
      ok: false,
      dryRun: options.dryRun,
      live,
      configured: false,
      scanned,
      skippedTest,
      message: "Sheets credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT or OWNER_SHEETS_SA_EMAIL and OWNER_SHEETS_SA_KEY. Nothing was written.",
      ...(options.dryRun ? { preview: leads.slice(0, 100).map((lead) => ({ disposition: "sheet-unread", siteClientId: lead.siteClientId, reason: "Sheets credentials are not configured." })), writes: contractWrites() } : {}),
    });
  }

  let loaded: Awaited<ReturnType<typeof loadIndexes>>;
  try {
    loaded = await loadIndexes(credentials, state.emailOkColumn || cachedEmailOkColumn);
  } catch (error) {
    if (isSheetsForbidden(error)) {
      console.error(FORBIDDEN_LOG);
      return baseResult({
        ok: false,
        dryRun: options.dryRun,
        live,
        sheetsForbidden: true,
        scanned,
        skippedTest,
        message: "Sheets returned 403. Share the spreadsheet with the service account client_email in FIREBASE_SERVICE_ACCOUNT (fallback OWNER_SHEETS_SA_EMAIL). Nothing was written and the cursor did not move.",
      });
    }
    throw error;
  }
  if ("forbidden" in loaded) {
    console.error(FORBIDDEN_LOG);
    return baseResult({
      ok: false,
      dryRun: options.dryRun,
      live,
      sheetsForbidden: true,
      scanned,
      skippedTest,
      message: "Sheets returned 403. Share the spreadsheet with the service account client_email in FIREBASE_SERVICE_ACCOUNT (fallback OWNER_SHEETS_SA_EMAIL). Nothing was written and the cursor did not move.",
    });
  }

  const memory = await loadMemories(leads.map((lead) => lead.key));
  const plans = planHolyGrailBatch(leads, loaded.indexes, now, memory);
  const tally = counts(plans);
  if (options.dryRun) {
    return baseResult({
      dryRun: true,
      live,
      scanned,
      skippedTest,
      ...tally,
      message: "Dry run. Nothing was written and the cursor did not move.",
      preview: previewRows(plans),
      writes: contractWrites(),
    });
  }

  try {
    await applyPlans(credentials, plans);
  } catch (error) {
    if (isSheetsForbidden(error)) {
      console.error(FORBIDDEN_LOG);
      return baseResult({
        ok: false,
        live,
        sheetsForbidden: true,
        scanned,
        skippedTest,
        ...tally,
        message: "Sheets returned 403 during the write. Share the spreadsheet with the service account client_email in FIREBASE_SERVICE_ACCOUNT (fallback OWNER_SHEETS_SA_EMAIL). The cursor was not advanced.",
      });
    }
    throw error;
  }

  await saveMemories(plans);
  await saveState({ exists: true, cursors: nextCursors, emailOkColumn: loaded.emailOkColumn });
  const wrote = tally.append + tally.possibleDupes + tally.knownUpdates > 0;
  return baseResult({
    live,
    wrote,
    scanned,
    skippedTest,
    ...tally,
    message: wrote ? "Sync wrote the allowed Holy Grail columns." : "Sync checked this window and had nothing new to write.",
  });
}

function cursorsMoved(before: SyncState["cursors"], after: SyncState["cursors"]): boolean {
  return COLLECTIONS.some((name) => before[name].ms !== after[name].ms || before[name].seenIds.join(",") !== after[name].seenIds.join(","));
}

export async function runHolyGrailHar(fetch: () => Promise<HarFetchResult> = fetchHarLeads): Promise<HolyGrailRunResult> {
  const fetched = await fetch();
  if (fetched.stub) {
    return baseResult({
      ok: true,
      stub: true,
      wrote: false,
      message: fetched.reason || HAR_STUB_REASON,
    });
  }
  if (!fetched.leads.length) {
    return baseResult({ stub: false, wrote: false, message: fetched.reason || "HAR returned no leads." });
  }
  if (!holyGrailLive()) {
    return baseResult({
      live: false,
      stub: false,
      wrote: false,
      message: "HOLY_GRAIL_SYNC_LIVE is not true. HAR leads were not written.",
    });
  }
  const leads = fetched.leads.map((lead) => leadFromHar(lead)).filter((lead): lead is HolyGrailLead => Boolean(lead));
  return applyExternalLeads(leads);
}

async function applyExternalLeads(leads: HolyGrailLead[]): Promise<HolyGrailRunResult> {
  if (!leads.length) {
    return baseResult({ message: "HAR returned no usable leads.", stub: false });
  }
  const credentials = resolveSheetsCredentials();
  if (!credentials) {
    console.error("[HolyGrail] Sheets credentials are missing. Set FIREBASE_SERVICE_ACCOUNT or OWNER_SHEETS_SA_EMAIL and OWNER_SHEETS_SA_KEY.");
    return baseResult({ ok: false, configured: false, message: "Sheets credentials are not configured. HAR leads were not written." });
  }
  const state = await loadState();
  const loaded = await loadIndexes(credentials, state.emailOkColumn || cachedEmailOkColumn);
  if ("forbidden" in loaded) {
    console.error(FORBIDDEN_LOG);
    return baseResult({
      ok: false,
      sheetsForbidden: true,
      message: "Sheets returned 403. HAR leads were not written and the website cursor did not move.",
    });
  }
  const memory = await loadMemories(leads.map((lead) => lead.key));
  const plans = planHolyGrailBatch(leads, loaded.indexes, Date.now(), memory);
  try {
    await applyPlans(credentials, plans);
  } catch (error) {
    if (isSheetsForbidden(error)) {
      console.error(FORBIDDEN_LOG);
      return baseResult({ ok: false, sheetsForbidden: true, message: "Sheets returned 403 while writing HAR rows. The cursor was not advanced." });
    }
    throw error;
  }
  await saveMemories(plans);
  if (loaded.emailOkColumn && loaded.emailOkColumn !== state.emailOkColumn) {
    await db().collection("sheetSync").doc(STATE_DOC).set({
      emailOkColumn: loaded.emailOkColumn,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
  const tally = counts(plans);
  return baseResult({
    wrote: tally.append + tally.possibleDupes + tally.knownUpdates > 0,
    stub: false,
    ...tally,
    message: "HAR leads were planned with the same dedupe as the website feed.",
  });
}

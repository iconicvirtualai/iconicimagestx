/**
 * Orders for Cadi 2.0.
 * Reads use the readonly Sheets client. Writes use a separate client whose
 * only scope is https://www.googleapis.com/auth/spreadsheets.
 * Cell values are sent as RAW so Sheets does not evaluate them.
 */

import { google } from "googleapis";
import {
  OWNER_ORDER_STATUS_NEW,
  OWNER_ORDER_TEXT_MAX,
  OWNER_ORDERS_HEADERS,
  OWNER_ORDERS_TAB,
  type OwnerOrder,
  type OwnerOrdersResponse,
} from "../../shared/ownerOrders";
import {
  OWNER_SHEET_ID,
  createReadonlySheetsClient,
  resolveSheetsCredentials,
  type SheetsCredentials,
} from "./ownerSheets";

const ORDERS_WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const OWNER_ORDER_MINUTE_LIMIT = 5;
export const OWNER_ORDER_DAY_LIMIT = 50;

const FORMULA_LEAD = /^[=+\-@]/;
const NOT_CONNECTED = "Orders are not connected.";

type SheetsClient = ReturnType<typeof createReadonlySheetsClient>;

const hits = new Map<string, number[]>();

export function resetOwnerOrderRateLimitForTests() {
  hits.clear();
}

export function formatOrderTimestampCt(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const period = read("dayPeriod").toUpperCase().startsWith("P") ? "PM" : "AM";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")} ${period} CT`;
}

export function neutralizeSheetFormula(text: string): string {
  return FORMULA_LEAD.test(text) ? `'${text}` : text;
}

export function prepareOwnerOrderText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Enter an order." };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter an order." };
  if (trimmed.length > OWNER_ORDER_TEXT_MAX) {
    return { ok: false, error: "Orders are limited to 2,000 characters." };
  }
  return { ok: true, text: neutralizeSheetFormula(trimmed) };
}

export function consumeOwnerOrderRateLimit(email: string, now: number): { ok: true } | { ok: false; error: string } {
  const key = email.trim().toLowerCase();
  const recent = (hits.get(key) || []).filter((stamp) => now - stamp < DAY_MS);
  const inMinute = recent.filter((stamp) => now - stamp < MINUTE_MS);
  if (inMinute.length >= OWNER_ORDER_MINUTE_LIMIT) {
    hits.set(key, recent);
    return { ok: false, error: "Too many orders. You can submit 5 per minute." };
  }
  if (recent.length >= OWNER_ORDER_DAY_LIMIT) {
    hits.set(key, recent);
    return { ok: false, error: "Too many orders. You can submit 50 per day." };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

export function releaseOwnerOrderRateLimit(email: string, now: number) {
  const key = email.trim().toLowerCase();
  const recent = hits.get(key);
  if (!recent) return;
  const index = recent.lastIndexOf(now);
  if (index >= 0) recent.splice(index, 1);
}

export type SubmitOwnerOrderResult =
  | { ok: true; order: OwnerOrder }
  | { ok: false; status: 400 | 429 | 503; error: string };

export async function listOwnerOrders(): Promise<OwnerOrdersResponse> {
  const credentials = resolveSheetsCredentials();
  if (!credentials) {
    return { orders: [], configured: false, notice: NOT_CONNECTED, readerEmail: null };
  }
  const sheets = createReadonlySheetsClient(credentials);
  const orders = await readOrders(sheets);
  return { orders, configured: true, notice: null, readerEmail: credentials.client_email };
}

export async function submitOwnerOrder(input: {
  raw: unknown;
  ownerEmail: string;
  now?: Date;
}): Promise<SubmitOwnerOrderResult> {
  const prepared = prepareOwnerOrderText(input.raw);
  if ("error" in prepared) return { ok: false, status: 400, error: prepared.error };
  const credentials = resolveSheetsCredentials();
  if (!credentials) return { ok: false, status: 503, error: NOT_CONNECTED };

  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const limit = consumeOwnerOrderRateLimit(input.ownerEmail, nowMs);
  if ("error" in limit) return { ok: false, status: 429, error: limit.error };

  try {
    const sheets = createOrdersWriteClient(credentials);
    const order = await appendOrder(sheets, prepared.text, now);
    return { ok: true, order };
  } catch (error) {
    releaseOwnerOrderRateLimit(input.ownerEmail, nowMs);
    throw error;
  }
}

function createOrdersWriteClient(credentials: SheetsCredentials) {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [ORDERS_WRITE_SCOPE],
  });
  return google.sheets({ version: "v4", auth });
}

async function readTitles(sheets: SheetsClient): Promise<string[]> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: OWNER_SHEET_ID,
    fields: "sheets.properties.title",
  });
  return (meta.data.sheets || [])
    .map((sheet) => sheet.properties?.title || "")
    .filter(Boolean);
}

async function readOrders(sheets: SheetsClient): Promise<OwnerOrder[]> {
  const titles = await readTitles(sheets);
  if (!titles.includes(OWNER_ORDERS_TAB)) return [];
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: OWNER_SHEET_ID,
    range: sheetRange("A:E"),
    valueRenderOption: "FORMATTED_VALUE",
  });
  return parseOrderRows(response.data.values || []);
}

async function appendOrder(sheets: SheetsClient, text: string, now: Date): Promise<OwnerOrder> {
  const titles = await readTitles(sheets);
  if (!titles.includes(OWNER_ORDERS_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: OWNER_SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: OWNER_ORDERS_TAB,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: OWNER_SHEET_ID,
      range: sheetRange("A1:E1"),
      valueInputOption: "RAW",
      requestBody: { values: [Array.from(OWNER_ORDERS_HEADERS)] },
    });
  }

  const order: OwnerOrder = {
    timestamp: formatOrderTimestampCt(now),
    text,
    status: OWNER_ORDER_STATUS_NEW,
    ownerBot: "",
    reply: "",
  };
  await sheets.spreadsheets.values.append({
    spreadsheetId: OWNER_SHEET_ID,
    range: sheetRange("A:E"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[order.timestamp, order.text, order.status, order.ownerBot, order.reply]],
    },
  });
  return order;
}

function parseOrderRows(values: unknown[][]): OwnerOrder[] {
  const rows = values.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
  if (!rows.length) return [];
  const header = looksLikeHeader(rows[0]) ? rows[0] : [];
  const data = header.length ? rows.slice(1) : rows;
  const timestampAt = columnIndex(header, "Timestamp CT", 0);
  const textAt = columnIndex(header, "Order text", 1);
  const statusAt = columnIndex(header, "Status", 2);
  const ownerBotAt = columnIndex(header, "Owner bot", 3);
  const replyAt = columnIndex(header, "Cadi 2.0 reply", 4);
  const orders = data
    .map((row) => ({
      timestamp: cellAt(row, timestampAt),
      text: cellAt(row, textAt),
      status: cellAt(row, statusAt),
      ownerBot: cellAt(row, ownerBotAt),
      reply: cellAt(row, replyAt),
    }))
    .filter((order) => order.timestamp || order.text || order.status || order.ownerBot || order.reply);
  return orders.slice(-10).reverse();
}

function looksLikeHeader(row: string[]): boolean {
  const cells = row.map((cell) => cell.trim());
  return cells.includes("Timestamp CT") || cells.includes("Order text");
}

function columnIndex(header: string[], name: string, fallback: number): number {
  const index = header.findIndex((cell) => cell.trim() === name);
  return index >= 0 ? index : fallback;
}

function cellAt(row: string[], index: number): string {
  return (row[index] || "").trim();
}

function sheetRange(a1: string): string {
  return `'${OWNER_ORDERS_TAB.replace(/'/g, "''")}'!${a1}`;
}

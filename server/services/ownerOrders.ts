/**
 * Orders for Cadi 2.0.
 * The owners portal workbook is no longer read or written.
 */

import {
  OWNER_ORDER_TEXT_MAX,
  type OwnerOrder,
  type OwnerOrdersResponse,
} from "../../shared/ownerOrders";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const OWNER_ORDER_MINUTE_LIMIT = 5;
export const OWNER_ORDER_DAY_LIMIT = 50;

const FORMULA_LEAD = /^[=+\-@]/;
const NOT_CONNECTED = "Orders are not connected.";

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
  return { orders: [], configured: false, notice: NOT_CONNECTED, readerEmail: null };
}

export async function submitOwnerOrder(input: {
  raw: unknown;
  ownerEmail: string;
  now?: Date;
}): Promise<SubmitOwnerOrderResult> {
  const prepared = prepareOwnerOrderText(input.raw);
  if ("error" in prepared) return { ok: false, status: 400, error: prepared.error };
  return { ok: false, status: 503, error: NOT_CONNECTED };
}

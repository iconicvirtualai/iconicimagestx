/**
 * Package lines for admin orders.
 * Reads what was stored. When an order's own services are empty, the linked
 * booking can supply the package. This module does not write to Firestore.
 */

import { normalizeBookingLineItems, sumLineItemPrices, type BookingLineItem } from "./bookingPricing.ts";

export interface OrderServiceLine {
  id?: string;
  name: string;
  qty: number;
  price: number;
}

const PACKAGE_LABEL_KEYS = [
  "selectedService",
  "package",
  "packageName",
  "packageId",
  "selectedPackage",
] as const;

export function cleanPackageName(raw: string): string {
  return raw
    .replace(/\s+[—–-]\s+\$[\d,]+(?:\s*\/\s*\w+)?\s*$/i, "")
    .replace(/\s+\$[\d,]+(?:\s*\/\s*\w+)?\s*$/i, "")
    .trim();
}

export function orderServiceLines(
  record: Record<string, unknown> | null | undefined,
  linked?: Record<string, unknown> | null,
): OrderServiceLine[] {
  const own = storedServiceLines(record);
  if (own.length > 0) return own;
  const fromLink = storedServiceLines(linked);
  if (fromLink.length > 0) return fromLink;
  const synthesized = synthesizePackageLine(record) || synthesizePackageLine(linked);
  return synthesized ? [synthesized] : [];
}

export function orderChargeSummary(
  record: Record<string, unknown> | null | undefined,
  lines: OrderServiceLine[],
): { subtotal: number; tax: number; total: number } {
  const lineSubtotal = roundMoney(lines.reduce((sum, line) => sum + line.price, 0));
  const pricing = nested(record?.pricing);
  const tax = moneyOrNull(record?.tax) ?? moneyOrNull(pricing.tax) ?? 0;
  const storedTotal = moneyOrNull(record?.total) ?? moneyOrNull(pricing.total);
  const total = storedTotal ?? roundMoney(lineSubtotal + tax);
  const storedSubtotal = moneyOrNull(record?.subtotal) ?? moneyOrNull(pricing.subtotal);
  const subtotal = lineSubtotal > 0
    ? lineSubtotal
    : storedSubtotal && storedSubtotal > 0
      ? storedSubtotal
      : total;
  return { subtotal: roundMoney(subtotal), tax: roundMoney(tax), total: roundMoney(total) };
}

export function dedupeAdminOrders<T extends Record<string, unknown>>(records: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const record of records) {
    const keys = identityKeys(record);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    const id = text(record.id);
    if (id) {
      seen.add(`id:${id}`);
      seen.add(`order:${id}`);
      seen.add(`request:${id}`);
    }
    unique.push(record);
  }
  return unique;
}

export function exclusiveOrderBuckets<T extends Record<string, unknown>>(
  records: T[],
  group: (record: T) => "action" | "active" | "archived",
): { action: T[]; active: T[]; archived: T[] } {
  const action: T[] = [];
  const active: T[] = [];
  const archived: T[] = [];
  for (const record of dedupeAdminOrders(records)) {
    const bucket = group(record);
    if (bucket === "archived") archived.push(record);
    else if (bucket === "action") action.push(record);
    else active.push(record);
  }
  return { action, active, archived };
}

function storedServiceLines(record: Record<string, unknown> | null | undefined): OrderServiceLine[] {
  if (!record) return [];
  const raw = Array.isArray(record.lineItems) && record.lineItems.length > 0
    ? record.lineItems
    : record.services;
  return normalizeBookingLineItems(raw)
    .filter((item) => item.name.trim() && !isPromo(item))
    .map(toOrderLine);
}

function synthesizePackageLine(record: Record<string, unknown> | null | undefined): OrderServiceLine | null {
  if (!record) return null;
  const label = packageLabel(record);
  if (!label) return null;
  const pricing = nested(record.pricing);
  const price = moneyOrNull(record.total)
    ?? moneyOrNull(pricing.total)
    ?? moneyOrNull(pricing.subtotal)
    ?? moneyOrNull(record.amount)
    ?? labeledMoney(label);
  if (price == null) return null;
  return { name: cleanPackageName(label) || label, qty: 1, price };
}

function packageLabel(record: Record<string, unknown>): string {
  for (const key of PACKAGE_LABEL_KEYS) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function identityKeys(record: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const id = text(record.id);
  if (id) keys.push(`id:${id}`);
  const orderId = text(record.convertedToOrderId) || text(record.orderId);
  if (orderId) keys.push(`order:${orderId}`);
  const requestId = text(record.orderRequestId);
  if (requestId) keys.push(`request:${requestId}`);
  return keys;
}

function toOrderLine(item: BookingLineItem): OrderServiceLine {
  const line: OrderServiceLine = {
    name: item.name,
    qty: item.qty > 0 ? item.qty : 1,
    price: item.price,
  };
  if (item.id) line.id = item.id;
  return line;
}

function isPromo(item: { id?: string; name?: string }): boolean {
  const id = String(item.id || "");
  const name = String(item.name || "");
  return id.startsWith("promo-") || name.startsWith("Promo Code:");
}

function labeledMoney(raw: string): number | null {
  const match = raw.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function moneyOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nested(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function serviceLineSubtotal(lines: OrderServiceLine[]): number {
  return roundMoney(sumLineItemPrices(lines));
}

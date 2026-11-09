/**
 * Square CreatePaymentLink buyer prefill and idempotency.
 *
 * buyer_phone_number must start with + and contain 9–16 digits (max length 17).
 * address_line_1 is the street only. City, state, and ZIP are separate fields.
 * Square rejects a reused idempotency key when the body differs, including after
 * a failed create, so each attempt gets its own key.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";

export const SQUARE_DEPOSIT_CHECKOUT_FAILURE = `We could not start the deposit checkout. Please call ${BUSINESS_CONTACT.phoneDisplay}.`;

export const SQUARE_CHECKOUT_FAILURE = `We could not start Square checkout. Please call ${BUSINESS_CONTACT.phoneDisplay}.`;

const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
]);

/** Letters, numbers, and the punctuation Square's address lines allow. */
const ADDRESS_TEXT = /^[\p{L}\p{N} .,#&/'()-]+$/u;

const FULL_US_ADDRESS =
  /^(?<street>.+),\s*(?<city>[A-Za-z][A-Za-z .'-]*[A-Za-z]),\s*(?<state>[A-Za-z]{2})\s*,?\s*(?<zip>\d{5}(?:-\d{4})?)$/;

export interface SquareBuyerAddress {
  address_line_1: string;
  locality?: string;
  administrative_district_level_1?: string;
  postal_code?: string;
  country: "US";
}

export interface SquareApiError {
  category: string;
  code: string;
  field: string;
  detail: string;
}

/** E.164, or "" when the value cannot satisfy Square's phone rule. */
export function squareBuyerPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  let normalized = "";
  if (digits.length === 10) normalized = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1"))
    normalized = `+${digits}`;
  else if (trimmed.startsWith("+") && digits.length >= 9 && digits.length <= 16)
    normalized = `+${digits}`;
  if (!/^\+[1-9]\d{8,15}$/.test(normalized) || normalized.length > 17)
    return "";
  return normalized;
}

function cleanAddressText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return "";
  if (!/[\p{L}\p{N}]/u.test(text)) return "";
  if (!ADDRESS_TEXT.test(text)) return "";
  return text;
}

function looksLikeCityStateZip(value: string): boolean {
  return /\b[A-Za-z]{2}\s*,?\s*\d{5}(?:-\d{4})?\b/.test(value);
}

/**
 * A Square Address, or null when the freeform line cannot be valid.
 * A full "street, city, ST ZIP" line is split. A street-only line is sent as
 * address_line_1. Anything else is omitted.
 */
export function squareBuyerAddress(value: unknown): SquareBuyerAddress | null {
  if (typeof value !== "string") return null;
  const raw = value.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!raw) return null;
  const match = raw.match(FULL_US_ADDRESS);
  if (match?.groups) {
    const street = cleanAddressText(match.groups.street, 500);
    const city = cleanAddressText(match.groups.city, 80);
    const state = match.groups.state.toUpperCase();
    const zip = match.groups.zip;
    if (
      !street ||
      !city ||
      !US_STATE_CODES.has(state) ||
      !/^\d{5}(?:-\d{4})?$/.test(zip)
    )
      return null;
    return {
      address_line_1: street,
      locality: city,
      administrative_district_level_1: state,
      postal_code: zip,
      country: "US",
    };
  }
  if (looksLikeCityStateZip(raw) || raw.includes(",")) return null;
  const line = cleanAddressText(raw, 500);
  if (!line) return null;
  return { address_line_1: line, country: "US" };
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable for the same invoice, amount, and attempt. A new attempt cannot collide. */
export function squarePaymentLinkIdempotencyKey(input: {
  invoiceId: string;
  purpose: "checkout" | "deposit";
  amountCents: number;
  attempt: number;
}): string {
  const invoiceId = String(input.invoiceId || "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
  const purpose = input.purpose === "deposit" ? "deposit" : "checkout";
  const amountCents = Number.isFinite(input.amountCents)
    ? Math.round(input.amountCents)
    : 0;
  const attempt = input.attempt > 0 ? 1 : 0;
  const hash = fnv1a32(`${purpose}|${invoiceId}|${amountCents}|${attempt}`);
  const prefix = purpose === "deposit" ? "dep" : "pay";
  return `${prefix}-${invoiceId}-${amountCents}-a${attempt}-${hash}`.slice(
    0,
    192,
  );
}

export function scrubSquareLogText(value: string): string {
  return value
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[phone]");
}

export function readSquareErrors(body: unknown): SquareApiError[] {
  if (!body || typeof body !== "object") return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.slice(0, 8).map((error) => {
    const row =
      error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : {};
    const detail =
      typeof row.detail === "string"
        ? scrubSquareLogText(row.detail).slice(0, 300)
        : "";
    return {
      category: typeof row.category === "string" ? row.category : "",
      code: typeof row.code === "string" ? row.code : "",
      field: typeof row.field === "string" ? row.field : "",
      detail,
    };
  });
}

const PREFILL_CODES = new Set([
  "INVALID_PHONE_NUMBER",
  "INVALID_EMAIL_ADDRESS",
]);

/** True when every Square error is about pre_populated_data. */
export function squarePrefillRejected(body: unknown): boolean {
  const errors = readSquareErrors(body);
  if (errors.length === 0) return false;
  return errors.every((error) => {
    if (error.field.startsWith("pre_populated_data")) return true;
    return PREFILL_CODES.has(error.code);
  });
}

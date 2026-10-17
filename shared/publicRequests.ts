/**
 * Shared checks for the public holiday and Iconic Studios request forms.
 * These requests are not charges. Square pay links are used only when an
 * HTTPS Square URL is already in the environment.
 */

import { BOOKING_PROCESSING_LABEL, processingFee } from "./invoiceProcessing.ts";

export const PUBLIC_PROCESSING_NOTE = "A 2.8% processing fee is added at checkout.";
export const PUBLIC_PROCESSING_LABEL = BOOKING_PROCESSING_LABEL;

export const HOLIDAY_PAY_LINK_ENV = "HOLIDAY_SQUARE_PAY_URL";
export const STUDIOS_PAY_LINK_ENV = "STUDIOS_SQUARE_PAY_URL";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function isHoneypot(value: unknown): boolean {
  return cleanText(value, 200).length > 0;
}

export function validEmail(value: string): boolean {
  return value.length <= 120 && EMAIL.test(value);
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function validPhone(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function validIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validTime(value: string): boolean {
  return TIME.test(value);
}

export function formatUsd(amount: number): string {
  const whole = Number.isInteger(amount);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function withProcessing(subtotal: number): { subtotal: number; processing: number; total: number } {
  const processing = processingFee(subtotal);
  const total = Math.round((subtotal + processing) * 100) / 100;
  return { subtotal, processing, total };
}

/**
 * A pay link is shown only for an https Square host already configured
 * in the environment. Empty, non-Square, and vercel.app values stay hidden.
 */
export function readSquarePayLink(raw: string | undefined | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 300) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return null;
  const square =
    host === "square.link" ||
    host.endsWith(".square.link") ||
    host === "squareup.com" ||
    host.endsWith(".squareup.com") ||
    host === "square.site" ||
    host.endsWith(".square.site");
  if (!square) return null;
  return url.toString();
}

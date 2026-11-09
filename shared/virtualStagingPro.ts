/**
 * Professional virtual staging requests from /services/virtual-staging/pro-order.
 *
 * Price is $25 per photo, or $200 for every full set of 10. Remainder photos
 * stay $25. The booking catalog credit (VIRTUAL_STAGING_UNIT_PRICE) is a
 * different product. The server quotes with priceVirtualStagingPro and ignores
 * any total the browser sends. No payment is taken here.
 */

import { safeStorageFileName } from "./listingAccess.ts";

export const VIRTUAL_STAGING_PRO_ORDER_SOURCE = "virtual-staging-pro";
export const VIRTUAL_STAGING_PRO_LEAD = "Virtual staging pro page";
export const VIRTUAL_STAGING_PRO_SERVICE = "Virtual Staging Pro";
export const VIRTUAL_STAGING_PRO_LINE_NAME = "Pro Staging";
/** Status the admin orders list treats as a new request. */
export const VIRTUAL_STAGING_PRO_STATUS = "new";
/** Dollars per photo outside a full set of 10. */
export const VIRTUAL_STAGING_PRO_UNIT_PRICE = 25;
export const VIRTUAL_STAGING_PRO_BUNDLE_SIZE = 10;
export const VIRTUAL_STAGING_PRO_BUNDLE_PRICE = 200;
export const VIRTUAL_STAGING_PRO_RATE_LINE = "$25 per photo, or 10 photos for $200";
export const VIRTUAL_STAGING_PRO_MAX_PHOTOS = 20;
/** Direct-to-storage cap. Bytes do not pass through the API. */
export const VIRTUAL_STAGING_PRO_MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export const VIRTUAL_STAGING_PRO_STYLES = [
  "Modern",
  "Contemporary",
  "Traditional",
  "Industrial",
  "Luxury",
  "Minimalist",
  "Scandinavian",
  "Farmhouse",
] as const;

export const VIRTUAL_STAGING_PRO_ROOM_TYPES = [
  "Living Room",
  "Bedroom",
  "Dining Room",
  "Office",
  "Kitchen",
  "Patio",
  "Other",
] as const;

export type VirtualStagingProStyle = (typeof VIRTUAL_STAGING_PRO_STYLES)[number];
export type VirtualStagingProRoomType = (typeof VIRTUAL_STAGING_PRO_ROOM_TYPES)[number];

const STYLE_SET = new Set<string>(VIRTUAL_STAGING_PRO_STYLES);
const ROOM_SET = new Set<string>(VIRTUAL_STAGING_PRO_ROOM_TYPES);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Domains the test-data cleanup tool already treats as clear test mail. */
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

export interface VirtualStagingProPhotoInput {
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  roomType: VirtualStagingProRoomType;
  byteSize: number;
}

export interface VirtualStagingProOrderInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  style: VirtualStagingProStyle;
  instructions: string;
  photos: VirtualStagingProPhotoInput[];
}

export interface VirtualStagingProLineItem {
  id: "virtual-staging-pro" | "virtual-staging-pro-10";
  name: string;
  qty: number;
  unitPrice: number;
  price: number;
}

export interface VirtualStagingProQuote {
  unitPrice: number;
  qty: number;
  subtotal: number;
  total: number;
  lineItems: VirtualStagingProLineItem[];
}

export type VirtualStagingProParseResult =
  | { ok: true; value: VirtualStagingProOrderInput }
  | { ok: false; honeypot: true }
  | { ok: false; honeypot: false; error: string };

export interface VirtualStagingProQaFlags {
  qaOnly?: true;
  playtest?: true;
  testData?: true;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function oneLine(value: string, max: number): string {
  return value.replace(/[\r\n\u0000]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeVirtualStagingPhotoType(value: unknown, fileName: string): string {
  const raw = text(value).toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (PHOTO_TYPES.has(raw)) return raw;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return raw;
}

/**
 * min(n * 25, floor(n / 10) * 200 + (n % 10) * 25).
 * A full set of 10 is $200. Photos outside those sets stay $25.
 * Nine photos stay $225; they are not pulled down to the next bundle.
 */
export function priceVirtualStagingPro(photoCount: number): number {
  const straight = photoCount * VIRTUAL_STAGING_PRO_UNIT_PRICE;
  const bundled = Math.floor(photoCount / VIRTUAL_STAGING_PRO_BUNDLE_SIZE) * VIRTUAL_STAGING_PRO_BUNDLE_PRICE
    + (photoCount % VIRTUAL_STAGING_PRO_BUNDLE_SIZE) * VIRTUAL_STAGING_PRO_UNIT_PRICE;
  return Math.min(straight, bundled);
}

export function quoteVirtualStagingPro(photoCount: number): VirtualStagingProQuote | null {
  if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > VIRTUAL_STAGING_PRO_MAX_PHOTOS) {
    return null;
  }
  const bundles = Math.floor(photoCount / VIRTUAL_STAGING_PRO_BUNDLE_SIZE);
  const remainder = photoCount % VIRTUAL_STAGING_PRO_BUNDLE_SIZE;
  const lineItems: VirtualStagingProLineItem[] = [];
  if (bundles > 0) {
    lineItems.push({
      id: "virtual-staging-pro-10",
      name: `${VIRTUAL_STAGING_PRO_LINE_NAME} (10 photos)`,
      qty: bundles,
      unitPrice: VIRTUAL_STAGING_PRO_BUNDLE_PRICE,
      price: bundles * VIRTUAL_STAGING_PRO_BUNDLE_PRICE,
    });
  }
  if (remainder > 0) {
    lineItems.push({
      id: "virtual-staging-pro",
      name: VIRTUAL_STAGING_PRO_LINE_NAME,
      qty: remainder,
      unitPrice: VIRTUAL_STAGING_PRO_UNIT_PRICE,
      price: remainder * VIRTUAL_STAGING_PRO_UNIT_PRICE,
    });
  }
  const total = priceVirtualStagingPro(photoCount);
  return {
    unitPrice: VIRTUAL_STAGING_PRO_UNIT_PRICE,
    qty: photoCount,
    subtotal: total,
    total,
    lineItems,
  };
}

/**
 * Marks a request the cleanup tool can archive. An order number hides the
 * client name from the borderline name check, so QA TEST has to be flagged.
 */
export function virtualStagingProQaFlags(input: {
  name: string;
  email: string;
  notes: string;
}): VirtualStagingProQaFlags {
  const email = input.email.trim().toLowerCase();
  const domain = email.split("@")[1] || "";
  const local = email.split("@")[0] || "";
  const blob = `${input.name}\n${input.notes}`;
  const testDomain = TEST_EMAIL_DOMAINS.has(domain) || domain.endsWith(".test") || domain.endsWith(".invalid");
  const qaName = /\bQA\s*TEST\b/i.test(blob) || /\bplaytest\b/i.test(blob) || /\btest order\b/i.test(blob);
  const testLocal = /\b(test|fake|dummy|playtest)\b/i.test(local);
  if (!testDomain && !qaName && !testLocal) return {};
  return {
    qaOnly: true,
    testData: true,
    ...(qaName || /\bplaytest\b/i.test(`${blob}\n${local}`) ? { playtest: true } : {}),
  };
}

export function virtualStagingProStoragePath(orderId: string, fileName: string, index: number): string {
  return `virtual-staging-pro/${orderId}/${index}_${safeStorageFileName(fileName)}`;
}

export function isVirtualStagingProStoragePath(orderId: string, storagePath: unknown): storagePath is string {
  if (!orderId || typeof storagePath !== "string") return false;
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `virtual-staging-pro/${orderId}/`;
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
}

export function parseVirtualStagingProOrder(body: unknown): VirtualStagingProParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, honeypot: false, error: "That order could not be read." };
  }
  const raw = body as Record<string, unknown>;
  if (text(raw.companyWebsite)) return { ok: false, honeypot: true };

  const name = oneLine(text(raw.name), 80);
  const email = oneLine(text(raw.email), 120).toLowerCase();
  const phone = oneLine(text(raw.phone), 30);
  const address = oneLine(text(raw.address), 200);
  const style = oneLine(text(raw.style), 40);
  const instructions = text(raw.instructions).replace(/\u0000/g, "").trim().slice(0, 2000);

  if (name.length < 2) return { ok: false, honeypot: false, error: "Enter your name." };
  if (text(raw.name).length > 80) return { ok: false, honeypot: false, error: "Name is too long." };
  if (!EMAIL_RE.test(email)) return { ok: false, honeypot: false, error: "Enter a valid email." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, honeypot: false, error: "Enter a phone number." };
  }
  if (address.length < 5) return { ok: false, honeypot: false, error: "Enter the property address." };
  if (text(raw.address).length > 200) return { ok: false, honeypot: false, error: "Address is too long." };
  if (!STYLE_SET.has(style)) return { ok: false, honeypot: false, error: "Choose a listed style." };
  if (text(raw.instructions).length > 2000) return { ok: false, honeypot: false, error: "Notes are too long." };

  if (!Array.isArray(raw.photos) || raw.photos.length === 0) {
    return { ok: false, honeypot: false, error: "Add at least one photo." };
  }
  if (raw.photos.length > VIRTUAL_STAGING_PRO_MAX_PHOTOS) {
    return { ok: false, honeypot: false, error: `Send up to ${VIRTUAL_STAGING_PRO_MAX_PHOTOS} photos per order.` };
  }

  const photos: VirtualStagingProPhotoInput[] = [];
  for (const entry of raw.photos) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, honeypot: false, error: "A photo could not be read." };
    }
    const photo = entry as Record<string, unknown>;
    const fileName = oneLine(text(photo.fileName), 180);
    if (!fileName) return { ok: false, honeypot: false, error: "Each photo needs a file name." };
    const contentType = normalizeVirtualStagingPhotoType(photo.contentType, fileName);
    if (!PHOTO_TYPES.has(contentType)) {
      return { ok: false, honeypot: false, error: "Upload a JPG, PNG, or WebP photo." };
    }
    const roomType = oneLine(text(photo.roomType), 40);
    if (!ROOM_SET.has(roomType)) return { ok: false, honeypot: false, error: "Choose a room type for each photo." };
    const byteSize = Number(photo.byteSize);
    if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > VIRTUAL_STAGING_PRO_MAX_PHOTO_BYTES) {
      return { ok: false, honeypot: false, error: "Each photo must be a JPG, PNG, or WebP under 12 MB." };
    }
    photos.push({
      fileName,
      contentType: contentType as VirtualStagingProPhotoInput["contentType"],
      roomType: roomType as VirtualStagingProRoomType,
      byteSize,
    });
  }

  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      address,
      style: style as VirtualStagingProStyle,
      instructions,
      photos,
    },
  };
}

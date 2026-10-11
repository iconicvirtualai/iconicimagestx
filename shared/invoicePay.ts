/**
 * Client pay links and the public invoice gate.
 * No Firestore, no email, no Square. Callers store payToken and invoiceId.
 *
 * Option A: a legacy Firestore auto-id with no payToken stays payable from the
 * link already emailed to the client. A derived id (listing_, ordreq_, playtest-)
 * is guessable, so the public page and checkout require a matching payToken,
 * a signed-in owner, or a staff session. Once a payToken is stored, public
 * callers must present it. That is what the migration does.
 */

const FIRESTORE_AUTO_ID = /^[A-Za-z0-9]{20}$/;

export function isDerivedInvoiceId(id: string): boolean {
  return id.startsWith("listing_")
    || id.startsWith("ordreq_")
    || id.startsWith("playtest-");
}

/**
 * Booking invoices already emailed as /invoice/{autoId} with no token.
 * Twenty-character Firestore ids only. Derived prefixes are excluded even
 * when the whole id happens to be 20 characters.
 */
export function isLegacyOpenAutoId(id: string): boolean {
  return FIRESTORE_AUTO_ID.test(id) && !isDerivedInvoiceId(id);
}

/** Read-only ids for invoices created before links were stored. Does not allocate one. */
export function legacyInvoiceDocIds(anchor: {
  orderRequestId?: unknown;
  listingId?: unknown;
}): string[] {
  const ids: string[] = [];
  const orderRequestId = textId(anchor.orderRequestId);
  const listingId = textId(anchor.listingId);
  if (orderRequestId) ids.push(`ordreq_${orderRequestId}`);
  if (listingId) ids.push(`listing_${listingId}`);
  return ids;
}

export function invoiceRedirectTarget(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || typeof data !== "object") return null;
  return textId(data.redirectInvoiceId) || textId(data._redirect);
}

/** 256-bit token, base64url, no padding. At least 128 bits. */
export function createPayToken(): string {
  const bytes = new Uint8Array(32);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("A crypto RNG is required to create a pay token.");
  }
  cryptoApi.getRandomValues(bytes);
  return base64Url(bytes);
}

export function clientPayPath(invoiceId: string, payToken?: unknown, extra?: Record<string, string | undefined>): string {
  const id = requiredId(invoiceId);
  const params = new URLSearchParams();
  const token = textId(payToken);
  if (token) params.set("t", token);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      const text = textId(value);
      if (text) params.set(key, text);
    }
  }
  const query = params.toString();
  return query ? `/invoice/${id}?${query}` : `/invoice/${id}`;
}

export function clientPayUrl(
  origin: string,
  invoiceId: string,
  payToken?: unknown,
  extra?: Record<string, string | undefined>,
): string {
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}${clientPayPath(invoiceId, payToken, extra)}`;
}

export type InvoiceAudience = "staff" | "owner" | "public";
export type InvoiceView = "full" | "public" | "deny";

/**
 * Public callers need a matching payToken once one is stored.
 * With no token, only a legacy 20-character auto-id is still open.
 * Staff and the owning client are decided by the caller.
 */
export function decideInvoiceView(input: {
  invoiceId: string;
  payToken?: unknown;
  presentedToken?: unknown;
  audience: InvoiceAudience;
  matches: (stored: string, presented: string) => boolean;
}): InvoiceView {
  if (input.audience === "staff" || input.audience === "owner") return "full";
  const stored = textId(input.payToken) || "";
  const presented = textId(input.presentedToken) || "";
  if (stored) return input.matches(stored, presented) ? "public" : "deny";
  if (isLegacyOpenAutoId(input.invoiceId)) return "public";
  return "deny";
}

/** Payer fields. Name only. No email, phone, address, notes, or internal ids. */
export function publicInvoiceClient(invoice: Record<string, unknown>): { clientName: string } {
  const name = typeof invoice.clientName === "string" ? invoice.clientName.trim() : "";
  return { clientName: name };
}

export function publicInvoiceLines(lineItems: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(lineItems)) return [];
  const lines: Array<Record<string, unknown>> = [];
  for (const item of lineItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    if (!name && row.price == null) continue;
    const line: Record<string, unknown> = { name };
    if (typeof row.description === "string" && row.description.trim()) line.description = row.description;
    if (row.qty != null) line.qty = row.qty;
    if (row.unitPrice != null) line.unitPrice = row.unitPrice;
    if (row.price != null) line.price = row.price;
    lines.push(line);
  }
  return lines;
}

function requiredId(value: unknown): string {
  const id = textId(value);
  if (!id) throw new Error("Invoice id is required.");
  return id;
}

function textId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encode = globalThis.btoa;
  if (!encode) throw new Error("base64 encoding is required to create a pay token.");
  return encode(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

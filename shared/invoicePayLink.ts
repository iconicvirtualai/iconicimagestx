/**
 * Client pay links.
 *
 * A separate change (pay-token invoices) stores `payToken` and uses
 * `/invoice/{id}?t={payToken}`. Until that field is on the invoice, this
 * returns null. It never builds `/invoice/listing_{id}` or `/invoice/ordreq_{id}`
 * without that token.
 */

import { publicSiteUrl, type PublicSiteEnv } from "./publicSiteUrl.ts";

export interface InvoicePaySource {
  id?: unknown;
  payToken?: unknown;
  status?: unknown;
}

const SETTLED = new Set(["paid", "comped"]);

export function isGuessableInvoiceId(id: string): boolean {
  return id.startsWith("listing_") || id.startsWith("ordreq_");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function settled(invoice: InvoicePaySource | null | undefined): boolean {
  return SETTLED.has(text(invoice?.status).toLowerCase());
}

/**
 * Tokenized pay link on the public site, or null.
 * Paid and comped invoices omit the link. A missing `payToken` omits it too,
 * including when the document id is `listing_` or `ordreq_`.
 */
export function invoicePayLinkFor(
  invoice: InvoicePaySource | null | undefined,
  env?: PublicSiteEnv,
): string | null {
  if (!invoice || settled(invoice)) return null;
  const id = text(invoice.id);
  const token = text(invoice.payToken);
  if (!id || !token) return null;
  const url = new URL(`${publicSiteUrl(env)}/invoice/${encodeURIComponent(id)}`);
  url.searchParams.set("t", token);
  return url.toString();
}

/**
 * Pay link for invoice email and stored client URLs.
 * Uses the token when it exists. A legacy auto-id with no token still links
 * on the public site. `listing_` and `ordreq_` ids without a token return null.
 */
export function clientInvoiceUrl(
  invoice: InvoicePaySource | null | undefined,
  env?: PublicSiteEnv,
): string | null {
  const tokenized = invoicePayLinkFor(invoice, env);
  if (tokenized) return tokenized;
  if (!invoice || settled(invoice)) return null;
  const id = text(invoice.id);
  if (!id || isGuessableInvoiceId(id)) return null;
  return `${publicSiteUrl(env)}/invoice/${encodeURIComponent(id)}`;
}

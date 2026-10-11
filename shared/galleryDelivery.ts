/**
 * Client gallery-delivery notice: subject, links, and the order History entry.
 * No Firestore and no mail transport.
 */

import { invoicePayLinkFor, type InvoicePaySource } from "./invoicePayLink.ts";
import { publicClientUrl, type PublicSiteEnv } from "./publicSiteUrl.ts";

export type GalleryEmailDelivery = "sent" | "suppressed" | "allowlist";

export interface GalleryDeliveredHistory {
  action: "Gallery delivered";
  by: string;
  at: string;
  details: string;
  recipients: string[];
  email: GalleryEmailDelivery;
}

export function galleryDeliverySubject(address: unknown): string {
  const place = typeof address === "string" ? address.trim() : "";
  if (!place || place.toLowerCase() === "the property") return "Your gallery is ready";
  return `Your gallery is ready: ${place}`;
}

export function galleryDeliveryUrl(galleryId: string, env?: PublicSiteEnv): string {
  return publicClientUrl(`/gallery/${encodeURIComponent(galleryId)}`, env);
}

/** Pay link for the delivery email. Token required. Paid and comped are omitted. */
export function galleryDeliveryPayUrl(
  invoice: InvoicePaySource | null | undefined,
  env?: PublicSiteEnv,
): string | null {
  return invoicePayLinkFor(invoice, env);
}

export function galleryDeliveredHistoryEntry(input: {
  at: string;
  actor?: { email?: string | null; name?: string | null; uid?: string | null };
  recipients: string[];
  email: GalleryEmailDelivery;
}): GalleryDeliveredHistory {
  const recipients = input.recipients.map((item) => item.trim()).filter(Boolean);
  const who = recipients.length > 0 ? recipients.join(", ") : "none";
  const outcome = input.email === "sent"
    ? "Email sent."
    : input.email === "allowlist"
      ? "Email sent via the test allowlist."
      : "Email suppressed by the notify gate.";
  return {
    action: "Gallery delivered",
    by: staffLabel(input.actor),
    at: input.at,
    details: `Recipients: ${who}. ${outcome}`,
    recipients,
    email: input.email,
  };
}

function staffLabel(actor?: { email?: string | null; name?: string | null; uid?: string | null }): string {
  const email = clean(actor?.email);
  const name = clean(actor?.name);
  const uid = clean(actor?.uid);
  if (name && email) return `${name} (${email})`;
  return email || name || uid || "staff";
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

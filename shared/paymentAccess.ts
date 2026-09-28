/**
 * Shared payment gating for Iconic invoices.
 * Square is the default. Stripe stays limited to Studio Noir and legacy VSAI.
 */

const CLOSED_STATUSES = new Set(["void", "voided", "cancelled", "canceled"]);
const SETTLED_STATUSES = new Set(["paid", "comped"]);

export type InvoiceLike = Record<string, unknown> | null | undefined;

function statusOf(invoice: InvoiceLike): string {
  return String(invoice?.status || "").toLowerCase();
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function invoiceBalance(invoice: InvoiceLike): { total: number; amountPaid: number; amountDue: number } {
  const total = numeric(invoice?.total) ?? 0;
  const amountPaid = numeric(invoice?.amountPaid) ?? 0;
  const statedDue = numeric(invoice?.amountDue);
  const computedDue = Math.max(0, total - amountPaid);
  const amountDue = statedDue == null ? computedDue : Math.max(0, statedDue);
  return { total, amountPaid, amountDue };
}

/** Unpaid invoices stay gated. Missing invoices are not paid. */
export function invoiceAllowsDownload(invoice: InvoiceLike): boolean {
  if (!invoice) return false;
  const status = statusOf(invoice);
  if (CLOSED_STATUSES.has(status)) return false;
  if (SETTLED_STATUSES.has(status)) return true;

  const { total, amountPaid, amountDue } = invoiceBalance(invoice);
  const statedDue = numeric(invoice.amountDue);
  if (total <= 0 && (statedDue == null || statedDue <= 0)) return true;
  // A zero amountDue with nothing collected is not proof of payment.
  if (statedDue != null && statedDue <= 0 && amountPaid <= 0 && total > 0) return false;
  return amountDue <= 0 && amountPaid > 0;
}

/** Amount the client still needs to pay. Ignores a stale 0 when nothing has been collected. */
export function amountStillDue(invoice: InvoiceLike): number {
  if (!invoice) return 0;
  const status = statusOf(invoice);
  if (SETTLED_STATUSES.has(status) || CLOSED_STATUSES.has(status)) return 0;
  const { total, amountPaid, amountDue } = invoiceBalance(invoice);
  const computedDue = Math.max(0, total - amountPaid);
  const statedDue = numeric(invoice.amountDue);
  if (statedDue != null && statedDue <= 0 && computedDue > 0 && amountPaid <= 0) return computedDue;
  return amountDue;
}

export function squarePaymentNote(invoiceId: string, invoiceNumber?: unknown): string {
  const label = invoiceNumber ? `Iconic Images invoice ${invoiceNumber}` : "Iconic Images invoice";
  return `${label} invoiceId:${invoiceId}`;
}

export function invoiceIdFromSquareNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const match = note.match(/invoiceId:([A-Za-z0-9_-]+)/);
  return match?.[1] || null;
}

const LINK_MEDIA_TYPES = new Set(["video", "reel", "tour", "matterport"]);

/** Public gallery payload. File and share URLs stay off the response until the invoice is paid. */
export function publicMediaItem(item: Record<string, unknown>, canDownload: boolean) {
  const type = String(item.type || "photo");
  const title = item.title || item.fileName || "Media";
  const base = {
    id: item.id,
    fileName: item.fileName || title,
    title,
    type,
    width: item.width || null,
    height: item.height || null,
    canDownload: Boolean(canDownload && item.downloadable !== false && !LINK_MEDIA_TYPES.has(type)),
    locked: !canDownload,
  };

  if (!canDownload) {
    return { ...base, url: null, shareUrl: null, embedUrl: null };
  }

  const url = (item.shareUrl || item.embedUrl || item.url || null) as string | null;
  return {
    ...base,
    url,
    shareUrl: (item.shareUrl || item.url || item.embedUrl || null) as string | null,
    embedUrl: (item.embedUrl || item.url || null) as string | null,
  };
}

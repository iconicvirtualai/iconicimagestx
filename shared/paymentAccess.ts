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

/**
 * Iconic bills after the shoot. This gate does not look for a deposit,
 * a pre-shoot Square invoice, or any booking payment. A missing invoice
 * is not paid. A status with no money fields is not a zero-dollar invoice.
 */
export function invoiceAllowsDownload(invoice: InvoiceLike): boolean {
  if (!invoice) return false;
  const status = statusOf(invoice);
  if (CLOSED_STATUSES.has(status)) return false;
  if (SETTLED_STATUSES.has(status)) return true;

  const hasMoney = ["total", "amountDue", "amountPaid"].some((key) => numeric(invoice[key]) != null);
  if (!hasMoney) return false;

  const { total, amountPaid, amountDue } = invoiceBalance(invoice);
  const statedDue = numeric(invoice.amountDue);
  if (total <= 0 && (statedDue == null || statedDue <= 0)) return true;
  // A zero amountDue with nothing collected is not proof of payment.
  if (statedDue != null && statedDue <= 0 && amountPaid <= 0 && total > 0) return false;
  return amountDue <= 0 && amountPaid > 0;
}

export const ICONIC_DOWNLOAD_LOCK = {
  title: "Your Iconic files are locked",
  message: "Iconic Images invoices after the shoot. Downloads open when that invoice is paid, or when our team releases the gallery.",
} as const;

export interface GalleryDownloadGate {
  invoice?: InvoiceLike;
  /** Stored gallery flag. True after payment unlock or a staff release. */
  downloadEnabled?: unknown;
  /** Explicit staff release. Independent of the invoice. */
  downloadsReleased?: unknown;
  /** Listing switch. False is a staff release. Missing stays locked. */
  lockDownloads?: unknown;
  /** Listing switch. Missing means payment is required. False does not open files. */
  requirePayment?: unknown;
}

/** Missing means locked. Explicit false is the staff release. */
export function lockDownloadsOn(value: unknown): boolean {
  return value !== false;
}

/** Missing means the invoice is required before files open. */
export function requirePaymentOn(value: unknown): boolean {
  return value !== false;
}

/**
 * Owning-client downloads stay locked until the post-shoot invoice is paid
 * (or comped, or zero dollars) or staff releases them. Turning Require
 * Payment off does not open files. A shoot can be booked without payment.
 */
export function clientGalleryDownloadsUnlocked(gate: GalleryDownloadGate = {}): boolean {
  if (gate.downloadsReleased === true) return true;
  if (gate.lockDownloads === false) return true;
  if (gate.downloadEnabled === true) return true;
  return invoiceAllowsDownload(gate.invoice);
}

/** Shared studio links preview the project. They do not offer file downloads. */
export function studioOffersDownloads(view: unknown, downloadsUnlocked: unknown): boolean {
  if (view === "public") return false;
  return downloadsUnlocked === true;
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

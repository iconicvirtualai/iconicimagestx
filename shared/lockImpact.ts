/**
 * Studio download lock: the rule that was live, the strict invoice rule, and
 * the safety net that ships.
 *
 * The safety net keeps a gallery unlocked when staff released it or marked the
 * listing paid or comped. That includes the narrow stale-copy case (a copied
 * paid field on an invoice document that is explicitly unpaid with amountDue
 * greater than 0 and no staff release flag). That case stays unlocked and the
 * impact report lists it for review. Nothing here writes.
 */

import { recordAddressText } from "./addressText.ts";
import {
  clientGalleryDownloadsUnlocked,
  invoiceAllowsDownload,
  invoiceBalance,
  type InvoiceLike,
} from "./paymentAccess.ts";

const SETTLED = new Set(["paid", "comped"]);

export interface LockImpactDoc {
  id: string;
  [key: string]: unknown;
}

export interface LockImpactSubject {
  listing: LockImpactDoc | null;
  galleries: LockImpactDoc[];
  /** Linked invoice document. Null when the document does not exist. */
  invoice: InvoiceLike;
}

export interface LockImpactScan {
  listings: LockImpactDoc[];
  galleries: LockImpactDoc[];
  invoices: LockImpactDoc[];
}

export interface LockImpactRow {
  listingId: string;
  galleryId: string;
  address: string;
  clientName: string;
  invoiceId: string;
  invoiceStatus: string;
  amountPaid: string;
  amountDue: string;
  oldUnlockFields: string;
  stalePaidFields: string;
  disposition: "kept unlocked by safety net" | "needs review, kept unlocked" | "staff payment signal, kept unlocked";
}

export interface LockImpactAssessment {
  scannedListings: number;
  scannedGalleries: number;
  skippedPlaytestListings: number;
  skippedPlaytestGalleries: number;
  /** Old rule open, strict invoice rule closed. The safety net keeps these open. */
  strictWouldLock: LockImpactRow[];
  /** Stale copied paid field, explicitly unpaid invoice, amountDue > 0, no staff release. Kept open. */
  needsReview: LockImpactRow[];
  /** paymentStatus or invoiceStatus paid/comped that the old rule did not unlock. Kept open. */
  staffPaymentSignal: LockImpactRow[];
  /** Old rule open and the safety net closed. This stays zero. */
  runtimeNewlyLocked: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function status(value: unknown): string {
  return text(value).toLowerCase();
}

function settled(value: unknown): boolean {
  return SETTLED.has(status(value));
}

/** Playtest seeds and the delivery QA job stay out of the production scan. */
export function isPlaytestDoc(doc: { id?: unknown; playtest?: unknown } | null | undefined): boolean {
  if (!doc) return false;
  if (doc.playtest === true) return true;
  return text(doc.id).toLowerCase().startsWith("playtest-");
}

function nestedInvoiceStatus(listing: LockImpactDoc | null): string {
  const nested = listing?.invoice;
  if (!nested || typeof nested !== "object") return "";
  return text((nested as { status?: unknown }).status);
}

/** Status string the pre-change studio route trusted. A nonempty invoice document status wins. */
export function oldInvoiceStatus(subject: LockImpactSubject): string {
  const docStatus = text(subject.invoice && typeof subject.invoice === "object"
    ? (subject.invoice as { status?: unknown }).status
    : "");
  if (docStatus) return docStatus;
  return nestedInvoiceStatus(subject.listing) || text(subject.listing?.invoiceStatus);
}

function releaseFlags(subject: LockImpactSubject): { downloadEnabled: boolean; downloadsReleased: boolean } {
  const listing = subject.listing;
  return {
    downloadEnabled: listing?.downloadEnabled === true || subject.galleries.some((gallery) => gallery.downloadEnabled === true),
    downloadsReleased: listing?.downloadsReleased === true || subject.galleries.some((gallery) => gallery.downloadsReleased === true),
  };
}

function staffRelease(subject: LockImpactSubject): boolean {
  const flags = releaseFlags(subject);
  return flags.downloadsReleased || flags.downloadEnabled || subject.listing?.lockDownloads === false;
}

/** Copied listing fields staff set by hand. The invoice document is not one of these. */
export function copiedPaidFields(listing: LockImpactDoc | null): string[] {
  if (!listing) return [];
  const fields: string[] = [];
  if (settled(listing.paymentStatus)) fields.push(`listing.paymentStatus=${status(listing.paymentStatus)}`);
  if (settled(listing.invoiceStatus)) fields.push(`listing.invoiceStatus=${status(listing.invoiceStatus)}`);
  const nested = nestedInvoiceStatus(listing);
  if (settled(nested)) fields.push(`listing.invoice.status=${status(nested)}`);
  return fields;
}

/**
 * Production studio gate before the invoice document became authoritative.
 * Status only: paid or comped. Money fields were not read. paymentStatus was not read.
 */
export function oldStudioDownloadsUnlocked(subject: LockImpactSubject): boolean {
  const invoiceStatus = oldInvoiceStatus(subject);
  const flags = releaseFlags(subject);
  return clientGalleryDownloadsUnlocked({
    invoice: invoiceStatus ? { status: invoiceStatus } : null,
    downloadEnabled: flags.downloadEnabled,
    downloadsReleased: flags.downloadsReleased,
    lockDownloads: subject.listing?.lockDownloads,
  });
}

/**
 * Strict invoice rule. The linked invoice document decides paid. A copied
 * listing.invoiceStatus or paymentStatus does not unlock. Staff release flags still do.
 */
export function strictStudioDownloadsUnlocked(subject: LockImpactSubject): boolean {
  const flags = releaseFlags(subject);
  const invoice = subject.invoice && typeof subject.invoice === "object" ? subject.invoice : null;
  return clientGalleryDownloadsUnlocked({
    invoice,
    downloadEnabled: flags.downloadEnabled,
    downloadsReleased: flags.downloadsReleased,
    lockDownloads: subject.listing?.lockDownloads,
  });
}

/**
 * Invoice document exists, its status is present and not paid/comped, it does
 * not allow download, amount due is greater than 0, and nobody released the gallery.
 */
export function narrowStalePaidCopy(subject: LockImpactSubject): boolean {
  if (staffRelease(subject)) return false;
  if (copiedPaidFields(subject.listing).length === 0) return false;
  const invoice = subject.invoice;
  if (!invoice || typeof invoice !== "object") return false;
  const invoiceStatus = status((invoice as { status?: unknown }).status);
  if (!invoiceStatus || settled(invoiceStatus)) return false;
  if (invoiceAllowsDownload(invoice)) return false;
  return invoiceBalance(invoice).amountDue > 0;
}

/**
 * Runtime rule for the owning client's studio.
 * Staff release and a listing paymentStatus or invoiceStatus of paid or comped
 * stay unlocked. The narrow stale-copy case stays unlocked too, so a client
 * whose Square payment never reached the invoice document is not locked.
 * The report lists that case for review. Truly unpaid records with none of
 * these signals stay locked.
 */
export function studioDownloadsUnlocked(subject: LockImpactSubject): boolean {
  if (strictStudioDownloadsUnlocked(subject)) return true;
  return copiedPaidFields(subject.listing).length > 0;
}

/** Fields that made the old rule unlock. Empty when the old rule was already locked. */
export function oldUnlockFields(subject: LockImpactSubject): string[] {
  const fields: string[] = [];
  const listing = subject.listing;
  if (listing?.downloadsReleased === true) fields.push("listing.downloadsReleased=true");
  for (const gallery of subject.galleries) {
    if (gallery.downloadsReleased === true) fields.push(`gallery.downloadsReleased=true (${gallery.id})`);
  }
  if (listing?.lockDownloads === false) fields.push("listing.lockDownloads=false");
  if (listing?.downloadEnabled === true) fields.push("listing.downloadEnabled=true");
  for (const gallery of subject.galleries) {
    if (gallery.downloadEnabled === true) fields.push(`gallery.downloadEnabled=true (${gallery.id})`);
  }
  const invoiceStatus = oldInvoiceStatus(subject);
  if (!settled(invoiceStatus)) return fields;
  const docStatus = text(subject.invoice && typeof subject.invoice === "object"
    ? (subject.invoice as { status?: unknown }).status
    : "");
  if (docStatus && status(docStatus) === status(invoiceStatus)) {
    fields.push(`invoice.status=${status(invoiceStatus)}`);
    return fields;
  }
  const nested = nestedInvoiceStatus(listing);
  if (nested && status(nested) === status(invoiceStatus)) fields.push(`listing.invoice.status=${status(invoiceStatus)}`);
  else if (listing && status(listing.invoiceStatus) === status(invoiceStatus)) {
    fields.push(`listing.invoiceStatus=${status(invoiceStatus)}`);
  }
  return fields;
}

function referencedInvoiceId(listing: LockImpactDoc | null, galleries: LockImpactDoc[]): string {
  return text(listing?.invoiceId) || galleries.map((gallery) => text(gallery.invoiceId)).find(Boolean) || "";
}

function invoiceFor(
  listing: LockImpactDoc | null,
  galleries: LockImpactDoc[],
  invoices: LockImpactDoc[],
): LockImpactDoc | null {
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const direct = referencedInvoiceId(listing, galleries);
  if (direct && byId.has(direct)) return byId.get(direct) || null;
  for (const gallery of galleries) {
    const galleryInvoice = text(gallery.invoiceId);
    if (galleryInvoice && byId.has(galleryInvoice)) return byId.get(galleryInvoice) || null;
  }
  const orderIds = new Set(
    [text(listing?.orderId), ...galleries.map((gallery) => text(gallery.orderId))].filter(Boolean),
  );
  return invoices.find((invoice) => {
    if (listing && text(invoice.listingId) === listing.id) return true;
    const orderId = text(invoice.orderId);
    return Boolean(orderId && orderIds.has(orderId));
  }) || null;
}

function blank(value: string): string {
  return value || "(none)";
}

function rowFor(subject: LockImpactSubject, referencedId: string): LockImpactRow | null {
  const oldUnlocked = oldStudioDownloadsUnlocked(subject);
  const strictUnlocked = strictStudioDownloadsUnlocked(subject);
  const runtimeUnlocked = studioDownloadsUnlocked(subject);
  const narrow = narrowStalePaidCopy(subject);
  const strictWouldLock = oldUnlocked && !strictUnlocked;
  const heldOpen = !strictUnlocked && runtimeUnlocked;
  if (!strictWouldLock && !narrow && !heldOpen) return null;

  const invoice = subject.invoice && typeof subject.invoice === "object"
    ? subject.invoice as Record<string, unknown>
    : null;
  const balance = invoice ? invoiceBalance(invoice) : null;
  const listing = subject.listing;
  const gallery = subject.galleries[0];
  const stale = copiedPaidFields(listing);
  let disposition: LockImpactRow["disposition"] = "staff payment signal, kept unlocked";
  if (narrow) disposition = "needs review, kept unlocked";
  else if (strictWouldLock) disposition = "kept unlocked by safety net";

  return {
    listingId: blank(listing?.id || ""),
    galleryId: blank(subject.galleries.map((item) => item.id).sort().join(", ")),
    address: blank(recordAddressText(listing) || recordAddressText(gallery)),
    clientName: blank(text(listing?.clientName) || text(gallery?.clientName)),
    invoiceId: blank(text(invoice?.id) || referencedId),
    invoiceStatus: invoice ? (text(invoice.status) || "(blank)") : "(none)",
    amountPaid: balance ? String(balance.amountPaid) : "(none)",
    amountDue: balance ? String(balance.amountDue) : "(none)",
    oldUnlockFields: blank(oldUnlockFields(subject).join(", ")),
    stalePaidFields: blank(stale.join(", ")),
    disposition,
  };
}

function galleriesForListing(listing: LockImpactDoc, galleries: LockImpactDoc[]): LockImpactDoc[] {
  const related = new Map<string, LockImpactDoc>();
  for (const gallery of galleries) {
    if (text(gallery.listingId) === listing.id) related.set(gallery.id, gallery);
  }
  const named = text(listing.galleryId);
  if (named) {
    const found = galleries.find((gallery) => gallery.id === named);
    if (found) related.set(found.id, found);
  }
  return [...related.values()];
}

export function assessLockImpact(scan: LockImpactScan): LockImpactAssessment {
  const listings = scan.listings.filter((doc) => !isPlaytestDoc(doc));
  const galleries = scan.galleries.filter((doc) => !isPlaytestDoc(doc));
  const listingIds = new Set(listings.map((listing) => listing.id));
  const subjects: Array<{ subject: LockImpactSubject; referencedId: string; galleries: LockImpactDoc[] }> = [];

  for (const listing of listings) {
    const related = galleriesForListing(listing, galleries);
    subjects.push({
      subject: {
        listing,
        galleries: related,
        invoice: invoiceFor(listing, related, scan.invoices),
      },
      referencedId: referencedInvoiceId(listing, related),
      galleries: related,
    });
  }

  const attached = new Set(subjects.flatMap((entry) => entry.galleries.map((gallery) => gallery.id)));
  for (const gallery of galleries) {
    if (attached.has(gallery.id)) continue;
    const listingId = text(gallery.listingId);
    if (listingId && listingIds.has(listingId)) continue;
    subjects.push({
      subject: {
        listing: null,
        galleries: [gallery],
        invoice: invoiceFor(null, [gallery], scan.invoices),
      },
      referencedId: referencedInvoiceId(null, [gallery]),
      galleries: [gallery],
    });
  }

  const rows = subjects
    .map((entry) => rowFor(entry.subject, entry.referencedId))
    .filter((row): row is LockImpactRow => Boolean(row))
    .sort((a, b) => a.listingId.localeCompare(b.listingId) || a.galleryId.localeCompare(b.galleryId));

  return {
    scannedListings: listings.length,
    scannedGalleries: galleries.length,
    skippedPlaytestListings: scan.listings.length - listings.length,
    skippedPlaytestGalleries: scan.galleries.length - galleries.length,
    strictWouldLock: rows.filter((row) => row.disposition === "kept unlocked by safety net"),
    needsReview: rows.filter((row) => row.disposition === "needs review, kept unlocked"),
    staffPaymentSignal: rows.filter((row) => row.disposition === "staff payment signal, kept unlocked"),
    runtimeNewlyLocked: subjects.filter((entry) => oldStudioDownloadsUnlocked(entry.subject) && !studioDownloadsUnlocked(entry.subject)).length,
  };
}

function formatRow(row: LockImpactRow): string {
  return [
    `listingId=${row.listingId}`,
    `galleryId=${row.galleryId}`,
    `address=${row.address}`,
    `clientName=${row.clientName}`,
    `invoiceId=${row.invoiceId}`,
    `invoiceStatus=${row.invoiceStatus}`,
    `amountPaid=${row.amountPaid}`,
    `amountDue=${row.amountDue}`,
    `oldUnlockFields=${row.oldUnlockFields}`,
    `stalePaidFields=${row.stalePaidFields}`,
    `disposition=${row.disposition}`,
  ].join(" ");
}

function formatSection(title: string, rows: LockImpactRow[]): string {
  const body = rows.length > 0 ? rows.map(formatRow).join("\n") : "(none)";
  return `${title}\n${body}`;
}

export function formatLockImpactReport(scan: LockImpactScan, projectId: string): string {
  const report = assessLockImpact(scan);
  const lines = [
    `Firebase project: ${projectId || "(unknown project)"}`,
    "Read-only lock impact. No documents were written.",
    "Choice: keep the narrow stale-paid case unlocked and list it for review. No migration writer.",
    "Runtime rule: unlock when gallery downloadsReleased or downloadEnabled is true (including PATCH /api/galleries/:id/downloads), when listing.lockDownloads is false, when the linked invoice document allows download, or when listing.paymentStatus or listing.invoiceStatus is paid or comped. The narrow case (those copied paid fields, invoice document exists, status explicitly unpaid, amountDue > 0, no staff release) stays unlocked. A record with none of those signals stays locked.",
    "",
    formatSection(
      "Unlocked under the old rule, locked under the strict invoice rule (safety net keeps these unlocked):",
      report.strictWouldLock,
    ),
    "",
    formatSection(
      "Needs review (stale copied paid field, invoice explicitly unpaid, amountDue > 0, no staff release, kept unlocked):",
      report.needsReview,
    ),
    "",
    formatSection(
      "Staff payment signal the old rule did not unlock (kept unlocked):",
      report.staffPaymentSignal,
    ),
    "",
    "Summary",
    `Scanned listings: ${report.scannedListings}`,
    `Scanned galleries: ${report.scannedGalleries}`,
    `Skipped playtest listings: ${report.skippedPlaytestListings}`,
    `Skipped playtest galleries: ${report.skippedPlaytestGalleries}`,
    `Old rule unlocked, strict invoice rule would lock: ${report.strictWouldLock.length}`,
    `Needs review, kept unlocked: ${report.needsReview.length}`,
    `Staff payment signal the old rule did not unlock, kept unlocked: ${report.staffPaymentSignal.length}`,
    `Runtime newly locked: ${report.runtimeNewlyLocked}`,
    "",
  ];
  return lines.join("\n");
}

/** In-memory records for `pnpm report:lock-impact -- --fixtures`. Not production data. */
export function lockImpactFixtureScan(): LockImpactScan {
  return {
    listings: [
      {
        id: "listing-staff-paid",
        address: "10 Oak St",
        clientName: "Ada Paid",
        invoiceId: "missing-invoice",
        invoiceStatus: "paid",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-blank-status",
        address: "15 Blank St",
        clientName: "Ivy Blank",
        invoiceId: "inv-blank",
        invoiceStatus: "paid",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-pagemill",
        address: "20 Pagemill Rd",
        clientName: "Cam Stale",
        invoiceId: "inv-pagemill",
        invoiceStatus: "paid",
        paymentStatus: "unpaid",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-payment-status",
        address: "25 Flag St",
        clientName: "Jo Flag",
        invoiceId: "inv-flag",
        invoiceStatus: "sent",
        paymentStatus: "paid",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-unpaid",
        address: "30 Due Ln",
        clientName: "Bea Due",
        invoiceId: "inv-unpaid",
        invoiceStatus: "sent",
        paymentStatus: "unpaid",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-settled",
        address: "40 Paid Ave",
        clientName: "Dee Settled",
        invoiceId: "inv-settled",
        invoiceStatus: "sent",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-released",
        address: "50 Release Ct",
        clientName: "Eli Release",
        invoiceId: "inv-released",
        invoiceStatus: "sent",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "listing-comped-flag",
        address: "60 Comp Way",
        clientName: "Fay Comp",
        invoiceStatus: "sent",
        paymentStatus: "comped",
        lockDownloads: true,
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "playtest-delivery-qa-listing",
        playtest: true,
        address: "QA Lane",
        clientName: "QA Client",
        invoiceStatus: "paid",
        invoiceId: "playtest-delivery-qa-invoice",
      },
    ],
    galleries: [
      {
        id: "gallery-staff-paid",
        listingId: "listing-staff-paid",
        address: "10 Oak St",
        clientName: "Ada Paid",
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "gallery-pagemill",
        listingId: "listing-pagemill",
        address: "20 Pagemill Rd",
        clientName: "Cam Stale",
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "gallery-unpaid",
        listingId: "listing-unpaid",
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "gallery-released",
        listingId: "listing-released",
        downloadsReleased: true,
        downloadEnabled: true,
      },
      {
        id: "gallery-download-only",
        address: "70 Gallery St",
        clientName: "Gia Gallery",
        downloadEnabled: true,
        downloadsReleased: false,
      },
      {
        id: "gallery-orphan",
        address: "80 Orphan St",
        clientName: "Hal Orphan",
        downloadEnabled: false,
        downloadsReleased: false,
      },
      {
        id: "playtest-delivery-qa-gallery",
        playtest: true,
        listingId: "playtest-delivery-qa-listing",
        downloadsReleased: false,
        downloadEnabled: false,
      },
    ],
    invoices: [
      { id: "inv-blank", status: "", amountPaid: 0, amountDue: 500, total: 500 },
      { id: "inv-pagemill", status: "sent", amountPaid: 0, amountDue: 450, total: 450 },
      { id: "inv-flag", status: "sent", amountPaid: 0, amountDue: 75, total: 75 },
      { id: "inv-unpaid", status: "unpaid", amountPaid: 0, amountDue: 200, total: 200 },
      { id: "inv-settled", status: "paid", amountPaid: 300, amountDue: 0, total: 300 },
      { id: "inv-released", status: "sent", amountPaid: 0, amountDue: 100, total: 100 },
      { id: "playtest-delivery-qa-invoice", status: "sent", amountPaid: 0, amountDue: 1, total: 1, playtest: true },
    ],
  };
}

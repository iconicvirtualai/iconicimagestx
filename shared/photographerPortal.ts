/**
 * Photographer portal labels.
 * Turns an assigned listing plus Iconic Studio edit jobs (already returned
 * by /api/studio/workspace) into one status line and one next step.
 * Does not queue edits or call OpenAI.
 */

import { iconicStudioHref, isRawStudioFile, listingAddressLabel } from "./iconicStudio";

const CHICAGO = "America/Chicago";

const CLOSED = new Set(["cancelled", "canceled", "archived", "declined", "no_show"]);
const OFFICE = new Set(["delivered", "completed", "delivered_paid", "delivered_unpaid", "paid"]);

const DATE_FIELDS = ["apptDate", "shootDate", "scheduledDate", "appointmentDate"] as const;

export const PHOTOGRAPHER_UPLOAD_ACCEPT =
  "image/*,.raw,.cr2,.cr3,.nef,.nrw,.arw,.srf,.sr2,.dng,.rw2,.orf,.raf,.pef,.3fr,.fff,.iiq";

export type PhotographerWhen = "today" | "upcoming" | "past" | "unscheduled";
export type PhotographerActionKind = "upload" | "review" | "wait" | "shoot" | "done" | "closed";
export type PhotographerTone = "action" | "review" | "wait" | "shoot" | "done" | "closed";
export type PhotographerTab = "next" | "today" | "upcoming" | "all" | "pay";

export interface PhotographerListingInput {
  id?: unknown;
  status?: unknown;
  address?: unknown;
  propertyAddress?: unknown;
  shootLocation?: unknown;
  clientName?: unknown;
  apptDate?: unknown;
  shootDate?: unknown;
  scheduledDate?: unknown;
  appointmentDate?: unknown;
  apptTime?: unknown;
  appointmentDuration?: unknown;
  services?: unknown;
  accessInfo?: unknown;
  notes?: unknown;
  images?: unknown;
  iconicPolish?: unknown;
}

export interface PhotographerStudioJob {
  listingId?: unknown;
  status?: unknown;
  origin?: unknown;
  sourcePath?: unknown;
}

export interface PhotographerStudioCount {
  label: string;
  value: number;
}

export interface PhotographerStudioRollup {
  queued: number;
  editing: number;
  review: number;
  approved: number;
  failed: number;
  rejected: number;
  waitingOnPhoto: number;
  headline: string;
  counts: PhotographerStudioCount[];
}

export interface PhotographerNextAction {
  kind: PhotographerActionKind;
  label: string;
  detail: string;
  statusLabel: string;
  tone: PhotographerTone;
}

export interface PhotographerJobCard {
  id: string;
  address: string;
  clientName: string;
  listingStatus: string;
  officeStatus: string;
  when: PhotographerWhen;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  servicesLabel: string;
  accessInfo: string;
  notes: string;
  imageCount: number;
  iconicPolish: boolean;
  apptMs: number | null;
  mapsHref: string | null;
  studioHref: string;
  action: PhotographerNextAction;
  studio: PhotographerStudioRollup;
}

export interface PhotographerSummary {
  needsYou: number;
  today: number;
  upcoming: number;
  inStudio: number;
}

export function chicagoDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function photographerUploadFolder(fileName: string, contentType?: string): "photos" | "raw" {
  return isRawStudioFile(fileName, contentType) ? "raw" : "photos";
}

export function photographerAcceptsFile(name: string, contentType?: string): boolean {
  if (isRawStudioFile(name, contentType)) return true;
  const type = String(contentType || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

export function photographerUploadHref(listingId: string, iconicPolish = false): string {
  const params = new URLSearchParams({ job: listingId });
  if (iconicPolish) params.set("polish", "1");
  return `/admin/upload?${params.toString()}`;
}

export function jobNeedsPhotographer(job: PhotographerJobCard): boolean {
  return job.action.kind === "upload" || job.action.kind === "review";
}

export function photographerSummary(jobs: PhotographerJobCard[]): PhotographerSummary {
  return {
    needsYou: jobs.filter(jobNeedsPhotographer).length,
    today: jobs.filter((job) => job.when === "today").length,
    upcoming: jobs.filter((job) => job.when === "upcoming").length,
    inStudio: jobs.filter((job) => job.studio.editing + job.studio.queued > 0).length,
  };
}

export function filterPhotographerJobs(jobs: PhotographerJobCard[], tab: PhotographerTab): PhotographerJobCard[] {
  if (tab === "next") return jobs.filter(jobNeedsPhotographer);
  if (tab === "today") return jobs.filter((job) => job.when === "today");
  if (tab === "upcoming") return jobs.filter((job) => job.when === "upcoming");
  if (tab === "pay") return jobs.filter((job) => job.when === "past");
  return jobs;
}

export function photographerEmptyCopy(tab: PhotographerTab, hasAnyJobs: boolean): string {
  if (!hasAnyJobs) {
    return "No jobs are assigned to this login. When the office assigns a shoot, it shows up here with an upload button and a status line.";
  }
  if (tab === "next") return "Nothing is waiting on you. Upcoming shoots stay under Upcoming until the shoot day.";
  if (tab === "today") return "No shoot is booked for today.";
  if (tab === "upcoming") return "No upcoming shoots are on this login.";
  if (tab === "pay") return "No past shoots to estimate yet.";
  return "No jobs are on this login.";
}

export function photographerPayEstimate(jobs: PhotographerJobCard[], payRate: number): { completed: number; amount: number } {
  const rate = Number.isFinite(payRate) && payRate > 0 ? payRate : 0;
  const completed = jobs.filter((job) => job.when === "past" && (job.imageCount > 0 || OFFICE.has(job.listingStatus))).length;
  return { completed, amount: completed * rate };
}

export function buildPhotographerPortal(input: {
  listings: PhotographerListingInput[];
  studioJobs?: PhotographerStudioJob[];
  today?: string;
}): PhotographerJobCard[] {
  const today = normalizeToday(input.today);
  const studioJobs = input.studioJobs || [];
  const cards = input.listings
    .map((listing) => buildJob(listing, studioJobs, today))
    .filter((job): job is PhotographerJobCard => Boolean(job));
  return sortPhotographerJobs(cards);
}

function buildJob(
  listing: PhotographerListingInput,
  studioJobs: PhotographerStudioJob[],
  today: string,
): PhotographerJobCard | null {
  const id = asText(listing.id);
  if (!id) return null;
  const listingStatus = asText(listing.status).toLowerCase().replace(/\s+/g, "_");
  const address = photographerAddress(listing);
  const appointment = readListingAppointment(listing);
  const when = appointmentBucket(appointment, today);
  const imageCount = Array.isArray(listing.images) ? listing.images.length : 0;
  const studio = rollupStudio(id, imageCount, studioJobs);
  const action = decideAction({ listingStatus, when, imageCount, studio });
  return {
    id,
    address,
    clientName: asText(listing.clientName) || "Client not on file",
    listingStatus,
    officeStatus: listingStatus ? listingStatus.replace(/_/g, " ") : "not set",
    when,
    dateLabel: appointment ? formatPortalDate(appointment) : "No shoot time",
    timeLabel: asText(listing.apptTime) || "Time not set",
    durationLabel: durationLabel(listing.appointmentDuration),
    servicesLabel: servicesLabel(listing.services),
    accessInfo: asText(listing.accessInfo),
    notes: asText(listing.notes),
    imageCount,
    iconicPolish: listing.iconicPolish === true,
    apptMs: appointment ? appointment.getTime() : null,
    mapsHref: address === "Untitled listing" ? null : `https://maps.google.com/?q=${encodeURIComponent(address)}`,
    studioHref: iconicStudioHref(id),
    action,
    studio,
  };
}

function decideAction(input: {
  listingStatus: string;
  when: PhotographerWhen;
  imageCount: number;
  studio: PhotographerStudioRollup;
}): PhotographerNextAction {
  const { listingStatus, when, imageCount, studio } = input;
  if (CLOSED.has(listingStatus)) {
    return {
      kind: "closed",
      label: "Closed",
      detail: "This job is closed.",
      statusLabel: "Closed",
      tone: "closed",
    };
  }
  if (studio.failed > 0) {
    return {
      kind: "review",
      label: "Open Studio",
      detail: "An edit failed. Open Studio and read the note on that photo.",
      statusLabel: "Needs a look",
      tone: "action",
    };
  }
  if (studio.review > 0) {
    return {
      kind: "review",
      label: "Review edits",
      detail: "Studio finished photos on this job. Approve the ones that look right.",
      statusLabel: "Ready to review",
      tone: "review",
    };
  }
  if (studio.waitingOnPhoto > 0 && imageCount > 0) {
    return {
      kind: "review",
      label: "Open Studio",
      detail: "An edit is waiting on an exterior photo. Open Studio to see which frame it needs.",
      statusLabel: "Waiting on a photo",
      tone: "action",
    };
  }
  if (studio.rejected > 0 && studio.editing === 0 && studio.queued === 0) {
    return {
      kind: "review",
      label: "Open Studio",
      detail: "An edit was rejected. Open Studio if that photo needs a new upload.",
      statusLabel: "Needs a look",
      tone: "action",
    };
  }
  if (imageCount === 0) {
    if (when === "upcoming") {
      return {
        kind: "shoot",
        label: "Get directions",
        detail: "The shoot is still ahead. Use directions on this card, then come back and upload.",
        statusLabel: "Shoot scheduled",
        tone: "shoot",
      };
    }
    const detail = when === "today"
      ? "This shoot is today. Upload JPEG, PNG, WebP, or RAW when you leave the property."
      : when === "past"
        ? "This shoot date has passed. Upload the frames for this job."
        : "No shoot time is on file. Upload the photos when you have them.";
    return {
      kind: "upload",
      label: "Upload the shoot",
      detail,
      statusLabel: "Needs upload",
      tone: "action",
    };
  }
  if (studio.editing > 0 || studio.queued > 0) {
    return {
      kind: "wait",
      label: "Open Studio",
      detail: "Photos are in. Studio edits them one at a time from the order.",
      statusLabel: studio.editing > 0 ? "Editing now" : "In the queue",
      tone: "wait",
    };
  }
  const settled = studio.approved > 0 && studio.failed + studio.review + studio.editing + studio.queued + studio.waitingOnPhoto + studio.rejected === 0;
  if (OFFICE.has(listingStatus) || settled) {
    return {
      kind: "done",
      label: "With the office",
      detail: "This job is with the office.",
      statusLabel: "With the office",
      tone: "done",
    };
  }
  return {
    kind: "wait",
    label: "Open Studio",
    detail: "Photos are on the job. Studio edits from the order.",
    statusLabel: "Photos received",
    tone: "wait",
  };
}

export function rollupStudio(listingId: string, imageCount: number, jobs: PhotographerStudioJob[]): PhotographerStudioRollup {
  const mine = jobs.filter((job) => asText(job.listingId) === listingId);
  const rollup = {
    queued: 0,
    editing: 0,
    review: 0,
    approved: 0,
    failed: 0,
    rejected: 0,
    waitingOnPhoto: 0,
    headline: "",
    counts: [] as PhotographerStudioCount[],
  };
  for (const job of mine) {
    const status = asText(job.status).toLowerCase();
    const hasSource = Boolean(asText(job.sourcePath));
    if (status === "processing") rollup.editing += 1;
    else if (status === "review") rollup.review += 1;
    else if (status === "approved") rollup.approved += 1;
    else if (status === "failed") rollup.failed += 1;
    else if (status === "rejected") rollup.rejected += 1;
    else if (status === "pending" && !hasSource) rollup.waitingOnPhoto += 1;
    else if (status === "pending") rollup.queued += 1;
  }
  rollup.headline = studioHeadline(rollup, imageCount);
  rollup.counts = [
    ["Failed", rollup.failed],
    ["Review", rollup.review],
    ["Editing", rollup.editing],
    ["Queued", rollup.queued],
    ["Approved", rollup.approved],
    ["Rejected", rollup.rejected],
  ]
    .filter((entry) => Number(entry[1]) > 0)
    .map(([label, value]) => ({ label: String(label), value: Number(value) }));
  return rollup;
}

function studioHeadline(rollup: Omit<PhotographerStudioRollup, "headline" | "counts">, imageCount: number): string {
  if (rollup.failed > 0) return `${plural(rollup.failed, "edit")} failed. Open Studio.`;
  if (rollup.review > 0) return `${plural(rollup.review, "edit")} ${rollup.review === 1 ? "is" : "are"} ready to review.`;
  if (rollup.rejected > 0 && rollup.editing === 0 && rollup.queued === 0) {
    return `${plural(rollup.rejected, "edit")} ${rollup.rejected === 1 ? "was" : "were"} rejected.`;
  }
  if (rollup.editing > 0) return `Studio is editing ${plural(rollup.editing, "photo")}.`;
  if (rollup.queued > 0) return `Studio has ${plural(rollup.queued, "photo")} queued.`;
  if (rollup.waitingOnPhoto > 0) return "An edit is waiting on an exterior photo.";
  if (rollup.approved > 0) return `${plural(rollup.approved, "edit")} ${rollup.approved === 1 ? "is" : "are"} approved.`;
  if (imageCount > 0) {
    return `${plural(imageCount, "photo")} ${imageCount === 1 ? "is" : "are"} on the job. Studio has not queued an edit.`;
  }
  return "No photos on this job yet.";
}

function sortPhotographerJobs(jobs: PhotographerJobCard[]): PhotographerJobCard[] {
  const rank = (job: PhotographerJobCard) => {
    if (job.action.kind === "review") return 0;
    if (job.action.kind === "upload") return 1;
    if (job.when === "today") return 2;
    if (job.action.kind === "wait") return 3;
    if (job.action.kind === "shoot") return 4;
    if (job.action.kind === "done") return 5;
    return 6;
  };
  return [...jobs].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    if (a.when === "past" && b.when === "past") return (b.apptMs ?? 0) - (a.apptMs ?? 0);
    return (a.apptMs ?? Number.MAX_SAFE_INTEGER) - (b.apptMs ?? Number.MAX_SAFE_INTEGER);
  });
}

function photographerAddress(listing: PhotographerListingInput): string {
  for (const value of [listing.address, listing.propertyAddress, listing.shootLocation]) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const label = listingAddressLabel({ address: value });
      if (label !== "Untitled listing") return label;
    }
  }
  return "Untitled listing";
}

export function readAppointmentDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const row = value as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof row.toDate === "function") {
      try {
        const date = row.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
      } catch {
        return null;
      }
    }
    const seconds = typeof row.seconds === "number" ? row.seconds : row._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
  }
  return null;
}

function readListingAppointment(listing: PhotographerListingInput): Date | null {
  for (const field of DATE_FIELDS) {
    const date = readAppointmentDate(listing[field]);
    if (date) return date;
  }
  return null;
}

function appointmentBucket(date: Date | null, today: string): PhotographerWhen {
  if (!date) return "unscheduled";
  const key = chicagoDateKey(date);
  if (key === today) return "today";
  return key > today ? "upcoming" : "past";
}

function formatPortalDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function servicesLabel(services: unknown): string {
  if (!Array.isArray(services)) return "";
  return services
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") return asText((entry as { name?: unknown }).name);
      return "";
    })
    .filter(Boolean)
    .join(", ");
}

function durationLabel(value: unknown): string {
  const amount = typeof value === "number" ? value : Number(asText(value));
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `${amount} min`;
}

function normalizeToday(today?: string): string {
  if (today && /^\d{4}-\d{2}-\d{2}$/.test(today)) return today;
  return chicagoDateKey(new Date());
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

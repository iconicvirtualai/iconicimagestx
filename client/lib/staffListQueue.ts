import { listingAppointmentDate } from "@shared/listingWrite";

/** Next step on a project, in the order ops should clear it. */
export type ListingQueueId =
  | "needs_date"
  | "needs_photographer"
  | "needs_photos"
  | "ready_to_deliver"
  | "needs_payment";

export type ClientQueueId = "missing_email" | "missing_phone" | "follow_up" | "no_portal";

export interface QueueChip {
  id: string;
  label: string;
  hint: string;
}

export const LISTING_QUEUE: (QueueChip & { id: ListingQueueId })[] = [
  { id: "needs_date", label: "Set a date", hint: "No appointment on the project" },
  { id: "needs_photographer", label: "Assign photographer", hint: "Dated, and nobody is assigned" },
  { id: "needs_photos", label: "Waiting on photos", hint: "The shoot is underway and no files are in" },
  { id: "ready_to_deliver", label: "Deliver files", hint: "Photos are in and the client has not received them" },
  { id: "needs_payment", label: "Collect payment", hint: "Delivered and not marked paid" },
];

export const CLIENT_QUEUE: (QueueChip & { id: ClientQueueId })[] = [
  { id: "missing_email", label: "Add an email", hint: "This client cannot be emailed" },
  { id: "missing_phone", label: "Add a phone", hint: "This client cannot be texted" },
  { id: "follow_up", label: "Follow up", hint: "Marked inactive" },
  { id: "no_portal", label: "Open portal", hint: "Active client without portal access" },
];

export interface ListingQueueInput {
  status?: string | null;
  apptDate?: unknown;
  photographerIds?: unknown;
  photographerNames?: unknown;
  images?: unknown;
}

export interface ClientQueueInput {
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  portalAccess?: boolean | null;
}

const CLOSED = new Set(["paid", "delivered_paid", "archived", "cancelled", "canceled"]);
const PAYMENT = new Set(["delivered", "delivered_unpaid"]);
const SCHEDULED = new Set(["scheduled", "consult_scheduled", "appt_scheduled"]);

const LISTING_STATUS_CHIPS: { value: string; label: string; types: Array<"all" | "real_estate" | "business"> }[] = [
  { value: "all", label: "All", types: ["all", "real_estate", "business"] },
  { value: "unscheduled", label: "Unscheduled", types: ["all", "real_estate", "business"] },
  { value: "scheduled", label: "Scheduled", types: ["all", "real_estate"] },
  { value: "consult_scheduled", label: "Consult scheduled", types: ["all", "business"] },
  { value: "appt_scheduled", label: "Appt scheduled", types: ["all", "business"] },
  { value: "in_progress", label: "In progress", types: ["all", "real_estate", "business"] },
  { value: "delivered", label: "Delivered", types: ["all", "real_estate", "business"] },
  { value: "paid", label: "Paid", types: ["all", "real_estate", "business"] },
  { value: "archived", label: "Archived", types: ["all", "real_estate", "business"] },
  { value: "cancelled", label: "Cancelled", types: ["all", "real_estate", "business"] },
];

export function listingStatusChips(type: "all" | "real_estate" | "business") {
  return LISTING_STATUS_CHIPS.filter((chip) => chip.types.includes(type)).map(({ value, label }) => ({ value, label }));
}

export function listingNextAction(project: ListingQueueInput, now: Date): ListingQueueId | null {
  const status = normalizeStatus(project.status || "unscheduled");
  if (CLOSED.has(status)) return null;
  if (PAYMENT.has(status)) return "needs_payment";

  const appointment = listingAppointmentDate(project.apptDate);
  const past = appointment != null && appointment.getTime() < now.getTime();
  if (status === "in_progress" || (past && SCHEDULED.has(status))) {
    return hasImages(project.images) ? "ready_to_deliver" : "needs_photos";
  }
  if (status === "unscheduled" || !appointment) return "needs_date";
  if (!hasPeople(project.photographerIds) && !hasPeople(project.photographerNames)) return "needs_photographer";
  return null;
}

export function clientNextAction(client: ClientQueueInput): ClientQueueId | null {
  if (!text(client.email)) return "missing_email";
  if (!text(client.phone)) return "missing_phone";
  if (normalizeStatus(client.status || "active") === "inactive") return "follow_up";
  if (client.portalAccess !== true) return "no_portal";
  return null;
}

export function countListingQueue(projects: ListingQueueInput[], now: Date): Record<ListingQueueId, number> {
  const counts = emptyCounts(LISTING_QUEUE);
  projects.forEach((project) => {
    const action = listingNextAction(project, now);
    if (action) counts[action] += 1;
  });
  return counts;
}

export function countClientQueue(clients: ClientQueueInput[]): Record<ClientQueueId, number> {
  const counts = emptyCounts(CLIENT_QUEUE);
  clients.forEach((client) => {
    const action = clientNextAction(client);
    if (action) counts[action] += 1;
  });
  return counts;
}

export function queueTone(active: boolean, count: number): string {
  if (active) return "bg-[#0d9488] text-white border-[#0d9488]";
  if (count > 0) return "bg-white text-gray-800 border-slate-200 hover:border-[#0d9488]";
  return "bg-white text-gray-400 border-slate-200 hover:border-slate-300";
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasPeople(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => text(entry));
}

function hasImages(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function emptyCounts<T extends string>(chips: { id: T }[]): Record<T, number> {
  return Object.fromEntries(chips.map((chip) => [chip.id, 0])) as Record<T, number>;
}

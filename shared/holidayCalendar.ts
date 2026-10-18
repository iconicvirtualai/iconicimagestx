/**
 * Office calendar events for Thankful RSVPs and 'Tis client shoots.
 * Fifteen minutes on the photos calendar. Guests are not invited.
 */

import { HOLIDAY_RSVP_LEAD, HOLIDAY_SEASON_LEAD } from "./holidayCheckout.ts";
import { holidaySlotClaim, holidayStoredDate, holidayStoredTime, isHolidayTestBooking } from "./holidaySlots.ts";
import { THANKFUL_EVENT_DATE } from "./thankfulEvent.ts";
import { BUSINESS_CONTACT } from "./businessContact.ts";

export const HOLIDAY_OFFICE_CALENDAR_ID = "photos@iconicimagestx.com";
export const HOLIDAY_SLOT_MINUTES = 15;

/** One real RSVP was saved for Sat Nov 14 before the event moved to Nov 7. */
export const LEGACY_THANKFUL_DATE = "2026-11-14";
export const LEGACY_THANKFUL_TIME = "11:00 AM";

const CLOSED_STATUSES = new Set(["declined", "cancelled", "canceled"]);

export interface HolidayCalendarPlan {
  orderId: string;
  orderNumber: string;
  kind: "thankful" | "season";
  name: string;
  date: string;
  time: string;
  start: string;
  end: string;
  summary: string;
  description: string;
  movedFrom: string | null;
}

export interface HolidayBackfillMove {
  id: string;
  orderNumber: string;
  name: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  eventId: string | null;
  error: string | null;
}

export interface HolidayBackfillReport {
  created: number;
  skipped: {
    test: number;
    cancelled: number;
    alreadyScheduled: number;
    notASlot: number;
  };
  failed: Array<{ id: string; name: string; orderNumber: string; error: string }>;
  moved: HolidayBackfillMove[];
}

export interface HolidayBackfillPatch {
  id: string;
  patch: Record<string, unknown>;
}

export type HolidayCalendarStatus = "on calendar" | "failed" | "none";

export interface HolidayRsvpRow {
  id: string;
  name: string;
  time: string;
  headcount: string;
  headcountNumber: number | null;
  menuVote: string;
  status: string;
  orderNumber: string;
  calendarStatus: HolidayCalendarStatus;
  test: boolean;
  countsTowardTotal: boolean;
  sortMinutes: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function noteOf(order: Record<string, unknown>): string {
  return text(order.vibeNote) || text(order.notes);
}

function lineValue(note: string, label: string): string {
  const match = new RegExp(`^${label}:\\s*(.*)$`, "im").exec(note);
  return match ? match[1].trim() : "";
}

export function holidayGuestName(order: Record<string, unknown>): string {
  const named = text(order.clientName) || `${text(order.firstName)} ${text(order.lastName)}`.trim();
  return named || "Guest";
}

export function holidayHeadcountLabel(order: Record<string, unknown>): string {
  const note = noteOf(order);
  return lineValue(note, "Headcount") || lineValue(note, "Families") || lineValue(note, "Party guests");
}

export function holidayHeadcountNumber(label: string): number | null {
  const match = /(\d+)/.exec(label);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

export function holidayMenuVote(order: Record<string, unknown>): string {
  const note = noteOf(order);
  const vote = lineValue(note, "Menu vote");
  if (vote) return vote;
  const party = lineValue(note, "Party menu");
  const chef = lineValue(note, "Chef menu");
  const level = lineValue(note, "Menu level");
  const bits = [
    party,
    chef && chef.toLowerCase() !== "false" ? chef : "",
    level ? `level ${level}` : "",
  ].filter(Boolean);
  return bits.join(", ");
}

export function holidaySantaLabel(order: Record<string, unknown>): string {
  return lineValue(noteOf(order), "Photos with Santa");
}

export function holidayNotesLabel(order: Record<string, unknown>): string {
  return lineValue(noteOf(order), "Notes");
}

export function holidayPackageLabel(order: Record<string, unknown>): string {
  const selected = text(order.selectedService);
  if (selected) return selected;
  const named = text(order.packageName);
  if (named) return named;
  const fromNote = lineValue(noteOf(order), "Package");
  return fromNote || "Holiday shoot";
}

function closedStatus(order: Record<string, unknown>): boolean {
  return CLOSED_STATUSES.has(text(order.status).toLowerCase());
}

function holidayLead(order: Record<string, unknown>): "thankful" | "season" | null {
  const lead = text(order.leadSource);
  if (lead === HOLIDAY_RSVP_LEAD) return "thankful";
  if (lead === HOLIDAY_SEASON_LEAD) return "season";
  return null;
}

function clockMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function stamp(date: string, minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00`;
}

function shortMonthDay(date: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) return date;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(parts[2]) - 1]} ${Number(parts[3])}`;
}

export function holidayCalendarInsertBody(plan: HolidayCalendarPlan): Record<string, unknown> {
  return {
    summary: plan.summary,
    location: BUSINESS_CONTACT.address,
    description: plan.description,
    start: { dateTime: plan.start, timeZone: "America/Chicago" },
    end: { dateTime: plan.end, timeZone: "America/Chicago" },
    extendedProperties: {
      private: {
        orderNumber: plan.orderNumber,
        orderId: plan.orderId,
        source: "holiday_rsvp",
      },
    },
  };
}

function buildPlan(order: Record<string, unknown>, adminUrl: string): HolidayCalendarPlan | null {
  const kind = holidayLead(order);
  if (!kind) return null;
  const storedDate = holidayStoredDate(order);
  const time = holidayStoredTime(order);
  if (!time) return null;
  let date = storedDate;
  let movedFrom: string | null = null;
  if (kind === "thankful" && storedDate === LEGACY_THANKFUL_DATE && time === LEGACY_THANKFUL_TIME) {
    date = THANKFUL_EVENT_DATE;
    movedFrom = LEGACY_THANKFUL_DATE;
  }
  const claim = holidaySlotClaim(
    kind === "thankful" ? HOLIDAY_RSVP_LEAD : HOLIDAY_SEASON_LEAD,
    date,
    time,
  );
  if (!claim) return null;
  const minutes = clockMinutes(claim.time);
  if (minutes == null) return null;
  const name = holidayGuestName(order);
  const headcount = holidayHeadcountLabel(order);
  const headcountTitle = holidayHeadcountNumber(headcount) ?? (headcount || "—");
  const orderNumber = text(order.orderNumber);
  const summary = kind === "thankful"
    ? `Thankful RSVP — ${name} (${headcountTitle})`
    : `'Tis shoot — ${name} — ${holidayPackageLabel(order)}`;
  const description = [
    `Email: ${text(order.email) || text(order.clientEmail) || "—"}`,
    `Phone: ${text(order.phone) || text(order.clientPhone) || "—"}`,
    `Headcount: ${headcount || "—"}`,
    `Kids/Santa: ${holidaySantaLabel(order) || "—"}`,
    `Menu vote: ${holidayMenuVote(order) || "—"}`,
    `Notes: ${holidayNotesLabel(order) || "—"}`,
    `Order: ${orderNumber || "—"}`,
    `Admin: ${adminUrl}`,
  ].join("\n");
  return {
    orderId: text(order.id),
    orderNumber,
    kind,
    name,
    date: claim.date,
    time: claim.time,
    start: stamp(claim.date, minutes),
    end: stamp(claim.date, minutes + HOLIDAY_SLOT_MINUTES),
    summary,
    description,
    movedFrom,
  };
}

export type HolidayCalendarDecision =
  | { action: "skip"; reason: "test" | "cancelled" | "already" | "notASlot" }
  | { action: "create"; plan: HolidayCalendarPlan };

/** Test, cancelled, and already-held orders are not scheduled again. */
export function classifyHolidayCalendarOrder(order: Record<string, unknown>, adminUrl: string): HolidayCalendarDecision {
  if (!holidayLead(order)) return { action: "skip", reason: "notASlot" };
  if (isHolidayTestBooking(order)) return { action: "skip", reason: "test" };
  if (closedStatus(order)) return { action: "skip", reason: "cancelled" };
  if (text(order.calendarEventId)) return { action: "skip", reason: "already" };
  const plan = buildPlan(order, adminUrl);
  if (!plan) return { action: "skip", reason: "notASlot" };
  return { action: "create", plan };
}

export function planHolidayCalendarEvent(order: Record<string, unknown>, adminUrl: string): HolidayCalendarPlan | null {
  const decision = classifyHolidayCalendarOrder(order, adminUrl);
  return decision.action === "create" ? decision.plan : null;
}

function failureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  return (message || "Calendar hold failed.").slice(0, 300);
}

export async function runHolidayBackfill(input: {
  orders: Array<Record<string, unknown> & { id: string }>;
  adminUrl: (id: string) => string;
  create: (plan: HolidayCalendarPlan) => Promise<{ calendarId: string; eventId: string | null; htmlLink: string | null } | null>;
}): Promise<{ report: HolidayBackfillReport; patches: HolidayBackfillPatch[] }> {
  const report: HolidayBackfillReport = {
    created: 0,
    skipped: { test: 0, cancelled: 0, alreadyScheduled: 0, notASlot: 0 },
    failed: [],
    moved: [],
  };
  const patches: HolidayBackfillPatch[] = [];
  for (const order of input.orders) {
    const decision = classifyHolidayCalendarOrder({ ...order, id: order.id }, input.adminUrl(order.id));
    if (decision.action === "skip") {
      if (decision.reason === "test") report.skipped.test += 1;
      else if (decision.reason === "cancelled") report.skipped.cancelled += 1;
      else if (decision.reason === "already") report.skipped.alreadyScheduled += 1;
      else report.skipped.notASlot += 1;
      continue;
    }
    const plan = decision.plan;
    try {
      const created = await input.create(plan);
      if (!created?.eventId) throw new Error("Calendar returned no event id.");
      report.created += 1;
      if (plan.movedFrom) {
        report.moved.push({
          id: order.id,
          orderNumber: plan.orderNumber,
          name: plan.name,
          fromDate: plan.movedFrom,
          fromTime: plan.time,
          toDate: plan.date,
          toTime: plan.time,
          eventId: created.eventId,
          error: null,
        });
      }
      patches.push({
        id: order.id,
        patch: {
          calendarEventId: created.eventId,
          calendarId: created.calendarId,
          calendarHtmlLink: created.htmlLink,
          calendarHold: "held",
          calendarHoldError: null,
          officeFlag: null,
          officeNote: null,
          ...(plan.movedFrom ? { scheduledDate: plan.date } : {}),
        },
      });
    } catch (err) {
      const error = failureMessage(err);
      report.failed.push({
        id: order.id,
        name: plan.name,
        orderNumber: plan.orderNumber,
        error,
      });
      if (plan.movedFrom) {
        report.moved.push({
          id: order.id,
          orderNumber: plan.orderNumber,
          name: plan.name,
          fromDate: plan.movedFrom,
          fromTime: plan.time,
          toDate: plan.date,
          toTime: plan.time,
          eventId: null,
          error,
        });
      }
      patches.push({
        id: order.id,
        patch: {
          calendarHold: "failed",
          calendarHoldError: error,
          officeFlag: "calendar_hold_failed",
          officeNote: "Holiday calendar event was not created. Add it to the photos calendar manually.",
        },
      });
    }
  }
  return { report, patches };
}

/** Held events are on the calendar. A failed hold stays failed. Anything else is none. */
export function holidayCalendarStatus(order: Record<string, unknown>): HolidayCalendarStatus {
  if (text(order.calendarHold) === "failed" || order.officeFlag === "calendar_hold_failed") return "failed";
  if (text(order.calendarEventId) && text(order.calendarHold) !== "none") return "on calendar";
  return "none";
}

export function holidayRsvpBoard(orders: Array<Record<string, unknown> & { id: string }>): {
  rows: HolidayRsvpRow[];
  totalHeadcount: number;
} {
  const rows = orders
    .filter((order) => text(order.leadSource) === HOLIDAY_RSVP_LEAD)
    .map((order) => {
      const headcount = holidayHeadcountLabel(order);
      const headcountNumber = holidayHeadcountNumber(headcount);
      const test = isHolidayTestBooking(order);
      const closed = closedStatus(order);
      const storedDate = holidayStoredDate(order);
      const time = holidayStoredTime(order) || "—";
      const timeLabel = storedDate && storedDate !== THANKFUL_EVENT_DATE ? `${shortMonthDay(storedDate)} · ${time}` : time;
      return {
        id: order.id,
        name: holidayGuestName(order),
        time: timeLabel,
        sortMinutes: clockMinutes(time) ?? 24 * 60,
        headcount: headcount || "—",
        headcountNumber,
        menuVote: holidayMenuVote(order) || "—",
        status: text(order.status) || "new",
        orderNumber: text(order.orderNumber),
        calendarStatus: holidayCalendarStatus(order),
        test,
        countsTowardTotal: !test && !closed && headcountNumber != null,
      };
    })
    .sort((a, b) => a.sortMinutes - b.sortMinutes || a.name.localeCompare(b.name));
  const totalHeadcount = rows.reduce((sum, row) => sum + (row.countsTowardTotal ? row.headcountNumber || 0 : 0), 0);
  return { rows, totalHeadcount };
}

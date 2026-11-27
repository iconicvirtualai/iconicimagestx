/**
 * Aryeo customer and team email copy, translated onto Iconic order fields.
 *
 * Appointment reminder offset is not shown in Aryeo. This module defaults it
 * to 24 hours before the appointment in America/Chicago. Admins can change
 * reminderHoursBefore. That default is an assumption, not an Aryeo setting.
 *
 * Sends are gated by CLIENT_EMAIL_NOTIFY_LIVE (exactly "true"). This module
 * does not read or write CLIENT_NOTIFY_LIVE, CAMPAIGN_SEND_LIVE,
 * BOOKING_NOTIFY_LIVE, or CLIENT_PORTAL_ENABLED.
 * There is no SMS path.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";
import { galleryDeliveryUrl } from "./galleryDelivery.ts";
import { publicClientUrl, type PublicSiteEnv } from "./publicSiteUrl.ts";
import { receiptLogoUrl } from "./paymentReceiptLayout.ts";

export const CLIENT_EMAIL_NOTIFY_FLAG = "CLIENT_EMAIL_NOTIFY_LIVE";
export const CLIENT_EMAIL_NOTIFY_TEST_SINK = "ops+deliveryqa@iconicimagestx.com";
export const ARYEO_EMAIL_FROM_NAME = "Iconic Images";
export const ARYEO_EMAIL_FROM_ADDRESS = "photos@iconicimagestx.com";
export const ARYEO_COMPANY_NAME = "Iconic Images Media & Marketing";
export const NOTIFY_TIME_ZONE = "America/Chicago";
export const DEFAULT_APPOINTMENT_REMINDER_HOURS = 24;
export const PAYMENT_OVERDUE_DAYS = 3;
export const INVOICE_LICENSE_NOTE =
  "Licenses are not active until payment has been made in full #BeIconic";

export const BRAND_YELLOW = "#FFE500";
export const BRAND_INK = "#111111";

export function clientEmailNotifyLive(env: Record<string, string | undefined> = process.env): boolean {
  return env[CLIENT_EMAIL_NOTIFY_FLAG] === "true";
}

/**
 * The older booking_received and order_confirmed client emails.
 * They stay on unless CLIENT_EMAIL_NOTIFY_LIVE is exactly "true", because
 * the Aryeo Order Confirmation replaces them and a client must not get both.
 * CLIENT_NOTIFY_LIVE does not decide this.
 */
export function legacyClientOrderEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !clientEmailNotifyLive(env);
}

export function aryeoFromHeader(): string {
  return `${ARYEO_EMAIL_FROM_NAME} <${ARYEO_EMAIL_FROM_ADDRESS}>`;
}

export interface MergeGap {
  tag: string;
  reason: string;
}

/** Fields Aryeo templates use that this system does not have. Do not invent values. */
export const MERGE_TAG_GAPS: MergeGap[] = [
  {
    tag: "customer_app_download_cta",
    reason: "No Iconic customer app download link is stored. The block is omitted.",
  },
  {
    tag: "appointment_actions",
    reason: "No client self-serve reschedule or cancel URL. The email offers the studio phone and email.",
  },
  {
    tag: "listing.first_interactive_content_unbranded_url",
    reason: "A listing stores one tour URL (tourUrl, matterportUrl, or virtualTourUrl). There is no unbranded tour field, so that line is omitted.",
  },
  {
    tag: "property_website.unbranded_url",
    reason: "There is no unbranded property-website field. A branded site is linked only when the listing already has a slug or propertyWebsiteUrl.",
  },
  {
    tag: "listing.showcase_media_url",
    reason: "Showcase Select has no media URL unless the order already stores showcaseMediaUrl. The link line is omitted when that field is empty.",
  },
  {
    tag: "order.status_url",
    reason: "There is no tokenized public order-status URL. The portal listing is used only when listingId is already on the record.",
  },
  {
    tag: "customer_new_lead",
    reason: "Property-website lead mail is not wired. No lead object is created by order entry.",
  },
  {
    tag: "team notification preferences",
    reason: "Aryeo per-user Email/SMS/Push preferences are not stored. Team mail goes to ADMIN_EMAIL, COORDINATOR_EMAIL, and the assigned photographer email when the order has one.",
  },
];

const BLOCKED_COMPACT = new Set(["marcobrito", "deliagrimaldo"]);

export function compactPerson(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function hardSuppressionReason(input: { email?: string; name?: string }): string | null {
  const name = compactPerson(input.name || "");
  if (name && BLOCKED_COMPACT.has(name)) {
    return name === "marcobrito" ? "Marco Brito" : "Delia Grimaldo";
  }
  const email = (input.email || "").trim().toLowerCase();
  if (!email) return null;
  const local = email.split("@")[0] || "";
  const compactLocal = compactPerson(local);
  if (BLOCKED_COMPACT.has(compactLocal) || compactLocal.includes("marcobrito") || compactLocal.includes("deliagrimaldo")) {
    return compactLocal.includes("delia") ? "Delia Grimaldo" : "Marco Brito";
  }
  return null;
}

export type CustomerNotifyKey =
  | "customer_order_confirmation"
  | "customer_appointment_scheduled"
  | "customer_appointment_rescheduled"
  | "customer_appointment_reminder"
  | "customer_appointment_canceled"
  | "customer_appointment_postponed"
  | "listing_delivery"
  | "listing_delivery_showcase_select"
  | "customer_order_payment_required"
  | "customer_order_payment_overdue";

export type TeamNotifyKey =
  | "creator_order_received"
  | "creator_appointment_assigned"
  | "creator_appointment_unassigned"
  | "creator_appointment_scheduled"
  | "creator_appointment_rescheduled"
  | "creator_appointment_canceled"
  | "creator_appointment_postponed"
  | "creator_appointment_reminder"
  | "creator_upcoming_appointments_summary"
  | "creator_order_payment_processed";

export type AccountNotifyKey =
  | "customer_team_invitation"
  | "customer_user_activation"
  | "customer_user_reset_password"
  | "customer_user_verification";

export type NotifyKey = CustomerNotifyKey | TeamNotifyKey | AccountNotifyKey;

export interface NotifyDefinition {
  key: NotifyKey;
  label: string;
  audience: "customer" | "team" | "account";
  trigger: string;
  wired: boolean;
  wireNote?: string;
}

export const NOTIFY_DEFINITIONS: NotifyDefinition[] = [
  { key: "customer_order_confirmation", label: "Order Confirmation", audience: "customer", trigger: "Order placed (online booking or admin confirm)", wired: true },
  { key: "customer_appointment_scheduled", label: "Appointment Scheduled", audience: "customer", trigger: "Appointment scheduled. Subject is Appointment Confirmed.", wired: true },
  { key: "customer_appointment_rescheduled", label: "Appointment Rescheduled", audience: "customer", trigger: "Appointment date or time changes", wired: true },
  { key: "customer_appointment_reminder", label: "Appointment Reminder", audience: "customer", trigger: "Upcoming appointment. Default 24 hours before, America/Chicago.", wired: true },
  { key: "customer_appointment_canceled", label: "Appointment Canceled", audience: "customer", trigger: "Appointment or order canceled", wired: true },
  { key: "customer_appointment_postponed", label: "Appointment Postponed", audience: "customer", trigger: "Order status set to postponed", wired: true },
  { key: "listing_delivery", label: "Listing Delivered", audience: "customer", trigger: "Listing media delivered", wired: true },
  { key: "listing_delivery_showcase_select", label: "Listing Delivered — Showcase Select", audience: "customer", trigger: "Delivery marked showcase, or showcaseMediaUrl is set", wired: true },
  { key: "customer_order_payment_required", label: "Order Payment Required", audience: "customer", trigger: "Order fulfilled and still unpaid", wired: true },
  { key: "customer_order_payment_overdue", label: "Order Payment Overdue", audience: "customer", trigger: "3 days after fulfillment if still unpaid", wired: true },
  { key: "creator_order_received", label: "Order Received", audience: "team", trigger: "New order placed", wired: true },
  { key: "creator_appointment_assigned", label: "Appointment Assigned", audience: "team", trigger: "Photographer assigned", wired: true },
  { key: "creator_appointment_unassigned", label: "Appointment Unassigned", audience: "team", trigger: "Photographer removed", wired: true },
  { key: "creator_appointment_scheduled", label: "Appointment Scheduled", audience: "team", trigger: "Appointment scheduled", wired: true },
  { key: "creator_appointment_rescheduled", label: "Appointment Rescheduled", audience: "team", trigger: "Appointment date or time changes", wired: true },
  { key: "creator_appointment_canceled", label: "Appointment Canceled", audience: "team", trigger: "Appointment canceled", wired: true },
  { key: "creator_appointment_postponed", label: "Appointment Postponed", audience: "team", trigger: "Appointment postponed", wired: true },
  { key: "creator_appointment_reminder", label: "Appointment Reminder", audience: "team", trigger: "Same 24-hour reminder, to the assigned team", wired: true },
  { key: "creator_upcoming_appointments_summary", label: "Appointment Summary", audience: "team", trigger: "Daily summary for that Chicago day", wired: true },
  { key: "creator_order_payment_processed", label: "Order Payment Processed", audience: "team", trigger: "Payment recorded on the order", wired: true },
  {
    key: "customer_team_invitation",
    label: "Customer Team Invitation",
    audience: "account",
    trigger: "Invited to a customer team",
    wired: false,
    wireNote: "The client hub already sends team_invite. This Aryeo copy is preview-only so the portal does not send a second invitation.",
  },
  {
    key: "customer_user_activation",
    label: "User Activation",
    audience: "account",
    trigger: "New client user invited",
    wired: false,
    wireNote: "Booking already sends account_password_setup when a portal account is created. Not duplicated.",
  },
  {
    key: "customer_user_reset_password",
    label: "User Reset Password",
    audience: "account",
    trigger: "Password reset requested",
    wired: false,
    wireNote: "Forgot password already uses Firebase sendPasswordResetEmail. Not duplicated.",
  },
  {
    key: "customer_user_verification",
    label: "User Verification",
    audience: "account",
    trigger: "First login code",
    wired: false,
    wireNote: "The portal has no first-login verification code. This email is not sent.",
  },
];

export function notifyDefinition(key: string): NotifyDefinition | null {
  return NOTIFY_DEFINITIONS.find((item) => item.key === key) || null;
}

export function isNotifyKey(key: string): key is NotifyKey {
  return notifyDefinition(key) != null;
}

export interface NotifySettings {
  enabled: Partial<Record<NotifyKey, boolean>>;
  reminderHoursBefore: number;
}

export function defaultNotifySettings(): NotifySettings {
  const enabled = {} as Partial<Record<NotifyKey, boolean>>;
  for (const item of NOTIFY_DEFINITIONS) enabled[item.key] = item.wired;
  return { enabled, reminderHoursBefore: DEFAULT_APPOINTMENT_REMINDER_HOURS };
}

export function normalizeReminderHours(value: unknown): number {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours)) return DEFAULT_APPOINTMENT_REMINDER_HOURS;
  const whole = Math.round(hours);
  if (whole < 1 || whole > 168) return DEFAULT_APPOINTMENT_REMINDER_HOURS;
  return whole;
}

export function notificationEnabled(settings: NotifySettings, key: NotifyKey): boolean {
  const def = notifyDefinition(key);
  if (!def?.wired) return false;
  if (settings.enabled[key] === false) return false;
  return true;
}

export interface NotifyContext {
  orderNumber: string;
  address: string;
  orderId: string;
  requestId: string;
  listingId: string;
  galleryId: string;
  statusUrl: string;
  editUrl: string;
  firstName: string;
  fullName: string;
  email: string;
  phone: string;
  lineItems: Array<{ name: string; price: string }>;
  total: string;
  balanceDue: string;
  appointmentWhen: string;
  appointmentStartIso: string;
  photographerName: string;
  photographerEmail: string;
  calendarUrl: string;
  downloadUrl: string;
  brandedTourUrl: string;
  unbrandedTourUrl: string;
  brandedWebsiteUrl: string;
  unbrandedWebsiteUrl: string;
  showcaseMediaUrl: string;
  showcase: boolean;
  mediaOutstanding: boolean;
  mediaOutstandingDetail: string;
  unpaid: boolean;
  paymentAmount: string;
  paymentMethod: string;
  paymentWhen: string;
  paymentId: string;
  teamMembers: string[];
  dailyAppointments: Array<{ when: string; address: string; orderNumber: string; clientName: string }>;
  activationUrl: string;
  invitingName: string;
  invitingEmail: string;
  teamName: string;
  teamRole: string;
  verificationCode: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: unknown): string {
  if (typeof value === "string" && value.trim().startsWith("$")) return value.trim();
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "";
  return `$${amount.toFixed(2)}`;
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function personName(record: Record<string, unknown>): { first: string; full: string } {
  const first = firstText(record, ["firstName", "clientFirstName"]);
  const last = firstText(record, ["lastName", "clientLastName"]);
  const full = firstText(record, ["clientName", "customerName", "fullName"]) || `${first} ${last}`.trim();
  return { first: first || full.split(/\s+/)[0] || "", full };
}

export function orderUnpaid(record: Record<string, unknown>): boolean {
  const paymentStatus = firstText(record, ["paymentStatus"]).toLowerCase();
  if (paymentStatus === "paid" || paymentStatus === "comped") return false;
  const invoiceStatus = text(record.invoiceStatus).toLowerCase();
  if (invoiceStatus === "paid" || invoiceStatus === "comped") return false;
  const dueRaw = record.balanceDue ?? record.amountDue;
  if (dueRaw != null && dueRaw !== "" && Number(dueRaw) <= 0) return false;
  const total = Number(record.total);
  if (Number.isFinite(total) && total <= 0 && dueRaw == null) return false;
  return true;
}

export function mediaOutstandingOf(record: Record<string, unknown>): { outstanding: boolean; detail: string } {
  if (record.mediaOutstanding === false) return { outstanding: false, detail: "" };
  const listed = Array.isArray(record.outstandingMedia)
    ? record.outstandingMedia.map((item) => text(item) || text((item as { name?: unknown })?.name)).filter(Boolean)
    : [];
  const note = listed.join(", ") || firstText(record, ["outstandingMediaNote", "pendingMedia", "mediaPendingNote"]);
  if (record.mediaOutstanding === true || note) {
    return {
      outstanding: true,
      detail: note || "Some media for this listing is still outstanding.",
    };
  }
  return { outstanding: false, detail: "" };
}

export function isShowcaseDelivery(record: Record<string, unknown>): boolean {
  if (record.showcase === true || record.showcaseSelect === true) return true;
  const channel = firstText(record, ["deliveryTarget", "deliveryChannel"]).toLowerCase();
  if (channel === "showcase" || channel === "showcase_select") return true;
  return Boolean(firstText(record, ["showcaseMediaUrl"]));
}

function lineItemsOf(record: Record<string, unknown>): Array<{ name: string; price: string }> {
  const raw = Array.isArray(record.lineItems) ? record.lineItems : Array.isArray(record.services) ? record.services : [];
  return raw.map((item) => {
    if (typeof item === "string") return { name: item, price: "" };
    if (!item || typeof item !== "object") return { name: "", price: "" };
    const row = item as Record<string, unknown>;
    return { name: text(row.name) || text(row.label) || text(row.service), price: money(row.price ?? row.amount ?? row.total) };
  }).filter((item) => item.name);
}

function dateFromUnknown(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (value && typeof value === "object") {
    const row = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
    if (typeof row.toDate === "function") {
      const date = row.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    }
    const seconds = typeof row.seconds === "number" ? row.seconds : typeof row._seconds === "number" ? row._seconds : null;
    if (seconds != null) return new Date(seconds * 1000);
  }
  return null;
}

function clockFromLabel(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = (match[3] || "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function chicagoDateParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NOTIFY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

/** Interpret a wall-clock time in America/Chicago as a UTC instant. */
export function chicagoWallTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const seen = chicagoDateParts(guess);
  const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return new Date(guess.getTime() - (seenUtc - guess.getTime()));
}

export function appointmentStart(record: Record<string, unknown>): Date | null {
  const timeLabel = firstText(record, ["scheduledTime", "appointmentTime", "requestedTimeLabel"]);
  const clock = clockFromLabel(timeLabel);
  const rawDate = record.scheduledDate ?? record.appointmentDate ?? record.shootDate;
  if (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
    const [year, month, day] = rawDate.trim().split("-").map(Number);
    if (!clock) return chicagoWallTime(year, month, day, 12, 0);
    return chicagoWallTime(year, month, day, clock.hour, clock.minute);
  }
  const instant = dateFromUnknown(rawDate);
  if (!instant) return null;
  if (!clock) return instant;
  const parts = chicagoDateParts(instant);
  return chicagoWallTime(parts.year, parts.month, parts.day, clock.hour, clock.minute);
}

export function formatChicagoWhen(date: Date | null, timeLabel = ""): string {
  if (!date) return timeLabel;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: NOTIFY_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${when} CT`;
}

export function googleCalendarLink(input: { title: string; start: Date | null; address: string; details: string }): string {
  if (!input.start) return "";
  const end = new Date(input.start.getTime() + 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${stamp(input.start)}/${stamp(end)}`,
    location: input.address,
    details: input.details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function contextFromRecord(
  record: Record<string, unknown>,
  extras: { id?: string; collection?: "orders" | "orderRequests"; env?: PublicSiteEnv; requestId?: string } = {},
): NotifyContext {
  const person = personName(record);
  const id = extras.id || text(record.id);
  const requestId = extras.requestId || text(record.orderRequestId) || (extras.collection === "orderRequests" ? id : "");
  const orderId = text(record.orderId) || (extras.collection === "orders" ? id : text(record.id));
  const listingId = firstText(record, ["listingId"]);
  const galleryId = firstText(record, ["galleryId"]);
  const address = firstText(record, ["addressLabel", "address", "fullAddress", "propertyAddress"]);
  const slug = firstText(record, ["listingSlug", "slug", "propertyWebsiteSlug"]);
  const statusUrl = firstText(record, ["statusUrl"]) || (listingId ? publicClientUrl(`/portal/listings/${encodeURIComponent(listingId)}`, extras.env) : "");
  const editPath = extras.collection === "orderRequests" || (!orderId && requestId)
    ? `/admin/order-request/${encodeURIComponent(requestId || id)}`
    : `/admin/order/${encodeURIComponent(orderId || id)}`;
  const start = appointmentStart(record);
  const timeLabel = firstText(record, ["scheduledTime", "appointmentTime", "requestedTimeLabel"]);
  const outstanding = mediaOutstandingOf(record);
  const downloadUrl = firstText(record, ["downloadCenterUrl", "galleryUrl", "deliveryUrl"])
    || (galleryId ? galleryDeliveryUrl(galleryId, extras.env) : "");
  const brandedWebsite = firstText(record, ["propertyWebsiteUrl", "brandedPropertyWebsiteUrl"])
    || (slug ? publicClientUrl(`/l/${encodeURIComponent(slug)}`, extras.env) : "");
  return {
    orderNumber: firstText(record, ["orderNumber"]) || "",
    address,
    orderId: orderId || id,
    requestId,
    listingId,
    galleryId,
    statusUrl,
    editUrl: id || requestId ? publicClientUrl(editPath, extras.env) : "",
    firstName: person.first,
    fullName: person.full,
    email: firstText(record, ["clientEmail", "email", "customerEmail"]),
    phone: firstText(record, ["clientPhone", "phone"]),
    lineItems: lineItemsOf(record),
    total: money(record.total),
    balanceDue: money(record.balanceDue ?? record.amountDue),
    appointmentWhen: formatChicagoWhen(start, timeLabel),
    appointmentStartIso: start ? start.toISOString() : "",
    photographerName: firstText(record, ["assignedPhotographerName", "photographerName"]),
    photographerEmail: firstText(record, ["photographerEmail", "assignedPhotographerEmail"]),
    calendarUrl: firstText(record, ["googleCalendarUrl", "calendarHtmlLink"]),
    downloadUrl,
    brandedTourUrl: firstText(record, ["brandedTourUrl", "tourUrl", "matterportUrl", "virtualTourUrl"]),
    unbrandedTourUrl: firstText(record, ["unbrandedTourUrl"]),
    brandedWebsiteUrl: brandedWebsite,
    unbrandedWebsiteUrl: firstText(record, ["unbrandedPropertyWebsiteUrl"]),
    showcaseMediaUrl: firstText(record, ["showcaseMediaUrl"]),
    showcase: isShowcaseDelivery(record),
    mediaOutstanding: outstanding.outstanding,
    mediaOutstandingDetail: outstanding.detail,
    unpaid: orderUnpaid(record),
    paymentAmount: money(record.paymentAmount ?? record.amount),
    paymentMethod: firstText(record, ["paymentMethod"]),
    paymentWhen: firstText(record, ["paidAt", "paymentWhen"]),
    paymentId: firstText(record, ["paymentId", "squarePaymentId", "stripePaymentIntentId"]),
    teamMembers: [],
    dailyAppointments: [],
    activationUrl: firstText(record, ["activationUrl", "passwordSetupLink"]),
    invitingName: firstText(record, ["invitingName"]),
    invitingEmail: firstText(record, ["invitingEmail"]),
    teamName: firstText(record, ["teamName"]),
    teamRole: firstText(record, ["teamRole"]) || "member",
    verificationCode: firstText(record, ["verificationCode"]),
  };
}

function orderCode(ctx: NotifyContext): string {
  return ctx.orderNumber || "the order";
}

export function subjectFor(key: NotifyKey, ctx: NotifyContext): string {
  const number = ctx.orderNumber || "";
  const address = ctx.address || "";
  switch (key) {
    case "customer_order_confirmation":
      return `New order confirmation ${number}${number ? " - " : ""}${address}`.replace(/\s+/g, " ").trim();
    case "customer_appointment_scheduled":
      return `Order ${number} Appointment Confirmed`.replace(/\s+/g, " ").trim();
    case "customer_appointment_rescheduled":
    case "creator_appointment_rescheduled":
      return `Order ${number} Appointment Rescheduled`.replace(/\s+/g, " ").trim();
    case "customer_appointment_reminder":
    case "creator_appointment_reminder":
      return `Order ${number} Appointment Reminder`.replace(/\s+/g, " ").trim();
    case "customer_appointment_canceled":
    case "creator_appointment_canceled":
      return `Order ${number} Appointment Canceled`.replace(/\s+/g, " ").trim();
    case "customer_appointment_postponed":
    case "creator_appointment_postponed":
      return `Order ${number} Appointment Postponed`.replace(/\s+/g, " ").trim();
    case "listing_delivery":
      return `Delivery notification for ${address || "your listing"}`;
    case "listing_delivery_showcase_select":
      return `Media delivery notification for ${address || "your listing"}`;
    case "customer_order_payment_required":
      return `Payment due for Order ${number}${number ? " - " : ""}${address}`.replace(/\s+/g, " ").trim();
    case "customer_order_payment_overdue":
      return `Payment overdue for Order ${number}${number ? " - " : ""}${address}`.replace(/\s+/g, " ").trim();
    case "creator_order_received":
      return `New order ${number} placed by ${ctx.fullName || "a client"}${address ? ` - ${address}` : ""}`.replace(/\s+/g, " ").trim();
    case "creator_appointment_assigned":
      return `Assigned to Appointment for Order ${number}`.trim();
    case "creator_appointment_unassigned":
      return `Unassigned from Appointment for Order ${number}`.trim();
    case "creator_appointment_scheduled":
      return `Order ${number} Appointment Scheduled`.replace(/\s+/g, " ").trim();
    case "creator_upcoming_appointments_summary":
      return "Upcoming Appointments Summary";
    case "creator_order_payment_processed":
      return `You have received a payment for Order ${number}`.trim();
    case "customer_team_invitation":
      return `You have been invited to join team ${ctx.teamName || "your team"}`;
    case "customer_user_activation":
      return `Important: Account Activation Link For ${ARYEO_COMPANY_NAME}`;
    case "customer_user_reset_password":
      return "Important: Account Password Reset Link";
    case "customer_user_verification":
      return "Important: Account Verification Code";
    default:
      return "Iconic Images";
  }
}

function p(html: string): string {
  return `<div style="margin:0 0 12px;">${html}</div>`;
}

function orderDetailsHtml(ctx: NotifyContext): string {
  const rows = ctx.lineItems.map((item) => (
    `<tr><td style="padding:6px 0;color:#333;">${escapeHtml(item.name)}</td><td style="padding:6px 0;text-align:right;">${escapeHtml(item.price)}</td></tr>`
  )).join("");
  return `
    <div style="margin:16px 0;padding:16px;border:1px solid #eee;border-radius:8px;">
      <div style="font-weight:bold;margin-bottom:8px;">Order ${escapeHtml(orderCode(ctx))}</div>
      <div>${escapeHtml(ctx.address || "Address not on the order")}</div>
      ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${rows}</table>` : ""}
      ${ctx.total ? `<div style="margin-top:8px;"><strong>Total:</strong> ${escapeHtml(ctx.total)}</div>` : ""}
      ${ctx.balanceDue ? `<div><strong>Balance due:</strong> ${escapeHtml(ctx.balanceDue)}</div>` : ""}
      <div style="margin-top:12px;">Please remember: <strong>${escapeHtml(INVOICE_LICENSE_NOTE)}</strong></div>
    </div>
  `;
}

function appointmentsHtml(ctx: NotifyContext): string {
  if (!ctx.appointmentWhen && !ctx.address) return "";
  return `
    <div style="margin:16px 0;">
      <div style="font-weight:bold;">Appointment</div>
      <div>${escapeHtml(ctx.appointmentWhen || "Time to be confirmed")}</div>
      <div>${escapeHtml(ctx.address)}</div>
      ${ctx.photographerName ? `<div>Photographer: ${escapeHtml(ctx.photographerName)}</div>` : ""}
    </div>
  `;
}

function calendarLinksHtml(ctx: NotifyContext): string {
  const generated = googleCalendarLink({
    title: `Iconic Images appointment ${ctx.orderNumber}`.trim(),
    start: ctx.appointmentStartIso ? new Date(ctx.appointmentStartIso) : null,
    address: ctx.address,
    details: `Order ${ctx.orderNumber}`.trim(),
  });
  const links = [
    ctx.calendarUrl ? `<a href="${escapeHtml(ctx.calendarUrl)}">View the calendar event</a>` : "",
    generated ? `<a href="${escapeHtml(generated)}">Add to Google Calendar</a>` : "",
  ].filter(Boolean);
  if (links.length === 0) return "";
  return p(links.join("<br>"));
}

function actionsHtml(): string {
  return p(`Questions or a new time? Call <a href="${BUSINESS_CONTACT.phoneHref}">${escapeHtml(BUSINESS_CONTACT.phoneDisplay)}</a> or email <a href="${BUSINESS_CONTACT.emailHref}">${escapeHtml(BUSINESS_CONTACT.email)}</a>.`);
}

function statusBlock(ctx: NotifyContext): string {
  if (!ctx.statusUrl) return "";
  return p(`You can view the most up to date status of your order here: <a href="${escapeHtml(ctx.statusUrl)}">${escapeHtml(ctx.statusUrl)}</a>`);
}

function pendingLine(ctx: NotifyContext): string {
  if (!ctx.mediaOutstanding) return "";
  return p(`<strong>Pending:</strong> ${escapeHtml(ctx.mediaOutstandingDetail)}`);
}

function contactBlock(): string {
  return `
    <div>Iconic Images Crew<br>
    <a href="${BUSINESS_CONTACT.emailHref}">${escapeHtml(BUSINESS_CONTACT.email)}</a><br>
    <a href="${BUSINESS_CONTACT.phoneHref}">${escapeHtml(BUSINESS_CONTACT.phoneDisplay)}</a></div>
    <div>${escapeHtml(BUSINESS_CONTACT.address)}</div>
  `;
}

function innerHtml(key: NotifyKey, ctx: NotifyContext): string {
  const number = escapeHtml(orderCode(ctx));
  switch (key) {
    case "customer_order_confirmation":
      return [
        p("This is an automated email confirming your order submission."),
        statusBlock(ctx),
        orderDetailsHtml(ctx),
        appointmentsHtml(ctx),
      ].join("");
    case "customer_appointment_scheduled":
      return [
        p("This is an automated message letting you know your appointment has been confirmed and scheduled."),
        appointmentsHtml(ctx),
        calendarLinksHtml(ctx),
        actionsHtml(),
        orderDetailsHtml(ctx),
      ].join("");
    case "customer_appointment_rescheduled":
      return [
        p("This is an automated message letting you know your appointment has been <strong>rescheduled</strong>."),
        appointmentsHtml(ctx),
        calendarLinksHtml(ctx),
        actionsHtml(),
        orderDetailsHtml(ctx),
      ].join("");
    case "customer_appointment_reminder":
      return [
        p(`This is an automated message reminding you of your scheduled appointment for Order ${number}.`),
        appointmentsHtml(ctx),
        calendarLinksHtml(ctx),
        actionsHtml(),
        orderDetailsHtml(ctx),
      ].join("");
    case "customer_appointment_canceled":
      return [
        p("This is a confirmation message letting you know your appointment has been canceled. Please let us know if and when you are ready to reschedule."),
        actionsHtml(),
        orderDetailsHtml(ctx),
      ].join("");
    case "customer_appointment_postponed":
      return [
        p(`This is an automated message letting you know that an appointment for Order ${number} has been postponed.`),
        appointmentsHtml(ctx),
        orderDetailsHtml(ctx),
      ].join("");
    case "listing_delivery":
      return [
        p(`Hi ${escapeHtml(ctx.firstName || "there")}!`),
        p(`Your media for ${escapeHtml(ctx.address || "your listing")} is ready for download! Check out the link below to access your content:`),
        pendingLine(ctx),
        ctx.downloadUrl ? p(`<strong>Iconic Media:</strong> <a href="${escapeHtml(ctx.downloadUrl)}">${escapeHtml(ctx.downloadUrl)}</a>`) : "",
        ctx.brandedTourUrl ? p(`<strong>This listing also includes 3D Virtual content URL(s). Access with the links below:</strong><br><strong>3D Tour Branded:</strong> <a href="${escapeHtml(ctx.brandedTourUrl)}">${escapeHtml(ctx.brandedTourUrl)}</a>`) : "",
        ctx.unbrandedTourUrl ? p(`<strong>3D Tour Unbranded:</strong> <a href="${escapeHtml(ctx.unbrandedTourUrl)}">${escapeHtml(ctx.unbrandedTourUrl)}</a>`) : "",
        ctx.brandedWebsiteUrl || ctx.unbrandedWebsiteUrl ? p(`<strong>This listing also includes a property website. Login to your account if you'd like to customize it further.</strong><br>${ctx.brandedWebsiteUrl ? `<strong>Branded Property Website:</strong> <a href="${escapeHtml(ctx.brandedWebsiteUrl)}">${escapeHtml(ctx.brandedWebsiteUrl)}</a><br>` : ""}${ctx.unbrandedWebsiteUrl ? `<strong>Unbranded Property Website:</strong> <a href="${escapeHtml(ctx.unbrandedWebsiteUrl)}">${escapeHtml(ctx.unbrandedWebsiteUrl)}</a>` : ""}`) : "",
        p("Happy Listing!"),
        contactBlock(),
        p("<strong>Book your Podcast Studio Rental, Photo Studio Rental, Headshots &amp; More @ Iconic Studios Ste 105</strong>"),
        p("<em>Note: If you haven't logged into your account before, you will receive a secure account activation email with your access.</em>"),
      ].join("");
    case "listing_delivery_showcase_select":
      return [
        p(`Hello ${escapeHtml(ctx.fullName || "there")},`),
        p(`Your content for ${escapeHtml(ctx.address || "your listing")} is ready for download in your Showcase agent experience dashboard!`),
        ctx.showcaseMediaUrl ? p(`Access your media with this link: <a href="${escapeHtml(ctx.showcaseMediaUrl)}">${escapeHtml(ctx.showcaseMediaUrl)}</a>`) : "",
        p("Thank you for your business,"),
        p(escapeHtml(ARYEO_COMPANY_NAME)),
      ].join("");
    case "customer_order_payment_required":
      return [
        p(`This is an automated email letting you know that Order ${number} has been fulfilled and is now awaiting payment.`),
        statusBlock(ctx),
        orderDetailsHtml(ctx),
        p("Thank you for your business,"),
        p(escapeHtml(ARYEO_COMPANY_NAME)),
      ].join("");
    case "customer_order_payment_overdue":
      return [
        p(`This is an automated email letting you know that Order ${number} requires payment and is overdue.`),
        statusBlock(ctx),
        orderDetailsHtml(ctx),
        p("Thank you for your business,"),
        p(escapeHtml(ARYEO_COMPANY_NAME)),
      ].join("");
    case "creator_order_received":
      return [
        p("You have received a new order! This is an automated email notification. Please review the details below and take any further actions in your account."),
        ctx.editUrl ? p(`You can manage your order here: <a href="${escapeHtml(ctx.editUrl)}">${escapeHtml(ctx.editUrl)}</a>`) : "",
        orderDetailsHtml(ctx),
        appointmentsHtml(ctx),
      ].join("");
    case "creator_appointment_assigned":
      return [p("This is an automated message letting you know that you have been assigned to this appointment."), appointmentsHtml(ctx), orderDetailsHtml(ctx)].join("");
    case "creator_appointment_unassigned":
      return [p("This is an automated message letting you know that you have been unassigned from this appointment."), appointmentsHtml(ctx), orderDetailsHtml(ctx)].join("");
    case "creator_appointment_scheduled":
      return [
        p("This is an automated message letting you know your appointment has been confirmed and scheduled."),
        appointmentsHtml(ctx),
        ctx.teamMembers.length ? p(`<strong>Team:</strong> ${escapeHtml(ctx.teamMembers.join(", "))}`) : (ctx.photographerName ? p(`<strong>Team:</strong> ${escapeHtml(ctx.photographerName)}`) : ""),
        calendarLinksHtml(ctx),
        actionsHtml(),
        orderDetailsHtml(ctx),
      ].join("");
    case "creator_appointment_rescheduled":
      return [p("This is an automated message letting you know your appointment has been <strong>rescheduled</strong>."), appointmentsHtml(ctx), calendarLinksHtml(ctx), actionsHtml(), orderDetailsHtml(ctx)].join("");
    case "creator_appointment_canceled":
      return [p("This is an automated message letting you know your appointment has been canceled."), actionsHtml(), orderDetailsHtml(ctx)].join("");
    case "creator_appointment_postponed":
      return [p(`This is an automated message letting you know that an appointment for Order ${number} has been postponed.`), appointmentsHtml(ctx), orderDetailsHtml(ctx)].join("");
    case "creator_appointment_reminder":
      return [p(`This is an automated message reminding you of your scheduled appointment for Order ${number}.`), appointmentsHtml(ctx), calendarLinksHtml(ctx), actionsHtml(), orderDetailsHtml(ctx)].join("");
    case "creator_upcoming_appointments_summary": {
      const rows = ctx.dailyAppointments.map((item) => (
        `<li style="margin:0 0 8px;">${escapeHtml(item.when)} — ${escapeHtml(item.address)} — ${escapeHtml(item.orderNumber)} — ${escapeHtml(item.clientName)}</li>`
      )).join("");
      return [p("This is an automated email with your daily schedule of appointments. Here are your upcoming appointments:"), `<ul>${rows}</ul>`].join("");
    }
    case "creator_order_payment_processed":
      return [
        p("Hello,"),
        p(`You have received a payment for Order ${number}.`),
        p(`${escapeHtml(ctx.paymentAmount || "Payment")} ${ctx.paymentMethod ? `via ${escapeHtml(ctx.paymentMethod)}` : ""} ${ctx.paymentWhen ? `on ${escapeHtml(ctx.paymentWhen)}` : ""}`.trim()),
        ctx.editUrl ? p(`You can manage your order here: <a href="${escapeHtml(ctx.editUrl)}">${escapeHtml(ctx.editUrl)}</a>`) : "",
      ].join("");
    case "customer_team_invitation":
      return [
        p(`Hi ${escapeHtml(ctx.firstName || "there")},`),
        p(`You've been invited by ${escapeHtml(ctx.invitingName || "a teammate")} (${escapeHtml(ctx.invitingEmail)}) to activate your account as a ${escapeHtml(ctx.teamRole)} of team ${escapeHtml(ctx.teamName)}.`),
        ctx.teamRole === "admin"
          ? "<ul><li>View and manage team members listings</li><li>Place orders on behalf of team members</li><li>Update the team roster</li><li>View and manage team settings.</li></ul>"
          : "<ul><li>Access your projects and files</li><li>Review upcoming appointments</li><li>Receive important account notifications and communication</li><li>Automatically share your listings with team admin</li></ul>",
        ctx.activationUrl ? p(`Button not working? Copy and paste the link below into your browser: <a href="${escapeHtml(ctx.activationUrl)}">${escapeHtml(ctx.activationUrl)}</a>`) : "",
      ].join("");
    case "customer_user_activation":
      return [
        p(`Hi ${escapeHtml(ctx.firstName || "there")},`),
        p(`You've been invited to activate your account with ${escapeHtml(ARYEO_COMPANY_NAME)}. This will allow you to:`),
        "<ul><li>Access your projects and files</li><li>Review upcoming appointments</li><li>Receive important account notifications and communication</li></ul>",
        ctx.activationUrl ? p(`Button not working? Copy and paste the link below into your browser: <a href="${escapeHtml(ctx.activationUrl)}">${escapeHtml(ctx.activationUrl)}</a>`) : "",
      ].join("");
    case "customer_user_reset_password":
      return [
        p(`Hi ${escapeHtml(ctx.firstName || "there")},`),
        p(`You are receiving this email because we received a password reset request for your account with ${escapeHtml(ARYEO_COMPANY_NAME)}.`),
        p("This password reset link will expire in 60 minutes."),
        p("If you did not request a password reset, no further action is required."),
        ctx.activationUrl ? p(`Button not working? Copy and paste the link below into your browser: <a href="${escapeHtml(ctx.activationUrl)}">${escapeHtml(ctx.activationUrl)}</a>`) : "",
      ].join("");
    case "customer_user_verification":
      return [
        p(`Hi ${escapeHtml(ctx.firstName || "there")},`),
        p(`Your verification code for your account with ${escapeHtml(ARYEO_COMPANY_NAME)} is listed below. Please enter it along with a new password of your choosing and do not share this email.`),
        ctx.verificationCode ? `<h1>${escapeHtml(ctx.verificationCode)}</h1>` : "",
      ].join("");
    default:
      return "";
  }
}

export function gapsFor(key: NotifyKey, ctx: NotifyContext): MergeGap[] {
  const gaps: MergeGap[] = [];
  const push = (tag: string) => {
    const found = MERGE_TAG_GAPS.find((item) => item.tag === tag);
    if (found && !gaps.some((item) => item.tag === tag)) gaps.push(found);
  };
  if (key.startsWith("customer_") || key.startsWith("creator_appointment") || key === "listing_delivery") {
    push("customer_app_download_cta");
  }
  if (key.includes("appointment") && key !== "creator_upcoming_appointments_summary") push("appointment_actions");
  if (key === "listing_delivery") {
    if (!ctx.unbrandedTourUrl) push("listing.first_interactive_content_unbranded_url");
    if (!ctx.unbrandedWebsiteUrl) push("property_website.unbranded_url");
    if (!ctx.statusUrl) push("order.status_url");
  }
  if (key === "listing_delivery_showcase_select" && !ctx.showcaseMediaUrl) push("listing.showcase_media_url");
  if ((key === "customer_order_confirmation" || key.includes("payment")) && !ctx.statusUrl) push("order.status_url");
  if (key.startsWith("creator_")) push("team notification preferences");
  if (key === "customer_user_verification") push("user_verification.verification_code");
  if (!MERGE_TAG_GAPS.some((item) => item.tag === "user_verification.verification_code") && key === "customer_user_verification") {
    gaps.push({ tag: "user_verification.verification_code", reason: "The portal has no first-login verification code. This email is not sent." });
  }
  return gaps;
}

export function wrapEmailHtml(inner: string, env?: PublicSiteEnv): string {
  const logo = receiptLogoUrl(env);
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:${BRAND_INK};">
      <div style="background:#111111;padding:20px;text-align:center;">
        <img src="${escapeHtml(logo)}" alt="Iconic Images" width="180" style="width:180px;max-width:70%;height:auto;border:0;">
      </div>
      <div style="height:6px;background:${BRAND_YELLOW};line-height:6px;font-size:0;">&nbsp;</div>
      <div style="padding:28px 24px;font-size:15px;line-height:1.5;">
        ${inner}
      </div>
      <div style="padding:8px 24px 28px;font-size:12px;line-height:1.5;color:#555555;text-align:center;">
        <div>${escapeHtml(BUSINESS_CONTACT.line)}</div>
        <div style="margin-top:6px;">${escapeHtml(ARYEO_EMAIL_FROM_NAME)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export interface RenderedEmail {
  key: NotifyKey;
  subject: string;
  html: string;
  text: string;
  gaps: MergeGap[];
}

export function renderNotification(key: NotifyKey, ctx: NotifyContext, env?: PublicSiteEnv): RenderedEmail {
  const subject = subjectFor(key, ctx);
  const html = wrapEmailHtml(innerHtml(key, ctx), env);
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { key, subject, html, text, gaps: gapsFor(key, ctx) };
}

export function sampleNotifyContext(): NotifyContext {
  const start = chicagoWallTime(2026, 11, 28, 10, 30);
  return {
    orderNumber: "#1042",
    address: "1200 Sample Oak Lane, Spring, TX 77380",
    orderId: "order_sample",
    requestId: "request_sample",
    listingId: "listing_sample",
    galleryId: "gallery_sample",
    statusUrl: publicClientUrl("/portal/listings/listing_sample"),
    editUrl: publicClientUrl("/admin/order/order_sample"),
    firstName: "Jordan",
    fullName: "Jordan Hale",
    email: "jordan.hale.sample@example.com",
    phone: "281-555-0100",
    lineItems: [
      { name: "Premium photos", price: "$249.00" },
      { name: "Drone", price: "$149.00" },
    ],
    total: "$398.00",
    balanceDue: "$398.00",
    appointmentWhen: formatChicagoWhen(start, "10:30 AM"),
    appointmentStartIso: start.toISOString(),
    photographerName: "Alex Rivera",
    photographerEmail: "alex.sample@iconicimagestx.com",
    calendarUrl: "",
    downloadUrl: publicClientUrl("/gallery/gallery_sample"),
    brandedTourUrl: "https://my.matterport.com/show/?m=sample",
    unbrandedTourUrl: "",
    brandedWebsiteUrl: publicClientUrl("/l/1200-sample-oak"),
    unbrandedWebsiteUrl: "",
    showcaseMediaUrl: "",
    showcase: false,
    mediaOutstanding: false,
    mediaOutstandingDetail: "",
    unpaid: true,
    paymentAmount: "$398.00",
    paymentMethod: "card",
    paymentWhen: "Nov 28, 2026",
    paymentId: "pay_sample",
    teamMembers: ["Alex Rivera"],
    dailyAppointments: [
      {
        when: formatChicagoWhen(start, "10:30 AM"),
        address: "1200 Sample Oak Lane, Spring, TX 77380",
        orderNumber: "#1042",
        clientName: "Jordan Hale",
      },
    ],
    activationUrl: publicClientUrl("/portal"),
    invitingName: "Casey Admin",
    invitingEmail: "casey.sample@iconicimagestx.com",
    teamName: "Hale Group",
    teamRole: "member",
    verificationCode: "",
  };
}

export function scopeId(input: { orderId?: string; requestId?: string; orderNumber?: string }): string {
  return input.requestId || input.orderId || input.orderNumber || "unknown";
}

export function idempotencyKey(key: NotifyKey, scope: string, slot = ""): string {
  return [key, scope, slot].filter(Boolean).join(":");
}

export interface NotifyIntent {
  key: NotifyKey;
  slot: string;
  audience: "customer" | "team";
}

function slotOf(record: Record<string, unknown>): string {
  const start = appointmentStart(record);
  return start ? start.toISOString() : firstText(record, ["scheduledDate", "scheduledTime"]) || "unscheduled";
}

function changedSchedule(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return slotOf(before) !== slotOf(after) && slotOf(after) !== "unscheduled";
}

/** Which emails a new event should attempt. Account emails are never included. */
export function intentsForEvent(event: {
  type: "order_placed" | "appointment_scheduled" | "appointment_changed" | "appointment_canceled" | "appointment_postponed" | "listing_delivered" | "order_fulfilled" | "payment_processed";
  before?: Record<string, unknown>;
  after: Record<string, unknown>;
}): NotifyIntent[] {
  const after = event.after || {};
  const before = event.before || {};
  const slot = slotOf(after);
  const intents: NotifyIntent[] = [];
  const add = (key: NotifyKey, audience: "customer" | "team", useSlot = "") => {
    intents.push({ key, audience, slot: useSlot });
  };
  if (event.type === "order_placed") {
    add("customer_order_confirmation", "customer");
    add("creator_order_received", "team");
  }
  if (event.type === "appointment_scheduled" || (event.type === "appointment_changed" && !appointmentStart(before) && appointmentStart(after))) {
    add("customer_appointment_scheduled", "customer", slot);
    add("creator_appointment_scheduled", "team", slot);
  }
  if (event.type === "appointment_changed" && appointmentStart(before) && changedSchedule(before, after)) {
    add("customer_appointment_rescheduled", "customer", slot);
    add("creator_appointment_rescheduled", "team", slot);
  }
  if (event.type === "appointment_changed") {
    const prev = firstText(before, ["assignedPhotographerId", "photographerId"]);
    const next = firstText(after, ["assignedPhotographerId", "photographerId"]);
    if (next && next !== prev) add("creator_appointment_assigned", "team", `${next}:${slot}`);
    if (prev && !next) add("creator_appointment_unassigned", "team", prev);
  }
  if (event.type === "appointment_canceled") {
    add("customer_appointment_canceled", "customer", slot);
    add("creator_appointment_canceled", "team", slot);
  }
  if (event.type === "appointment_postponed") {
    add("customer_appointment_postponed", "customer", slot);
    add("creator_appointment_postponed", "team", slot);
  }
  if (event.type === "listing_delivered") {
    if (isShowcaseDelivery(after)) add("listing_delivery_showcase_select", "customer", "showcase");
    else add("listing_delivery", "customer", "delivery");
  }
  if (event.type === "order_fulfilled" && orderUnpaid(after)) {
    add("customer_order_payment_required", "customer", "due");
  }
  if (event.type === "payment_processed") {
    add("creator_order_payment_processed", "team", firstText(after, ["paymentId", "squarePaymentId", "stripePaymentIntentId"]) || slot);
  }
  return intents;
}

export function reminderDueAt(startIso: string, hoursBefore: number): string | null {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() - normalizeReminderHours(hoursBefore) * 60 * 60 * 1000).toISOString();
}

export function overdueDueAt(fulfilledAtIso: string): string | null {
  const start = new Date(fulfilledAtIso);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + PAYMENT_OVERDUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** 7:00am America/Chicago on the appointment's Chicago calendar day. */
export function dailySummaryDueAt(startIso: string): string | null {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const parts = chicagoDateParts(start);
  return chicagoWallTime(parts.year, parts.month, parts.day, 7, 0).toISOString();
}

export function chicagoDayKey(startIso: string): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";
  const parts = chicagoDateParts(start);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

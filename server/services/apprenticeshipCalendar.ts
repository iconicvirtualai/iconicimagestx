import { google } from "googleapis";
import {
  APPRENTICESHIP_CALENDAR_SCOPE,
  apprenticeshipCalendarSetupNote,
  apprenticeshipHoursFromEnv,
  findApprenticeshipPackage,
  openApprenticeshipSlots,
  type ApprenticeshipHours,
  type ApprenticeshipSlot,
} from "../../shared/apprenticeship";

export interface BusyInterval {
  start: string;
  end: string;
}

export interface FreeBusyRead {
  busy: BusyInterval[];
  error: boolean;
}

export interface ApprenticeshipAvailability {
  available: boolean;
  slots: ApprenticeshipSlot[];
  durationMinutes: number;
  calendarId: string;
  serviceAccountEmail: string | null;
  missingCredentials: boolean;
  setupNote: string | null;
}

export interface ApprenticeshipEventInput {
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  packageName: string;
  slot: ApprenticeshipSlot;
  notes?: string;
  /**
   * Unpaid hold until the $25 booking fee is paid. The event stays opaque and
   * confirmed so free/busy still blocks the slot; only the title and notes say HOLD.
   */
  hold?: boolean;
}

export const APPRENTICESHIP_HOLD_PREFIX = "HOLD · $25 fee due · ";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function firebaseServiceAccount(
  env: Record<string, string | undefined> = process.env,
): ServiceAccount | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
    const client_email = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
    const private_key = typeof parsed.private_key === "string" ? parsed.private_key.replace(/\\n/g, "\n") : "";
    if (!client_email || !private_key.includes("PRIVATE KEY")) return null;
    return { client_email, private_key };
  } catch {
    return null;
  }
}

export function calendarAuthFromAccount(
  account: ServiceAccount | null,
  env: Record<string, string | undefined> = process.env,
) {
  if (!account) return null;
  const subject = env.APPRENTICESHIP_CALENDAR_SUBJECT?.trim();
  return new google.auth.JWT({
    email: account.client_email,
    key: account.private_key,
    scopes: [APPRENTICESHIP_CALENDAR_SCOPE],
    subject: subject || undefined,
  });
}

export async function availabilityFromFreeBusy(input: {
  now: Date;
  packageId: string;
  hours?: ApprenticeshipHours;
  accountEmail: string | null;
  query: () => Promise<FreeBusyRead>;
}): Promise<ApprenticeshipAvailability> {
  const hours = input.hours ?? apprenticeshipHoursFromEnv();
  const pkg = findApprenticeshipPackage(input.packageId);
  const durationMinutes = pkg?.durationMinutes ?? 20;
  const setup = (missingCredentials: boolean) => apprenticeshipCalendarSetupNote({
    calendarId: hours.calendarId,
    serviceAccountEmail: input.accountEmail,
    missingCredentials,
  });
  if (!input.accountEmail) {
    return {
      available: false,
      slots: [],
      durationMinutes,
      calendarId: hours.calendarId,
      serviceAccountEmail: null,
      missingCredentials: true,
      setupNote: setup(true),
    };
  }
  try {
    const read = await input.query();
    if (read.error) {
      return {
        available: false,
        slots: [],
        durationMinutes,
        calendarId: hours.calendarId,
        serviceAccountEmail: input.accountEmail,
        missingCredentials: false,
        setupNote: setup(false),
      };
    }
    return {
      available: true,
      slots: openApprenticeshipSlots({
        now: input.now,
        busy: read.busy,
        durationMinutes,
        hours,
      }),
      durationMinutes,
      calendarId: hours.calendarId,
      serviceAccountEmail: input.accountEmail,
      missingCredentials: false,
      setupNote: null,
    };
  } catch (error) {
    console.error("[Apprenticeship] Calendar freeBusy failed:", error);
    return {
      available: false,
      slots: [],
      durationMinutes,
      calendarId: hours.calendarId,
      serviceAccountEmail: input.accountEmail,
      missingCredentials: false,
      setupNote: setup(false),
    };
  }
}

export async function queryStevenFreeBusy(input: {
  timeMin: string;
  timeMax: string;
  hours?: ApprenticeshipHours;
  env?: Record<string, string | undefined>;
}): Promise<FreeBusyRead & { email: string | null }> {
  const env = input.env ?? process.env;
  const account = firebaseServiceAccount(env);
  const auth = calendarAuthFromAccount(account, env);
  const hours = input.hours ?? apprenticeshipHoursFromEnv(env);
  if (!auth || !account) return { busy: [], error: true, email: null };
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      timeZone: hours.timeZone,
      items: [{ id: hours.calendarId }],
    },
  });
  const entry = response.data.calendars?.[hours.calendarId];
  const errors = entry?.errors || [];
  const busy = (entry?.busy || [])
    .map((block) => ({ start: block.start || "", end: block.end || "" }))
    .filter((block) => block.start && block.end);
  return { busy, error: errors.length > 0, email: account.client_email };
}

export async function readApprenticeshipAvailability(input: {
  packageId: string;
  now?: Date;
  env?: Record<string, string | undefined>;
}): Promise<ApprenticeshipAvailability> {
  const env = input.env ?? process.env;
  const hours = apprenticeshipHoursFromEnv(env);
  const now = input.now ?? new Date();
  const account = firebaseServiceAccount(env);
  const timeMax = new Date(now.getTime() + (hours.horizonDays + 1) * 24 * 60 * 60 * 1000);
  return availabilityFromFreeBusy({
    now,
    packageId: input.packageId,
    hours,
    accountEmail: account?.client_email ?? null,
    query: async () => {
      const read = await queryStevenFreeBusy({
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        hours,
        env,
      });
      return { busy: read.busy, error: read.error };
    },
  });
}

export async function createApprenticeshipEvent(
  booking: ApprenticeshipEventInput,
  env: Record<string, string | undefined> = process.env,
): Promise<{ calendarId: string; eventId: string | null; htmlLink: string | null } | null> {
  const account = firebaseServiceAccount(env);
  const auth = calendarAuthFromAccount(account, env);
  if (!auth) return null;
  const hours = apprenticeshipHoursFromEnv(env);
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.insert({
    calendarId: hours.calendarId,
    sendUpdates: "none",
    requestBody: {
      summary: `${booking.hold ? APPRENTICESHIP_HOLD_PREFIX : ""}Apprenticeship: ${booking.clientName}`,
      location: booking.address,
      description: [
        `Order: ${booking.orderNumber}`,
        `Package: ${booking.packageName}`,
        `Client: ${booking.clientName}`,
        `Email: ${booking.clientEmail}`,
        `Phone: ${booking.clientPhone}`,
        booking.hold
          ? "Booking fee: $25 NOT PAID YET. Hold until the Square payment lands."
          : "Booking fee: $25, credited toward the package",
        "Balance invoiced after the shoot",
        booking.notes ? `Notes: ${booking.notes}` : "",
      ].filter(Boolean).join("\n"),
      start: { dateTime: booking.slot.start, timeZone: hours.timeZone },
      end: { dateTime: booking.slot.end, timeZone: hours.timeZone },
      extendedProperties: {
        private: {
          orderNumber: booking.orderNumber,
          source: "apprenticeship",
        },
      },
    },
  });
  return {
    calendarId: hours.calendarId,
    eventId: response.data.id || null,
    htmlLink: response.data.htmlLink || null,
  };
}

/**
 * Called after the $25 booking fee is recorded. Drops the HOLD title and marks
 * the fee paid in the event notes. Best effort: returns false when the calendar is not reachable.
 */
export async function confirmApprenticeshipEvent(
  input: { calendarId?: string | null; eventId: string; orderNumber?: string },
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const account = firebaseServiceAccount(env);
  const auth = calendarAuthFromAccount(account, env);
  if (!auth || !input.eventId) return false;
  const hours = apprenticeshipHoursFromEnv(env);
  const calendarId = input.calendarId || hours.calendarId;
  const calendar = google.calendar({ version: "v3", auth });
  const current = await calendar.events.get({ calendarId, eventId: input.eventId });
  const summary = String(current.data.summary || "").replace(APPRENTICESHIP_HOLD_PREFIX, "");
  const description = String(current.data.description || "").replace(
    "Booking fee: $25 NOT PAID YET. Hold until the Square payment lands.",
    "Booking fee: $25 PAID, credited toward the package",
  );
  await calendar.events.patch({
    calendarId,
    eventId: input.eventId,
    sendUpdates: "none",
    requestBody: { summary, description },
  });
  return true;
}

/**
 * Deletes an unpaid HOLD so the slot opens again. A missing event counts as deleted.
 * Returns false when the calendar is not reachable.
 */
export async function deleteApprenticeshipEvent(
  input: { calendarId?: string | null; eventId: string },
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const account = firebaseServiceAccount(env);
  const auth = calendarAuthFromAccount(account, env);
  if (!auth || !input.eventId) return false;
  const hours = apprenticeshipHoursFromEnv(env);
  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({
      calendarId: input.calendarId || hours.calendarId,
      eventId: input.eventId,
      sendUpdates: "none",
    });
  } catch (error) {
    const code = Number((error as { code?: unknown })?.code ?? (error as { status?: unknown })?.status);
    if (code === 404 || code === 410) return true;
    throw error;
  }
  return true;
}

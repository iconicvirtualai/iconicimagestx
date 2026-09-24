import { google } from "googleapis";

export interface CalendarBooking {
  orderId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  address: string;
  services: string[];
  scheduledDate?: Date | null;
  scheduledTime?: string | null;
  photographerEmail?: string | null;
  photographerCalendarId?: string | null;
  photographerName?: string | null;
  notes?: string;
}

export interface CalendarSource {
  id: string;
  name?: string;
}

export interface CalendarScheduleEvent {
  id: string;
  calendarId: string;
  photographerName: string;
  summary: string;
  location: string;
  description: string;
  start: string | null;
  end: string | null;
  htmlLink: string | null;
}

function getPrivateKey() {
  return (process.env.GOOGLE_CALENDAR_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail || !privateKey) return null;

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function parseTime(time?: string | null) {
  if (!time) return { hours: 9, minutes: 0 };
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return { hours: 9, minutes: 0 };

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridian = match[3]?.toUpperCase();

  if (meridian === "PM" && hours < 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

function eventTimes(date?: Date | null, time?: string | null) {
  if (!date) return null;
  const { hours, minutes } = parseTime(time);
  const datePart = date.toISOString().slice(0, 10);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + Number(process.env.DEFAULT_APPOINTMENT_DURATION_MINUTES || 90);
  const hhmm = (totalMinutes: number) => {
    const dayMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hh = Math.floor(dayMinutes / 60).toString().padStart(2, "0");
    const mm = (dayMinutes % 60).toString().padStart(2, "0");
    return `${hh}:${mm}:00`;
  };

  return {
    start: `${datePart}T${hhmm(startMinutes)}`,
    end: `${datePart}T${hhmm(endMinutes)}`,
  };
}

export async function createCalendarBookingEvent(booking: CalendarBooking) {
  const auth = getAuth();
  const times = eventTimes(booking.scheduledDate, booking.scheduledTime);
  if (!auth || !times) return null;

  const calendarId =
    booking.photographerCalendarId ||
    booking.photographerEmail ||
    process.env.GOOGLE_CALENDAR_ID ||
    "primary";

  const calendar = google.calendar({ version: "v3", auth });
  const summary = `Iconic Images: ${booking.clientName}`;
  const description = [
    `Order: ${booking.orderId}`,
    `Client: ${booking.clientName}`,
    booking.clientEmail ? `Email: ${booking.clientEmail}` : "",
    booking.clientPhone ? `Phone: ${booking.clientPhone}` : "",
    booking.photographerName ? `Photographer: ${booking.photographerName}` : "",
    booking.services.length ? `Services: ${booking.services.join(", ")}` : "",
    booking.notes ? `Notes: ${booking.notes}` : "",
  ].filter(Boolean).join("\n");

  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody: {
      summary,
      location: booking.address,
      description,
      start: { dateTime: times.start, timeZone: "America/Chicago" },
      end: { dateTime: times.end, timeZone: "America/Chicago" },
      extendedProperties: {
        private: {
          orderId: booking.orderId,
          source: "iconicimagestx",
        },
      },
    },
  });

  return {
    calendarId,
    eventId: response.data.id || null,
    htmlLink: response.data.htmlLink || null,
  };
}

export async function verifyCalendarWriteAccess() {
  const auth = getAuth();
  if (!auth) {
    throw new Error("Google Calendar service account is not configured.");
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 5);

  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody: {
      summary: "Iconic Calendar Health Check",
      description: "Temporary event created by Iconic Images to verify booking calendar write access.",
      start: { dateTime: start.toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: end.toISOString(), timeZone: "America/Chicago" },
      extendedProperties: {
        private: {
          source: "iconicimagestx-health-check",
        },
      },
    },
  });

  const eventId = response.data.id;
  if (eventId) {
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: "none",
    });
  }

  return {
    calendarId,
    eventId: eventId || null,
  };
}

export async function listCalendarScheduleEvents({
  calendars,
  timeMin,
  timeMax,
}: {
  calendars: CalendarSource[];
  timeMin: string;
  timeMax: string;
}) {
  const auth = getAuth();
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });
  const uniqueCalendars = Array.from(
    new Map(
      calendars
        .filter((item) => item.id)
        .map((item) => [item.id.toLowerCase(), item])
    ).values()
  );

  const results = await Promise.allSettled(
    uniqueCalendars.map(async (source) => {
      const response = await calendar.events.list({
        calendarId: source.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });

      return (response.data.items || []).map((event): CalendarScheduleEvent => ({
        id: event.id || `${source.id}-${event.iCalUID || event.htmlLink || event.summary}`,
        calendarId: source.id,
        photographerName: source.name || source.id,
        summary: event.summary || "Untitled appointment",
        location: event.location || "",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        htmlLink: event.htmlLink || null,
      }));
    })
  );

  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.error(`[Calendar] Failed to read ${uniqueCalendars[index]?.id}:`, result.reason);
    return [];
  });
}

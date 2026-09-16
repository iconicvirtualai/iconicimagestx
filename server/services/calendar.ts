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
  const start = new Date(date);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + Number(process.env.DEFAULT_APPOINTMENT_DURATION_MINUTES || 90));
  return { start, end };
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
      start: { dateTime: times.start.toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: times.end.toISOString(), timeZone: "America/Chicago" },
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

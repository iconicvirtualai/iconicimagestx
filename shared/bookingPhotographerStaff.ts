/**
 * Public booking photographer id → Firebase Auth uid.
 * Calendar addresses stay in the server photographer list.
 * This map is the optional override. An empty value means the uid is still
 * unknown and accept-time matching has to find the staff doc.
 */

export const BOOKING_PHOTOGRAPHER_STAFF_UIDS: Record<string, string> = {
  "mike-luna": "",
  "armando-martinez": "",
  "daniel-adaclog": "",
  "steven-banda": "",
  "pedro-hernandez": "",
  "david-gonzalez": "",
  "cadi-torres": "",
};

export interface BookingStaffIdentity {
  id: string;
  email?: unknown;
  googleCalendarId?: unknown;
  name?: unknown;
}

export interface ResolvedBookingPhotographer {
  uid: string | null;
  name: string | null;
  publicId: string;
}

export function missingBookingPhotographerStaffUids(): string[] {
  return Object.entries(BOOKING_PHOTOGRAPHER_STAFF_UIDS)
    .filter(([, uid]) => !String(uid || "").trim())
    .map(([id]) => id);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Match a staff doc by calendar email. Never treat the public slug as a uid. */
export function resolveBookingPhotographerStaff(input: {
  publicId: string;
  calendarId?: string | null;
  name?: string | null;
  staff?: BookingStaffIdentity[];
}): ResolvedBookingPhotographer {
  const publicId = input.publicId.trim();
  const configured = String(BOOKING_PHOTOGRAPHER_STAFF_UIDS[publicId] || "").trim();
  const calendar = text(input.calendarId);
  const match = calendar
    ? (input.staff || []).find((member) => text(member.email) === calendar || text(member.googleCalendarId) === calendar)
    : undefined;
  const candidate = String(match?.id || configured || "").trim();
  const uid = candidate && candidate !== publicId ? candidate : null;
  const matchedName = typeof match?.name === "string" ? match.name.trim() : "";
  return {
    uid,
    name: (input.name || "").trim() || matchedName || null,
    publicId,
  };
}

/** Fields the photographer portal query already understands. */
export function listingPhotographerAssignment(resolved: ResolvedBookingPhotographer): {
  photographerUid: string;
  photographerIds: string[];
  photographerNames: string[];
  bookingPhotographerId: string;
  assignedPhotographerName: string | null;
} | null {
  if (!resolved.uid) return null;
  return {
    photographerUid: resolved.uid,
    photographerIds: [resolved.uid],
    photographerNames: resolved.name ? [resolved.name] : [],
    bookingPhotographerId: resolved.publicId,
    assignedPhotographerName: resolved.name,
  };
}

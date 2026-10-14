/**
 * Write the assigned shooter's staff uid onto a listing.
 * Does not copy calendar addresses onto the listing.
 */

import admin from "firebase-admin";
import {
  listingPhotographerAssignment,
  resolveBookingPhotographerStaff,
  type BookingStaffIdentity,
} from "../../shared/bookingPhotographerStaff";
import { bookingPhotographerById } from "./bookingPhotographers";

const db = () => admin.firestore();

export async function assignBookingPhotographerToListing(
  listingId: string,
  request: Record<string, unknown>,
): Promise<{ uid: string | null; publicId: string }> {
  const id = listingId.trim();
  const publicId = typeof request.bookingPhotographerId === "string" ? request.bookingPhotographerId.trim() : "";
  if (!id || !publicId) return { uid: null, publicId };
  const person = bookingPhotographerById(publicId);
  const staffSnap = await db().collection("staff").limit(200).get();
  const staff: BookingStaffIdentity[] = staffSnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      email: data.email,
      googleCalendarId: data.googleCalendarId,
      name: data.name,
    };
  });
  const resolved = resolveBookingPhotographerStaff({
    publicId,
    calendarId: person?.calendarId || null,
    name: person?.name || (typeof request.assignedPhotographerName === "string" ? request.assignedPhotographerName : null),
    staff,
  });
  const patch = listingPhotographerAssignment(resolved);
  if (!patch) return { uid: null, publicId };
  await db().collection("listings").doc(id).set({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { uid: patch.photographerUid, publicId };
}

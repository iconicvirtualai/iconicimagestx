/**
 * Admin-only read of one photographer's portal.
 * GET returns listings and studio job labels. It does not upload, write,
 * or send email or SMS.
 */

import admin from "firebase-admin";
import { jsonSafe } from "../lib/firestoreJson";

const db = () => admin.firestore();

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const PRIVATE_KEY = /email|phone|sms|token|secret|password/i;

export function previewListing(id: string, data: FirebaseFirestore.DocumentData): Record<string, unknown> {
  const row = jsonSafe({ id, ...data }) as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (PRIVATE_KEY.test(key)) delete row[key];
  }
  return row;
}

export function previewStudioJob(data: Record<string, unknown>): {
  listingId: string;
  status: string;
  origin: string;
  sourcePath: string;
  type: string;
  label: string;
} | null {
  const listingId = text(data.listingId);
  if (!listingId) return null;
  return {
    listingId,
    status: text(data.status),
    origin: text(data.origin),
    sourcePath: text(data.sourcePath),
    type: text(data.type),
    label: text(data.label),
  };
}

export async function loadPhotographerPreview(staffId: string) {
  const staffSnap = await db().collection("staff").doc(staffId).get();
  if (!staffSnap.exists) throw httpError(404, "Photographer not found.");
  const staff = staffSnap.data() || {};
  if (staff.isActive === false || staff.role !== "photographer") {
    throw httpError(404, "Photographer not found.");
  }

  const [byUid, byIds, jobSnap] = await Promise.all([
    db().collection("listings").where("photographerUid", "==", staffId).limit(50).get(),
    db().collection("listings").where("photographerIds", "array-contains", staffId).limit(50).get(),
    db().collection("editJobs").limit(200).get(),
  ]);
  const merged = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of [...byUid.docs, ...byIds.docs]) merged.set(doc.id, doc);
  const listings = [...merged.values()].map((doc) => previewListing(doc.id, doc.data() || {}));
  const allowed = new Set(listings.map((listing) => text(listing.id)));
  const studioJobs = jobSnap.docs
    .map((doc) => previewStudioJob(doc.data() || {}))
    .filter((job): job is NonNullable<typeof job> => Boolean(job && allowed.has(job.listingId)));

  return {
    photographer: {
      id: staffId,
      firstName: text(staff.firstName) || "Photographer",
      payRate: typeof staff.payRate === "number" && staff.payRate > 0 ? staff.payRate : 75,
    },
    listings,
    studioJobs,
  };
}

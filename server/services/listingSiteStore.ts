/**
 * Published listing sites, keyed by address slug.
 * Tests keep the same shape in memory.
 */

import admin from "firebase-admin";
import { buildPublicListingSite, isListingSiteSlug, type PublicListingSite } from "../../shared/listingSite";
import { jsonSafe } from "../lib/firestoreJson";

const memory = new Map<string, Record<string, unknown>>();

export function resetListingSiteMemory() {
  memory.clear();
}

export function seedListingSite(listing: Record<string, unknown>) {
  const id = typeof listing.id === "string" ? listing.id : "";
  if (id) memory.set(id, listing);
}

function useMemory(): boolean {
  return !admin.apps.length || process.env.NODE_ENV === "test" || process.env.LISTING_SITE_STORE === "memory";
}

export async function readPublishedListingSite(slug: string): Promise<PublicListingSite | null> {
  if (!isListingSiteSlug(slug)) return null;
  if (useMemory()) {
    for (const listing of memory.values()) {
      const site = buildPublicListingSite(listing);
      if (site?.slug === slug) return site;
    }
    return null;
  }
  const snap = await admin.firestore().collection("listings").where("listingSiteSlug", "==", slug).limit(5).get();
  for (const doc of snap.docs) {
    const listing = jsonSafe({ id: doc.id, ...(doc.data() || {}) }) as Record<string, unknown>;
    const site = buildPublicListingSite(listing);
    if (site?.slug === slug) return site;
  }
  return null;
}

export async function saveListingSiteInquiry(slug: string, inquiry: { name: string; contact: string; when: string; at: string }): Promise<boolean> {
  if (!isListingSiteSlug(slug)) return false;
  if (useMemory()) {
    for (const listing of memory.values()) {
      const site = buildPublicListingSite(listing);
      if (site?.slug !== slug) continue;
      const existing = Array.isArray(listing.listingSiteInquiries) ? listing.listingSiteInquiries : [];
      listing.listingSiteInquiries = [...existing, inquiry].slice(-50);
      return true;
    }
    return false;
  }
  const snap = await admin.firestore().collection("listings").where("listingSiteSlug", "==", slug).limit(5).get();
  for (const doc of snap.docs) {
    const listing = jsonSafe({ id: doc.id, ...(doc.data() || {}) }) as Record<string, unknown>;
    const site = buildPublicListingSite(listing);
    if (site?.slug !== slug) continue;
    await doc.ref.update({
      listingSiteInquiries: admin.firestore.FieldValue.arrayUnion(inquiry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }
  return false;
}

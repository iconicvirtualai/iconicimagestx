/**
 * Batched read of orders and invoices for the admin listings price.
 * Firestore only. This does not write listings, orders, or invoices.
 */

import { collection, documentId, getDocs, query, where, type QueryDocumentSnapshot } from "firebase/firestore";
import {
  chunkIds,
  loadListingBillingIndex,
  loadListingPriceIndex,
  type ListingPriceCollection,
  type ListingPriceDoc,
  type ListingPriceReader,
} from "@shared/listingPrice";
import { db } from "@/lib/firebase";

function asDoc(snap: QueryDocumentSnapshot): ListingPriceDoc {
  return { ...(snap.data() as Record<string, unknown>), id: snap.id };
}

async function readChunks(
  collectionName: ListingPriceCollection,
  field: string | ReturnType<typeof documentId>,
  values: string[],
): Promise<ListingPriceDoc[]> {
  const docs: ListingPriceDoc[] = [];
  for (const part of chunkIds(values)) {
    const snap = await getDocs(query(collection(db, collectionName), where(field, "in", part)));
    snap.docs.forEach((entry) => docs.push(asDoc(entry)));
  }
  return docs;
}

export const firestoreListingPriceReader: ListingPriceReader = {
  byIds(collectionName, ids) {
    return readChunks(collectionName, documentId(), ids);
  },
  byField(collectionName, field, values) {
    return readChunks(collectionName, field, values);
  },
};

export function loadAdminListingPrices(listings: Record<string, unknown>[]) {
  return loadListingPriceIndex(listings, firestoreListingPriceReader);
}

/** Price fallback and project status share this one batched read. */
export function loadAdminListingBilling(listings: Record<string, unknown>[]) {
  return loadListingBillingIndex(listings, firestoreListingPriceReader);
}

/**
 * Writes the order, listing, and order-request status for one Studio step.
 * Does not send email or SMS.
 */

import admin from "firebase-admin";
import { nextOrderPipelineStatus, type StudioPipelineStep } from "../../shared/studioPipeline";

const db = () => admin.firestore();

async function advanceDoc(collection: "orders" | "orderRequests", id: unknown, step: StudioPipelineStep) {
  if (typeof id !== "string" || !id.trim()) return "";
  const ref = db().collection(collection).doc(id.trim());
  const snap = await ref.get();
  if (!snap.exists) return "";
  const current = snap.data()?.status;
  const status = nextOrderPipelineStatus(current, step);
  if (status !== String(current || "")) {
    await ref.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return status;
}

export async function advanceStudioPipeline(listingId: string, step: StudioPipelineStep) {
  const listingRef = db().collection("listings").doc(listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return { listingStatus: "", orderStatus: "" };
  const listing = snap.data() || {};
  const listingStatus = nextOrderPipelineStatus(listing.status, step);
  if (listingStatus !== String(listing.status || "")) {
    await listingRef.update({
      status: listingStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  const orderStatus = await advanceDoc("orders", listing.orderId, step);
  await advanceDoc("orderRequests", listing.orderRequestId, step);
  return { listingStatus, orderStatus: orderStatus || listingStatus };
}

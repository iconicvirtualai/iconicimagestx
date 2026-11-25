/**
 * Seed one TEST studio pipeline order in the Firebase emulators.
 * Fake client, no phone, no live email. Refuses to run outside the emulators.
 */

import admin from "firebase-admin";

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "iconic-images-aicon";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing to seed. Start the Firebase emulators first. This script does not touch production.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "iconic-images-aicon.firebasestorage.app",
  });
}

export const STUDIO_PIPELINE = {
  photographerUid: "photo-studio-pipeline",
  photographerEmail: "photo.studio.pipeline@example.com",
  photographerPassword: "PhotoTest!9599",
  clientUid: "client-studio-pipeline",
  clientEmail: "test.studio.pipeline@example.com",
  clientPassword: "StudioTest!9599",
  clientId: "crm-studio-pipeline",
  clientName: "TEST - Studio Pipeline",
  listingId: "teststudio01",
  orderId: "testorder221",
  requestId: "testrequest221",
  orderNumber: "#221",
  address: "221 Test Studio Lane",
} as const;

async function user(uid: string, email: string, password: string) {
  try {
    await admin.auth().getUser(uid);
    await admin.auth().updateUser(uid, { email, password, emailVerified: true });
  } catch {
    await admin.auth().createUser({ uid, email, password, emailVerified: true });
  }
}

const now = new Date().toISOString();
await user(STUDIO_PIPELINE.photographerUid, STUDIO_PIPELINE.photographerEmail, STUDIO_PIPELINE.photographerPassword);
await user(STUDIO_PIPELINE.clientUid, STUDIO_PIPELINE.clientEmail, STUDIO_PIPELINE.clientPassword);

const db = admin.firestore();
await db.collection("staff").doc(STUDIO_PIPELINE.photographerUid).set({
  firebaseUid: STUDIO_PIPELINE.photographerUid,
  firstName: "TEST",
  lastName: "Photographer",
  email: STUDIO_PIPELINE.photographerEmail,
  role: "photographer",
  isActive: true,
  createdAt: now,
});
await db.collection("clients").doc(STUDIO_PIPELINE.clientUid).set({
  firebaseUid: STUDIO_PIPELINE.clientUid,
  firstName: "TEST",
  lastName: "Studio Pipeline",
  name: STUDIO_PIPELINE.clientName,
  email: STUDIO_PIPELINE.clientEmail,
  company: "TEST Brokerage",
  portalAccess: true,
  status: "active",
  linkedClientId: STUDIO_PIPELINE.clientId,
  testOrder: true,
  createdAt: now,
});
await db.collection("clients").doc(STUDIO_PIPELINE.clientId).set({
  firebaseUid: STUDIO_PIPELINE.clientUid,
  firstName: "TEST",
  lastName: "Studio Pipeline",
  name: STUDIO_PIPELINE.clientName,
  email: STUDIO_PIPELINE.clientEmail,
  company: "TEST Brokerage",
  portalAccess: true,
  status: "active",
  testOrder: true,
  createdAt: now,
});

const order = {
  orderNumber: STUDIO_PIPELINE.orderNumber,
  listingId: STUDIO_PIPELINE.listingId,
  clientId: STUDIO_PIPELINE.clientId,
  clientName: STUDIO_PIPELINE.clientName,
  clientEmail: STUDIO_PIPELINE.clientEmail,
  email: STUDIO_PIPELINE.clientEmail,
  status: "scheduled",
  address: STUDIO_PIPELINE.address,
  services: ["TEST listing photos"],
  lineItems: [{ name: "TEST listing photos", price: 0, qty: 1, category: "service" }],
  testOrder: true,
  createdAt: now,
};
await db.collection("orders").doc(STUDIO_PIPELINE.orderId).set(order);
await db.collection("orderRequests").doc(STUDIO_PIPELINE.requestId).set({
  ...order,
  firebaseUid: STUDIO_PIPELINE.clientUid,
  clientProfileId: `client:${STUDIO_PIPELINE.clientId}`,
});
const oldGalleries = await db.collection("galleries").where("listingId", "==", STUDIO_PIPELINE.listingId).get();
for (const gallery of oldGalleries.docs) await gallery.ref.delete();
await db.collection("galleries").doc(`gal${STUDIO_PIPELINE.listingId}`).delete().catch(() => undefined);
const oldJobs = await db.collection("editJobs").where("listingId", "==", STUDIO_PIPELINE.listingId).get();
for (const job of oldJobs.docs) await job.ref.delete();
await db.collection("listings").doc(STUDIO_PIPELINE.listingId).set({
  orderId: STUDIO_PIPELINE.orderId,
  orderRequestId: STUDIO_PIPELINE.requestId,
  orderNumber: STUDIO_PIPELINE.orderNumber,
  clientId: STUDIO_PIPELINE.clientId,
  firebaseUid: STUDIO_PIPELINE.clientUid,
  clientProfileId: `client:${STUDIO_PIPELINE.clientId}`,
  clientName: STUDIO_PIPELINE.clientName,
  clientEmail: STUDIO_PIPELINE.clientEmail,
  address: STUDIO_PIPELINE.address,
  status: "scheduled",
  apptDate: "2026-11-01",
  projectType: "real_estate",
  photographerUid: STUDIO_PIPELINE.photographerUid,
  photographerIds: [STUDIO_PIPELINE.photographerUid],
  services: ["TEST listing photos"],
  images: [],
  downloadsReleased: true,
  lockDownloads: false,
  downloadEnabled: true,
  testOrder: true,
  createdAt: now,
});

console.log(`Seeded TEST studio order ${STUDIO_PIPELINE.orderNumber} at ${STUDIO_PIPELINE.address}`);
process.exit(0);

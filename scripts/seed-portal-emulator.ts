/**
 * Seed the local Firebase emulators for the portal sync test.
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set, so it cannot touch production.
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

const clientUid = "client-e2e-uid";
const crmId = "crm-e2e-ada";
const adminUid = "admin-e2e-uid";
const clientEmail = "ada.lane@example.com";
const adminEmail = "admin.e2e@example.com";

async function user(uid: string, email: string, password: string) {
  try {
    await admin.auth().getUser(uid);
    await admin.auth().updateUser(uid, { email, password, emailVerified: true });
  } catch {
    await admin.auth().createUser({ uid, email, password, emailVerified: true });
  }
}

await user(clientUid, clientEmail, "PortalTest!9599");
await user(adminUid, adminEmail, "AdminTest!9599");

const db = admin.firestore();
const now = new Date().toISOString();
await db.collection("staff").doc(adminUid).set({
  firebaseUid: adminUid,
  firstName: "Casey",
  lastName: "Admin",
  email: adminEmail,
  role: "admin",
  isActive: true,
  createdAt: now,
});
await db.collection("clients").doc(clientUid).set({
  firebaseUid: clientUid,
  firstName: "Ada",
  lastName: "Lane",
  email: clientEmail,
  phone: "(281) 555-0100",
  company: "Lane Realty",
  portalAccess: true,
  status: "active",
  linkedClientId: crmId,
  createdAt: now,
});
await db.collection("clients").doc(crmId).set({
  firebaseUid: clientUid,
  firstName: "Ada",
  lastName: "Lane",
  email: clientEmail,
  phone: "(281) 555-0100",
  company: "Lane Realty",
  portalAccess: true,
  status: "active",
  createdAt: now,
});
await db.collection("listings").doc("listing-e2e").set({
  clientId: crmId,
  firebaseUid: clientUid,
  clientProfileId: "client:crm-e2e-ada",
  orderNumber: "#014",
  address: "14 Ember Lane",
  status: "scheduled",
  projectType: "real_estate",
  clientName: "Ada Lane",
  clientEmail,
  createdAt: now,
});
await db.collection("orderRequests").doc("order-e2e").set({
  clientId: crmId,
  firebaseUid: clientUid,
  clientProfileId: "client:crm-e2e-ada",
  orderNumber: "#014",
  listingId: "listing-e2e",
  status: "new",
  address: "14 Ember Lane",
  clientName: "Ada Lane",
  firstName: "Ada",
  lastName: "Lane",
  email: clientEmail,
  clientEmail,
  createdAt: now,
});

console.log("Seeded emulator client ada.lane@example.com and admin admin.e2e@example.com");
process.exit(0);

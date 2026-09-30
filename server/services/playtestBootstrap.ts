import admin from "firebase-admin";
import { PLAYTEST_ADDRESS, isStaffRole, normalizeEmail } from "../../shared/listingAccess";

const db = () => admin.firestore();

export interface PlaytestPhotographerInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: string;
  phone?: string;
}

export interface PlaytestBootstrapInput {
  photographer?: PlaytestPhotographerInput;
  clientEmail?: string;
  seedListing?: boolean;
  seedGallery?: boolean;
}

function httpError(status: number, error: string) {
  return Object.assign(new Error(error), { status });
}

export async function bootstrapPlaytest(input: PlaytestBootstrapInput) {
  const photographerInput = input.photographer || {};
  const email = normalizeEmail(photographerInput.email);
  const password = String(photographerInput.password || "");
  const firstName = String(photographerInput.firstName || "Playtest").trim().slice(0, 80);
  const lastName = String(photographerInput.lastName || "Photographer").trim().slice(0, 80);
  const role = photographerInput.role || "photographer";
  const seedListing = input.seedListing !== false;
  const seedGallery = input.seedGallery !== false;
  const clientEmail = normalizeEmail(input.clientEmail);

  if (!email || !email.includes("@")) throw httpError(400, "Photographer email is required.");
  if (password.length < 6) throw httpError(400, "Photographer password must be at least 6 characters.");
  if (!isStaffRole(role)) throw httpError(400, "Role must be admin, coordinator, photographer, or editor.");

  const photographer = await ensurePlaytestStaff({
    email,
    password,
    firstName,
    lastName,
    role,
    phone: String(photographerInput.phone || "").trim(),
  });

  let client: { id: string; email: string; name: string } | null = null;
  let clientStatus: "linked" | "not_found" | "skipped" = clientEmail ? "not_found" : "skipped";
  if (clientEmail) {
    const matches = await db().collection("clients").where("email", "==", clientEmail).limit(5).get();
    const preferred = matches.docs.find((doc) => doc.data().firebaseUid === doc.id) || matches.docs[0];
    if (preferred) {
      client = {
        id: preferred.id,
        email: clientEmail,
        name: `${preferred.data().firstName || ""} ${preferred.data().lastName || ""}`.trim() || clientEmail,
      };
      clientStatus = "linked";
    }
  }

  let listing: { id: string; address: string; status: string } | null = null;
  if (seedListing) {
    listing = await upsertPlaytestListing(photographer.uid, client);
  }

  let gallery: { id: string; urlPath: string } | null = null;
  let invoice: { id: string; urlPath: string; status: string; amountDue: number } | null = null;
  if (seedGallery && client && listing) {
    const seeded = await upsertPlaytestDelivery(photographer.uid, client, listing.id);
    gallery = seeded.gallery;
    invoice = seeded.invoice;
  }

  const origin = process.env.APP_URL || "https://iconicimagestx.vercel.app";
  return {
    photographer,
    client: client
      ? { ...client, status: clientStatus }
      : { status: clientStatus, email: clientEmail || null },
    listing,
    gallery: gallery ? { ...gallery, url: `${origin}${gallery.urlPath}` } : null,
    invoice: invoice ? { ...invoice, url: `${origin}${invoice.urlPath}` } : null,
    next: [
      `Sign in as the photographer at ${origin}/admin/login`,
      `Upload at ${origin}/admin/upload or ${origin}/admin/photographer`,
      client
        ? `Client signs in at ${origin}/portal and opens ${origin}/portal/home`
        : `Create the client at ${origin}/portal, then re-run this request with clientEmail to attach a gallery and invoice`,
    ],
  };
}

async function ensurePlaytestStaff(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string;
}) {
  let created = false;
  let user: admin.auth.UserRecord;
  try {
    user = await admin.auth().createUser({
      email: input.email,
      password: input.password,
      displayName: `${input.firstName} ${input.lastName}`.trim(),
      emailVerified: true,
    });
    created = true;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/email-already-exists") throw err;
    user = await admin.auth().getUserByEmail(input.email);
    const existing = await db().collection("staff").doc(user.uid).get();
    if (existing.exists && existing.data()?.playtest !== true) {
      throw httpError(409, "That email already belongs to a staff account that is not a playtest login. Use a different email.");
    }
    await admin.auth().updateUser(user.uid, {
      password: input.password,
      displayName: `${input.firstName} ${input.lastName}`.trim(),
      disabled: false,
    });
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const staffPayload: Record<string, unknown> = {
    firebaseUid: user.uid,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    isActive: true,
    playtest: true,
    updatedAt: now,
  };
  if (created) {
    staffPayload.createdAt = now;
    staffPayload.assignedOrders = [];
  }
  await db().collection("staff").doc(user.uid).set(staffPayload, { merge: true });

  try {
    await admin.auth().setCustomUserClaims(user.uid, { isStaff: true, role: input.role });
  } catch (err) {
    console.warn("[Staff] Playtest claims were not set. Firestore role is still used.", err);
  }

  return {
    uid: user.uid,
    email: input.email,
    role: input.role,
    created,
    playtest: true,
  };
}

async function upsertPlaytestListing(photographerUid: string, client: { id: string; email: string; name: string } | null) {
  const id = `playtest-job-${photographerUid}`;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const when = admin.firestore.Timestamp.now();
  const ref = db().collection("listings").doc(id);
  const existing = await ref.get();
  const previousImages = existing.exists && Array.isArray(existing.data()?.images) ? existing.data()!.images : [];

  await ref.set({
    playtest: true,
    propertyAddress: PLAYTEST_ADDRESS,
    address: PLAYTEST_ADDRESS,
    shootLocation: PLAYTEST_ADDRESS,
    clientName: client?.name || "Playtest Client",
    clientEmail: client?.email || "",
    clientId: client?.id || "",
    photographerUid,
    photographerIds: [photographerUid],
    assignedProviders: [{ providerId: photographerUid, role: "photographer" }],
    status: "scheduled",
    shootDate: when,
    apptDate: when,
    apptTime: "10:00 AM",
    services: ["Photography"],
    images: previousImages,
    notes: "Playtest job created for portal upload. Safe to ignore in production scheduling.",
    createdAt: existing.exists ? existing.data()?.createdAt || now : now,
    updatedAt: now,
  }, { merge: true });

  return { id, address: PLAYTEST_ADDRESS, status: "scheduled" };
}

async function upsertPlaytestDelivery(
  photographerUid: string,
  client: { id: string; email: string; name: string },
  listingId: string,
) {
  const orderId = `playtest-order-${client.id}`;
  const galleryId = `playtest-gallery-${client.id}`;
  const invoiceId = `playtest-invoice-${client.id}`;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const listingSnap = await db().collection("listings").doc(listingId).get();
  const images = listingSnap.exists && Array.isArray(listingSnap.data()?.images) ? listingSnap.data()!.images : [];
  const mediaItems = images
    .filter((image: { url?: string }) => image?.url)
    .map((image: { url: string; name?: string; path?: string; uploadedBy?: string; uploadedAt?: string; contentType?: string }, index: number) => ({
      id: `playtest-media-${index}-${image.path || image.name || "photo"}`,
      url: image.url,
      shareUrl: image.url,
      fileName: image.name || `Photo ${index + 1}`,
      title: image.name || `Photo ${index + 1}`,
      type: String(image.contentType || "").startsWith("video/") ? "video" : "photo",
      storagePath: image.path || "",
      downloadable: true,
      uploadedBy: image.uploadedBy || photographerUid,
      uploadedAt: image.uploadedAt || new Date().toISOString(),
    }));

  await db().collection("galleries").doc(galleryId).set({
    playtest: true,
    listingId,
    orderId,
    title: "Playtest Gallery",
    address: PLAYTEST_ADDRESS,
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    status: "delivered",
    downloadEnabled: true,
    mediaItems,
    deliveredAt: now,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  await db().collection("invoices").doc(invoiceId).set({
    playtest: true,
    invoiceNumber: `PLAY-${client.id.slice(0, 6).toUpperCase()}`,
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    orderId,
    galleryId,
    listingId,
    address: PLAYTEST_ADDRESS,
    lineItems: [{ name: "Playtest photography", price: 150, qty: 1, category: "service" }],
    subtotal: 150,
    tax: 0,
    total: 150,
    amountPaid: 0,
    amountDue: 150,
    status: "sent",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  await db().collection("listings").doc(listingId).set({
    playtestGalleryId: galleryId,
    clientId: client.id,
    clientEmail: client.email,
    clientName: client.name,
    updatedAt: now,
  }, { merge: true });

  return {
    gallery: { id: galleryId, urlPath: `/gallery/${galleryId}` },
    invoice: { id: invoiceId, urlPath: `/invoice/${invoiceId}`, status: "sent", amountDue: 150 },
  };
}

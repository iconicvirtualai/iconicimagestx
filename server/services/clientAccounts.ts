import admin from "firebase-admin";
import { cleanPersonName, normalizeEmail } from "../../shared/listingAccess";

const db = () => admin.firestore();

export interface PortalClientInput {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export async function upsertPortalClient(input: PortalClientInput) {
  const email = normalizeEmail(input.email);
  const firstName = cleanPersonName(input.firstName);
  const lastName = cleanPersonName(input.lastName);
  const phone = String(input.phone || "").trim().slice(0, 40);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const existing = email
    ? await db().collection("clients").where("email", "==", email).limit(5).get()
    : null;
  const linked = existing?.docs.find((doc) => doc.id !== input.uid);
  const linkedData = linked?.data() || {};

  const uidRef = db().collection("clients").doc(input.uid);
  const uidSnap = await uidRef.get();
  const previous = uidSnap.exists ? uidSnap.data() || {} : {};

  await uidRef.set({
    firebaseUid: input.uid,
    firstName: firstName || previous.firstName || "Client",
    lastName: lastName || previous.lastName || "",
    email: email || previous.email || "",
    phone: phone || previous.phone || linkedData.phone || "",
    company: previous.company || linkedData.company || "",
    address: previous.address || linkedData.address || "",
    status: "active",
    portalAccess: true,
    totalOrders: previous.totalOrders ?? linkedData.totalOrders ?? 0,
    totalSpend: previous.totalSpend ?? linkedData.totalSpend ?? 0,
    tags: previous.tags || linkedData.tags || [],
    notes: previous.notes || linkedData.notes || "",
    linkedClientId: linked?.id || previous.linkedClientId || null,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  }, { merge: true });

  if (linked) {
    await linked.ref.set({
      firebaseUid: input.uid,
      portalAccess: true,
      updatedAt: now,
    }, { merge: true });
  }

  return { id: input.uid, linkedClientId: linked?.id || null, email };
}

export async function resolveClientIdentity(uid: string, email?: string) {
  const ids = new Set<string>([uid]);
  const direct = await db().collection("clients").doc(uid).get();
  let profile: Record<string, any> | null = direct.exists ? { id: direct.id, ...direct.data() } : null;

  const redirectId = typeof profile?._redirect === "string" ? profile._redirect : "";
  if (redirectId) ids.add(redirectId);
  const linkedId = typeof profile?.linkedClientId === "string" ? profile.linkedClientId : "";
  if (linkedId) ids.add(linkedId);

  const normalized = normalizeEmail(email || (profile as { email?: string } | null)?.email);
  if (normalized) {
    const matches = await db().collection("clients").where("email", "==", normalized).limit(10).get();
    for (const doc of matches.docs) {
      ids.add(doc.id);
      if (!profile) profile = { id: doc.id, ...doc.data() };
    }
  }

  if (redirectId && profile && !profile.email) {
    const real = await db().collection("clients").doc(redirectId).get();
    if (real.exists) profile = { id: real.id, ...real.data(), portalDocId: uid };
  }

  return { ids: [...ids], profile, email: normalized };
}

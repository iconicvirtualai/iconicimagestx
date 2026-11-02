import admin from "firebase-admin";
import { cleanPersonName, normalizeEmail } from "../../shared/listingAccess";
import { ownerAllowlist } from "../../shared/ownerAccess";
import { passwordPolicyError } from "../../shared/passwordAccount";
import { isStaffRole } from "../../shared/staffAccess";
import { siteEditorAccess, type SiteEditorFlags } from "../../shared/siteEditor";

export class StaffLoginError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ProvisionStaffInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  role?: unknown;
  password?: unknown;
  tempPassword?: unknown;
  siteEditor?: unknown;
}

export interface ProvisionStaffResult {
  uid: string;
  created: boolean;
  role: string;
  mustChangePassword: true;
}

function passwordFrom(input: ProvisionStaffInput): string {
  if (typeof input.password === "string" && input.password) return input.password;
  if (typeof input.tempPassword === "string") return input.tempPassword;
  return "";
}

function httpError(status: number, message: string): StaffLoginError {
  return new StaffLoginError(status, message);
}

async function ensureAuthUser(email: string, password: string, displayName: string): Promise<{ uid: string; created: boolean }> {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(existing.uid, { password, displayName, email });
    return { uid: existing.uid, created: false };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }

  try {
    const created = await admin.auth().createUser({ email, password, displayName });
    return { uid: created.uid, created: true };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      const existing = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(existing.uid, { password, displayName, email });
      return { uid: existing.uid, created: false };
    }
    if (code === "auth/invalid-password" || code === "auth/weak-password") {
      throw httpError(400, "Password must be at least 8 characters.");
    }
    throw err;
  }
}

async function deleteManualDuplicates(email: string, authUid: string) {
  const dupes = await admin.firestore().collection("staff").where("email", "==", email).get();
  await Promise.all(dupes.docs
    .filter((entry) => entry.id !== authUid && entry.id.startsWith("manual_"))
    .map((entry) => entry.ref.delete()));
}

function editorFlags(role: string, email: string, flags: unknown): SiteEditorFlags {
  const access = siteEditorAccess({
    role,
    email,
    flags: flags && typeof flags === "object" ? flags as Partial<SiteEditorFlags> : undefined,
    ownerEmails: ownerAllowlist(process.env.OWNER_EMAILS),
  });
  return { view: access.view, edit: access.edit, publish: access.publish };
}

/** Create the Auth user, or replace the password when that email already has one. */
export async function provisionStaffLogin(input: ProvisionStaffInput): Promise<ProvisionStaffResult> {
  const firstName = cleanPersonName(input.firstName);
  const lastName = cleanPersonName(input.lastName);
  const email = normalizeEmail(input.email);
  const phone = String(input.phone || "").trim().slice(0, 40);
  const role = input.role;
  const password = passwordFrom(input);
  if (!firstName || !email || !email.includes("@") || !role) {
    throw httpError(400, "First name, email, role, and password are required.");
  }
  if (!isStaffRole(role)) throw httpError(400, "Choose a staff role.");
  const policy = passwordPolicyError(password);
  if (policy) throw httpError(400, policy);

  const displayName = `${firstName} ${lastName}`.trim();
  const { uid, created } = await ensureAuthUser(email, password, displayName);
  const db = admin.firestore();
  const ref = db.collection("staff").doc(uid);
  const existing = await ref.get();
  const prev = existing.exists ? existing.data() || {} : {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    firebaseUid: uid,
    firstName,
    lastName,
    email,
    phone: phone || prev.phone || "",
    role,
    isActive: true,
    mustChangePassword: true,
    siteEditor: editorFlags(role, email, input.siteEditor),
    assignedOrders: Array.isArray(prev.assignedOrders) ? prev.assignedOrders : [],
    createdAt: prev.createdAt || now,
    updatedAt: now,
  }, { merge: true });
  await deleteManualDuplicates(email, uid);
  return { uid, created, role, mustChangePassword: true };
}

/** Admin sets a new password on a photographer or other staff record. */
export async function setStaffPassword(staffId: string, password: unknown): Promise<{ uid: string; mustChangePassword: true }> {
  const nextPassword = String(password || "");
  const policy = passwordPolicyError(nextPassword);
  if (policy) throw httpError(400, policy);
  const db = admin.firestore();
  const snap = await db.collection("staff").doc(staffId).get();
  if (!snap.exists) throw httpError(404, "Staff member not found.");
  const data = snap.data() || {};
  const email = normalizeEmail(data.email);
  if (!email || !email.includes("@")) {
    throw httpError(400, "This team member needs an email before a password can be set.");
  }
  const firstName = cleanPersonName(data.firstName) || "Staff";
  const lastName = cleanPersonName(data.lastName);
  const { uid } = await ensureAuthUser(email, nextPassword, `${firstName} ${lastName}`.trim());
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (uid === staffId) {
    await db.collection("staff").doc(uid).update({
      firebaseUid: uid,
      mustChangePassword: true,
      updatedAt: now,
    });
  } else {
    const prev = snap.data() || {};
    await db.collection("staff").doc(uid).set({
      ...prev,
      firebaseUid: uid,
      email,
      mustChangePassword: true,
      updatedAt: now,
      createdAt: prev.createdAt || now,
    }, { merge: true });
    if (staffId.startsWith("manual_")) await snap.ref.delete();
  }
  await deleteManualDuplicates(email, uid);
  return { uid, mustChangePassword: true };
}

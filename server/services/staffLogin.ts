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
  replaceExisting?: unknown;
}

export interface StaffLoginActor {
  uid: string;
  email?: string | null;
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

const CLIENT_TAKEN = "That email belongs to a client account. The password and role were not changed.";
const ADMIN_TAKEN = "That email belongs to an admin. The password and role were not changed.";
const REPLACE_REQUIRED = "That email already has a login. Check Replace existing login to set a new password. Nothing was changed.";

async function findAuthUser(email: string): Promise<admin.auth.UserRecord | null> {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "auth/user-not-found") return null;
    throw err;
  }
}

async function clientLinked(uid: string, email: string): Promise<boolean> {
  const db = admin.firestore();
  const byId = await db.collection("clients").doc(uid).get();
  if (byId.exists) return true;
  const [byEmail, byUid] = await Promise.all([
    db.collection("clients").where("email", "==", email).limit(1).get(),
    db.collection("clients").where("firebaseUid", "==", uid).limit(1).get(),
  ]);
  return !byEmail.empty || !byUid.empty;
}

async function staffLoginFor(uid: string, email: string): Promise<{ id: string; role: string } | null> {
  const db = admin.firestore();
  const direct = await db.collection("staff").doc(uid).get();
  if (direct.exists) {
    const role = direct.data()?.role;
    if (typeof role === "string" && role) return { id: direct.id, role };
  }
  const matches = await db.collection("staff").where("email", "==", email).get();
  const found = matches.docs.find((entry) => !entry.id.startsWith("manual_") && typeof entry.data()?.role === "string");
  if (!found) return null;
  return { id: found.id, role: String(found.data().role) };
}

async function stampMustChangeClaim(uid: string) {
  const record = await admin.auth().getUser(uid);
  const claims = { ...(record.customClaims || {}), mustChangePassword: true };
  await admin.auth().setCustomUserClaims(uid, claims);
  await admin.auth().revokeRefreshTokens(uid);
}

function logReplacement(actor: StaffLoginActor, target: { uid: string; email: string; previousRole: string | null; nextRole: string | null }) {
  console.info("[Staff] Replaced existing login", JSON.stringify({
    actorUid: actor.uid,
    actorEmail: actor.email || null,
    targetUid: target.uid,
    targetEmail: target.email,
    previousRole: target.previousRole,
    nextRole: target.nextRole,
  }));
}

/**
 * Create an Auth user, or set a password on an existing one only when the
 * admin checked Replace existing login. Client logins and admin roles are
 * never taken over.
 */
async function ensureAuthUser(input: {
  email: string;
  password: string;
  displayName: string;
  replaceExisting: boolean;
  requestedRole: string | null;
  actor: StaffLoginActor;
}): Promise<{ uid: string; created: boolean }> {
  const existing = await findAuthUser(input.email);
  if (!existing) {
    try {
      const created = await admin.auth().createUser({
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      });
      await stampMustChangeClaim(created.uid);
      return { uid: created.uid, created: true };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/email-already-exists") {
        if (code === "auth/invalid-password" || code === "auth/weak-password") {
          throw httpError(400, "Password must be at least 8 characters.");
        }
        throw err;
      }
    }
  }

  const user = existing || await admin.auth().getUserByEmail(input.email);
  if (await clientLinked(user.uid, input.email)) throw httpError(409, CLIENT_TAKEN);
  const staff = await staffLoginFor(user.uid, input.email);
  if (staff?.role === "admin" && input.requestedRole !== null) throw httpError(409, ADMIN_TAKEN);
  if (!input.replaceExisting) throw httpError(409, REPLACE_REQUIRED);

  await admin.auth().updateUser(user.uid, {
    password: input.password,
    displayName: input.displayName,
    email: input.email,
  });
  await stampMustChangeClaim(user.uid);
  logReplacement(input.actor, {
    uid: user.uid,
    email: input.email,
    previousRole: staff?.role || null,
    nextRole: input.requestedRole,
  });
  return { uid: user.uid, created: false };
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
export async function provisionStaffLogin(input: ProvisionStaffInput, actor: StaffLoginActor): Promise<ProvisionStaffResult> {
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
  const { uid, created } = await ensureAuthUser({
    email,
    password,
    displayName,
    replaceExisting: input.replaceExisting === true,
    requestedRole: role,
    actor,
  });
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
export async function setStaffPassword(
  staffId: string,
  password: unknown,
  actor: StaffLoginActor,
  replaceExisting: boolean,
): Promise<{ uid: string; mustChangePassword: true }> {
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
  const { uid } = await ensureAuthUser({
    email,
    password: nextPassword,
    displayName: `${firstName} ${lastName}`.trim(),
    replaceExisting,
    requestedRole: null,
    actor,
  });
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

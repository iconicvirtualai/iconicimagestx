/**
 * Attach a public booking to a client portal account.
 * Writes clients/{uid} the same way POST /api/clients/register does.
 * Password-setup mail is the caller's job and stays behind CLIENT_NOTIFY_LIVE.
 */

import { randomBytes } from "crypto";
import admin from "firebase-admin";
import { cleanPersonName, normalizeEmail } from "../../shared/listingAccess";
import { upsertPortalClient } from "./clientAccounts";
import { planBookingAccount } from "./bookingAccountPlan";

const db = () => admin.firestore();

export interface BookingClientInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** Mint a password link only when the caller is about to email it. */
  preparePasswordLink?: boolean;
}

export interface BookingClientResult {
  clientId: string | null;
  createdAccount: boolean;
  passwordSetupLink: string | null;
  skipReason: "staff_email" | "invalid_email" | null;
}

function appUrl() {
  return process.env.APP_URL || process.env.FRONTEND_URL || "https://iconicimagestx.com";
}

export async function attachBookingClient(input: BookingClientInput): Promise<BookingClientResult> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { clientId: null, createdAccount: false, passwordSetupLink: null, skipReason: "invalid_email" };
  }

  const firstName = cleanPersonName(input.firstName) || "Client";
  const lastName = cleanPersonName(input.lastName);
  const phone = String(input.phone || "").trim().slice(0, 40);

  const staffHit = await db().collection("staff").where("email", "==", email).limit(1).get();
  let authUid: string | null = null;
  if (staffHit.empty) {
    try {
      authUid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/user-not-found") throw err;
    }
  }

  const plan = planBookingAccount({ staffMatch: !staffHit.empty, authUid });
  if (plan.skipReason === "staff_email") {
    console.warn(`[Bookings] Skipped portal account for staff email ${email}`);
    return { clientId: null, createdAccount: false, passwordSetupLink: null, skipReason: "staff_email" };
  }

  let uid = plan.attachToUid;
  let createdAccount = false;
  if (plan.createAuthUser) {
    try {
      const user = await admin.auth().createUser({
        email,
        password: randomBytes(24).toString("base64url"),
        displayName: `${firstName} ${lastName}`.trim(),
        emailVerified: false,
      });
      uid = user.uid;
      createdAccount = true;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/email-already-exists") throw err;
      uid = (await admin.auth().getUserByEmail(email)).uid;
      createdAccount = false;
    }
  }

  if (!uid) {
    return { clientId: null, createdAccount: false, passwordSetupLink: null, skipReason: null };
  }

  try {
    await upsertPortalClient({ uid, email, firstName, lastName, phone });
  } catch (err) {
    if (createdAccount) await admin.auth().deleteUser(uid).catch(() => undefined);
    throw err;
  }

  let passwordSetupLink: string | null = null;
  if (createdAccount && plan.sendPasswordSetup && input.preparePasswordLink) {
    passwordSetupLink = await createPasswordSetupLink(email);
  }

  return { clientId: uid, createdAccount, passwordSetupLink, skipReason: null };
}

async function createPasswordSetupLink(email: string): Promise<string | null> {
  const continueUrl = `${appUrl().replace(/\/$/, "")}/portal`;
  try {
    return await admin.auth().generatePasswordResetLink(email, {
      url: continueUrl,
      handleCodeInApp: false,
    });
  } catch (err) {
    console.warn("[Bookings] Password setup link with continue URL failed. Using the default Firebase link.", err);
  }
  try {
    return await admin.auth().generatePasswordResetLink(email);
  } catch (err) {
    console.error("[Bookings] Password setup link was not created:", err);
    return null;
  }
}

/** Firebase Auth's own password email. Used when SMTP cannot deliver the setup link. */
export async function sendFirebasePasswordEmail(email: string): Promise<void> {
  const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!key) {
    throw new Error("Set FIREBASE_WEB_API_KEY or VITE_FIREBASE_API_KEY to send the Firebase password email.");
  }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  if (!res.ok) {
    throw new Error(`Firebase password email failed (${res.status}).`);
  }
}

export async function createRequestedAppointment(input: {
  orderRequestId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: unknown;
  addressLabel: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  services: unknown[];
  notes: string;
}) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db().collection("appointments").add({
    orderRequestId: input.orderRequestId,
    clientId: input.clientId,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientPhone: input.clientPhone,
    address: input.address,
    addressLabel: input.addressLabel,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    services: input.services,
    status: "requested",
    source: "booking_form",
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  });
}

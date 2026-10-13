import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import {
  CLIENT_CONFIRMATION_DOC_ID,
  resolveClientConfirmation,
} from "./clientConfirmationEmail";

admin.initializeApp();

const db = admin.firestore();

// ─── Set custom claims when a staff document is created or updated ────────────
// This embeds the role directly into the Firebase Auth token so the server
// middleware can check it without hitting Firestore on every request.

export const syncStaffClaims = functions.firestore
  .document("staff/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;

    // Document deleted — remove custom claims
    if (!change.after.exists) {
      try {
        await admin.auth().setCustomUserClaims(uid, { role: null, isStaff: false });
        console.log(`[syncStaffClaims] Cleared claims for deleted staff ${uid}`);
      } catch (err) {
        console.error(`[syncStaffClaims] Failed to clear claims for ${uid}:`, err);
      }
      return;
    }

    const staff = change.after.data()!;
    const role: string = staff.role || "photographer";
    const isActive: boolean = staff.isActive !== false;

    try {
      await admin.auth().setCustomUserClaims(uid, {
        role,
        isStaff: isActive,
      });
      console.log(`[syncStaffClaims] Set claims for ${uid}: role=${role}, isStaff=${isActive}`);
    } catch (err) {
      console.error(`[syncStaffClaims] Failed to set claims for ${uid}:`, err);
    }
  });

export const onOrderCreated = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;

    // Not the booking_received order-ack. This Gmail path is a non-order-form
    // client/owner blast and stays off unless CLIENT_NOTIFY_LIVE is exactly
    // "true" and CLIENT_COMMS_ZONE is not RED. Keep in sync with shared/clientNotify.ts.
    if (process.env.CLIENT_COMMS_ZONE === "RED" || process.env.CLIENT_NOTIFY_LIVE !== "true") {
      console.warn(`[onOrderCreated] Suppressed email for ${orderId}. CLIENT_NOTIFY_LIVE is not exactly true or zone is RED.`);
      return;
    }

    try {
      // Gmail Auth
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
        subject: "orders@iconicimagestx.com",
      });

      const gmail = google.gmail({ version: "v1", auth });

      const clientTemplateDoc = await db.collection("emailTemplates").doc(CLIENT_CONFIRMATION_DOC_ID).get();
      const ownerTemplateDoc = await db.collection("emailTemplates").doc("ownerNotification").get();
      const clientMessage = resolveClientConfirmation(order, clientTemplateDoc.exists ? clientTemplateDoc.data() : null);

      const encodeHtmlEmail = (to: string, subject: string, html: string) => {
        const message = [
          `To: ${to}`,
          `From: orders@iconicimagestx.com`,
          `Subject: ${subject.replace(/[\r\n]+/g, " ")}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=utf-8`,
          ``,
          html,
        ].join("\n");
        return Buffer.from(message)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
      };

      if (order.clientEmail) {
        await gmail.users.messages.send({
          userId: "me",
          requestBody: {
            raw: encodeHtmlEmail(order.clientEmail, clientMessage.subject, clientMessage.html),
          },
        });
      }

      const ownerTemplate = ownerTemplateDoc.data();
      if (ownerTemplate && typeof ownerTemplate.subject === "string" && typeof ownerTemplate.body === "string") {
        const ownerTags: Record<string, string> = {
          clientName: typeof order.clientName === "string" ? order.clientName : "",
          clientEmail: typeof order.clientEmail === "string" ? order.clientEmail : "",
          clientPhone: typeof order.clientPhone === "string" ? order.clientPhone : "",
          propertyAddress: typeof order.addressLabel === "string"
            ? order.addressLabel
            : typeof order.propertyAddress === "string"
              ? order.propertyAddress
              : "",
          services: Array.isArray(order.services) ? order.services.join(", ") : String(order.services || ""),
          notes: typeof order.notes === "string" ? order.notes : "",
          orderId,
          status: typeof order.status === "string" ? order.status : "",
        };
        const replaceOwnerTags = (template: string) => template.replace(/\{\s*(\w+)\s*\}/g, (_, key: string) => ownerTags[key] ?? "");
        const ownerMessage = [
          `To: orders@iconicimagestx.com`,
          `From: orders@iconicimagestx.com`,
          `Subject: ${replaceOwnerTags(ownerTemplate.subject).replace(/[\r\n]+/g, " ")}`,
          ``,
          replaceOwnerTags(ownerTemplate.body),
        ].join("\n");
        const raw = Buffer.from(ownerMessage).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw },
        });
      }

      console.log("Emails sent successfully");
    } catch (error) {
      console.error("EMAIL FUNCTION ERROR:", error);
    }
  });

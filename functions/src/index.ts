import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { google } from "googleapis";

admin.initializeApp();

const db = admin.firestore();

const ICONIC_FROM_EMAIL = "photos@iconicimagestx.com";
const ICONIC_OFFICE_EMAIL = "photos@iconicimagestx.com";

function encodeEmail(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `From: Iconic Images <${ICONIC_FROM_EMAIL}>`,
    `Reply-To: ${ICONIC_OFFICE_EMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function formatOrderItems(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) return "Not specified";
  return items
    .map((item) => {
      const name = item?.name || item?.label || item?.title || "Service";
      const price = Number(item?.price);
      return Number.isFinite(price) ? `- ${name}: $${price.toFixed(2)}` : `- ${name}`;
    })
    .join("\n");
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

function gmailClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: ICONIC_FROM_EMAIL,
  });

  return google.gmail({ version: "v1", auth });
}

function replaceTags(template: string, data: Record<string, string>): string {
  let result = template;

  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\s*${key}\\s*\\}`, "gi");
    result = result.replace(regex, value ?? "");
  });

  return result;
}

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

// A booking is not considered fully received until both the customer and office
// notifications have been attempted. This Firestore trigger mirrors the proven
// Sleek Media flow and does not depend on the browser making a second request.
export const onOrderRequestCreated = functions.firestore
  .document("orderRequests/{orderId}")
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;
    const clientEmail = String(order.email || order.clientEmail || "").trim();
    const clientName = String(order.clientName || order.clientFullName || "Client").trim();
    const address = String(order.address || order.propertyAddress || "Not specified").trim();
    const phone = String(order.phone || order.clientPhone || "Not provided").trim();
    const scheduledDate = String(order.scheduledDate || order.preferredDate || "To be confirmed");
    const scheduledTime = String(order.scheduledTime || order.preferredTime || "To be confirmed");
    const access = String(order.accessMethod || order.propertyAccess || "Not specified");
    const notes = String(order.vibeNote || order.notes || order.specialRequests || "None");
    const itemText = formatOrderItems(order.lineItems || order.addOns || []);
    const total = formatMoney(order.total ?? order.totalPrice ?? order.pricing?.total);

    if (!clientEmail) {
      await snap.ref.set({
        notificationStatus: "failed",
        notificationError: "No client email supplied",
        notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    const summary = [
      `Order ID: ${orderId}`,
      `Client: ${clientName}`,
      `Email: ${clientEmail}`,
      `Phone: ${phone}`,
      `Property: ${address}`,
      `Requested date: ${scheduledDate}`,
      `Requested time: ${scheduledTime}`,
      `Access: ${access}`,
      "",
      "ORDER DETAILS",
      itemText,
      "",
      `Total: ${total}`,
      `Notes: ${notes}`,
    ].join("\n");

    const clientBody = [
      `Hi ${clientName},`,
      "",
      "We received your request with Iconic Images. Your requested appointment is not confirmed until our office follows up.",
      "",
      summary,
      "",
      "Questions? Reply to this email or contact photos@iconicimagestx.com.",
      "",
      "Iconic Images",
    ].join("\n");

    const officeBody = [
      "A new order request was submitted through ORDERICONIC.",
      "",
      summary,
      "",
      `Review the request: https://iconicimagestx.vercel.app/admin/orders/${orderId}`,
    ].join("\n");

    const gmail = gmailClient();
    const [clientResult, officeResult] = await Promise.allSettled([
      gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodeEmail(clientEmail, `We received your Iconic order request — ${address}`, clientBody),
        },
      }),
      gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodeEmail(ICONIC_OFFICE_EMAIL, `NEW ICONIC ORDER — ${clientName} — ${address}`, officeBody),
        },
      }),
    ]);

    const clientSent = clientResult.status === "fulfilled";
    const officeSent = officeResult.status === "fulfilled";
    const errors = [
      clientResult.status === "rejected" ? `Client: ${String(clientResult.reason)}` : "",
      officeResult.status === "rejected" ? `Office: ${String(officeResult.reason)}` : "",
    ].filter(Boolean);

    await snap.ref.set({
      clientConfirmationSent: clientSent,
      officeNotificationSent: officeSent,
      notificationStatus: clientSent && officeSent ? "sent" : "failed",
      notificationError: errors.join(" | ") || null,
      notificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("emailLogs").add({
      orderId,
      trigger: "order_request_created",
      clientEmail,
      officeEmail: ICONIC_OFFICE_EMAIL,
      clientSent,
      officeSent,
      errors,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!clientSent || !officeSent) {
      throw new Error(`Booking notifications failed: ${errors.join(" | ")}`);
    }
  });

export const onOrderCreated = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;

    try {
      // Gmail Auth
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
        subject: "orders@iconicimagestx.com",
      });

      const gmail = google.gmail({ version: "v1", auth });

      // Fetch email templates
      const clientTemplateDoc = await db.collection("emailTemplates").doc("clientConfirmation").get();
      const ownerTemplateDoc = await db.collection("emailTemplates").doc("ownerNotification").get();

      const clientTemplate = clientTemplateDoc.data();
      const ownerTemplate = ownerTemplateDoc.data();

      if (!clientTemplate || !ownerTemplate) {
        console.error("Email templates not found in Firestore");
        return;
      }

      // BUILD LINE ITEMS STRING
      const lineItemsText = (order.lineItems || [])
        .map((item: any) => `- ${item.name} - $${item.price}`)
        .join("\n");

      console.log("RAW TEMPLATE:", JSON.stringify(clientTemplate.body));

      // BUILD TAG DATA
      const tagData: Record<string, string> = {
        clientName: order.clientName || "",
        clientEmail: order.clientEmail || "",
        clientPhone: order.clientPhone || "",
        propertyAddress: order.propertyAddress || "",
        services: Array.isArray(order.services)
          ? order.services.join(", ")
          : order.services || "",
        lineItems: lineItemsText,
        total: String(order.total || order.pricing?.total || 0),
        notes: order.notes || "",
        orderId: orderId,
        status: order.status || "",
      };

      console.log("TAG DATA:", tagData);

      const replaceTagsFn = (template: string, data: Record<string, string>) => {
        let result = template;
        Object.entries(data).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\s*${key}\\s*\\}`, "g");
          result = result.replace(regex, value ?? "");
        });
        return result;
      };

      // Replace template tags
      const clientSubject = replaceTagsFn(clientTemplate.subject, tagData);
      const clientBody = replaceTagsFn(clientTemplate.body, tagData);
      const ownerSubject = replaceTagsFn(ownerTemplate.subject, tagData);
      const ownerBody = replaceTagsFn(ownerTemplate.body, tagData);

      // Email encoding
      const encodeEmail = (to: string, subject: string, body: string) => {
        const message = [
          `To: ${to}`,
          `From: orders@iconicimagestx.com`,
          `Subject: ${subject}`,
          ``,
          body,
        ].join("\n");
        return Buffer.from(message)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
      };

      // Send client email
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeEmail(order.clientEmail, clientSubject, clientBody) },
      });

      // Send owner email
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeEmail("orders@iconicimagestx.com", ownerSubject, ownerBody) },
      });

      console.log("Emails sent successfully");
    } catch (error) {
      console.error("EMAIL FUNCTION ERROR:", error);
    }
  });

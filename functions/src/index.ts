import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { google } from "googleapis";

admin.initializeApp();

const db = admin.firestore();

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

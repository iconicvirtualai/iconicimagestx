import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { google } from "googleapis";

admin.initializeApp();

const db = admin.firestore();

function replaceTags(template: string, data: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => data[key] || match);
}

export const onOrderCreated = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: "orders@iconicimagestx.com",
    });

    const gmail = google.gmail({ version: "v1", auth });

    // Fetch templates from Firestore
    const clientTemplateDoc = await db.collection("emailTemplates").doc("clientConfirmation").get();
    const ownerTemplateDoc = await db.collection("emailTemplates").doc("ownerNotification").get();

    const clientTemplate = clientTemplateDoc.data();
    const lineItemsText = (order.lineItems || [])
      console.log("LINE ITEMS TEXT:", lineItemsText);
console.log("TAG DATA:", tagData);
  .map((item: any) => `• ${item.name} — $${item.price}`)
  .join('\n');
    const ownerTemplate = ownerTemplateDoc.data();

    if (!clientTemplate || !ownerTemplate) {
      console.error("Email templates not found in Firestore");
      return;
    }

    // Build merge tag data
    const tagData: Record<string, string> = {
  clientName: order.clientName || "",
  clientEmail: order.clientEmail || "",
  clientPhone: order.clientPhone || "",
  propertyAddress: order.propertyAddress || "",

  // OLD (keep if you want fallback)
  services: Array.isArray(order.services)
    ? order.services.join(", ")
    : order.services || "",

  // 🔥 NEW (THIS IS THE FIX)
  lineItems: lineItemsText,
  total: String(order.pricing?.total || 0),

  notes: order.notes || "",
  orderId: orderId,
  status: order.status || "",
};

    const clientSubject = replaceTags(clientTemplate.subject, tagData);
    const clientBody = replaceTags(clientTemplate.body, tagData);
    const ownerSubject = replaceTags(ownerTemplate.subject, tagData);
    const ownerBody = replaceTags(ownerTemplate.body, tagData);

    const encodeEmail = (to: string, subject: string, body: string) => {
      const message = [
        `To: ${to}`,
        `From: orders@iconicimagestx.com`,
        `Subject: ${subject}`,
        ``,
        body,
      ].join("\n");
      return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    };

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodeEmail(order.clientEmail, clientSubject, clientBody) },
    });

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodeEmail("orders@iconicimagestx.com", ownerSubject, ownerBody) },
    });

    console.log("Emails sent successfully");
  });

// updated Wed Mar 18 12:36:42 AM UTC 2026

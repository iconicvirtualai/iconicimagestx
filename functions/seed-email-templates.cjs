const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "iconic-images-aicon",
});

const db = admin.firestore();

const BUSINESS_CONTACT_LINE = "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";

async function seedEmailTemplates() {
  console.log("Seeding email templates...");

  await db.collection("emailTemplates").doc("clientConfirmation").set({
    subject: "We received your Iconic order {{orderNumber}}",
    htmlBody: "\n    <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;\">\n      <div style=\"background: #000; padding: 20px; text-align: center; margin-bottom: 30px;\">\n        <h1 style=\"color: #fff; margin: 0; font-size: 24px;\">ICONIC IMAGES</h1>\n        <p style=\"color: #ccc; margin: 5px 0 0; font-size: 12px; letter-spacing: 2px;\">REAL ESTATE MEDIA</p>\n      </div>\n      \n      <h2 style=\"color:#0d9488;\">We received your order</h2>\n      <p>Hi {{clientName}},</p>\n      <p>Thank you for booking with Iconic Images. Your order number is <strong>{{orderNumber}}</strong>.</p>\n      <table style=\"width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;\">\n        <tr style=\"background:#f8fafc;\"><td style=\"padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;\">Order</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{orderNumber}}</td></tr>\n        <tr><td style=\"padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;\">Property</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{propertyAddress}}</td></tr>\n        <tr style=\"background:#f8fafc;\"><td style=\"padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;\">Services</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{services}}</td></tr>\n        <tr><td style=\"padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;\">Details</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{lineItems}}</td></tr>\n        <tr style=\"background:#f8fafc;\"><td style=\"padding:10px 14px;font-weight:bold;color:#555;\">Notes</td><td style=\"padding:10px 14px;\">{{notes}}</td></tr>\n      </table>\n      <p>Total: <strong>{{total}}</strong></p>\n      <p>We'll be in touch to confirm your shoot time.</p>\n    \n      <div style=\"border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center; color: #999; font-size: 12px;\">\n        <p>26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | <a href=\"tel:+12813560965\" style=\"color:#666666;text-decoration:underline;\">281.356.0965</a> | <a href=\"mailto:photos@iconicimagestx.com\" style=\"color:#666666;text-decoration:underline;\">photos@iconicimagestx.com</a></p>\n        <p>Iconic Images Photography, LLC</p>\n        <p><a href=\"https://iconicimagestx.vercel.app\" style=\"color:#999999;text-decoration:underline;\">iconicimagestx.vercel.app</a></p>\n        <p>Questions? Reply to this email or message us through your client portal.</p>\n      </div>\n    </div>\n  ",
  });
  console.log("clientConfirmation template saved.");

  await db.collection("emailTemplates").doc("ownerNotification").set({
    subject: "New Booking – {propertyAddress}",
    body: [
      "New booking submitted.",
      "",
      "Client: {clientName}",
      "Email: {clientEmail}",
      "Phone: {clientPhone}",
      "Property: {propertyAddress}",
      "",
      "{lineItems}",
      "",
      "Total: {total}",
      "",
      "Notes: {notes}",
      "",
      "Order ID: {orderId}",
      "Status: {status}",
      "",
      BUSINESS_CONTACT_LINE,
    ].join("\n"),
  });
  console.log("ownerNotification template saved.");
  process.exit(0);
}

seedEmailTemplates().catch((err) => {
  console.error(err);
  process.exit(1);
});

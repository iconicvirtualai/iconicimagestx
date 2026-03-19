const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "iconic-images-aicon",
});
const db = admin.firestore();

async function seedEmailTemplates() {
  console.log("Seeding email templates...");
  await db.collection("emailTemplates").doc("clientConfirmation").set({
    subject: "Booking Confirmed – {propertyAddress}",
    body: `Hi {clientName},\n\nThank you for booking with Iconic Images TX!\n\nProperty: {propertyAddress}\nServices: {services}\nNotes: {notes}\nOrder ID: {orderId}\n\nWe'll be in touch shortly to confirm your shoot time.\n\nWarm regards,\nThe Iconic Images TX Team\norders@iconicimagestx.com`,
  });
  console.log("✅ clientConfirmation saved.");

  await db.collection("emailTemplates").doc("ownerNotification").set({
    subject: "New Booking – {propertyAddress}",
    body: `New booking submitted.\n\nName: {clientName}\nEmail: {clientEmail}\nPhone: {clientPhone}\nProperty: {propertyAddress}\nServices: {services}\nNotes: {notes}\nOrder ID: {orderId}\nStatus: {status}`,
  });
  console.log("✅ ownerNotification saved.");
  console.log("\n🎉 All templates seeded!");
  process.exit(0);
}
seedEmailTemplates().catch((err) => { console.error("❌ Error:", err); process.exit(1); });

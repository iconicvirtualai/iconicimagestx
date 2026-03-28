const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "iconic-images-aicon",
});

const db = admin.firestore();

async function seedEmailTemplates() {
  console.log("Seeding email templates...");

  // CLIENT CONFIRMATION EMAIL
  await db.collection("emailTemplates").doc("clientConfirmation").set({
    subject: "Booking Confirmed – {propertyAddress}",
    body: `Hi {clientName}!

Thank you for booking with Iconic! Here are the details of your request. We'll be in touch to confirm your order shortly.

📍 Property:
{propertyAddress}

━━━ ORDER DETAILS ━━━

{lineItems}

━━━━━━━━━━━━━━━━━━━━

💰 Total:
${total}

📝 Notes:
{notes}

— Iconic Images TX`,
  });

  console.log("✅ clientConfirmation template saved.");

  // OWNER / ADMIN NOTIFICATION EMAIL
  await db.collection("emailTemplates").doc("ownerNotification").set({
    subject: "New Booking – {propertyAddress}",
    body: `New booking submitted.

👤 Client:
{clientName}

📧 Email:
{clientEmail}

📞 Phone:
{clientPhone}

📍 Property:
{propertyAddress}

━━━ ORDER DETAILS ━━━

{lineItems}

━━━━━━━━━━━━━━━━━━━━

💰 Total:
${total}

📝 Notes:
{notes}

🆔 Order ID:
{orderId}

📊 Status:
{status}`,
  });

  console.log("✅ ownerNotification template saved.");
  console.log("🎉 All templates seeded!");

  process.exit(0);
}

seedEmailTemplates().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

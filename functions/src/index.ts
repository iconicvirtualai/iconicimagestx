import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as twilio from "twilio";

admin.initializeApp();

const client = twilio.default(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const onOrderCreated = functions.firestore
.document("orders/{orderId}")
.onCreate(async (snap) => {

  const order = snap.data();

  const sms = `New Iconic booking:\n${order.propertyAddress}\nClient: ${order.clientName}`;

  await client.messages.create({
    body: sms,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: order.clientPhone
  });

});

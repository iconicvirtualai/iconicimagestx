/**
 * Iconic Images — Payments Routes
 * Stripe payment intents, invoicing, and webhooks.
 * Ported and adapted from iconic-virtual-vsai-demo.
 * Place at: server/routes/payments.ts
 */

import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import admin from "firebase-admin";
import { requireCoordinator, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";

const router = Router();
const db = () => admin.firestore();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

// ─── POST /api/payments/create-intent — Create payment intent ─────────────────

router.post("/create-intent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { invoiceId, amount, currency = "usd" } = req.body;

    if (!invoiceId || !amount) {
      return res.status(400).json({ error: "invoiceId and amount required." });
    }

    const invoiceDoc = await db().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;

    // Create or retrieve Stripe customer
    let stripeCustomerId = invoice.stripeCustomerId;
    if (!stripeCustomerId) {
      const clientDoc = await db().collection("clients").doc(invoice.clientId).get();
      const client = clientDoc.data();

      if (client) {
        const customer = await stripe.customers.create({
          email: invoice.clientEmail,
          name: invoice.clientName,
          metadata: {
            clientId: invoice.clientId,
            firebaseUid: client.firebaseUid || "",
          },
        });
        stripeCustomerId = customer.id;
        await db().collection("clients").doc(invoice.clientId).update({
          stripeCustomerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency,
      customer: stripeCustomerId || undefined,
      metadata: {
        invoiceId,
        orderId: invoice.orderId || "",
        clientId: invoice.clientId || "",
        clientName: invoice.clientName || "",
      },
      description: `Iconic Images — Invoice ${invoice.invoiceNumber}`,
      receipt_email: invoice.clientEmail,
    });

    // Store payment intent ID on invoice
    await invoiceDoc.ref.update({
      stripePaymentIntentId: paymentIntent.id,
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("[Payments] Create intent error:", err);
    return res.status(500).json({ error: "Failed to create payment intent." });
  }
});

// ─── POST /api/payments/send-invoice — Send invoice link to client ────────────

router.post("/send-invoice", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });

    const invoiceDoc = await db().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;
    const paymentUrl = `${process.env.APP_URL}/invoice/${invoiceId}`;

    await sendEmail({
      to: invoice.clientEmail,
      template: "invoice",
      variables: {
        clientName: invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        amount: `$${invoice.total.toFixed(2)}`,
        paymentUrl,
        dueDate: invoice.dueDate
          ? (invoice.dueDate as admin.firestore.Timestamp).toDate().toLocaleDateString()
          : "Upon receipt",
      },
    });

    await invoiceDoc.ref.update({
      status: "sent",
      paymentUrl,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("[Payments] Send invoice error:", err);
    return res.status(500).json({ error: "Failed to send invoice." });
  }
});

// ─── GET /api/payments/invoice/:id — Get invoice for payment page (public) ────

router.get("/invoice/:id", async (req: Request, res: Response) => {
  try {
    const invoiceDoc = await db().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;

    // Only return safe fields for public payment page
    return res.json({
      id: invoiceDoc.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      status: invoice.status,
      stripePaymentIntentId: invoice.stripePaymentIntentId,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch invoice." });
  }
});

// ─── POST /api/payments/webhook — Stripe webhook ─────────────────────────────
// This route must use raw body — wire it in server/index.ts BEFORE express.json()

router.post(
  "/webhook",
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("[Payments] Webhook signature verification failed:", err);
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const intent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentSucceeded(intent);
          break;
        }
        case "payment_intent.payment_failed": {
          const intent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentFailed(intent);
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          await handleRefund(charge);
          break;
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("[Payments] Webhook handler error:", err);
      return res.status(500).json({ error: "Webhook handler failed." });
    }
  }
);

// ─── GET /api/payments/transactions — List transactions ──────────────────────

router.get("/transactions", requireCoordinator, async (req, res) => {
  try {
    const { startDate, endDate, limit = "50" } = req.query;
    let query = db().collection("transactions").orderBy("createdAt", "desc");

    if (startDate) {
      query = query.where(
        "createdAt", ">=",
        admin.firestore.Timestamp.fromDate(new Date(startDate as string))
      ) as typeof query;
    }
    if (endDate) {
      query = query.where(
        "createdAt", "<=",
        admin.firestore.Timestamp.fromDate(new Date(endDate as string))
      ) as typeof query;
    }

    const snapshot = await query.limit(Number(limit)).get();
    const transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalRevenue = transactions
      .filter((t: Record<string, unknown>) => t.status === "completed" && t.type === "payment")
      .reduce((sum: number, t: Record<string, unknown>) => sum + (Number(t.amount) || 0), 0);

    return res.json({ transactions, totalRevenue });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

// ─── Webhook Handlers ─────────────────────────────────────────────────────────

async function handlePaymentSucceeded(intent: Stripe.PaymentIntent) {
  const { invoiceId, orderId, clientId, clientName } = intent.metadata;
  if (!invoiceId) return;

  const amount = intent.amount_received / 100;

  // Update invoice
  const invoiceRef = db().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;

  const invoice = invoiceDoc.data()!;
  const newAmountPaid = (invoice.amountPaid || 0) + amount;
  const newAmountDue = Math.max(0, invoice.total - newAmountPaid);

  await invoiceRef.update({
    amountPaid: newAmountPaid,
    amountDue: newAmountDue,
    status: newAmountDue <= 0 ? "paid" : "partial",
    paidAt: newAmountDue <= 0 ? admin.firestore.FieldValue.serverTimestamp() : null,
    paymentMethod: "stripe",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Record transaction
  await db().collection("transactions").add({
    type: "payment",
    orderId: orderId || invoice.orderId,
    invoiceId,
    clientId: clientId || invoice.clientId,
    clientName: clientName || invoice.clientName,
    amount,
    paymentMethod: "stripe",
    status: "completed",
    stripePaymentIntentId: intent.id,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update order balance
  if (orderId) {
    await db().collection("orders").doc(orderId).update({
      depositPaid: admin.firestore.FieldValue.increment(amount),
      balanceDue: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Update client total spend
  if (clientId) {
    await db().collection("clients").doc(clientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Send receipt
  if (invoice.clientEmail) {
    await sendEmail({
      to: invoice.clientEmail,
      template: "payment_receipt",
      variables: {
        clientName: invoice.clientName,
        amount: `$${amount.toFixed(2)}`,
        invoiceNumber: invoice.invoiceNumber,
        balance: `$${newAmountDue.toFixed(2)}`,
      },
    }).catch(console.error);
  }
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const { invoiceId } = intent.metadata;
  if (!invoiceId) return;

  await db().collection("agentLogs").add({
    agent: "travis",
    action: "Payment failed",
    summary: `Payment failed for invoice ${invoiceId}`,
    status: "flagged",
    relatedId: invoiceId,
    relatedType: "invoice",
    priority: "high",
    requiresHumanReview: true,
    details: intent.last_payment_error?.message || "Unknown error",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function handleRefund(charge: Stripe.Charge) {
  if (!charge.payment_intent) return;

  const intentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent.id;

  const invoiceSnap = await db()
    .collection("invoices")
    .where("stripePaymentIntentId", "==", intentId)
    .limit(1)
    .get();

  if (invoiceSnap.empty) return;

  const invoiceDoc = invoiceSnap.docs[0];
  const refundAmount = charge.amount_refunded / 100;

  await db().collection("transactions").add({
    type: "refund",
    invoiceId: invoiceDoc.id,
    clientId: invoiceDoc.data().clientId,
    clientName: invoiceDoc.data().clientName,
    amount: -refundAmount,
    paymentMethod: "stripe",
    status: "completed",
    stripePaymentIntentId: intentId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export default router;

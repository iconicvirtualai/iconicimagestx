/**
 * Iconic Images - Payments Routes
 * Square is the default processor for Iconic invoices.
 * Stripe is retained only for invoices explicitly marked as Studio Noir / stripe.
 */

import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import admin from "firebase-admin";
import crypto from "crypto";
import { requireCoordinator, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { sendEmail } from "../services/email";

const router = Router();
const db = () => admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function appUrl() {
  return process.env.APP_URL || "https://iconicimagestx.com";
}

function stripeReady() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function squareReady() {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function invoiceProvider(invoice: Record<string, unknown>): "square" | "stripe" {
  const explicit = String(invoice.paymentProvider || invoice.processor || "").toLowerCase();
  if (explicit === "stripe" || explicit === "square") return explicit;

  const channel = String(invoice.channel || invoice.brand || invoice.bookingType || "").toLowerCase();
  return channel.includes("studio noir") || channel.includes("studionoir") ? "stripe" : "square";
}

function money(value: unknown) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

async function applySuccessfulPayment({
  invoiceId,
  orderId,
  clientId,
  clientName,
  amount,
  method,
  squarePaymentId,
  stripePaymentIntentId,
}: {
  invoiceId: string;
  orderId?: string;
  clientId?: string;
  clientName?: string;
  amount: number;
  method: "square" | "stripe";
  squarePaymentId?: string;
  stripePaymentIntentId?: string;
}) {
  const invoiceRef = db().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;

  const invoice = invoiceDoc.data()!;
  const currentPaid = Number(invoice.amountPaid) || 0;
  const total = Number(invoice.total) || 0;
  const newAmountPaid = currentPaid + amount;
  const newAmountDue = Math.max(0, total - newAmountPaid);
  const resolvedOrderId = orderId || invoice.orderId || "";
  const resolvedClientId = clientId || invoice.clientId || "";

  await invoiceRef.update({
    amountPaid: newAmountPaid,
    amountDue: newAmountDue,
    status: newAmountDue <= 0 ? "paid" : "partial",
    paidAt: newAmountDue <= 0 ? admin.firestore.FieldValue.serverTimestamp() : null,
    paymentMethod: method,
    ...(squarePaymentId ? { squarePaymentId } : {}),
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (resolvedOrderId) {
    await db().collection("orders").doc(resolvedOrderId).update({
      depositPaid: admin.firestore.FieldValue.increment(amount),
      balanceDue: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Payments] Order balance update failed:", err));
  }

  if (resolvedClientId) {
    await db().collection("clients").doc(resolvedClientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Payments] Client spend update failed:", err));
  }

  if (resolvedOrderId && newAmountDue <= 0) {
    const gallerySnap = await db()
      .collection("galleries")
      .where("orderId", "==", resolvedOrderId)
      .limit(1)
      .get();

    if (!gallerySnap.empty) {
      await gallerySnap.docs[0].ref.update({
        downloadEnabled: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  await db().collection("transactions").add({
    type: "payment",
    orderId: resolvedOrderId,
    invoiceId,
    clientId: resolvedClientId,
    clientName: clientName || invoice.clientName,
    amount,
    paymentMethod: method,
    status: "completed",
    ...(squarePaymentId ? { squarePaymentId } : {}),
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (invoice.clientEmail) {
    await sendEmail({
      to: invoice.clientEmail,
      template: "payment_receipt",
      variables: {
        clientName: invoice.clientName,
        amount: money(amount),
        invoiceNumber: invoice.invoiceNumber,
        balance: money(newAmountDue),
      },
    }).catch(console.error);
  }
}

// Legacy/private Stripe intent route. Keep this available for Studio Noir tools only.
router.post("/create-intent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!stripeReady()) {
      return res.status(503).json({ error: "Studio Noir Stripe payments are not configured yet." });
    }

    const { invoiceId, amount, currency = "usd" } = req.body;
    if (!invoiceId || !amount) return res.status(400).json({ error: "invoiceId and amount required." });

    const invoiceDoc = await db().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;
    if (invoiceProvider(invoice) !== "stripe") {
      return res.status(400).json({ error: "This invoice is configured for Square, not Stripe." });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      metadata: {
        invoiceId,
        orderId: invoice.orderId || "",
        clientId: invoice.clientId || "",
        clientName: invoice.clientName || "",
      },
      description: `Studio Noir - Invoice ${invoice.invoiceNumber}`,
      receipt_email: invoice.clientEmail,
    });

    await invoiceDoc.ref.update({
      paymentProvider: "stripe",
      stripePaymentIntentId: paymentIntent.id,
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error("[Payments] Create intent error:", err);
    return res.status(500).json({ error: "Failed to create payment intent." });
  }
});

router.post("/send-invoice", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });

    const invoiceDoc = await db().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;
    const provider = invoiceProvider(invoice);
    const paymentUrl = `${appUrl()}/invoice/${invoiceId}`;

    await sendEmail({
      to: invoice.clientEmail,
      template: "invoice",
      variables: {
        clientName: invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        amount: money(invoice.total),
        paymentUrl,
        dueDate: invoice.dueDate
          ? (invoice.dueDate as admin.firestore.Timestamp).toDate().toLocaleDateString()
          : "Upon receipt",
      },
    });

    await invoiceDoc.ref.update({
      status: "sent",
      paymentProvider: provider,
      paymentUrl,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, paymentUrl, provider });
  } catch (err) {
    console.error("[Payments] Send invoice error:", err);
    return res.status(500).json({ error: "Failed to send invoice." });
  }
});

router.get("/invoice/:id", async (req: Request, res: Response) => {
  try {
    const invoiceDoc = await db().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;
    const provider = invoiceProvider(invoice);

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
      paymentProvider: provider,
      stripePaymentIntentId: invoice.stripePaymentIntentId || null,
      squarePaymentId: invoice.squarePaymentId || null,
      squarePaymentLinkId: invoice.squarePaymentLinkId || null,
      galleryId: invoice.galleryId || null,
      paymentUrl: invoice.paymentUrl || `${appUrl()}/invoice/${invoiceDoc.id}`,
      canPayOnline: provider === "stripe" ? stripeReady() : squareReady(),
    });
  } catch (err) {
    console.error("[Payments] Invoice fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch invoice." });
  }
});

router.post("/invoice/:id/checkout", async (req: Request, res: Response) => {
  try {
    const invoiceDoc = await db().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });

    const invoice = invoiceDoc.data()!;
    const amountDue = Number(invoice.amountDue ?? invoice.total ?? 0);
    const provider = invoiceProvider(invoice);

    if (invoice.status === "paid" || amountDue <= 0) {
      return res.json({
        paid: true,
        provider,
        redirectUrl: invoice.galleryId
          ? `${appUrl()}/gallery/${invoice.galleryId}`
          : `${appUrl()}/invoice/${invoiceDoc.id}`,
      });
    }

    if (provider === "square") {
      if (!squareReady()) return res.status(503).json({ error: "Square payments are not configured yet." });

      const response = await fetch(`${squareBaseUrl()}/v2/online-checkout/payment-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": process.env.SQUARE_VERSION || "2026-08-20",
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          idempotency_key: `${invoiceDoc.id}-${Date.now()}`,
          quick_pay: {
            name: `Iconic Images Invoice ${invoice.invoiceNumber || invoiceDoc.id}`,
            price_money: {
              amount: Math.round(amountDue * 100),
              currency: "USD",
            },
            location_id: process.env.SQUARE_LOCATION_ID,
          },
          checkout_options: {
            redirect_url: invoice.galleryId
              ? `${appUrl()}/gallery/${invoice.galleryId}`
              : `${appUrl()}/invoice/${invoiceDoc.id}?paid=1`,
          },
          pre_populated_data: {
            buyer_email: invoice.clientEmail || undefined,
          },
          payment_note: `Iconic Images invoice ${invoice.invoiceNumber || invoiceDoc.id}`,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("[Payments] Square checkout error:", result);
        return res.status(500).json({ error: "Failed to start Square checkout." });
      }

      const link = result.payment_link;
      await invoiceDoc.ref.update({
        status: "sent",
        paymentProvider: "square",
        paymentUrl: link?.url || `${appUrl()}/invoice/${invoiceDoc.id}`,
        squarePaymentLinkId: link?.id || null,
        squareOrderId: link?.order_id || null,
        sentAt: invoice.sentAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({ checkoutUrl: link?.url, provider: "square" });
    }

    if (!stripeReady()) {
      return res.status(503).json({ error: "Studio Noir Stripe payments are not configured yet." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: invoice.clientEmail || undefined,
      client_reference_id: invoiceDoc.id,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amountDue * 100),
          product_data: {
            name: `Studio Noir Invoice ${invoice.invoiceNumber || invoiceDoc.id}`,
            description: invoice.address || invoice.clientName || undefined,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        receipt_email: invoice.clientEmail || undefined,
        metadata: {
          invoiceId: invoiceDoc.id,
          orderId: invoice.orderId || "",
          clientId: invoice.clientId || "",
          clientName: invoice.clientName || "",
        },
      },
      metadata: {
        invoiceId: invoiceDoc.id,
        orderId: invoice.orderId || "",
        clientId: invoice.clientId || "",
      },
      success_url: `${appUrl()}/invoice/${invoiceDoc.id}?paid=1`,
      cancel_url: `${appUrl()}/invoice/${invoiceDoc.id}?cancelled=1`,
    });

    await invoiceDoc.ref.update({
      status: "sent",
      paymentProvider: "stripe",
      paymentUrl: `${appUrl()}/invoice/${invoiceDoc.id}`,
      stripeCheckoutSessionId: session.id,
      sentAt: invoice.sentAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ checkoutUrl: session.url, provider: "stripe" });
  } catch (err) {
    console.error("[Payments] Checkout error:", err);
    return res.status(500).json({ error: "Failed to start checkout." });
  }
});

router.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[Payments] Stripe webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid webhook signature." });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_intent) {
          const intent = await stripe.paymentIntents.retrieve(
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent.id
          );
          await handleStripePaymentSucceeded(intent);
        }
        break;
      }
      case "payment_intent.succeeded":
        await handleStripePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handleStripePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleStripeRefund(event.data.object as Stripe.Charge);
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[Payments] Stripe webhook handler error:", err);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
});

router.post("/square-webhook", async (req: Request, res: Response) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : JSON.stringify(req.body || {});
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

    if (signatureKey) {
      const notificationUrl = `${appUrl()}/api/payments/square-webhook`;
      const expected = crypto.createHmac("sha256", signatureKey)
        .update(notificationUrl + rawBody)
        .digest("base64");
      const received = Array.isArray(req.headers["x-square-hmacsha256-signature"])
        ? req.headers["x-square-hmacsha256-signature"][0]
        : req.headers["x-square-hmacsha256-signature"];
      const valid = Boolean(received) &&
        Buffer.byteLength(expected) === Buffer.byteLength(received || "") &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received || ""));
      if (!valid) return res.status(400).json({ error: "Invalid Square webhook signature." });
    }

    const event = JSON.parse(rawBody);
    const payment = event?.data?.object?.payment;
    if (!payment?.id || payment.status !== "COMPLETED") return res.json({ received: true });

    let invoiceDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    if (payment.order_id) {
      const bySquareOrder = await db()
        .collection("invoices")
        .where("squareOrderId", "==", payment.order_id)
        .limit(1)
        .get();
      if (!bySquareOrder.empty) invoiceDoc = bySquareOrder.docs[0];
    }

    if (!invoiceDoc) {
      const byPayment = await db()
        .collection("invoices")
        .where("squarePaymentId", "==", payment.id)
        .limit(1)
        .get();
      if (!byPayment.empty) invoiceDoc = byPayment.docs[0];
    }

    if (!invoiceDoc) {
      await db().collection("agentLogs").add({
        agent: "travis",
        action: "Unmatched Square payment",
        summary: `Square payment ${payment.id} could not be matched to an invoice`,
        status: "flagged",
        relatedType: "invoice",
        priority: "high",
        requiresHumanReview: true,
        details: payment.order_id || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.json({ received: true, unmatched: true });
    }

    const invoice = invoiceDoc.data();
    if (invoice.squarePaymentId === payment.id || invoice.status === "paid") {
      return res.json({ received: true, duplicate: true });
    }

    await applySuccessfulPayment({
      invoiceId: invoiceDoc.id,
      orderId: invoice.orderId,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      amount: Number(payment.total_money?.amount || 0) / 100,
      method: "square",
      squarePaymentId: payment.id,
    });

    return res.json({ received: true });
  } catch (err) {
    console.error("[Payments] Square webhook error:", err);
    return res.status(500).json({ error: "Square webhook handler failed." });
  }
});

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
    console.error("[Payments] Transactions error:", err);
    return res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

async function handleStripePaymentSucceeded(intent: Stripe.PaymentIntent) {
  const { invoiceId, orderId, clientId, clientName } = intent.metadata;
  if (!invoiceId) return;

  await applySuccessfulPayment({
    invoiceId,
    orderId,
    clientId,
    clientName,
    amount: intent.amount_received / 100,
    method: "stripe",
    stripePaymentIntentId: intent.id,
  });
}

async function handleStripePaymentFailed(intent: Stripe.PaymentIntent) {
  const { invoiceId } = intent.metadata;
  if (!invoiceId) return;

  await db().collection("agentLogs").add({
    agent: "travis",
    action: "Studio Noir payment failed",
    summary: `Stripe payment failed for invoice ${invoiceId}`,
    status: "flagged",
    relatedId: invoiceId,
    relatedType: "invoice",
    priority: "high",
    requiresHumanReview: true,
    details: intent.last_payment_error?.message || "Unknown error",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function handleStripeRefund(charge: Stripe.Charge) {
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

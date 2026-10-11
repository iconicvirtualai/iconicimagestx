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
import { clientNotifyLive } from "../../shared/clientNotify";
import { addressText } from "../../shared/addressText";
import { bookingDateLabel } from "../../shared/clientHome";
import { amountStillDue, invoiceAllowsDownload, squarePaymentNote } from "../../shared/paymentAccess";
import { invoiceEmailNumber, invoicePageInvoiceNumber, receiptEmailNumber } from "../../shared/orderProjectInvoice";
import { fetchPublishedSquareInvoiceUrl, resolveSquareCheckoutUrl, squareApiBaseUrl } from "../../shared/squareInvoice";
import { clientInvoiceUrl } from "../../shared/invoicePayLink";
import { publicClientUrl } from "../../shared/publicSiteUrl";
import {
  createPayToken,
  decideInvoiceView,
  invoiceRedirectTarget,
  isLegacyOpenAutoId,
  publicInvoiceClient,
  publicInvoiceLines,
  type InvoiceAudience,
} from "../../shared/invoicePay";
import { normalizeEmail } from "../../shared/listingAccess";
import { isActiveStaffRecord } from "../../shared/staffAccess";
import { isTempAdminEnabled, liveServerEnv } from "../../shared/tempAdmin";
import { payTokenMatches } from "../lib/payToken";
import { resolveClientIdentity } from "../services/clientAccounts";
import { matchSquarePaymentInvoice } from "../services/squarePaymentMatch";

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
  return squareApiBaseUrl(process.env.SQUARE_ENVIRONMENT);
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

function invoiceNotFound(res: Response) {
  return res.status(404).json({ error: "Invoice not found." });
}

function presentedPayToken(req: Request): string {
  const query = req.query.t;
  if (typeof query === "string" && query.trim()) return query.trim();
  const body = req.body && typeof req.body === "object" ? (req.body as { t?: unknown }).t : "";
  return typeof body === "string" ? body.trim() : "";
}

async function loadInvoice(id: string) {
  const seen = new Set<string>();
  let current = id.trim();
  for (let hop = 0; hop < 4; hop += 1) {
    if (!current || seen.has(current)) return null;
    seen.add(current);
    const snap = await db().collection("invoices").doc(current).get();
    if (!snap.exists) return null;
    const next = invoiceRedirectTarget(snap.data() || {});
    if (!next || next === snap.id) return snap;
    current = next;
  }
  return null;
}

function ownsInvoice(ids: string[], email: string, invoice: Record<string, unknown>): boolean {
  const clientId = typeof invoice.clientId === "string" ? invoice.clientId.trim() : "";
  if (clientId && ids.includes(clientId)) return true;
  const invoiceEmail = normalizeEmail(invoice.clientEmail);
  const viewerEmail = normalizeEmail(email);
  return Boolean(invoiceEmail && viewerEmail && invoiceEmail === viewerEmail);
}

async function audienceFor(req: Request, invoice: Record<string, unknown>): Promise<InvoiceAudience> {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "public";
  const token = header.slice("Bearer ".length).trim();
  if (!token) return "public";
  try {
    if (isTempAdminEnabled(liveServerEnv()) && token === "temp-admin-token") return "staff";
    const decoded = await admin.auth().verifyIdToken(token);
    const staffDoc = await db().collection("staff").doc(decoded.uid).get();
    const staff = staffDoc.exists ? staffDoc.data() : null;
    if (isActiveStaffRecord(staff) && (staff?.role === "admin" || staff?.role === "coordinator")) {
      return "staff";
    }
    const identity = await resolveClientIdentity(decoded.uid, decoded.email);
    if (ownsInvoice(identity.ids, identity.email || decoded.email || "", invoice)) return "owner";
    return "public";
  } catch (err) {
    console.warn("[Payments] Invoice session was not applied.");
    return "public";
  }
}

async function payTokenForLink(invoiceDoc: FirebaseFirestore.DocumentSnapshot): Promise<string> {
  const invoice = invoiceDoc.data() || {};
  const existing = typeof invoice.payToken === "string" ? invoice.payToken.trim() : "";
  if (existing) return existing;
  if (isLegacyOpenAutoId(invoiceDoc.id)) return "";
  const payToken = createPayToken();
  const paymentUrl = clientInvoiceUrl({ id: invoiceDoc.id, payToken, status: invoice.status }) || "";
  await invoiceDoc.ref.update({
    payToken,
    ...(paymentUrl ? { paymentUrl } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return payToken;
}

function invoiceMoney(invoice: Record<string, unknown>) {
  return {
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    amountDue: invoice.amountDue,
    processing: invoice.processing ?? null,
    fees: invoice.fees ?? null,
    travel: invoice.travel ?? null,
    promoDiscount: invoice.promoDiscount ?? null,
    promoCode: invoice.promoCode ?? null,
  };
}

function invoiceNumberFields(invoice: Record<string, unknown>, id: string) {
  return invoicePageInvoiceNumber({
    invoiceNumber: invoice.invoiceNumber,
    id,
    createdAt: invoice.createdAt,
  });
}

async function paymentAlreadyRecorded({
  squarePaymentId,
  stripePaymentIntentId,
}: {
  squarePaymentId?: string;
  stripePaymentIntentId?: string;
}) {
  if (squarePaymentId) {
    const existing = await db().collection("transactions").where("squarePaymentId", "==", squarePaymentId).limit(1).get();
    if (!existing.empty) return true;
  }
  if (stripePaymentIntentId) {
    const existing = await db().collection("transactions").where("stripePaymentIntentId", "==", stripePaymentIntentId).limit(1).get();
    if (!existing.empty) return true;
  }
  return false;
}

async function unlockGalleriesForInvoice({
  invoiceId,
  orderId,
  galleryId,
}: {
  invoiceId: string;
  orderId?: string;
  galleryId?: string;
}) {
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  if (galleryId) refs.set(galleryId, db().collection("galleries").doc(galleryId));

  const lookups: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    db().collection("galleries").where("invoiceId", "==", invoiceId).get(),
  ];
  if (orderId) lookups.push(db().collection("galleries").where("orderId", "==", orderId).get());

  const snaps = await Promise.all(lookups);
  snaps.forEach((snap) => snap.docs.forEach((doc) => refs.set(doc.id, doc.ref)));

  await Promise.all([...refs.values()].map((ref) => ref.update({
    downloadEnabled: true,
    paymentStatus: "paid",
    unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch((err) => console.error("[Payments] Gallery unlock failed:", err))));
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
  const resolvedOrderId = orderId || invoice.orderId || "";
  const resolvedClientId = clientId || invoice.clientId || "";
  const sameSquare = Boolean(squarePaymentId) && invoice.squarePaymentId === squarePaymentId;
  const sameStripe = Boolean(stripePaymentIntentId) && invoice.stripePaymentIntentId === stripePaymentIntentId;
  const duplicate = sameSquare || sameStripe || await paymentAlreadyRecorded({ squarePaymentId, stripePaymentIntentId });

  if (duplicate) {
    if (invoiceAllowsDownload(invoice)) {
      await unlockGalleriesForInvoice({
        invoiceId,
        orderId: resolvedOrderId,
        galleryId: typeof invoice.galleryId === "string" ? invoice.galleryId : undefined,
      });
    }
    return;
  }

  const currentPaid = Number(invoice.amountPaid) || 0;
  const total = Number(invoice.total) || 0;
  const newAmountPaid = currentPaid + amount;
  const newAmountDue = Math.max(0, total - newAmountPaid);

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
      balanceDue: newAmountDue,
      paymentStatus: newAmountDue <= 0 ? "paid" : "partial",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Payments] Order balance update failed:", err));
  }

  if (resolvedClientId) {
    await db().collection("clients").doc(resolvedClientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Payments] Client spend update failed:", err));
  }

  if (newAmountDue <= 0) {
    await unlockGalleriesForInvoice({
      invoiceId,
      orderId: resolvedOrderId,
      galleryId: typeof invoice.galleryId === "string" ? invoice.galleryId : undefined,
    });
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
        invoiceNumber: receiptEmailNumber({
          invoiceNumber: invoice.invoiceNumber,
          id: invoiceId,
          createdAt: invoice.createdAt,
        }),
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
      ...(clientNotifyLive() && invoice.clientEmail ? { receipt_email: invoice.clientEmail } : {}),
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

    const invoiceDoc = await loadInvoice(String(invoiceId));
    if (!invoiceDoc) return invoiceNotFound(res);

    const invoice = invoiceDoc.data() || {};
    const provider = invoiceProvider(invoice);
    const payToken = await payTokenForLink(invoiceDoc);
    const paymentUrl = clientInvoiceUrl({
      id: invoiceDoc.id,
      payToken: payToken || invoice.payToken,
      status: invoice.status,
    }) || "";

    await sendEmail({
      to: invoice.clientEmail,
      template: "invoice",
      variables: {
        clientName: invoice.clientName,
        invoiceNumber: invoiceEmailNumber({
          invoiceNumber: invoice.invoiceNumber,
          id: invoiceDoc.id,
          createdAt: invoice.createdAt,
        }),
        amount: money(invoice.total),
        paymentUrl,
        dueDate: bookingDateLabel(invoice.dueDate, "Upon receipt"),
      },
    });

    await invoiceDoc.ref.update({
      status: "sent",
      paymentProvider: provider,
      ...(paymentUrl ? { paymentUrl } : {}),
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, paymentUrl, provider });
  } catch (err) {
    console.error("[Payments] Send invoice error:", err);
    return res.status(500).json({ error: "Failed to send invoice." });
  }
});

router.post("/send-receipt", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });

    const invoiceDoc = await loadInvoice(String(invoiceId));
    if (!invoiceDoc) return invoiceNotFound(res);

    const invoice = invoiceDoc.data() || {};
    if (!invoiceAllowsDownload(invoice)) {
      return res.status(409).json({ error: "Invoice is not paid. Send the pay link instead." });
    }

    await sendEmail({
      to: invoice.clientEmail,
      template: "payment_receipt",
      variables: {
        clientName: invoice.clientName,
        amount: money(invoice.amountPaid || invoice.total),
        invoiceNumber: receiptEmailNumber({
          invoiceNumber: invoice.invoiceNumber,
          id: invoiceDoc.id,
          createdAt: invoice.createdAt,
        }),
        balance: money(amountStillDue(invoice)),
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[Payments] Send receipt error:", err);
    return res.status(500).json({ error: "Failed to send receipt." });
  }
});

router.get("/invoice/:id", async (req: Request, res: Response) => {
  try {
    const invoiceDoc = await loadInvoice(req.params.id);
    if (!invoiceDoc) return invoiceNotFound(res);

    const invoice = invoiceDoc.data() || {};
    const provider = invoiceProvider(invoice);
    const audience = await audienceFor(req, invoice);
    const view = decideInvoiceView({
      invoiceId: invoiceDoc.id,
      payToken: invoice.payToken,
      presentedToken: presentedPayToken(req),
      audience,
      matches: payTokenMatches,
    });
    if (view === "deny") return invoiceNotFound(res);

    const paid = invoiceAllowsDownload(invoice);
    const shared = {
      id: invoiceDoc.id,
      paid,
      invoiceNumber: invoiceNumberFields(invoice, invoiceDoc.id),
      clientName: invoice.clientName,
      ...invoiceMoney(invoice),
      status: invoice.status,
      paymentProvider: provider,
      canPayOnline: provider === "stripe" ? stripeReady() : squareReady(),
      createdAt: invoice.createdAt || null,
    };
    if (view === "public") {
      const body: Record<string, unknown> = {
        ...shared,
        ...publicInvoiceClient(invoice),
        lineItems: publicInvoiceLines(invoice.lineItems),
      };
      if (paid && typeof invoice.galleryId === "string" && invoice.galleryId.trim()) {
        body.galleryId = invoice.galleryId;
      }
      return res.json(body);
    }

    return res.json({
      ...shared,
      lineItems: invoice.lineItems,
      billToAddress: typeof invoice.billToAddress === "string" ? invoice.billToAddress : null,
      notes: typeof invoice.notes === "string" ? invoice.notes : null,
      clientEmail: invoice.clientEmail || null,
      stripePaymentIntentId: invoice.stripePaymentIntentId || null,
      squarePaymentId: invoice.squarePaymentId || null,
      squarePaymentLinkId: invoice.squarePaymentLinkId || null,
      galleryId: invoice.galleryId || null,
      paymentUrl: clientInvoiceUrl({
        id: invoiceDoc.id,
        payToken: invoice.payToken,
        status: invoice.status,
      }) || "",
      canPayOnline: provider === "stripe" ? stripeReady() : squareReady(),
    });
  } catch (err) {
    console.error("[Payments] Invoice fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch invoice." });
  }
});

router.post("/invoice/:id/checkout", async (req: Request, res: Response) => {
  try {
    const invoiceDoc = await loadInvoice(req.params.id);
    if (!invoiceDoc) return invoiceNotFound(res);

    const invoice = invoiceDoc.data() || {};
    const audience = await audienceFor(req, invoice);
    const view = decideInvoiceView({
      invoiceId: invoiceDoc.id,
      payToken: invoice.payToken,
      presentedToken: presentedPayToken(req),
      audience,
      matches: payTokenMatches,
    });
    if (view === "deny") return invoiceNotFound(res);

    const amountDue = amountStillDue(invoice);
    const provider = invoiceProvider(invoice);
    const payToken = await payTokenForLink(invoiceDoc);
    const invoiceUrl = clientInvoiceUrl({
      id: invoiceDoc.id,
      payToken: payToken || invoice.payToken,
      status: invoice.status,
    }) || "";

    if (invoiceAllowsDownload(invoice)) {
      return res.json({
        paid: true,
        provider,
        redirectUrl: view === "full" && invoice.galleryId
          ? publicClientUrl(`/gallery/${encodeURIComponent(String(invoice.galleryId))}`)
          : invoiceUrl,
      });
    }

    if (amountDue <= 0) {
      return res.status(400).json({ error: "This invoice cannot be paid online." });
    }

    if (provider === "square") {
      const freshUrl =
        squareReady() && invoice.squareInvoiceId
          ? await fetchPublishedSquareInvoiceUrl(String(invoice.squareInvoiceId), {
              fetchImpl: fetch,
              env: process.env,
              timeoutMs: 5000,
            })
          : null;
      const publishedUrl = resolveSquareCheckoutUrl({
        freshUrl,
        storedUrl: invoice.squareInvoiceUrl,
      });
      if (publishedUrl) {
        if (freshUrl && freshUrl !== invoice.squareInvoiceUrl) {
          await invoiceDoc.ref.update({
            squareInvoiceUrl: freshUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch((err) => console.error("[Payments] Square invoice URL save failed:", err));
        }
        return res.json({ checkoutUrl: publishedUrl, provider: "square" });
      }

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
            redirect_url: clientInvoiceUrl({
              id: invoiceDoc.id,
              payToken,
              status: invoice.status,
            }, undefined, { paid: "1" }) || invoiceUrl,
          },
          pre_populated_data: {
            buyer_email: invoice.clientEmail || undefined,
          },
          payment_note: squarePaymentNote(invoiceDoc.id, invoice.invoiceNumber),
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
        paymentUrl: link?.url || invoiceUrl,
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
            description: addressText(invoice.address) || addressText(invoice.billToAddress) || (typeof invoice.clientName === "string" ? invoice.clientName : "") || undefined,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        ...(clientNotifyLive() && invoice.clientEmail ? { receipt_email: invoice.clientEmail } : {}),
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
      success_url: clientInvoiceUrl({
        id: invoiceDoc.id,
        payToken,
        status: invoice.status,
      }, undefined, { paid: "1" }) || invoiceUrl,
      cancel_url: clientInvoiceUrl({
        id: invoiceDoc.id,
        payToken,
        status: invoice.status,
      }, undefined, { cancelled: "1" }) || invoiceUrl,
    });

    await invoiceDoc.ref.update({
      status: "sent",
      paymentProvider: "stripe",
      ...(invoiceUrl ? { paymentUrl: invoiceUrl } : {}),
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

function squareNotificationUrls(): string[] {
  const explicit = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  const urls = [
    explicit,
    `${appUrl()}/api/payments/square-webhook`,
    process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL.replace(/\/$/, "")}/api/payments/square-webhook`
      : "",
  ].filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

function squareSignatureValid(rawBody: string, received: string | undefined, key: string): boolean {
  if (!received) return false;
  const receivedBuf = Buffer.from(received);
  return squareNotificationUrls().some((url) => {
    const expected = crypto.createHmac("sha256", key).update(url + rawBody).digest("base64");
    const expectedBuf = Buffer.from(expected);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  });
}

async function findInvoiceForSquarePayment(payment: Record<string, unknown>) {
  const hit = await matchSquarePaymentInvoice(payment, {
    async byId(id) {
      const snap = await db().collection("invoices").doc(id).get();
      if (!snap.exists) return null;
      return { id: snap.id, data: snap.data() || {} };
    },
    async byField(field, value) {
      const snap = await db().collection("invoices").where(field, "==", value).limit(1).get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, data: doc.data() || {} };
    },
  });
  if (!hit) return null;
  const snap = await db().collection("invoices").doc(hit.id).get();
  return snap.exists ? snap : null;
}

router.post("/square-webhook", async (req: Request, res: Response) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : JSON.stringify(req.body || {});
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) {
      console.error("[Payments] Square webhook rejected: SQUARE_WEBHOOK_SIGNATURE_KEY is not set.");
      return res.status(401).json({ error: "Square webhook signature key is not configured." });
    }

    const received = Array.isArray(req.headers["x-square-hmacsha256-signature"])
      ? req.headers["x-square-hmacsha256-signature"][0]
      : req.headers["x-square-hmacsha256-signature"];
    if (!squareSignatureValid(rawBody, received, signatureKey)) {
      return res.status(400).json({ error: "Invalid Square webhook signature." });
    }

    const event = JSON.parse(rawBody);
    const payment = event?.data?.object?.payment || event?.data?.object;
    if (!payment?.id || payment.status !== "COMPLETED") return res.json({ received: true });

    const invoiceDoc = await findInvoiceForSquarePayment(payment);
    if (!invoiceDoc) {
      await db().collection("agentLogs").add({
        agent: "travis",
        action: "Unmatched Square payment",
        summary: `Square payment ${payment.id} could not be matched to an invoice`,
        status: "flagged",
        relatedType: "invoice",
        priority: "high",
        requiresHumanReview: true,
        details: payment.order_id || payment.note || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.json({ received: true, unmatched: true });
    }

    const invoice = invoiceDoc.data() || {};
    if (invoiceProvider(invoice) === "stripe") {
      return res.json({ received: true, ignored: "stripe-invoice" });
    }

    const amountCents = Number(payment.amount_money?.amount ?? payment.total_money?.amount ?? 0);
    const amount = amountCents / 100;
    if (amount <= 0) return res.json({ received: true, ignored: "zero-amount" });

    await applySuccessfulPayment({
      invoiceId: invoiceDoc.id,
      orderId: invoice.orderId,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      amount,
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

  const invoiceDoc = await loadInvoice(invoiceId);
  if (!invoiceDoc) return;
  if (invoiceProvider(invoiceDoc.data() || {}) !== "stripe") {
    console.warn(`[Payments] Ignored Stripe payment ${intent.id} for non-Stripe invoice ${invoiceId}`);
    return;
  }

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

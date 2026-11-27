/**
 * Iconic Images - Payments Routes
 * Square is the default processor for Iconic invoices.
 * Stripe is retained only for invoices explicitly marked as Studio Noir / stripe.
 */

import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import admin from "firebase-admin";
import { requireCoordinator, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { appFirestore } from "../lib/appFirestore";
import { sendEmail, type EmailDelivery } from "../services/email";
import { dispatchClientEmailNotifications } from "../services/aryeoEmailNotify";
import { buildPaymentReceipt, receiptProcessing } from "../services/paymentReceiptEmail";
import { ensureDotOptInLink } from "../services/doorsOpenTour";
import { doorsOpenReceiptEmailHtml } from "../../shared/doorsOpenTour";
import { clientNotifyLive } from "../../shared/clientNotify";
import { addressText } from "../../shared/addressText";
import { bookingDateLabel } from "../../shared/clientHome";
import { amountStillDue, invoiceAllowsDownload, invoiceIdFromSquareNote, squarePaymentNote } from "../../shared/paymentAccess";
import { invoiceEmailNumber, invoicePageInvoiceNumber, receiptEmailNumber } from "../../shared/orderProjectInvoice";
import { fetchPublishedSquareInvoiceUrl, resolveSquareCheckoutUrl } from "../../shared/squareInvoice";
import { squareBuyerPrefill } from "../../shared/clientHubSettings";
import { SQUARE_CHECKOUT_FAILURE, SQUARE_DEPOSIT_CHECKOUT_FAILURE } from "../../shared/squareCheckout";
import { createSquareQuickPayLink } from "../services/squarePaymentLink";
import { clientInvoiceUrl } from "../../shared/invoicePayLink";
import { publicClientUrl } from "../../shared/publicSiteUrl";
import { revenueStamp, sumTransactionAmounts } from "../../shared/revenueCount";
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
import {
  readSquareWebhookRawBody,
  squareWebhookNotificationUrls,
  squareWebhookSignatureValid,
} from "../services/squareWebhook";
import {
  APPRENTICESHIP_AWAITING_DEPOSIT_STATUS,
  APPRENTICESHIP_EXPIRED_STATUS,
  APPRENTICESHIP_HOLD_MINUTES,
  APPRENTICESHIP_ORDER_SOURCE,
  apprenticeshipBookingReturnPath,
} from "../../shared/apprenticeship";
import { confirmApprenticeshipEvent } from "../services/apprenticeshipCalendar";
import { resolveLateApprenticeshipPayment } from "../services/apprenticeshipHolds";
import { HEADSHOTS_ORDER_SOURCE, headshotBookingReturnPath } from "../../shared/headshots10";
import { confirmHeadshotHold, resolveLateHeadshotPayment } from "../services/headshotHolds";
import { seniorDepositCheckoutLive, seniorLivingDepositReturnPath } from "../../shared/seniorLiving";
import {
  isMirroredPayAtCloseSquarePayment,
  PAY_AT_CLOSE_METHOD,
  PAY_AT_CLOSE_PENDING_STATUS,
  payAtCloseCustomerOffer,
  premiumCatalogPackages,
  shapePayAtCloseDraft,
} from "../../shared/payAtClose";
import { packagesForStaffEditor } from "../../shared/bookingCatalog";
import { orderNumberLookupKeys } from "../../shared/orderNumber";
import { PAY_NOW_METHOD } from "../../shared/payNow";
import { paymentSettlementStatus, roundSettlementMoney } from "../../shared/paymentSettlement";
import { createRateLimiter } from "../lib/rateLimit";
import { clientIp } from "../lib/clientIp";
import { fetchSquareOrderSnapshot, fetchSquarePayment } from "../services/squareOrderLookup";
import { buildBookingInvoiceDraft } from "../../shared/bookingInvoice";
import { loadPricingAdjustments } from "../services/pricingAdjustments";
import {
  applyPayAtCloseWebhook,
  createTitusCheckout,
  mirrorPayAtCloseOnSquareOrder,
  payAtCloseOfferFromAdjustments,
} from "../services/payAtClose";

const router = Router();
const db = () => appFirestore();
const payNowReconcileLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

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
    processingPolicy: invoice.processingPolicy ?? null,
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
  titusCheckoutId,
  titusRefundId,
}: {
  squarePaymentId?: string;
  stripePaymentIntentId?: string;
  titusCheckoutId?: string;
  titusRefundId?: string;
}) {
  if (squarePaymentId) {
    const existing = await db().collection("transactions").where("squarePaymentId", "==", squarePaymentId).limit(1).get();
    if (!existing.empty) return true;
  }
  if (stripePaymentIntentId) {
    const existing = await db().collection("transactions").where("stripePaymentIntentId", "==", stripePaymentIntentId).limit(1).get();
    if (!existing.empty) return true;
  }
  if (titusCheckoutId) {
    const existing = await db().collection("transactions").where("titusCheckoutId", "==", titusCheckoutId).limit(1).get();
    if (!existing.empty) return true;
  }
  if (titusRefundId) {
    const existing = await db().collection("transactions").where("titusRefundId", "==", titusRefundId).limit(1).get();
    if (!existing.empty) return true;
  }
  return false;
}

interface AppliedPayment {
  applied: boolean;
  unlocked: boolean;
  duplicate: boolean;
  email: EmailDelivery | "failed";
}

async function refsForInvoice(
  collection: "galleries" | "listings",
  invoiceId: string,
  orderId: string | undefined,
  directId: string | undefined,
) {
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  if (directId) refs.set(directId, db().collection(collection).doc(directId));
  const lookups: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    db().collection(collection).where("invoiceId", "==", invoiceId).get(),
  ];
  if (orderId) lookups.push(db().collection(collection).where("orderId", "==", orderId).get());
  const snaps = await Promise.all(lookups);
  snaps.forEach((snap) => snap.docs.forEach((doc) => refs.set(doc.id, doc.ref)));
  return refs;
}

/** Full payment opens the listing and gallery. A partial payment only records the status. */
async function syncDownloadAccess({
  invoiceId,
  orderId,
  invoice,
  unlocked,
  auditEntry,
}: {
  invoiceId: string;
  orderId?: string;
  invoice: Record<string, unknown>;
  unlocked: boolean;
  auditEntry?: Record<string, unknown>;
}) {
  const galleryId = typeof invoice.galleryId === "string" ? invoice.galleryId : undefined;
  const listingId = typeof invoice.listingId === "string" ? invoice.listingId : undefined;
  const galleries = await refsForInvoice("galleries", invoiceId, orderId, galleryId);
  const listings = await refsForInvoice("listings", invoiceId, orderId, listingId);
  for (const ref of galleries.values()) {
    const snap = await ref.get().catch(() => null);
    const linked = snap?.exists ? snap.data()?.listingId : undefined;
    if (typeof linked === "string" && linked.trim()) {
      listings.set(linked, db().collection("listings").doc(linked));
    }
  }

  const patch = unlocked
    ? {
        clientGalleryDownloadsUnlocked: true,
        lockDownloads: false,
        downloadsReleased: true,
        downloadEnabled: true,
        paymentStatus: "paid",
        invoiceStatus: "paid",
        unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    : {
        paymentStatus: "partial",
        invoiceStatus: "partial",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

  await Promise.all([...galleries.values()].map((ref) => ref.update(patch).catch((err) => {
    console.error("[Payments] Gallery unlock failed:", err);
  })));
  await Promise.all([...listings.values()].map(async (ref) => {
    try {
      if (!auditEntry) {
        await ref.update(patch);
        return;
      }
      const snap = await ref.get();
      if (!snap.exists) return;
      const auditLog = Array.isArray(snap.data()?.auditLog) ? snap.data()?.auditLog : [];
      await ref.update({ ...patch, auditLog: [...auditLog, auditEntry] });
    } catch (err) {
      console.error("[Payments] Listing unlock failed:", err);
    }
  }));
}

function squarePaymentHistory({
  amount,
  unlocked,
  balance,
  email,
  squarePaymentId,
}: {
  amount: number;
  unlocked: boolean;
  balance: number;
  email: string;
  squarePaymentId?: string;
}) {
  const paidLabel = money(amount);
  const action = unlocked
    ? `Payment received ${paidLabel} via Square; downloads unlocked`
    : `Payment received ${paidLabel} via Square`;
  const balanceNote = !unlocked && balance > 0 ? ` Balance due ${money(balance)}.` : "";
  const mail = email === "allowlist"
    ? " Email sent via the test allowlist."
    : email === "sent"
      ? " Email sent."
      : email === "failed"
        ? " Receipt email failed."
        : " Email suppressed by the notify gate.";
  return {
    action,
    by: "Square",
    at: new Date().toISOString(),
    details: `${action}.${balanceNote}${mail}`.replace(/\s+/g, " ").trim(),
    email,
    ...(squarePaymentId ? { squarePaymentId } : {}),
  };
}

async function appendOrderHistory(orderId: string, entry: Record<string, unknown>) {
  if (!orderId) return;
  const ref = db().collection("orders").doc(orderId);
  try {
    const snap = await ref.get();
    if (!snap.exists) return;
    const history = Array.isArray(snap.data()?.history) ? snap.data()?.history : [];
    await ref.update({ history: [...history, entry] });
  } catch (err) {
    console.error("[Payments] Order history update failed:", err);
  }
}

/** Copy paid / partial onto the order and the order request the admin desk reads. */
async function rememberPaymentOnRecords(input: {
  orderId: string;
  orderRequestId: string;
  amountPaid: number;
  amountDue: number;
  status: "paid" | "partial" | "unpaid";
  squarePaymentId?: string;
  method: "square" | "stripe" | "pay_at_close";
  storedPaymentMethod?: string;
  titusCheckoutId?: string;
  /** First delivery only. A webhook retry must not add the deposit again. */
  incrementDeposit?: number;
}) {
  if (input.status === "unpaid") return;
  const patch: Record<string, unknown> = {
    paymentStatus: input.status,
    amountPaid: input.amountPaid,
    balanceDue: input.amountDue,
    ...(input.status === "paid" ? { paidAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    ...(input.squarePaymentId ? { squarePaymentId: input.squarePaymentId } : {}),
    ...(input.storedPaymentMethod === PAY_NOW_METHOD ? { paymentMethod: PAY_NOW_METHOD } : {}),
    ...(input.method === "pay_at_close"
      ? { paymentMethod: PAY_AT_CLOSE_METHOD, titusCheckoutId: input.titusCheckoutId || null }
      : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const writes: Array<Promise<unknown>> = [];
  if (input.orderId) {
    writes.push(db().collection("orders").doc(input.orderId).update({
      ...patch,
      ...(input.incrementDeposit ? { depositPaid: admin.firestore.FieldValue.increment(input.incrementDeposit) } : {}),
    }).catch((err) => console.error("[Payments] Order balance update failed:", err)));
  }
  if (input.orderRequestId) {
    writes.push(db().collection("orderRequests").doc(input.orderRequestId).update(patch).catch((err) => {
      console.error("[Payments] Order request balance update failed:", err);
    }));
  }
  await Promise.all(writes);
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
  titusCheckoutId,
  titusPaidAt,
  skipReceipt,
}: {
  invoiceId: string;
  orderId?: string;
  clientId?: string;
  clientName?: string;
  amount: number;
  method: "square" | "stripe" | "pay_at_close";
  squarePaymentId?: string;
  stripePaymentIntentId?: string;
  titusCheckoutId?: string;
  titusPaidAt?: string;
  /** Return-page reconcile must not send a receipt. The webhook still can. */
  skipReceipt?: boolean;
}): Promise<AppliedPayment | undefined> {
  const invoiceRef = db().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;

  const invoice = invoiceDoc.data()!;
  const resolvedOrderId = orderId || invoice.orderId || "";
  const resolvedClientId = clientId || invoice.clientId || "";
  const orderRequestId = typeof invoice.orderRequestId === "string" ? invoice.orderRequestId : "";
  const storedPaymentMethod = typeof invoice.paymentMethod === "string" ? invoice.paymentMethod : "";
  const sameSquare = Boolean(squarePaymentId) && invoice.squarePaymentId === squarePaymentId;
  const sameStripe = Boolean(stripePaymentIntentId) && invoice.stripePaymentIntentId === stripePaymentIntentId;
  const duplicate = sameSquare || sameStripe || await paymentAlreadyRecorded({ squarePaymentId, stripePaymentIntentId, titusCheckoutId });

  if (duplicate) {
    const currentPaid = roundSettlementMoney(Number(invoice.amountPaid) || 0);
    const total = roundSettlementMoney(Number(invoice.total) || 0);
    const due = roundSettlementMoney(Math.max(0, total - currentPaid));
    await rememberPaymentOnRecords({
      orderId: resolvedOrderId,
      orderRequestId,
      amountPaid: currentPaid,
      amountDue: due,
      status: paymentSettlementStatus(total, currentPaid, invoice.status),
      squarePaymentId,
      method,
      storedPaymentMethod,
      titusCheckoutId,
    });
    if (invoiceAllowsDownload(invoice)) {
      await syncDownloadAccess({
        invoiceId,
        orderId: resolvedOrderId,
        invoice,
        unlocked: true,
      });
    }
    return { applied: false, unlocked: false, duplicate: true, email: "suppressed" };
  }

  const currentPaid = Number(invoice.amountPaid) || 0;
  const total = roundSettlementMoney(Number(invoice.total) || 0);
  const newAmountPaid = roundSettlementMoney(currentPaid + amount);
  const newAmountDue = roundSettlementMoney(Math.max(0, total - newAmountPaid));
  const settlement = paymentSettlementStatus(total, newAmountPaid);
  const paymentMethod = storedPaymentMethod === PAY_NOW_METHOD || storedPaymentMethod === PAY_AT_CLOSE_METHOD
    ? storedPaymentMethod
    : method;

  await invoiceRef.update({
    amountPaid: newAmountPaid,
    amountDue: newAmountDue,
    status: settlement === "paid" ? "paid" : "partial",
    paidAt: settlement === "paid" ? admin.firestore.FieldValue.serverTimestamp() : null,
    paymentMethod,
    ...(method === "square" ? { paymentProvider: "square" } : {}),
    ...(squarePaymentId ? { squarePaymentId } : {}),
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    ...(titusCheckoutId ? { titusCheckoutId, titusSettledCheckoutId: titusCheckoutId } : {}),
    ...(titusPaidAt ? { titusPaidAt } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await rememberPaymentOnRecords({
    orderId: resolvedOrderId,
    orderRequestId,
    amountPaid: newAmountPaid,
    amountDue: newAmountDue,
    status: settlement,
    squarePaymentId,
    method,
    storedPaymentMethod,
    titusCheckoutId,
    incrementDeposit: amount,
  });

  const stamp = revenueStamp(invoice);
  if (resolvedClientId && stamp.countsTowardRevenue) {
    await db().collection("clients").doc(resolvedClientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Payments] Client spend update failed:", err));
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
    ...stamp,
    ...(squarePaymentId ? { squarePaymentId } : {}),
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    ...(titusCheckoutId ? { titusCheckoutId } : {}),
    ...(titusPaidAt ? { titusPaidAt } : {}),
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const unlocked = newAmountDue <= 0;
  let email: EmailDelivery | "failed" = "suppressed";
  if (!skipReceipt && invoice.clientEmail) {
    try {
      email = await deliverPaymentReceipt(invoice, invoiceId, newAmountPaid, newAmountDue, unlocked);
    } catch (err) {
      console.error("[Payments] Receipt email failed:", err);
      email = "failed";
    }
  }

  const auditEntry = method === "square"
    ? squarePaymentHistory({
        amount,
        unlocked,
        balance: newAmountDue,
        email,
        squarePaymentId,
      })
    : undefined;
  if (auditEntry) await appendOrderHistory(resolvedOrderId, auditEntry);
  await syncDownloadAccess({
    invoiceId,
    orderId: resolvedOrderId,
    invoice,
    unlocked,
    auditEntry,
  });

  if (resolvedOrderId) {
    void dispatchClientEmailNotifications({
      type: "payment_processed",
      record: {
        clientEmail: typeof invoice.clientEmail === "string" ? invoice.clientEmail : "",
        clientName: clientName || invoice.clientName,
        orderNumber: invoice.orderNumber,
        address: invoice.address || invoice.addressLabel,
        paymentAmount: amount,
        amount,
        paymentMethod: method,
        paymentId: squarePaymentId || stripePaymentIntentId || titusCheckoutId || invoiceId,
        squarePaymentId,
        stripePaymentIntentId,
        balanceDue: newAmountDue,
        paymentStatus: newAmountDue <= 0 ? "paid" : "partial",
        total,
      },
      recordId: resolvedOrderId,
      collection: "orders",
      requestId: orderRequestId,
    }).catch((err) => console.error("[Payments] Payment email notify failed:", err));
  }

  return { applied: true, unlocked, duplicate: false, email };
}

async function deliverPaymentReceipt(
  invoice: Record<string, unknown>,
  invoiceId: string,
  amountPaid: number,
  balance: number,
  unlocked: boolean,
): Promise<EmailDelivery> {
  const to = typeof invoice.clientEmail === "string" ? invoice.clientEmail : "";
  if (!to) return "suppressed";
  const offer = await ensureDotOptInLink(invoice);
  const rendered = buildPaymentReceipt({
    invoice,
    invoiceId,
    unlocked,
    amountPaid,
    balance,
    galleryId: invoice.galleryId,
    listing: typeof invoice.listingId === "string" ? { id: invoice.listingId } : null,
  });
  const doorsOpen = doorsOpenReceiptEmailHtml(offer.url || "");
  const html = rendered.html.includes("</body>")
    ? rendered.html.replace("</body>", `${doorsOpen}</body>`)
    : `${rendered.html}${doorsOpen}`;
  const subtotal = Number(invoice.subtotal) || 0;
  const promotions = Number(invoice.promoDiscount) || Number(invoice.promotions) || 0;
  const fees = Number(invoice.fees) || 0;
  const processingAmount = receiptProcessing({
    invoice,
    subtotal,
    promotions,
    fees,
    totalPaid: amountPaid,
  });
  const result = await sendEmail({
    to,
    template: "payment_receipt",
    subject: rendered.subject,
    html,
    text: rendered.text,
    variables: {
      clientName: String(invoice.clientName || ""),
      amount: money(amountPaid),
      invoiceNumber: receiptEmailNumber({
        invoiceNumber: invoice.invoiceNumber,
        id: invoiceId,
        createdAt: invoice.createdAt,
      }),
      balance: money(balance),
      processing: money(processingAmount),
      subtotal: money(subtotal),
      promotions: money(promotions),
      fees: money(fees),
      totalPaid: money(amountPaid),
      paidAt: "",
      galleryUrl: typeof invoice.galleryId === "string" && invoice.galleryId
        ? publicClientUrl(`/gallery/${encodeURIComponent(invoice.galleryId)}`)
        : "",
      dotOptInUrl: offer.url || "",
    },
  });
  return result.delivery;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function isDepositSquarePayment(invoice: Record<string, unknown>, payment: Record<string, unknown>): boolean {
  if (invoice.depositRequired !== true) return false;
  const linkRaw = payment.payment_link_id || payment.paymentLinkId;
  const linkId = typeof linkRaw === "string" ? linkRaw.trim() : "";
  const orderId = typeof payment.order_id === "string" ? payment.order_id.trim() : "";
  const depositLink = typeof invoice.squareDepositPaymentLinkId === "string"
    ? invoice.squareDepositPaymentLinkId.trim()
    : "";
  const depositOrder = typeof invoice.squareDepositOrderId === "string"
    ? invoice.squareDepositOrderId.trim()
    : "";
  if (linkId && depositLink && linkId === depositLink) return true;
  if (orderId && depositOrder && orderId === depositOrder) return true;
  return false;
}

/**
 * Senior-living deposit only. Leaves the invoice in draft so the after-shoot
 * send bills the remaining balance. Does not publish a Square invoice.
 */
function depositPaymentRecorded(
  payments: unknown,
  squarePaymentId: string,
): boolean {
  if (!squarePaymentId || !Array.isArray(payments)) return false;
  return payments.some((entry) => {
    return entry
      && typeof entry === "object"
      && (entry as { squarePaymentId?: string }).squarePaymentId === squarePaymentId;
  });
}

/**
 * Senior-living deposit only. Leaves the invoice in draft so the after-shoot
 * send bills the remaining balance. Does not publish a Square invoice.
 * The payment id is the idempotency key: a repeat delivery does not add again.
 */
async function applyDepositPayment({
  invoiceId,
  amount,
  squarePaymentId,
}: {
  invoiceId: string;
  amount: number;
  squarePaymentId?: string;
}) {
  const paymentKey = squarePaymentId?.trim() || "";
  const invoiceRef = db().collection("invoices").doc(invoiceId);
  const transactionRef = db().collection("transactions").doc(
    paymentKey ? `square-${paymentKey}` : `deposit-${invoiceId}`,
  );

  let confirmEvent: { calendarId: string | null; eventId: string; orderNumber: string } | null = null;
  let confirmHeadshot: { calendarId: string | null; eventId: string } | null = null;
  let lateApprenticeOrderId = "";
  let lateHeadshotOrderId = "";
  await db().runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) return;
    const invoice = invoiceSnap.data() || {};
    const transactionSnap = await tx.get(transactionRef);
    if (transactionSnap.exists || depositPaymentRecorded(invoice.payments, paymentKey)) return;
    if ((Number(invoice.depositPaid) || 0) > 0 || invoice.depositPaidAt) return;

    const total = Number(invoice.total) || 0;
    const depositPaid = roundMoney((Number(invoice.depositPaid) || 0) + amount);
    const amountDue = roundMoney(Math.max(0, total - depositPaid));
    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    const nextPayments = [
      ...payments,
      {
        type: "deposit",
        amount,
        ...(paymentKey ? { squarePaymentId: paymentKey } : {}),
        paidAt: new Date().toISOString(),
      },
    ];
    const orderId = typeof invoice.orderId === "string" ? invoice.orderId : "";
    const orderRequestId = typeof invoice.orderRequestId === "string" ? invoice.orderRequestId : "";
    const orderRef = orderId ? db().collection("orders").doc(orderId) : null;
    const requestRef = orderRequestId ? db().collection("orderRequests").doc(orderRequestId) : null;
    const orderSnap = orderRef ? await tx.get(orderRef) : null;
    const requestSnap = requestRef ? await tx.get(requestRef) : null;

    tx.update(invoiceRef, {
      depositPaid,
      depositPaidAt: admin.firestore.FieldValue.serverTimestamp(),
      payments: nextPayments,
      amountPaid: depositPaid,
      amountDue,
      status: "draft",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (orderRef && orderSnap?.exists) {
      const order = (orderSnap.data() || {}) as Record<string, unknown>;
      // Apprentice bookings are only confirmed once the $25 booking fee lands.
      const awaitingFee = order.status === APPRENTICESHIP_AWAITING_DEPOSIT_STATUS;
      const confirmsBooking = order.source === APPRENTICESHIP_ORDER_SOURCE && awaitingFee;
      const confirmsHeadshot = order.source === HEADSHOTS_ORDER_SOURCE && awaitingFee;
      // Paid after the 60-minute hold expired: re-confirm only if the time is still open.
      if (order.source === APPRENTICESHIP_ORDER_SOURCE && order.status === APPRENTICESHIP_EXPIRED_STATUS && orderId) {
        lateApprenticeOrderId = orderId;
      }
      if (order.source === HEADSHOTS_ORDER_SOURCE && order.status === APPRENTICESHIP_EXPIRED_STATUS && orderId) {
        lateHeadshotOrderId = orderId;
      }
      const depositStatus = paymentSettlementStatus(total, depositPaid);
      tx.update(orderRef, {
        depositPaid,
        amountPaid: depositPaid,
        balanceDue: amountDue,
        paymentStatus: depositStatus,
        ...(paymentKey ? { squarePaymentId: paymentKey } : {}),
        ...(depositStatus === "paid" ? { paidAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
        ...((confirmsBooking || confirmsHeadshot)
          ? {
            status: "confirmed",
            depositStatus: "paid",
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (confirmsBooking && typeof order.calendarEventId === "string" && order.calendarEventId) {
        confirmEvent = {
          calendarId: typeof order.calendarId === "string" ? order.calendarId : null,
          eventId: order.calendarEventId,
          orderNumber: String(order.orderNumber || ""),
        };
      }
      if (confirmsHeadshot && typeof order.calendarEventId === "string" && order.calendarEventId) {
        confirmHeadshot = {
          calendarId: typeof order.calendarId === "string" ? order.calendarId : null,
          eventId: order.calendarEventId,
        };
      }
    }
    if (requestRef && requestSnap?.exists) {
      const request = (requestSnap.data() || {}) as Record<string, unknown>;
      const requestStatus = paymentSettlementStatus(total, depositPaid);
      tx.update(requestRef, {
        depositPaid,
        amountPaid: depositPaid,
        paymentStatus: requestStatus,
        ...((request.source === APPRENTICESHIP_ORDER_SOURCE || request.source === HEADSHOTS_ORDER_SOURCE)
          ? { depositStatus: "paid" }
          : {}),
        ...(paymentKey ? { squarePaymentId: paymentKey } : {}),
        balanceDue: amountDue,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    tx.set(transactionRef, {
      type: "payment",
      kind: "deposit",
      orderId,
      invoiceId,
      clientId: invoice.clientId || "",
      clientName: invoice.clientName || "",
      amount,
      paymentMethod: "square",
      status: "completed",
      ...(paymentKey ? { squarePaymentId: paymentKey } : {}),
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: "system",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (lateApprenticeOrderId) {
    try {
      await resolveLateApprenticeshipPayment(lateApprenticeOrderId);
    } catch (error) {
      console.error("[Payments] Late apprenticeship payment follow-up failed:", error);
    }
  }
  if (lateHeadshotOrderId) {
    try {
      await resolveLateHeadshotPayment(lateHeadshotOrderId);
    } catch (error) {
      console.error("[Payments] Late headshot payment follow-up failed:", error);
    }
  }

  const held = confirmEvent as { calendarId: string | null; eventId: string; orderNumber: string } | null;
  if (held) {
    try {
      await confirmApprenticeshipEvent(held);
    } catch (error) {
      console.error("[Payments] Apprenticeship calendar confirm failed:", error);
    }
  }
  const headshotHeld = confirmHeadshot as { calendarId: string | null; eventId: string } | null;
  if (headshotHeld) {
    try {
      await confirmHeadshotHold(headshotHeld);
    } catch (error) {
      console.error("[Payments] Headshot calendar confirm failed:", error);
    }
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
        processing: money(invoice.processing ?? 0),
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

    await deliverPaymentReceipt(
      invoice,
      invoiceDoc.id,
      Number(invoice.amountPaid || invoice.total) || 0,
      amountStillDue(invoice),
      true,
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[Payments] Send receipt error:", err);
    return res.status(500).json({ error: "Failed to send receipt." });
  }
});

router.get("/pay-at-close", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const adjustments = await loadPricingAdjustments();
  const offer = payAtCloseOfferFromAdjustments(process.env, adjustments);
  let catalog = packagesForStaffEditor([]);
  try {
    const snap = await db().collection("packages").get();
    catalog = packagesForStaffEditor(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  } catch (err) {
    console.error("[Pay at Close] Catalog read failed — using the seeded catalog", err);
  }
  const packages = premiumCatalogPackages(catalog, 4).map((item) => ({
    id: item.bookingId || item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    features: item.includedServices,
  }));
  return res.json({ ...offer, packages });
});

async function beginPayAtCloseCheckout(invoiceDoc: FirebaseFirestore.DocumentSnapshot) {
  const invoice = invoiceDoc.data() || {};
  const offer = payAtCloseOfferFromAdjustments(process.env, await loadPricingAdjustments());
  if (!offer.offered) return { status: 403, body: { error: "Pay at Close is not available." } };
  if (invoiceAllowsDownload(invoice)) return { status: 200, body: { paid: true } };

  let payable = invoice;
  if (invoice.paymentMethod !== PAY_AT_CLOSE_METHOD) {
    const draft = buildBookingInvoiceDraft({
      lineItems: invoice.lineItems,
      total: invoice.total,
      pricing: { subtotal: invoice.subtotal, tax: invoice.tax },
      clientEmail: String(invoice.clientEmail || ""),
      clientName: String(invoice.clientName || ""),
      promoCode: typeof invoice.promoCode === "string" ? invoice.promoCode : null,
      promoDiscount: invoice.promoDiscount,
      processing: invoice.processing,
      applyProcessing: false,
    });
    const shaped = shapePayAtCloseDraft({ ...draft, amountPaid: Number(invoice.amountPaid) || 0 }, payAtCloseCustomerOffer(offer));
    payable = { ...invoice, ...shaped };
    await invoiceDoc.ref.update({
      lineItems: shaped.lineItems,
      subtotal: shaped.subtotal,
      total: shaped.total,
      amountDue: shaped.amountDue,
      processing: shaped.processing,
      processingPolicy: shaped.processingPolicy,
      payAtCloseFee: shaped.payAtCloseFee,
      paymentMethod: PAY_AT_CLOSE_METHOD,
      paymentProvider: PAY_AT_CLOSE_METHOD,
      paymentStatus: PAY_AT_CLOSE_PENDING_STATUS,
      status: PAY_AT_CLOSE_PENDING_STATUS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const due = amountStillDue(payable);
  if (due <= 0) return { status: 400, body: { error: "This invoice cannot be paid online." } };
  const payToken = await payTokenForLink(invoiceDoc);
  const successUrl = clientInvoiceUrl({ id: invoiceDoc.id, payToken, status: "sent" }, undefined, { paid: "1" }) || "";
  const cancelUrl = clientInvoiceUrl({ id: invoiceDoc.id, payToken, status: "sent" }) || successUrl;
  const name = typeof payable.clientName === "string" ? payable.clientName.trim() : "";
  const created = await createTitusCheckout({
    invoiceId: invoiceDoc.id,
    orderId: typeof payable.orderId === "string" ? payable.orderId : null,
    amount: due,
    description: `Iconic Images ${payable.invoiceNumber || invoiceDoc.id}`,
    successUrl,
    cancelUrl,
    email: typeof payable.clientEmail === "string" ? payable.clientEmail : null,
    firstName: name.split(/\s+/)[0] || null,
    lastName: name.split(/\s+/).slice(1).join(" ") || null,
    address: typeof payable.billToAddress === "string" ? payable.billToAddress : null,
    phone: typeof payable.billingPhone === "string" ? payable.billingPhone : null,
    checkoutStatus: typeof payable.titusCheckoutStatus === "string" ? payable.titusCheckoutStatus : null,
  }, { env: process.env });
  if (created.ok === false) return { status: 502, body: { error: created.error } };

  await invoiceDoc.ref.update({
    paymentMethod: PAY_AT_CLOSE_METHOD,
    paymentProvider: PAY_AT_CLOSE_METHOD,
    paymentStatus: PAY_AT_CLOSE_PENDING_STATUS,
    status: invoice.status === "paid" ? "paid" : PAY_AT_CLOSE_PENDING_STATUS,
    titusCheckoutId: created.checkoutId,
    titusCheckoutUrl: created.checkoutUrl,
    titusCheckoutStatus: created.status || "requires-payment",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const requestId = typeof payable.orderRequestId === "string" ? payable.orderRequestId : "";
  if (requestId) {
    await db().collection("orderRequests").doc(requestId).update({
      paymentMethod: PAY_AT_CLOSE_METHOD,
      paymentStatus: PAY_AT_CLOSE_PENDING_STATUS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[Pay at Close] Order request was not marked:", err));
  }
  return { status: 200, body: { checkoutUrl: created.checkoutUrl, provider: PAY_AT_CLOSE_METHOD } };
}

router.post("/invoice/:id/pay-at-close", async (req: Request, res: Response) => {
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
    const result = await beginPayAtCloseCheckout(invoiceDoc);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[Pay at Close] Checkout start failed:", err instanceof Error ? err.message : "error");
    return res.status(500).json({ error: "Pay at Close checkout could not be started." });
  }
});

router.post("/pay-at-close-webhook", async (req: Request, res: Response) => {
  try {
    const rawBody = await readSquareWebhookRawBody(req);
    if (rawBody === null) return res.status(400).json({ error: "Pay at Close webhook raw body is unavailable." });
    const header = (name: string) => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const result = await applyPayAtCloseWebhook(rawBody, {
      signature: header("x-webhook-signature"),
      timestamp: header("x-webhook-timestamp"),
    }, {
      env: process.env,
      findInvoiceById: async (id) => {
        const snap = await db().collection("invoices").doc(id).get();
        return snap.exists ? { id: snap.id, data: snap.data() || {} } : null;
      },
      findInvoiceByCheckoutId: async (checkoutId) => {
        const snap = await db().collection("invoices").where("titusCheckoutId", "==", checkoutId).limit(1).get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, data: doc.data() || {} };
      },
      save: async (id, patch) => {
        await db().collection("invoices").doc(id).update({
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      },
      applyPayment: (input) => applySuccessfulPayment({
        invoiceId: input.invoiceId,
        orderId: input.orderId,
        clientId: input.clientId,
        clientName: input.clientName,
        amount: input.amount,
        method: "pay_at_close",
        titusCheckoutId: input.titusCheckoutId,
        titusPaidAt: input.paidAt,
      }),
      recordRefund: async (input) => {
        if (await paymentAlreadyRecorded({ titusRefundId: input.refundId })) return { duplicate: true };
        const ref = db().collection("invoices").doc(input.invoiceId);
        const snap = await ref.get();
        if (!snap.exists) return { duplicate: false };
        const invoice = snap.data() || {};
        const paid = Number(invoice.amountPaid) || 0;
        const total = Number(invoice.total) || 0;
        const nextPaid = roundMoney(Math.max(0, paid - input.amount));
        const nextDue = roundMoney(Math.max(0, total - nextPaid));
        await ref.update({
          amountPaid: nextPaid,
          amountDue: nextDue,
          status: nextDue <= 0 ? "paid" : nextPaid > 0 ? "partial" : "failed",
          paymentMethod: PAY_AT_CLOSE_METHOD,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (typeof invoice.orderId === "string" && invoice.orderId) {
          await db().collection("orders").doc(invoice.orderId).update({
            balanceDue: nextDue,
            paymentStatus: nextDue <= 0 ? "paid" : "partial",
            paymentMethod: PAY_AT_CLOSE_METHOD,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch((err) => console.error("[Pay at Close] Refund order update failed:", err));
        }
        await db().collection("transactions").add({
          type: "refund",
          invoiceId: input.invoiceId,
          orderId: invoice.orderId || "",
          clientId: invoice.clientId || "",
          clientName: invoice.clientName || "",
          amount: -input.amount,
          paymentMethod: PAY_AT_CLOSE_METHOD,
          status: "completed",
          titusRefundId: input.refundId,
          titusCheckoutId: input.checkoutId,
          processedBy: "system",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { duplicate: false };
      },
      mirrorSquare: (invoice, input) => mirrorPayAtCloseOnSquareOrder(invoice, input, { env: process.env }),
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[Pay at Close] Webhook failed:", err instanceof Error ? err.message : "error");
    return res.status(500).json({ error: "Pay at Close webhook handler failed." });
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
    const doorsOpen = paid ? await ensureDotOptInLink(invoice) : null;
    const payAtCloseOffer = payAtCloseOfferFromAdjustments(process.env, await loadPricingAdjustments());
    const shared = {
      id: invoiceDoc.id,
      paid,
      invoiceNumber: invoiceNumberFields(invoice, invoiceDoc.id),
      clientName: invoice.clientName,
      ...invoiceMoney(invoice),
      status: invoice.status,
      paymentProvider: provider,
      paymentMethod: invoice.paymentMethod || null,
      payAtCloseOffered: payAtCloseOffer.offered,
      payAtCloseFee: invoice.payAtCloseFee ?? null,
      payAtCloseFailure: typeof invoice.payAtCloseFailure === "string" ? invoice.payAtCloseFailure : null,
      payAtCloseApplication: typeof invoice.payAtCloseApplication === "string" ? invoice.payAtCloseApplication : null,
      canPayOnline: provider === "stripe" ? stripeReady() : squareReady(),
      canPayAtClose: payAtCloseOffer.offered,
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
      if (doorsOpen) {
        body.dotOptIn = doorsOpen.dotOptIn;
        if (doorsOpen.url) body.dotOptInUrl = doorsOpen.url;
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
      ...(doorsOpen
        ? {
            dotOptIn: doorsOpen.dotOptIn,
            ...(doorsOpen.url ? { dotOptInUrl: doorsOpen.url } : {}),
          }
        : {}),
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

    // Stored balance only. New invoices already include 2.8% in total.
    // Legacy open invoices keep charging amountStillDue until a migration updates them.
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

      const created = await createSquareQuickPayLink({
        invoiceId: invoiceDoc.id,
        purpose: "checkout",
        amountCents: Math.round(amountDue * 100),
        name: `Iconic Images Invoice ${invoice.invoiceNumber || invoiceDoc.id}`,
        redirectUrl: clientInvoiceUrl({
          id: invoiceDoc.id,
          payToken,
          status: invoice.status,
        }, undefined, { paid: "1" }) || invoiceUrl,
        prefill: squareBuyerPrefill(invoice),
        paymentNote: squarePaymentNote(invoiceDoc.id, invoice.invoiceNumber),
        logLabel: "Square checkout error",
        failureMessage: SQUARE_CHECKOUT_FAILURE,
      });
      if (created.ok === false) return res.status(500).json({ error: created.message });

      await invoiceDoc.ref.update({
        status: "sent",
        paymentProvider: "square",
        paymentMethod: "square",
        paymentUrl: created.checkoutUrl || invoiceUrl,
        squarePaymentLinkId: created.linkId,
        squareOrderId: created.orderId,
        sentAt: invoice.sentAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({ checkoutUrl: created.checkoutUrl, provider: "square" });
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

router.post("/invoice/:id/deposit-checkout", async (req: Request, res: Response) => {
  try {
    if (!seniorDepositCheckoutLive()) return invoiceNotFound(res);
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

    if (invoice.depositRequired !== true) {
      return res.status(403).json({ error: "This invoice does not take a deposit." });
    }
    const orderId = typeof invoice.orderId === "string" ? invoice.orderId : "";
    const orderSnap = orderId ? await db().collection("orders").doc(orderId).get() : null;
    const order = orderSnap && orderSnap.exists ? orderSnap.data() || {} : null;
    const orderSource = String(order?.source || "");
    if (!order || (orderSource !== "senior-living" && orderSource !== APPRENTICESHIP_ORDER_SOURCE && orderSource !== HEADSHOTS_ORDER_SOURCE)) {
      return res.status(403).json({ error: "Deposits are only for senior living orders." });
    }
    const alreadyPaid = (Number(invoice.depositPaid) || 0) > 0 || Boolean(invoice.depositPaidAt);
    if (alreadyPaid) {
      return res.status(409).json({ error: "The deposit is already paid." });
    }
    if (orderSource === APPRENTICESHIP_ORDER_SOURCE && order.status === APPRENTICESHIP_EXPIRED_STATUS) {
      return res.status(409).json({
        error: `This hold expired after ${APPRENTICESHIP_HOLD_MINUTES} minutes without the $25 booking fee. Please book a new time.`,
      });
    }
    if (orderSource === HEADSHOTS_ORDER_SOURCE && order.status === APPRENTICESHIP_EXPIRED_STATUS) {
      return res.status(409).json({
        error: `This hold expired after ${APPRENTICESHIP_HOLD_MINUTES} minutes without the $10 booking fee. Please book a new time.`,
      });
    }
    if (String(invoice.status || "draft") !== "draft") {
      return res.status(409).json({ error: "The deposit can only be paid while the invoice is a draft." });
    }
    const depositAmount = Number(invoice.depositAmount);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({ error: "This invoice has no deposit amount." });
    }
    const storedLinkId = typeof invoice.squareDepositPaymentLinkId === "string"
      ? invoice.squareDepositPaymentLinkId.trim()
      : "";
    const storedOrderId = typeof invoice.squareDepositOrderId === "string"
      ? invoice.squareDepositOrderId.trim()
      : "";
    const storedUrl = typeof invoice.squareDepositCheckoutUrl === "string"
      ? invoice.squareDepositCheckoutUrl.trim()
      : "";
    if (storedUrl && (storedLinkId || storedOrderId)) {
      return res.json({ checkoutUrl: storedUrl, provider: "square" });
    }
    if (!squareReady()) return res.status(503).json({ error: "Square payments are not configured yet." });

    await payTokenForLink(invoiceDoc);
    const orderNumber = String(invoice.orderNumber || order.orderNumber || "");
    const amountCents = Math.round(depositAmount * 100);
    const created = await createSquareQuickPayLink({
      invoiceId: invoiceDoc.id,
      purpose: "deposit",
      amountCents,
      name: orderSource === APPRENTICESHIP_ORDER_SOURCE || orderSource === HEADSHOTS_ORDER_SOURCE
        ? `Iconic Images booking fee ${orderNumber || invoice.invoiceNumber || invoiceDoc.id}`
        : `Iconic Images deposit ${invoice.invoiceNumber || invoiceDoc.id}`,
      redirectUrl: `${appUrl()}${
        orderSource === HEADSHOTS_ORDER_SOURCE
          ? headshotBookingReturnPath(orderNumber)
          : orderSource === APPRENTICESHIP_ORDER_SOURCE
            ? apprenticeshipBookingReturnPath(orderNumber, invoice.depositReturn)
            : seniorLivingDepositReturnPath(orderNumber)
      }`,
      prefill: squareBuyerPrefill(invoice),
      paymentNote: squarePaymentNote(invoiceDoc.id, invoice.invoiceNumber),
      logLabel: "Square deposit checkout error",
      failureMessage: SQUARE_DEPOSIT_CHECKOUT_FAILURE,
    });
    if (created.ok === false) return res.status(500).json({ error: created.message });
    await invoiceDoc.ref.update({
      squareDepositPaymentLinkId: created.linkId,
      squareDepositOrderId: created.orderId,
      ...(created.checkoutUrl ? { squareDepositCheckoutUrl: created.checkoutUrl } : {}),
      paymentProvider: "square",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ checkoutUrl: created.checkoutUrl, provider: "square" });
  } catch (err) {
    console.error("[Payments] Deposit checkout error:", err);
    return res.status(500).json({ error: SQUARE_DEPOSIT_CHECKOUT_FAILURE });
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

function squareWebhookRequestPath(req: Request): string {
  const raw = req.originalUrl || req.url || req.path || "";
  return raw.split("?")[0];
}

function squareSignatureHeader(req: Request): string | undefined {
  const header = req.headers["x-square-hmacsha256-signature"];
  return Array.isArray(header) ? header[0] : header;
}

function squareSignatureValid(
  rawBody: string,
  received: string | undefined,
  key: string,
  urls: string[] = squareWebhookNotificationUrls(),
): boolean {
  return urls.some((url) => squareWebhookSignatureValid(rawBody, received, key, url));
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

async function findSquareSaleDoc(collectionName: string, payment: Record<string, unknown>) {
  const orderId = typeof payment.order_id === "string" ? payment.order_id.trim() : "";
  const linkRaw = payment.payment_link_id || payment.paymentLinkId;
  const linkId = typeof linkRaw === "string" ? linkRaw.trim() : "";
  const steps: Array<[string, string]> = [];
  if (orderId) steps.push(["squareOrderId", orderId]);
  if (linkId) {
    steps.push(["squarePaymentLinkId", linkId]);
    steps.push(["squareLinkId", linkId]);
  }
  for (const [field, value] of steps) {
    const snap = await db().collection(collectionName).where(field, "==", value).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

async function markSquareOrderPaid(
  ref: FirebaseFirestore.DocumentReference,
  data: Record<string, unknown>,
  amount: number,
  squarePaymentId: string,
) {
  if (data.squarePaymentId === squarePaymentId) return;
  const pricing = data.pricing && typeof data.pricing === "object" ? data.pricing as { total?: unknown } : {};
  const total = roundSettlementMoney(Number(data.total) || Number(pricing.total) || amount);
  const paid = roundSettlementMoney(amount);
  const status = paymentSettlementStatus(total, paid);
  const current = typeof data.status === "string" ? data.status : "";
  await ref.update({
    status: current === "awaiting-payment" ? "new" : current || "new",
    paymentStatus: status,
    amountPaid: paid,
    balanceDue: roundSettlementMoney(Math.max(0, total - paid)),
    squarePaymentId,
    ...(status === "paid" ? { paidAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * No invoice match yet. If the order request still points at an invoice,
 * settle that invoice (full Pay at Booking vs a deposit). Otherwise mark the
 * prepaid order itself.
 */
async function settlePrepaidOrderRequest(
  payment: Record<string, unknown>,
  amount: number,
  options?: { skipReceipt?: boolean },
): Promise<boolean> {
  const paymentId = typeof payment.id === "string" ? payment.id.trim() : "";
  if (!paymentId) return false;
  const request = await findSquareSaleDoc("orderRequests", payment);
  const legacy = request ? null : await findSquareSaleDoc("orders", payment);
  const primary = request || legacy;
  if (!primary) return false;
  const data = primary.data() || {};
  const invoiceId = typeof data.invoiceId === "string" ? data.invoiceId.trim() : "";
  if (invoiceId) {
    const invoiceSnap = await db().collection("invoices").doc(invoiceId).get();
    if (invoiceSnap.exists) {
      const invoice = invoiceSnap.data() || {};
      if (invoiceProvider(invoice) !== "stripe" && !isMirroredPayAtCloseSquarePayment(payment, invoice)) {
        if (isDepositSquarePayment(invoice, payment)) {
          await applyDepositPayment({ invoiceId, amount, squarePaymentId: paymentId });
          return true;
        }
        const linkedOrderId = typeof invoice.orderId === "string" ? invoice.orderId : "";
        await applySuccessfulPayment({
          invoiceId,
          orderId: linkedOrderId || (request ? undefined : primary.id),
          clientId: typeof invoice.clientId === "string" ? invoice.clientId : undefined,
          clientName: typeof invoice.clientName === "string" ? invoice.clientName : undefined,
          amount,
          method: "square",
          squarePaymentId: paymentId,
          skipReceipt: options?.skipReceipt,
        });
        return true;
      }
    }
  }
  await markSquareOrderPaid(primary.ref, data, amount, paymentId);
  const twin = await db().collection(request ? "orders" : "orderRequests").doc(primary.id).get();
  if (twin.exists) await markSquareOrderPaid(twin.ref, twin.data() || {}, amount, paymentId);
  return true;
}

function squareMoneyCents(payment: Record<string, unknown>): number {
  const amountMoney = payment.amount_money;
  const totalMoney = payment.total_money;
  const amount = amountMoney && typeof amountMoney === "object"
    ? Number((amountMoney as { amount?: unknown }).amount)
    : NaN;
  const total = totalMoney && typeof totalMoney === "object"
    ? Number((totalMoney as { amount?: unknown }).amount)
    : NaN;
  if (Number.isFinite(amount)) return amount;
  if (Number.isFinite(total)) return total;
  return 0;
}

/** When the payment has no note or reference, read the Square order's reference id. */
async function paymentWithSquareOrderReference(payment: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (invoiceIdFromSquareNote(payment.note || payment.payment_note)) return payment;
  if (typeof payment.reference_id === "string" && payment.reference_id.trim()) return payment;
  const orderId = typeof payment.order_id === "string" ? payment.order_id.trim() : "";
  if (!orderId) return payment;
  const snapshot = await fetchSquareOrderSnapshot(orderId, process.env).catch(() => null);
  if (!snapshot?.referenceId) return payment;
  return { ...payment, reference_id: snapshot.referenceId };
}

/** Idempotent settlement for one completed Square payment. */
export async function settleCompletedSquarePayment(
  payment: Record<string, unknown>,
  options?: { skipReceipt?: boolean },
): Promise<Record<string, unknown>> {
  if (!payment?.id || payment.status !== "COMPLETED") return { received: true };
  const amount = squareMoneyCents(payment) / 100;
  if (amount <= 0) return { received: true, ignored: "zero-amount" };

  const matchedPayment = await paymentWithSquareOrderReference(payment);
  const invoiceDoc = await findInvoiceForSquarePayment(matchedPayment);
  if (!invoiceDoc) {
    const settledOrder = await settlePrepaidOrderRequest(matchedPayment, amount, options);
    if (settledOrder) return { received: true, orderRequest: true };
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
    return { received: true, unmatched: true };
  }

  const invoice = invoiceDoc.data() || {};
  if (invoiceProvider(invoice) === "stripe") {
    return { received: true, ignored: "stripe-invoice" };
  }
  if (isMirroredPayAtCloseSquarePayment(matchedPayment, invoice)) {
    return { received: true, ignored: "pay-at-close-external" };
  }

  if (isDepositSquarePayment(invoice, matchedPayment)) {
    await applyDepositPayment({
      invoiceId: invoiceDoc.id,
      amount,
      squarePaymentId: String(payment.id),
    });
    return { received: true, deposit: true };
  }

  const settled = await applySuccessfulPayment({
    invoiceId: invoiceDoc.id,
    orderId: typeof invoice.orderId === "string" ? invoice.orderId : undefined,
    clientId: typeof invoice.clientId === "string" ? invoice.clientId : undefined,
    clientName: typeof invoice.clientName === "string" ? invoice.clientName : undefined,
    amount,
    method: "square",
    squarePaymentId: String(payment.id),
    skipReceipt: options?.skipReceipt,
  });

  return { received: true, ...(settled ?? {}) };
}

/** Return page. Confirms the Square payment server-side and does not email the client. */
export async function reconcilePayNowOrder(rawOrderNumber: string): Promise<{
  paymentStatus: "paid" | "partial" | "unpaid" | "pending";
  orderNumber: string;
}> {
  const keys = orderNumberLookupKeys(rawOrderNumber);
  const shown = keys[0] || "";
  if (!shown) return { paymentStatus: "unpaid", orderNumber: "" };

  let request: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (const key of keys) {
    const snap = await db().collection("orderRequests").where("orderNumber", "==", key).limit(1).get();
    if (!snap.empty) {
      request = snap.docs[0];
      break;
    }
  }
  if (!request) return { paymentStatus: "pending", orderNumber: shown };

  const data = request.data() || {};
  const orderNumber = typeof data.orderNumber === "string" && data.orderNumber ? data.orderNumber : shown;
  const invoiceId = typeof data.invoiceId === "string" ? data.invoiceId.trim() : "";
  const invoiceSnap = invoiceId ? await db().collection("invoices").doc(invoiceId).get() : null;
  const invoice = invoiceSnap?.exists ? (invoiceSnap.data() || {}) : {};
  const total = roundSettlementMoney(Number(invoice.total) || Number(data.total) || 0);
  const already = roundSettlementMoney(Math.max(Number(invoice.amountPaid) || 0, Number(data.amountPaid) || 0));
  const current = paymentSettlementStatus(total, already, invoice.paymentStatus || invoice.status || data.paymentStatus);
  if (current === "paid" || current === "partial") {
    await rememberPaymentOnRecords({
      orderId: typeof invoice.orderId === "string" ? invoice.orderId : "",
      orderRequestId: request.id,
      amountPaid: already,
      amountDue: roundSettlementMoney(Math.max(0, total - already)),
      status: current,
      squarePaymentId: typeof invoice.squarePaymentId === "string" ? invoice.squarePaymentId : undefined,
      method: "square",
      storedPaymentMethod: typeof invoice.paymentMethod === "string" ? invoice.paymentMethod : typeof data.paymentMethod === "string" ? data.paymentMethod : "",
    });
    return { paymentStatus: current, orderNumber };
  }

  const squareOrderId = String(invoice.squareOrderId || data.squareOrderId || "").trim();
  if (!squareOrderId) return { paymentStatus: "pending", orderNumber };
  const snapshot = await fetchSquareOrderSnapshot(squareOrderId, process.env);
  const paymentId = snapshot?.paymentIds[0] || "";
  if (!paymentId) return { paymentStatus: "pending", orderNumber };
  const payment = await fetchSquarePayment(paymentId, process.env);
  if (!payment || payment.status !== "COMPLETED") return { paymentStatus: "pending", orderNumber };

  const referenceId = typeof payment.reference_id === "string" && payment.reference_id.trim()
    ? payment.reference_id
    : snapshot?.referenceId || invoiceId;
  await settleCompletedSquarePayment({
    ...payment,
    order_id: typeof payment.order_id === "string" && payment.order_id ? payment.order_id : squareOrderId,
    ...(referenceId ? { reference_id: referenceId } : {}),
  }, { skipReceipt: true });

  const afterInvoice = invoiceId ? await db().collection("invoices").doc(invoiceId).get() : null;
  const afterRequest = await request.ref.get();
  const afterInvoiceData = afterInvoice?.exists ? (afterInvoice.data() || {}) : {};
  const afterRequestData = afterRequest.data() || {};
  const afterPaid = roundSettlementMoney(Math.max(
    Number(afterInvoiceData.amountPaid) || 0,
    Number(afterRequestData.amountPaid) || 0,
  ));
  const afterTotal = roundSettlementMoney(Number(afterInvoiceData.total) || Number(afterRequestData.total) || total);
  const after = paymentSettlementStatus(
    afterTotal,
    afterPaid,
    afterInvoiceData.status || afterRequestData.paymentStatus,
  );
  return { paymentStatus: after === "unpaid" ? "pending" : after, orderNumber };
}

router.post("/pay-now/reconcile", async (req: Request, res: Response) => {
  const limit = payNowReconcileLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.set("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Please wait a moment and try again." });
  }
  const raw = typeof req.body?.orderNumber === "string"
    ? req.body.orderNumber
    : typeof req.body?.order === "string"
      ? req.body.order
      : "";
  try {
    return res.json(await reconcilePayNowOrder(raw));
  } catch (err) {
    console.error("[Payments] Pay Now reconcile failed:", err instanceof Error ? err.message : "error");
    return res.status(500).json({ error: "Payment could not be confirmed." });
  }
});

router.post("/square-webhook", async (req: Request, res: Response) => {
  try {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) {
      console.error("[Payments] Square webhook rejected: SQUARE_WEBHOOK_SIGNATURE_KEY is not set.");
      return res.status(401).json({ error: "Square webhook signature key is not configured." });
    }

    const received = squareSignatureHeader(req);
    const rawBody = await readSquareWebhookRawBody(req);
    if (rawBody === null) {
      console.error("[Payments] Square webhook rejected: raw request body is unavailable.", {
        path: squareWebhookRequestPath(req),
        signatureHeaderPresent: Boolean(received),
        bodyIsBuffer: Buffer.isBuffer(req.body),
        bodyType: req.body === null ? "null" : typeof req.body,
      });
      return res.status(400).json({ error: "Square webhook raw body is unavailable." });
    }

    const candidateUrls = squareWebhookNotificationUrls();
    if (!squareSignatureValid(rawBody, received, signatureKey, candidateUrls)) {
      console.warn("[Payments] Square webhook signature rejected.", {
        path: squareWebhookRequestPath(req),
        signatureHeaderPresent: Boolean(received),
        bodyLength: Buffer.isBuffer(req.body) ? req.body.length : Buffer.byteLength(rawBody),
        bodyIsBuffer: Buffer.isBuffer(req.body),
        candidateUrls,
      });
      return res.status(400).json({ error: "Invalid Square webhook signature." });
    }

    const event = JSON.parse(rawBody);
    const payment = event?.data?.object?.payment || event?.data?.object;
    return res.json(await settleCompletedSquarePayment(payment || {}));
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
    const totalRevenue = sumTransactionAmounts(
      transactions.filter((t: Record<string, unknown>) => t.status === "completed" && t.type === "payment"),
    );

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
    ...revenueStamp(invoiceDoc.data()),
    stripePaymentIntentId: intentId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export default router;

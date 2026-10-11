/**
 * Square payment.created / payment.updated / invoice.payment_made.
 * Marks the invoice paid, and a full payment unlocks the linked listing and
 * gallery. A Firestore transaction plus the Square event id keeps a replay
 * from counting the payment twice.
 */

import { appFirestore } from "../lib/appFirestore";
import { emailAllowed, narrowGatedClientRecipients } from "../../shared/clientNotify";
import { matchSquarePaymentInvoice, type SquareInvoiceHit, type SquareInvoiceLookup } from "./squarePaymentMatch";
import { sendEmail, type EmailDelivery } from "./email";
import { buildPaymentReceipt } from "./paymentReceiptEmail";
import {
  squareWebhookNotificationUrl,
  squareWebhookRawBody,
  squareWebhookSignatureKey,
  squareWebhookSignatureValid,
} from "./squareWebhook";

const PAID_EVENTS = new Set(["payment.created", "payment.updated", "invoice.payment_made"]);
const SETTLED = new Set(["paid", "comped"]);

interface SettleResult {
  status: number;
  body: Record<string, unknown>;
}

export async function receiveSquareWebhook(input: {
  rawBody: unknown;
  signature?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
}): Promise<SettleResult> {
  const env = input.env ?? process.env;
  const key = squareWebhookSignatureKey(env);
  const notificationUrl = squareWebhookNotificationUrl(env);
  if (!key || !notificationUrl) {
    const missing = !key ? "SQUARE_WEBHOOK_SIGNATURE_KEY" : "SQUARE_WEBHOOK_NOTIFICATION_URL";
    console.warn(`[Payments] Square webhook not configured: ${missing} is not set. No payment was applied.`);
    return { status: 401, body: { error: "Square webhook is not configured." } };
  }

  const rawBody = squareWebhookRawBody(input.rawBody);
  if (rawBody == null) {
    console.warn("[Payments] Square webhook rejected: the raw body was not available.");
    return { status: 403, body: { error: "Invalid Square webhook signature." } };
  }
  if (!squareWebhookSignatureValid(rawBody, input.signature, key, notificationUrl)) {
    console.warn("[Payments] Square webhook rejected: signature did not match.");
    return { status: 403, body: { error: "Invalid Square webhook signature." } };
  }

  let event: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    event = parsed as Record<string, unknown>;
  } catch {
    console.warn("[Payments] Square webhook ignored: payload was not JSON.");
    return { status: 200, body: { received: true, ignored: "invalid-json" } };
  }

  const type = typeof event.type === "string" ? event.type : "";
  if (!PAID_EVENTS.has(type)) {
    return { status: 200, body: { received: true, ignored: type || "unhandled" } };
  }

  const parsedPayment = parseSquarePaymentEvent(event);
  if (!parsedPayment) {
    return { status: 200, body: { received: true, ignored: "not-completed" } };
  }
  if (parsedPayment.amountCents <= 0 && parsedPayment.mode === "increment") {
    return { status: 200, body: { received: true, ignored: "zero-amount" } };
  }

  const eventId = eventIdFor(event, parsedPayment);
  const invoiceHit = await findInvoice(parsedPayment.payment);
  if (!invoiceHit) {
    console.warn(
      `[Payments] Square webhook ignored: no invoice matched payment ${parsedPayment.paymentId || "(none)"} (${type} ${eventId}).`,
    );
    return { status: 200, body: { received: true, unmatched: true } };
  }
  if (isStripeInvoice(invoiceHit.data)) {
    return { status: 200, body: { received: true, ignored: "stripe-invoice" } };
  }

  const now = input.now ?? new Date();
  try {
    const applied = await settleInTransaction({
      eventId,
      type,
      invoiceId: invoiceHit.id,
      payment: parsedPayment,
      now,
      env,
    });
    return { status: 200, body: { received: true, ...applied } };
  } catch (err) {
    console.error("[Payments] Square webhook error:", err);
    return { status: 500, body: { error: "Square webhook handler failed." } };
  }
}

interface ParsedPayment {
  payment: Record<string, unknown>;
  paymentId: string;
  amountCents: number;
  mode: "increment" | "level";
  levelCents: number;
  methodLabel: string;
  squareInvoiceId: string;
}

async function settleInTransaction(input: {
  eventId: string;
  type: string;
  invoiceId: string;
  payment: ParsedPayment;
  now: Date;
  env: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  const db = appFirestore();
  const invoiceRef = db.collection("invoices").doc(input.invoiceId);
  const preview = await invoiceRef.get();
  if (!preview.exists) {
    console.warn(`[Payments] Square webhook ignored: invoice ${input.invoiceId} disappeared before settle.`);
    return { unmatched: true };
  }
  const previewData = preview.data() || {};
  const links = await linkedTargets(input.invoiceId, previewData);
  const nowIso = input.now.toISOString();
  const eventRef = db.collection("squareWebhookEvents").doc(input.eventId);

  const orderId = links.orderId || text(previewData.orderId);
  const clientId = text(previewData.clientId);
  const orderRef = orderId ? db.collection("orders").doc(orderId) : null;
  const clientRef = clientId ? db.collection("clients").doc(clientId) : null;
  const galleryRefs = links.galleryIds.map((id) => db.collection("galleries").doc(id));
  const listingRefs = links.listingIds.map((id) => db.collection("listings").doc(id));

  const outcome = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const invoiceSnap = await tx.get(invoiceRef);
    const orderSnap = orderRef ? await tx.get(orderRef) : null;
    const clientSnap = clientRef ? await tx.get(clientRef) : null;
    const gallerySnaps: Array<{ ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }> = [];
    for (const ref of galleryRefs) gallerySnaps.push({ ref, snap: await tx.get(ref) });
    const listingSnaps: Array<{ ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }> = [];
    for (const ref of listingRefs) listingSnaps.push({ ref, snap: await tx.get(ref) });

    if (eventSnap.exists) return { outcome: "duplicate" as const, email: "skipped" as const };
    if (!invoiceSnap.exists) return { outcome: "unmatched" as const, email: "skipped" as const };

    const invoice = invoiceSnap.data() || {};
    const appliedIds = stringList(invoice.appliedSquarePaymentIds);
    const paymentId = input.payment.paymentId;
    if (paymentId && (invoice.squarePaymentId === paymentId || appliedIds.includes(paymentId))) {
      tx.set(eventRef, eventRecord(input, "duplicate", nowIso));
      return { outcome: "duplicate" as const, email: "skipped" as const };
    }

    const totalCents = invoiceTotalCents(invoice);
    const currentPaidCents = toCents(invoice.amountPaid);
    let unattributed = toCents(invoice.unattributedSquareCents);
    let addCents = input.payment.mode === "level"
      ? Math.max(0, input.payment.levelCents - currentPaidCents)
      : input.payment.amountCents;
    if (input.payment.mode === "level") {
      unattributed += addCents;
    } else if (paymentId && unattributed > 0 && addCents > 0) {
      const absorbed = Math.min(unattributed, addCents);
      unattributed -= absorbed;
      addCents -= absorbed;
    }

    if (addCents <= 0) {
      tx.update(invoiceRef, {
        ...(paymentId ? { squarePaymentId: paymentId, appliedSquarePaymentIds: [...appliedIds, paymentId] } : {}),
        unattributedSquareCents: unattributed / 100,
        updatedAt: nowIso,
      });
      tx.set(eventRef, eventRecord(input, "duplicate", nowIso));
      return { outcome: "duplicate" as const, email: "skipped" as const };
    }

    const newPaidCents = currentPaidCents + addCents;
    const dueCents = Math.max(0, totalCents - newPaidCents);
    const fullyPaid = totalCents <= 0 ? newPaidCents > 0 : newPaidCents >= totalCents;
    const wasSettled = SETTLED.has(statusOf(invoice)) || (totalCents > 0 && currentPaidCents >= totalCents);
    const justUnlocked = fullyPaid && !wasSettled;
    const nextStatus = fullyPaid ? "paid" : "partial";
    const paidLabel = usd(addCents);
    const action = justUnlocked
      ? `Payment received ${paidLabel} via Square; downloads unlocked`
      : `Payment received ${paidLabel} via Square`;
    const clientEmail = text(invoice.clientEmail);
    const emailPlan = receiptPlan(clientEmail, input.env);
    const details = historyDetails(action, dueCents, justUnlocked, emailPlan);
    const entry = {
      action,
      by: "Square",
      at: nowIso,
      details,
      email: emailPlan === "pending" ? "pending" : emailPlan,
      recipients: clientEmail ? [clientEmail] : [],
      squareEventId: input.eventId,
      squarePaymentId: paymentId || null,
    };

    const nextApplied = paymentId ? [...appliedIds, paymentId] : appliedIds;
    tx.update(invoiceRef, {
      amountPaid: newPaidCents / 100,
      amountDue: dueCents / 100,
      amountStillDue: dueCents / 100,
      status: nextStatus,
      paymentStatus: nextStatus,
      paidAt: fullyPaid ? (text(invoice.paidAt) || nowIso) : invoice.paidAt ?? null,
      paymentMethod: "square",
      squarePaymentMethod: input.payment.methodLabel,
      ...(paymentId ? { squarePaymentId: paymentId } : {}),
      appliedSquarePaymentIds: nextApplied,
      unattributedSquareCents: unattributed / 100,
      updatedAt: nowIso,
    });

    if (orderSnap?.exists && orderRef) {
      const order = orderSnap.data() || {};
      const history = Array.isArray(order.history) ? order.history : [];
      tx.update(orderRef, {
        depositPaid: roundDollars(toCents(order.depositPaid) + addCents),
        balanceDue: dueCents / 100,
        paymentStatus: nextStatus,
        history: [...history, entry],
        updatedAt: nowIso,
      });
    }

    if (clientSnap?.exists && clientRef) {
      const client = clientSnap.data() || {};
      tx.update(clientRef, {
        totalSpend: roundDollars(toCents(client.totalSpend) + addCents),
        updatedAt: nowIso,
      });
    }

    const unlockPatch = fullyPaid
      ? {
          clientGalleryDownloadsUnlocked: true,
          lockDownloads: false,
          downloadsReleased: true,
          downloadEnabled: true,
          paymentStatus: "paid",
          invoiceStatus: "paid",
          unlockedAt: nowIso,
          updatedAt: nowIso,
        }
      : {
          paymentStatus: "partial",
          invoiceStatus: "partial",
          updatedAt: nowIso,
        };

    for (const item of gallerySnaps) {
      if (item.snap.exists) tx.update(item.ref, unlockPatch);
    }
    const writtenListings: string[] = [];
    for (const item of listingSnaps) {
      if (!item.snap.exists) continue;
      const listing = item.snap.data() || {};
      const auditLog = Array.isArray(listing.auditLog) ? listing.auditLog : [];
      tx.update(item.ref, { ...unlockPatch, auditLog: [...auditLog, entry] });
      writtenListings.push(item.ref.id);
    }

    tx.set(db.collection("transactions").doc(), {
      type: "payment",
      orderId: orderId || "",
      invoiceId: input.invoiceId,
      clientId,
      clientName: text(invoice.clientName),
      amount: addCents / 100,
      paymentMethod: "square",
      squarePaymentMethod: input.payment.methodLabel,
      status: "completed",
      ...(paymentId ? { squarePaymentId: paymentId } : {}),
      squareEventId: input.eventId,
      processedAt: nowIso,
      processedBy: "system",
      createdAt: nowIso,
      ...(invoice.playtest === true ? { playtest: true } : {}),
    });
    tx.set(eventRef, eventRecord(input, "applied", nowIso));

    return {
      outcome: "applied" as const,
      email: emailPlan,
      action,
      justUnlocked,
      fullyPaid,
      dueCents,
      clientEmail,
      invoice,
      galleryId: links.galleryIds[0] || text(invoice.galleryId),
      listingId: links.listingIds[0] || text(invoice.listingId),
      amountPaid: newPaidCents / 100,
      balance: dueCents / 100,
      orderId,
      listingIds: writtenListings,
    };
  });

  if (outcome.outcome !== "applied") {
    return { duplicate: outcome.outcome === "duplicate", unmatched: outcome.outcome === "unmatched" };
  }

  const delivery = await sendReceipt({
    plan: outcome.email,
    to: outcome.clientEmail,
    invoice: outcome.invoice,
    invoiceId: input.invoiceId,
    paidAt: input.now,
    unlocked: outcome.fullyPaid,
    amountPaid: outcome.amountPaid,
    balance: outcome.balance,
    galleryId: outcome.galleryId,
    listingId: outcome.listingId,
    env: input.env,
  });
  if (delivery !== outcome.email) {
    await patchHistoryEmail({
      orderId: outcome.orderId,
      listingIds: outcome.listingIds,
      eventId: input.eventId,
      email: delivery,
      action: outcome.action,
      balanceCents: outcome.dueCents,
      unlocked: outcome.justUnlocked,
    });
  }
  return {
    applied: true,
    unlocked: outcome.justUnlocked === true,
    duplicate: false,
    email: delivery,
  };
}

async function sendReceipt(input: {
  plan: "suppressed" | "allowlist" | "sent" | "pending" | "skipped";
  to: string;
  invoice: Record<string, unknown>;
  invoiceId: string;
  paidAt: Date;
  unlocked: boolean;
  amountPaid: number;
  balance: number;
  galleryId: string;
  listingId: string;
  env: Record<string, string | undefined>;
}): Promise<EmailDelivery | "failed" | "pending"> {
  if (input.plan === "suppressed" || input.plan === "skipped" || !input.to) return "suppressed";
  const rendered = buildPaymentReceipt({
    invoice: input.invoice,
    invoiceId: input.invoiceId,
    paidAt: input.paidAt,
    unlocked: input.unlocked,
    amountPaid: input.amountPaid,
    balance: input.balance,
    galleryId: input.galleryId,
    listing: input.listingId ? { id: input.listingId } : null,
    env: input.env,
  });
  try {
    const result = await sendEmail({
      to: input.to,
      template: "payment_receipt",
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      variables: {
        clientName: text(input.invoice.clientName),
        amount: usd(toCents(input.amountPaid)),
        invoiceNumber: rendered.subject,
        balance: usd(toCents(input.balance)),
      },
    });
    return result.delivery;
  } catch (err) {
    console.error("[Payments] Receipt email failed:", err);
    return "failed";
  }
}

async function patchHistoryEmail(input: {
  orderId: string;
  listingIds: string[];
  eventId: string;
  email: EmailDelivery | "failed" | "pending";
  action: string;
  balanceCents: number;
  unlocked: boolean;
}) {
  const details = historyDetails(input.action, input.balanceCents, input.unlocked, input.email);
  const db = appFirestore();
  if (input.orderId) {
    await patchList(db.collection("orders").doc(input.orderId), "history", input.eventId, input.email, details);
  }
  for (const listingId of input.listingIds) {
    await patchList(db.collection("listings").doc(listingId), "auditLog", input.eventId, input.email, details);
  }
}

async function patchList(
  ref: FirebaseFirestore.DocumentReference,
  field: "history" | "auditLog",
  eventId: string,
  email: string,
  details: string,
) {
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const rows = Array.isArray(data[field]) ? data[field] as Array<Record<string, unknown>> : [];
  const next = rows.map((row) => (
    row.squareEventId === eventId ? { ...row, email, details } : row
  ));
  await ref.update({ [field]: next });
}

function historyDetails(
  action: string,
  balanceCents: number,
  unlocked: boolean,
  email: string,
): string {
  const balance = !unlocked && balanceCents > 0 ? ` Balance due ${usd(balanceCents)}.` : "";
  const mail = email === "allowlist"
    ? " Email sent via the test allowlist."
    : email === "sent"
      ? " Email sent."
      : email === "failed"
        ? " Receipt email failed."
        : email === "pending"
          ? ""
          : " Email suppressed by the notify gate.";
  return `${action}.${balance}${mail}`.replace(/\s+/g, " ").trim();
}

function receiptPlan(
  to: string,
  env: Record<string, string | undefined>,
): "suppressed" | "allowlist" | "sent" | "pending" {
  if (!to) return "suppressed";
  if (emailAllowed("payment_receipt", env)) return "sent";
  if (narrowGatedClientRecipients({ to }, env)) return "pending";
  return "suppressed";
}

async function findInvoice(payment: Record<string, unknown>): Promise<SquareInvoiceHit | null> {
  const lookup = invoiceLookup();
  const hit = await matchSquarePaymentInvoice(payment, lookup);
  if (hit) return hit;
  const squareInvoiceId = text(payment.square_invoice_id);
  if (!squareInvoiceId) return null;
  const bySquare = await lookup.byField("squareInvoiceId", squareInvoiceId);
  if (!bySquare) return null;
  return matchSquarePaymentInvoice({ reference_id: bySquare.id }, lookup);
}

function invoiceLookup(): SquareInvoiceLookup {
  const db = appFirestore();
  return {
    async byId(id: string) {
      const snap = await db.collection("invoices").doc(id).get();
      if (!snap.exists) return null;
      return { id: snap.id, data: snap.data() || {} };
    },
    async byField(field: string, value: string) {
      const snap = await db.collection("invoices").where(field, "==", value).limit(1).get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, data: doc.data() || {} };
    },
  };
}

async function linkedTargets(invoiceId: string, invoice: Record<string, unknown>) {
  const db = appFirestore();
  const galleryIds = new Set<string>();
  const listingIds = new Set<string>();
  const add = (set: Set<string>, value: unknown) => {
    const id = text(value);
    if (id) set.add(id);
  };
  add(galleryIds, invoice.galleryId);
  add(listingIds, invoice.listingId);
  const orderId = text(invoice.orderId);

  const galleryReads = [db.collection("galleries").where("invoiceId", "==", invoiceId).get()];
  const listingReads = [db.collection("listings").where("invoiceId", "==", invoiceId).get()];
  if (orderId) {
    galleryReads.push(db.collection("galleries").where("orderId", "==", orderId).get());
    listingReads.push(db.collection("listings").where("orderId", "==", orderId).get());
  }
  const [gallerySnaps, listingSnaps] = await Promise.all([
    Promise.all(galleryReads),
    Promise.all(listingReads),
  ]);
  gallerySnaps.forEach((snap) => snap.docs.forEach((doc) => galleryIds.add(doc.id)));
  listingSnaps.forEach((snap) => snap.docs.forEach((doc) => listingIds.add(doc.id)));
  for (const galleryId of [...galleryIds]) {
    const snap = await db.collection("galleries").doc(galleryId).get();
    if (snap.exists) add(listingIds, snap.data()?.listingId);
  }
  return { galleryIds: [...galleryIds], listingIds: [...listingIds], orderId };
}

function parseSquarePaymentEvent(event: Record<string, unknown>): ParsedPayment | null {
  const type = text(event.type);
  const data = record(event.data);
  const object = record(data?.object);
  if (type === "payment.created" || type === "payment.updated") {
    const payment = record(object?.payment) || object;
    if (!payment) return null;
    if (text(payment.status).toUpperCase() !== "COMPLETED") return null;
    const amountCents = moneyCents(payment.amount_money) ?? moneyCents(payment.total_money) ?? 0;
    return {
      payment,
      paymentId: text(payment.id),
      amountCents,
      mode: "increment",
      levelCents: amountCents,
      methodLabel: methodLabel(payment),
      squareInvoiceId: "",
    };
  }
  if (type === "invoice.payment_made") {
    const invoice = record(object?.invoice) || object;
    if (!invoice) return null;
    const requests = Array.isArray(invoice.payment_requests) ? invoice.payment_requests : [];
    let completed = 0;
    for (const request of requests) {
      const row = record(request);
      completed += moneyCents(row?.total_completed_amount_money) ?? 0;
    }
    if (completed <= 0) return null;
    const squareInvoiceId = text(invoice.id);
    const payment: Record<string, unknown> = {
      order_id: text(invoice.order_id),
      note: text(invoice.description),
      square_invoice_id: squareInvoiceId,
      status: "COMPLETED",
    };
    return {
      payment,
      paymentId: "",
      amountCents: completed,
      mode: "level",
      levelCents: completed,
      methodLabel: "Square invoice",
      squareInvoiceId,
    };
  }
  return null;
}

function eventIdFor(event: Record<string, unknown>, payment: ParsedPayment): string {
  const id = text(event.event_id);
  if (id) return id;
  if (payment.paymentId) return `${text(event.type) || "payment"}:${payment.paymentId}`;
  return `invoice.payment_made:${payment.squareInvoiceId}:${payment.levelCents}`;
}

function eventRecord(
  input: { eventId: string; type: string; invoiceId: string; payment: ParsedPayment },
  outcome: string,
  nowIso: string,
) {
  return {
    eventId: input.eventId,
    type: input.type,
    invoiceId: input.invoiceId,
    squarePaymentId: input.payment.paymentId || null,
    outcome,
    processedAt: nowIso,
  };
}

function methodLabel(payment: Record<string, unknown>): string {
  const cardDetails = record(payment.card_details);
  const card = record(cardDetails?.card);
  const brand = text(card?.card_brand);
  if (brand) return brand;
  const source = text(payment.source_type);
  return source || "Square";
}

function isStripeInvoice(invoice: Record<string, unknown>): boolean {
  const explicit = text(invoice.paymentProvider || invoice.processor).toLowerCase();
  if (explicit === "stripe") return true;
  if (explicit === "square") return false;
  const channel = text(invoice.channel || invoice.brand || invoice.bookingType).toLowerCase();
  return channel.includes("studio noir") || channel.includes("studionoir");
}

function invoiceTotalCents(invoice: Record<string, unknown>): number {
  const total = toCents(invoice.total);
  if (total > 0) return total;
  const due = toCents(invoice.amountDue ?? invoice.amountStillDue);
  const paid = toCents(invoice.amountPaid);
  return Math.max(0, due + paid);
}

function moneyCents(value: unknown): number | null {
  const row = record(value);
  if (!row) return null;
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function toCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function roundDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function statusOf(invoice: Record<string, unknown>): string {
  return text(invoice.status).toLowerCase();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

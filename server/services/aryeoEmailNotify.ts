/**
 * Aryeo-parity customer and team email.
 * Live recipients require CLIENT_EMAIL_NOTIFY_LIVE exactly "true".
 * While that flag is unset, every delivered message goes only to
 * ops+deliveryqa@iconicimagestx.com.
 * Marco Brito and Delia Grimaldo are never recipients.
 * Successful sends are claimed once. The claim is appended to the order
 * only in production, and only for that order. Nothing backfills old orders.
 * No SMS.
 */

import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { officeStaffRecipients } from "./officeOrderNotify";
import {
  ARYEO_EMAIL_FROM_ADDRESS,
  CLIENT_EMAIL_NOTIFY_TEST_SINK,
  type NotifyContext,
  type NotifyIntent,
  type NotifyKey,
  type NotifySettings,
  aryeoFromHeader,
  chicagoDayKey,
  clientEmailNotifyLive,
  contextFromRecord,
  dailySummaryDueAt,
  defaultNotifySettings,
  hardSuppressionReason,
  idempotencyKey,
  intentsForEvent,
  normalizeReminderHours,
  notificationEnabled,
  notifyDefinition,
  overdueDueAt,
  reminderDueAt,
  renderNotification,
  sampleNotifyContext,
  scopeId,
} from "../../shared/aryeoEmailNotify";

export interface EmailNotifyClaim {
  key: string;
  notification: NotifyKey;
  at: string;
  orderId: string;
  collection: "orders" | "orderRequests" | "";
  intendedTo: string[];
  deliveredTo: string[];
  subject: string;
  live: boolean;
  status: "sent" | "suppressed" | "not_configured";
  reason?: string;
}

export interface EmailNotifyJob {
  id: string;
  kind: "reminder" | "overdue" | "daily_summary";
  dueAt: string;
  status: "pending" | "sent" | "canceled";
  orderId: string;
  collection: "orders" | "orderRequests" | "";
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface EmailNotifyStore {
  getSettings(): Promise<NotifySettings>;
  saveSettings(settings: NotifySettings): Promise<void>;
  claim(key: string): Promise<boolean>;
  complete(claim: EmailNotifyClaim): Promise<void>;
  release(key: string): Promise<void>;
  hasClaim(key: string): Promise<boolean>;
  upsertJob(job: EmailNotifyJob): Promise<void>;
  cancelJob(id: string): Promise<void>;
  dueJobs(now: Date): Promise<EmailNotifyJob[]>;
  markJob(id: string, status: EmailNotifyJob["status"]): Promise<void>;
  appendOrderLog(claim: EmailNotifyClaim): Promise<void>;
  logs(): EmailNotifyClaim[];
}

export function createMemoryEmailNotifyStore(): EmailNotifyStore {
  let settings = defaultNotifySettings();
  const claims = new Map<string, EmailNotifyClaim | "sending">();
  const jobs = new Map<string, EmailNotifyJob>();
  const orderLogs: EmailNotifyClaim[] = [];
  return {
    async getSettings() {
      return { enabled: { ...settings.enabled }, reminderHoursBefore: settings.reminderHoursBefore };
    },
    async saveSettings(next) {
      settings = { enabled: { ...next.enabled }, reminderHoursBefore: normalizeReminderHours(next.reminderHoursBefore) };
    },
    async claim(key) {
      if (claims.has(key)) return false;
      claims.set(key, "sending");
      return true;
    },
    async complete(claim) {
      claims.set(claim.key, claim);
      orderLogs.push(claim);
    },
    async release(key) {
      if (claims.get(key) === "sending") claims.delete(key);
    },
    async hasClaim(key) {
      const value = claims.get(key);
      return Boolean(value && value !== "sending");
    },
    async upsertJob(job) {
      const existing = jobs.get(job.id);
      if (existing?.status === "sent" || existing?.status === "canceled") return;
      jobs.set(job.id, { ...existing, ...job, payload: mergedJobPayload(existing?.payload, job.payload) });
    },
    async cancelJob(id) {
      const existing = jobs.get(id);
      if (existing && existing.status === "pending") jobs.set(id, { ...existing, status: "canceled" });
    },
    async dueJobs(now) {
      return [...jobs.values()].filter((job) => job.status === "pending" && job.dueAt <= now.toISOString());
    },
    async markJob(id, status) {
      const existing = jobs.get(id);
      if (existing) jobs.set(id, { ...existing, status });
    },
    async appendOrderLog(claim) {
      if (!orderLogs.includes(claim)) orderLogs.push(claim);
    },
    logs() {
      return [...orderLogs];
    },
  };
}

const memoryStore = createMemoryEmailNotifyStore();
let storeOverride: EmailNotifyStore | null = null;

export function setEmailNotifyStoreForTests(store: EmailNotifyStore | null): void {
  storeOverride = store;
}

export function resetEmailNotifyForTests(): void {
  storeOverride = createMemoryEmailNotifyStore();
}

function productionFirestoreEnabled(): boolean {
  return process.env.NODE_ENV === "production" && admin.apps.length > 0;
}

function activeStore(): EmailNotifyStore {
  if (storeOverride) return storeOverride;
  if (productionFirestoreEnabled()) return firestoreStore();
  return memoryStore;
}

const CLAIMS = "clientEmailNotifyClaims";
const JOBS = "clientEmailNotifyJobs";
const SETTINGS_DOC = "clientEmailNotify";

function firestoreStore(): EmailNotifyStore {
  const db = () => admin.firestore();
  return {
    async getSettings() {
      const snap = await db().collection("settings").doc(SETTINGS_DOC).get();
      if (!snap.exists) return defaultNotifySettings();
      const data = snap.data() || {};
      const defaults = defaultNotifySettings();
      const enabled = { ...defaults.enabled, ...(data.enabled && typeof data.enabled === "object" ? data.enabled : {}) };
      return { enabled, reminderHoursBefore: normalizeReminderHours(data.reminderHoursBefore) };
    },
    async saveSettings(settings) {
      await db().collection("settings").doc(SETTINGS_DOC).set({
        enabled: settings.enabled,
        reminderHoursBefore: normalizeReminderHours(settings.reminderHoursBefore),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    },
    async claim(key) {
      try {
        await db().collection(CLAIMS).doc(claimDocId(key)).create({
          key,
          status: "sending",
          at: new Date().toISOString(),
        });
        return true;
      } catch (err) {
        const code = err && typeof err === "object" && "code" in err ? Number((err as { code: unknown }).code) : 0;
        if (code === 6 || code === 409) return false;
        const message = err instanceof Error ? err.message : "";
        if (/already exists/i.test(message)) return false;
        throw err;
      }
    },
    async complete(claim) {
      await db().collection(CLAIMS).doc(claimDocId(claim.key)).set(claim, { merge: true });
      await this.appendOrderLog(claim);
    },
    async release(key) {
      await db().collection(CLAIMS).doc(claimDocId(key)).delete().catch(() => undefined);
    },
    async hasClaim(key) {
      const snap = await db().collection(CLAIMS).doc(claimDocId(key)).get();
      return snap.exists && snap.data()?.status === "sent";
    },
    async upsertJob(job) {
      const ref = db().collection(JOBS).doc(claimDocId(job.id));
      const snap = await ref.get();
      if (snap.exists && (snap.data()?.status === "sent" || snap.data()?.status === "canceled")) return;
      const prev = snap.exists ? snap.data()?.payload : {};
      await ref.set({
        ...job,
        payload: mergedJobPayload(prev && typeof prev === "object" ? prev as Record<string, unknown> : {}, job.payload),
      }, { merge: true });
    },
    async cancelJob(id) {
      const ref = db().collection(JOBS).doc(claimDocId(id));
      const snap = await ref.get();
      if (snap.exists && snap.data()?.status === "pending") await ref.set({ status: "canceled" }, { merge: true });
    },
    async dueJobs(now) {
      const snap = await db().collection(JOBS).where("status", "==", "pending").limit(100).get();
      return snap.docs
        .map((doc) => doc.data() as EmailNotifyJob)
        .filter((job) => typeof job.dueAt === "string" && job.dueAt <= now.toISOString());
    },
    async markJob(id, status) {
      await db().collection(JOBS).doc(claimDocId(id)).set({ status }, { merge: true });
    },
    async appendOrderLog(claim) {
      if (!claim.orderId || !claim.collection) return;
      await db().collection(claim.collection).doc(claim.orderId).update({
        clientEmailNotifyLog: admin.firestore.FieldValue.arrayUnion({
          key: claim.key,
          notification: claim.notification,
          at: claim.at,
          intendedTo: claim.intendedTo,
          deliveredTo: claim.deliveredTo,
          subject: claim.subject,
          live: claim.live,
          status: claim.status,
          reason: claim.reason || "",
        }),
      }).catch((err) => {
        console.error("[Aryeo email] Order log was not saved.", err instanceof Error ? err.message : "error");
      });
    },
    logs() {
      return [];
    },
  };
}

function mergedJobPayload(previous: Record<string, unknown> | undefined, next: Record<string, unknown>): Record<string, unknown> {
  const prevAppointments = Array.isArray(previous?.appointments) ? previous.appointments : [];
  const nextAppointments = Array.isArray(next.appointments) ? next.appointments : [];
  const seen = new Set<string>();
  const appointments = [...prevAppointments, ...nextAppointments].filter((item) => {
    const stamp = JSON.stringify(item);
    if (seen.has(stamp)) return false;
    seen.add(stamp);
    return true;
  });
  return {
    ...(previous || {}),
    ...next,
    ...(appointments.length ? { appointments } : {}),
  };
}

function claimDocId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 700);
}

type DeliveryOverride = (message: { to: string; subject: string; html: string; text: string }) => Promise<void>;
let deliveryOverride: DeliveryOverride | null = null;

export function setClientEmailDeliveryOverride(sink: DeliveryOverride | null): void {
  deliveryOverride = sink;
}

export interface SendOutcome {
  status: "sent" | "duplicate" | "disabled" | "suppressed" | "not_configured" | "no_recipient";
  deliveredTo: string[];
  intendedTo: string[];
  live: boolean;
  subject?: string;
  reason?: string;
}

function splitEmails(value: string): string[] {
  return value.split(/[,;]/).map((part) => part.trim()).filter((part) => part.includes("@"));
}

export function recipientsFor(
  intent: NotifyIntent,
  ctx: NotifyContext,
  env: Record<string, string | undefined>,
): { intended: string[]; blocked: string[] } {
  const raw = intent.audience === "customer"
    ? splitEmails(ctx.email)
    : [
      ...splitEmails(ctx.photographerEmail),
      ...officeStaffRecipients(env),
    ];
  const intended: string[] = [];
  const blocked: string[] = [];
  const seen = new Set<string>();
  const client = ctx.email.trim().toLowerCase();
  for (const email of raw) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (intent.audience === "team" && client && key === client) {
      blocked.push(email);
      continue;
    }
    const reason = hardSuppressionReason({ email, name: intent.audience === "customer" ? ctx.fullName : "" });
    if (reason) {
      blocked.push(email);
      continue;
    }
    intended.push(email);
  }
  if (intent.audience === "customer" && hardSuppressionReason({ email: ctx.email, name: ctx.fullName })) {
    return { intended: [], blocked: [ctx.email || ctx.fullName || "suppressed"] };
  }
  return { intended, blocked };
}

async function deliverMessage(to: string[], subject: string, html: string, text: string): Promise<"sent" | "not_configured"> {
  if (to.length === 0) return "not_configured";
  if (deliveryOverride) {
    await deliveryOverride({ to: to.join(", "), subject, html, text });
    return "sent";
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return "not_configured";
  const user = process.env.SMTP_USER || process.env.EMAIL_FROM;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return "not_configured";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: aryeoFromHeader(),
    to: to.join(", "),
    replyTo: ARYEO_EMAIL_FROM_ADDRESS,
    subject,
    html,
    text,
  });
  return "sent";
}

export async function sendRenderedNotification(input: {
  key: NotifyKey;
  ctx: NotifyContext;
  idempotency: string;
  intendedTo: string[];
  orderId?: string;
  collection?: "orders" | "orderRequests" | "";
  env?: Record<string, string | undefined>;
  settings?: NotifySettings;
  test?: boolean;
}): Promise<SendOutcome> {
  const env = input.env ?? process.env;
  const settings = input.settings ?? await activeStore().getSettings();
  const live = clientEmailNotifyLive(env);
  if (!input.test && !notificationEnabled(settings, input.key)) {
    return { status: "disabled", deliveredTo: [], intendedTo: input.intendedTo, live };
  }
  const def = notifyDefinition(input.key);
  if (!def?.wired && !input.test) {
    return { status: "disabled", deliveredTo: [], intendedTo: input.intendedTo, live, reason: def?.wireNote };
  }
  const store = activeStore();
  const claimed = await store.claim(input.idempotency);
  if (!claimed) return { status: "duplicate", deliveredTo: [], intendedTo: input.intendedTo, live };

  const blockedName = hardSuppressionReason({ email: input.ctx.email, name: input.ctx.fullName });
  const suppressed = input.intendedTo.filter((email) => hardSuppressionReason({ email, name: input.ctx.fullName }));
  const allowed = input.intendedTo.filter((email) => !suppressed.includes(email));
  if (allowed.length === 0 && !blockedName && suppressed.length === 0) {
    await store.release(input.idempotency);
    return { status: "no_recipient", deliveredTo: [], intendedTo: input.intendedTo, live };
  }
  if (allowed.length === 0) {
    const claim: EmailNotifyClaim = {
      key: input.idempotency,
      notification: input.key,
      at: new Date().toISOString(),
      orderId: input.orderId || input.ctx.orderId,
      collection: input.collection || "",
      intendedTo: input.intendedTo,
      deliveredTo: [],
      subject: "",
      live,
      status: "suppressed",
      reason: blockedName || "hard suppression",
    };
    await store.complete(claim);
    return { status: "suppressed", deliveredTo: [], intendedTo: input.intendedTo, live, reason: claim.reason };
  }

  const deliveredTo = live ? allowed : [CLIENT_EMAIL_NOTIFY_TEST_SINK];
  const rendered = renderNotification(input.key, input.ctx);
  const subject = live ? rendered.subject : `[QA] ${rendered.subject}`;
  try {
    const delivery = await deliverMessage(deliveredTo, subject, rendered.html, rendered.text);
    if (delivery === "not_configured") {
      await store.release(input.idempotency);
      return { status: "not_configured", deliveredTo: [], intendedTo: allowed, live, subject };
    }
    const claim: EmailNotifyClaim = {
      key: input.idempotency,
      notification: input.key,
      at: new Date().toISOString(),
      orderId: input.orderId || input.ctx.orderId,
      collection: input.collection || "",
      intendedTo: allowed,
      deliveredTo,
      subject,
      live,
      status: "sent",
    };
    await store.complete(claim);
    return { status: "sent", deliveredTo, intendedTo: allowed, live, subject };
  } catch (err) {
    await store.release(input.idempotency);
    console.error("[Aryeo email] Send failed.", err instanceof Error ? err.message : "error");
    return { status: "not_configured", deliveredTo: [], intendedTo: allowed, live, subject, reason: "send failed" };
  }
}

async function scheduleFollowUps(input: {
  ctx: NotifyContext;
  record: Record<string, unknown>;
  orderId: string;
  collection: "orders" | "orderRequests" | "";
  settings: NotifySettings;
  fulfilled?: boolean;
}): Promise<void> {
  const store = activeStore();
  const scope = scopeId({ orderId: input.orderId, requestId: input.ctx.requestId, orderNumber: input.ctx.orderNumber });
  if (input.ctx.appointmentStartIso) {
    const dueAt = reminderDueAt(input.ctx.appointmentStartIso, input.settings.reminderHoursBefore);
    if (dueAt) {
      const id = idempotencyKey("customer_appointment_reminder", scope, input.ctx.appointmentStartIso);
      await store.upsertJob({
        id,
        kind: "reminder",
        dueAt,
        status: "pending",
        orderId: input.orderId,
        collection: input.collection,
        idempotencyKey: id,
        payload: { record: input.record, requestId: input.ctx.requestId },
      });
      const day = chicagoDayKey(input.ctx.appointmentStartIso);
      const summaryId = `creator_upcoming_appointments_summary:${input.ctx.photographerEmail || "office"}:${day}`;
      const summaryDue = dailySummaryDueAt(input.ctx.appointmentStartIso);
      if (summaryDue) {
        await store.upsertJob({
          id: summaryId,
          kind: "daily_summary",
          dueAt: summaryDue,
          status: "pending",
          orderId: input.orderId,
          collection: input.collection,
          idempotencyKey: summaryId,
          payload: {
            appointments: [{
              when: input.ctx.appointmentWhen,
              address: input.ctx.address,
              orderNumber: input.ctx.orderNumber,
              clientName: input.ctx.fullName,
            }],
            photographerEmail: input.ctx.photographerEmail,
          },
        });
      }
    }
  }
  if (input.fulfilled && input.ctx.unpaid) {
    const dueAt = overdueDueAt(new Date().toISOString());
    if (dueAt) {
      const id = idempotencyKey("customer_order_payment_overdue", scope, "overdue");
      await store.upsertJob({
        id,
        kind: "overdue",
        dueAt,
        status: "pending",
        orderId: input.orderId,
        collection: input.collection,
        idempotencyKey: id,
        payload: { record: input.record, requestId: input.ctx.requestId },
      });
    }
  }
  if (input.fulfilled && !input.ctx.unpaid) {
    await store.cancelJob(idempotencyKey("customer_order_payment_overdue", scope, "overdue"));
  }
}

export async function dispatchClientEmailNotifications(input: {
  type: Parameters<typeof intentsForEvent>[0]["type"];
  record: Record<string, unknown>;
  before?: Record<string, unknown>;
  recordId: string;
  collection: "orders" | "orderRequests";
  requestId?: string;
  env?: Record<string, string | undefined>;
}): Promise<SendOutcome[]> {
  try {
    const settings = await activeStore().getSettings();
    const ctx = contextFromRecord(
      { ...input.record, id: input.recordId },
      { id: input.recordId, collection: input.collection, requestId: input.requestId, env: input.env },
    );
    const intents = intentsForEvent({ type: input.type, before: input.before, after: input.record });
    const outcomes: SendOutcome[] = [];
    const scope = scopeId({
      orderId: input.collection === "orders" ? input.recordId : ctx.orderId,
      requestId: input.requestId || ctx.requestId || (input.collection === "orderRequests" ? input.recordId : ""),
      orderNumber: ctx.orderNumber,
    });
    for (const intent of intents) {
      const people = recipientsFor(intent, ctx, input.env ?? process.env);
      outcomes.push(await sendRenderedNotification({
        key: intent.key,
        ctx,
        idempotency: idempotencyKey(intent.key, scope, intent.slot),
        intendedTo: people.intended,
        orderId: input.recordId,
        collection: input.collection,
        env: input.env,
        settings,
      }));
    }
    if (input.type === "appointment_scheduled" || input.type === "appointment_changed") {
      await scheduleFollowUps({
        ctx,
        record: input.record,
        orderId: input.recordId,
        collection: input.collection,
        settings,
      });
    }
    if (input.type === "order_fulfilled" || input.type === "listing_delivered") {
      await scheduleFollowUps({
        ctx,
        record: input.record,
        orderId: input.recordId,
        collection: input.collection,
        settings,
        fulfilled: true,
      });
    }
    if (input.type === "payment_processed" && !ctx.unpaid) {
      await activeStore().cancelJob(idempotencyKey(
        "customer_order_payment_overdue",
        scope,
        "overdue",
      ));
    }
    if (input.type === "appointment_canceled" || input.type === "appointment_postponed") {
      const start = ctx.appointmentStartIso;
      if (start) {
        await activeStore().cancelJob(idempotencyKey("customer_appointment_reminder", scope, start));
      }
    }
    return outcomes;
  } catch (err) {
    console.error("[Aryeo email] Dispatch failed.", err instanceof Error ? err.message : "error");
    return [];
  }
}

export async function sendTestNotification(input: {
  key: NotifyKey;
  to: string;
  env?: Record<string, string | undefined>;
}): Promise<SendOutcome> {
  const ctx = sampleNotifyContext();
  const reason = hardSuppressionReason({ email: input.to });
  if (reason) {
    return { status: "suppressed", deliveredTo: [], intendedTo: [input.to], live: clientEmailNotifyLive(input.env), reason };
  }
  return sendRenderedNotification({
    key: input.key,
    ctx,
    idempotency: `test:${input.key}:${input.to.toLowerCase()}:${Date.now()}`,
    intendedTo: [input.to],
    orderId: "",
    collection: "",
    env: input.env,
    test: true,
  });
}

export async function runDueClientEmailJobs(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<{ ran: number; sent: number }> {
  const store = activeStore();
  const settings = await store.getSettings();
  const jobs = await store.dueJobs(now);
  let sent = 0;
  for (const job of jobs) {
    if (job.kind === "reminder") {
      const record = (job.payload.record || {}) as Record<string, unknown>;
      const ctx = contextFromRecord(record, { id: job.orderId, collection: job.collection || undefined, requestId: String(job.payload.requestId || "") });
      const customer = recipientsFor({ key: "customer_appointment_reminder", audience: "customer", slot: "" }, ctx, env);
      const customerResult = await sendRenderedNotification({
        key: "customer_appointment_reminder",
        ctx,
        idempotency: job.idempotencyKey,
        intendedTo: customer.intended,
        orderId: job.orderId,
        collection: job.collection,
        env,
        settings,
      });
      const team = recipientsFor({ key: "creator_appointment_reminder", audience: "team", slot: "" }, ctx, env);
      await sendRenderedNotification({
        key: "creator_appointment_reminder",
        ctx,
        idempotency: job.idempotencyKey.replace("customer_appointment_reminder", "creator_appointment_reminder"),
        intendedTo: team.intended,
        orderId: job.orderId,
        collection: job.collection,
        env,
        settings,
      });
      if (customerResult.status === "sent" || customerResult.status === "duplicate" || customerResult.status === "suppressed" || customerResult.status === "disabled") {
        await store.markJob(job.id, "sent");
      }
      if (customerResult.status === "sent") sent += 1;
    } else if (job.kind === "overdue") {
      const record = (job.payload.record || {}) as Record<string, unknown>;
      const ctx = contextFromRecord({ ...record, balanceDue: record.balanceDue ?? record.amountDue ?? 1 }, {
        id: job.orderId,
        collection: job.collection || undefined,
      });
      if (!ctx.unpaid) {
        await store.markJob(job.id, "canceled");
        continue;
      }
      const people = recipientsFor({ key: "customer_order_payment_overdue", audience: "customer", slot: "" }, ctx, env);
      const result = await sendRenderedNotification({
        key: "customer_order_payment_overdue",
        ctx,
        idempotency: job.idempotencyKey,
        intendedTo: people.intended,
        orderId: job.orderId,
        collection: job.collection,
        env,
        settings,
      });
      if (result.status !== "not_configured") await store.markJob(job.id, "sent");
      if (result.status === "sent") sent += 1;
    } else if (job.kind === "daily_summary") {
      const appointments = Array.isArray(job.payload.appointments) ? job.payload.appointments : [];
      const ctx = sampleNotifyContext();
      ctx.email = "";
      ctx.fullName = "";
      ctx.photographerEmail = typeof job.payload.photographerEmail === "string" ? job.payload.photographerEmail : "";
      ctx.dailyAppointments = appointments as NotifyContext["dailyAppointments"];
      const people = recipientsFor({ key: "creator_upcoming_appointments_summary", audience: "team", slot: "" }, ctx, env);
      const result = await sendRenderedNotification({
        key: "creator_upcoming_appointments_summary",
        ctx,
        idempotency: job.idempotencyKey,
        intendedTo: people.intended,
        orderId: job.orderId,
        collection: job.collection,
        env,
        settings,
      });
      if (result.status !== "not_configured") await store.markJob(job.id, "sent");
      if (result.status === "sent") sent += 1;
    }
  }
  return { ran: jobs.length, sent };
}

export async function readNotifySettings(): Promise<NotifySettings> {
  return activeStore().getSettings();
}

export async function writeNotifySettings(patch: { key?: NotifyKey; enabled?: boolean; reminderHoursBefore?: number }): Promise<NotifySettings> {
  const current = await activeStore().getSettings();
  if (patch.key && notifyDefinition(patch.key)?.wired && typeof patch.enabled === "boolean") {
    current.enabled[patch.key] = patch.enabled;
  }
  if (patch.reminderHoursBefore != null) current.reminderHoursBefore = normalizeReminderHours(patch.reminderHoursBefore);
  await activeStore().saveSettings(current);
  return current;
}

export { sampleNotifyContext, renderNotification };

/**
 * Multi-channel campaigns. Staff can draft. Only an admin can approve.
 * Recipient sends require CAMPAIGN_SEND_LIVE=true and Approved or Scheduled.
 * Otherwise Send writes a dry-run log and does not email or text anyone.
 */

import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { createRateLimiter } from "../lib/rateLimit";
import { clientIp } from "../lib/clientIp";
import { normalizeEmail } from "../../shared/emailMarketing/contacts";
import { marketingPublicUrl } from "../../shared/emailMarketing/sendGate";
import { signedUnsubscribeUrl } from "../services/unsubscribeToken";
import { EmailNotConfiguredError } from "../services/email";
import { getMarketingStore } from "../services/marketingStore";
import { loadChannelAudience } from "../services/channelAudience";
import { ensureCampaignSample } from "../services/campaignSample";
import {
  addClickTracking,
  openPixel,
  sendCampaignEmail,
  sendCampaignText,
  trackToken,
} from "../services/campaignDelivery";
import { getChannelCampaignStore, type CampaignLog } from "../services/channelCampaignStore";
import {
  batchItems,
  calendarItems,
  campaignSendLive,
  campaignSmsBody,
  chicagoDay,
  hasChannelSchedule,
  normalizeCampaign,
  personName,
  phoneDigits,
  planDelivery,
  publicAudience,
  renderCampaignEmail,
  statusChangeError,
  type CampaignStatus,
  type ChannelCampaign,
  type ChannelPerson,
} from "../../shared/channelCampaigns";

const router = Router();
const sendLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });
const trackLimit = createRateLimiter({ windowMs: 60 * 1000, max: 120 });
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function staffGate(req: AuthenticatedRequest, res: Parameters<typeof requireStaff>[1], next: Parameters<typeof requireStaff>[2]) {
  return requireStaff(req, res, () => {
    if (process.env.NODE_ENV === "test" && process.env.CHANNEL_CAMPAIGN_TEST_ROLE) {
      const role = process.env.CHANNEL_CAMPAIGN_TEST_ROLE;
      req.staffRole = role;
      req.isAdmin = role === "admin";
      req.isCoordinator = role === "admin" || role === "coordinator";
    }
    next();
  });
}

async function emailCampaignSummaries() {
  const campaigns = await getMarketingStore().listCampaigns();
  return campaigns
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      purpose: campaign.subject || "",
      status: campaign.status,
      kind: "email" as const,
      ownerName: campaign.fromName || "",
      startsOn: campaign.scheduledAt ? chicagoDay(campaign.scheduledAt) : "",
      endsOn: "",
      updatedAt: campaign.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function delayMs(): number {
  const raw = process.env.CAMPAIGN_SEND_DELAY_MS;
  if (raw === undefined || raw === "") return 200;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 200;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logId(at: string): string {
  return `${at.replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`;
}

function secret(): string {
  return process.env.MARKETING_UNSUBSCRIBE_SECRET || "";
}

function unsubscribeFor(email: string, campaignId: string): string {
  const url = signedUnsubscribeUrl(marketingPublicUrl(), email, secret());
  return `${url}${url.includes("?") ? "&" : "?"}campaign=${encodeURIComponent(campaignId)}`;
}

async function runBatches<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  const batches = batchItems(items);
  for (let index = 0; index < batches.length; index += 1) {
    for (const item of batches[index]) await worker(item);
    if (index < batches.length - 1) await wait(delayMs());
  }
}

router.get("/t/open.gif", async (req, res) => {
  const limit = trackLimit.check(clientIp(req));
  const campaignId = String(req.query.c || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const email = normalizeEmail(req.query.e);
  const token = String(req.query.t || "");
  const key = secret();
  if (limit.allowed && key && campaignId && token === trackToken(key, `${campaignId}|${email}|open`)) {
    const store = getChannelCampaignStore();
    const fresh = await store.markEvent(`${campaignId}_${email}_open`);
    if (fresh) await store.bump(campaignId, "opened");
  }
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store");
  res.send(PIXEL);
});

router.get("/t/click", async (req, res) => {
  const limit = trackLimit.check(clientIp(req));
  if (!limit.allowed) return res.status(429).send("Too many requests.");
  const campaignId = String(req.query.c || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const email = normalizeEmail(req.query.e);
  const url = String(req.query.u || "");
  const token = String(req.query.t || "");
  const key = secret();
  if (!key || !campaignId || !/^https?:\/\//i.test(url) || token !== trackToken(key, `${campaignId}|${email}|${url}`)) {
    return res.status(400).send("Link is not valid.");
  }
  const store = getChannelCampaignStore();
  const fresh = await store.markEvent(`${campaignId}_${email}_click_${trackToken(key, url).slice(0, 16)}`);
  if (fresh) await store.bump(campaignId, "clicked");
  return res.redirect(url);
});

router.get("/", staffGate, async (req, res) => {
  await ensureCampaignSample();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
  const page = await getChannelCampaignStore().list(limit, String(req.query.cursor || ""));
  const emailCampaigns = await emailCampaignSummaries();
  res.json({ ...page, emailCampaigns, live: campaignSendLive() });
});

router.get("/calendar", staffGate, async (req, res) => {
  await ensureCampaignSample();
  const month = String(req.query.month || "");
  const campaigns = await getChannelCampaignStore().listAll(200);
  const email = await emailCampaignSummaries();
  const items = [
    ...calendarItems(campaigns),
    ...email.flatMap((campaign) => campaign.startsOn ? [{
      date: campaign.startsOn,
      campaignId: campaign.id,
      campaignName: campaign.name,
      channel: "email" as const,
      label: "GMass email",
      kind: "email" as const,
    }] : []),
  ].filter((item) => !month || item.date.startsWith(month));
  res.json({
    items,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      purpose: campaign.purpose,
      startsOn: campaign.startsOn,
      endsOn: campaign.endsOn,
    })),
  });
});

router.get("/social-queue", staffGate, async (_req, res) => {
  const queue = await getChannelCampaignStore().listQueue(50);
  res.json({ queue });
});

router.get("/audience", staffGate, async (req, res) => {
  await ensureCampaignSample();
  const segmentId = String(req.query.segmentId || "");
  const [preview, segments] = await Promise.all([
    loadChannelAudience(segmentId),
    getMarketingStore().listSegments(),
  ]);
  res.json({
    segments: segments.map((segment) => ({ id: segment.id, name: segment.name })),
    audience: publicAudience(preview),
  });
});

router.post("/", staffGate, async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name the campaign." });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const campaign = normalizeCampaign({
    ...req.body,
    name,
    status: "idea",
    ownerUid: req.user?.uid || "",
    ownerName: String(req.body?.ownerName || req.user?.email || "Staff"),
    ownerEmail: normalizeEmail(req.user?.email || ""),
    stats: undefined,
    sentAt: "",
  }, now, id);
  campaign.status = "idea";
  await getChannelCampaignStore().save(campaign);
  res.status(201).json({ campaign });
});

router.post("/media", staffGate, async (req, res) => {
  const match = String(req.body?.dataUrl || "").match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return res.status(400).json({ error: "Upload a PNG, JPEG, GIF, or WebP image." });
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 1_500_000) {
    return res.status(400).json({ error: "Image must be 1.5 MB or smaller." });
  }
  const ext = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  const safe = String(req.body?.name || "image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
  const filename = `${Date.now()}-${safe}.${ext}`;
  const dir = path.resolve(process.cwd(), "public/marketing");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  res.json({ url: `/marketing/${filename}`, name: filename });
});

router.get("/:id", staffGate, async (req, res) => {
  await ensureCampaignSample();
  const campaign = await getChannelCampaignStore().get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const [logs, preview] = await Promise.all([
    getChannelCampaignStore().listLogs(campaign.id, 10),
    loadChannelAudience(campaign.segmentId, campaign.id),
  ]);
  res.json({ campaign, logs: logs.logs, audience: publicAudience(preview), live: campaignSendLive() });
});

router.post("/:id", staffGate, async (req, res) => {
  const store = getChannelCampaignStore();
  const current = await store.get(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  if (current.status === "sent") return res.status(400).json({ error: "This campaign was sent. Start a new one to change it." });
  const now = new Date().toISOString();
  const next = normalizeCampaign({
    ...current,
    ...req.body,
    id: current.id,
    status: current.status,
    ownerUid: current.ownerUid,
    stats: current.stats,
    sentAt: current.sentAt,
    createdAt: current.createdAt,
  }, now, current.id);
  let reopened = false;
  if (current.status === "approved" || current.status === "scheduled") {
    next.status = "draft";
    reopened = true;
  }
  await store.save(next, current.status);
  res.json({ campaign: next, reopened });
});

router.post("/:id/status", staffGate, async (req: AuthenticatedRequest, res) => {
  const store = getChannelCampaignStore();
  const current = await store.get(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  const to = String(req.body?.status || "") as CampaignStatus;
  const error = statusChangeError({
    from: current.status,
    to,
    isAdmin: Boolean(req.isAdmin),
    hasSchedule: hasChannelSchedule(current),
  });
  if (error) return res.status(error.startsWith("Only an admin") ? 403 : 400).json({ error });
  const next = { ...current, status: to, updatedAt: new Date().toISOString() };
  await store.save(next, current.status);
  res.json({ campaign: next });
});

router.post("/:id/posts/:postId/queue", staffGate, async (req, res) => {
  const store = getChannelCampaignStore();
  const campaign = await store.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const post = campaign.posts.find((item) => item.id === req.params.postId);
  if (!post) return res.status(404).json({ error: "Post not found." });
  const now = new Date().toISOString();
  const queued = { ...post, queuedAt: now };
  const next = {
    ...campaign,
    posts: campaign.posts.map((item) => item.id === post.id ? queued : item),
    updatedAt: now,
  };
  await store.save(next, campaign.status);
  await store.queuePost({
    id: `${campaign.id}_${post.id}`,
    campaignId: campaign.id,
    campaignName: campaign.name,
    platform: post.platform,
    copy: post.copy,
    mediaUrl: post.mediaUrl,
    mediaName: post.mediaName,
    scheduledAt: post.scheduledAt,
    status: "queued",
    createdAt: now,
  });
  res.json({ campaign: next, queued: true });
});

router.get("/:id/logs", staffGate, async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const page = await getChannelCampaignStore().listLogs(req.params.id, limit, String(req.query.cursor || ""));
  res.json(page);
});

router.post("/:id/test", staffGate, async (req: AuthenticatedRequest, res) => {
  const limit = sendLimit.check(req.user?.uid || clientIp(req));
  if (!limit.allowed) return res.status(429).json({ error: "Too many send attempts. Try again shortly." });
  const to = normalizeEmail(req.user?.email || "");
  if (!to) return res.status(400).json({ error: "Your staff account has no email address." });
  const campaign = await getChannelCampaignStore().get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  if (!campaign.email.enabled) return res.status(400).json({ error: "Turn on the email channel before sending a test." });
  const person: ChannelPerson = {
    email: to,
    firstName: String(req.body?.firstName || "there"),
    lastName: "",
    phone: "",
    company: "",
    tags: [],
    emailVerified: true,
    source: "manual",
    doNotContact: false,
  };
  const rendered = renderCampaignEmail(campaign.email, person, unsubscribeFor(to, campaign.id));
  const html = `${addClickTracking(rendered.html, marketingPublicUrl(), campaign.id, to, secret())}${openPixel(marketingPublicUrl(), campaign.id, to, secret())}`;
  let delivered = false;
  let note = "Test email sent to the signed-in staff member only.";
  try {
    await sendCampaignEmail({ to, subject: rendered.subject, html, text: rendered.text });
    delivered = true;
  } catch (error) {
    delivered = false;
    note = error instanceof EmailNotConfiguredError
      ? "SMTP is not configured, so this test was logged and not delivered."
      : error instanceof Error ? error.message : "Test email was not delivered.";
  }
  const log: CampaignLog = {
    id: logId(new Date().toISOString()),
    campaignId: campaign.id,
    kind: "test",
    at: new Date().toISOString(),
    live: delivered,
    lines: [{ channel: "email", to, name: personName(person), detail: rendered.subject }],
    note,
  };
  await getChannelCampaignStore().addLog(log);
  res.json({ delivered, to, log });
});

router.post("/:id/send", staffGate, async (req: AuthenticatedRequest, res) => {
  const limit = sendLimit.check(`${req.user?.uid || clientIp(req)}:send`);
  if (!limit.allowed) return res.status(429).json({ error: "Too many send attempts. Try again shortly." });
  const store = getChannelCampaignStore();
  const campaign = await store.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  if (campaign.status !== "approved" && campaign.status !== "scheduled") {
    return res.status(400).json({ error: "Approve the campaign before sending." });
  }
  const preview = await loadChannelAudience(campaign.segmentId, campaign.id);
  if (preview.emailPeople.length + preview.smsPeople.length > 500) {
    return res.status(400).json({ error: "This audience is over 500 people. Narrow the segment before sending." });
  }
  const lines = planDelivery(campaign, preview, (email) => unsubscribeFor(email, campaign.id));
  const at = new Date().toISOString();
  const live = campaignSendLive();
  if (!live) {
    const log: CampaignLog = {
      id: logId(at),
      campaignId: campaign.id,
      kind: "dry-run",
      at,
      live: false,
      lines: lines.slice(0, 200),
      note: `Dry run. ${preview.emailCount} email, ${preview.smsCount} text, ${campaign.posts.length} post handoff. Nothing was sent.`,
    };
    await store.addLog(log);
    return res.json({ dryRun: true, live: false, total: lines.length, log });
  }

  let sent = 0;
  let delivered = 0;
  let failed = 0;
  const failures: string[] = [];
  if (campaign.email.enabled) {
    await runBatches(preview.emailPeople, async (person) => {
      const rendered = renderCampaignEmail(campaign.email, person, unsubscribeFor(person.email, campaign.id));
      const html = `${addClickTracking(rendered.html, marketingPublicUrl(), campaign.id, person.email, secret())}${openPixel(marketingPublicUrl(), campaign.id, person.email, secret())}`;
      try {
        await sendCampaignEmail({ to: person.email, subject: rendered.subject, html, text: rendered.text });
        sent += 1;
        delivered += 1;
      } catch (error) {
        failed += 1;
        if (failures.length < 8) failures.push(`${person.email}: ${error instanceof Error ? error.message : "failed"}`);
      }
    });
  }
  if (campaign.sms.enabled) {
    await runBatches(preview.smsPeople, async (person) => {
      const body = campaignSmsBody(campaign.sms.body, person.firstName);
      try {
        await sendCampaignText(phoneDigits(person.phone), body);
        sent += 1;
        delivered += 1;
        await store.rememberPhone(person.phone, campaign.id, at);
      } catch (error) {
        failed += 1;
        if (failures.length < 8) failures.push(`${phoneDigits(person.phone)}: ${error instanceof Error ? error.message : "failed"}`);
      }
    });
  }
  for (const post of campaign.posts) {
    await store.queuePost({
      id: `${campaign.id}_${post.id}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      platform: post.platform,
      copy: post.copy,
      mediaUrl: post.mediaUrl,
      mediaName: post.mediaName,
      scheduledAt: post.scheduledAt,
      status: "queued",
      createdAt: at,
    });
  }
  const attempted = (campaign.email.enabled ? preview.emailPeople.length : 0) + (campaign.sms.enabled ? preview.smsPeople.length : 0);
  const next: ChannelCampaign = {
    ...campaign,
    posts: campaign.posts.map((post) => ({ ...post, queuedAt: post.queuedAt || at })),
    stats: {
      ...campaign.stats,
      sent: campaign.stats.sent + sent,
      delivered: campaign.stats.delivered + delivered,
      failed: campaign.stats.failed + failed,
    },
    updatedAt: at,
    status: failed > 0 && sent === 0 && attempted > 0 ? campaign.status : "sent",
    sentAt: failed > 0 && sent === 0 && attempted > 0 ? campaign.sentAt : at,
  };
  await store.save(next, campaign.status);
  const log: CampaignLog = {
    id: logId(at),
    campaignId: campaign.id,
    kind: "send",
    at,
    live: true,
    lines: lines.slice(0, 200),
    note: failures.length ? `Sent ${sent}. Failed ${failed}. ${failures.join(" ")}` : `Sent ${sent}. Posts were queued for handoff.`,
  };
  await store.addLog(log);
  res.json({ dryRun: false, live: true, sent, failed, log, campaign: next });
});

export default router;

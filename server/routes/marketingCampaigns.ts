import { Router } from "express";
import crypto from "crypto";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { hasMarketingPermission, type MarketingPermission } from "../../shared/emailMarketing/permissions";
import { isValidEmail, normalizeEmail } from "../../shared/emailMarketing/contacts";
import { resolveAudience, type OverlapCampaign } from "../../shared/emailMarketing/audience";
import { deliverabilityWarnings, GMASS_IN_PORTAL, GMASS_LINK_OUT, GMASS_LINKS } from "../../shared/emailMarketing/deliverability";
import { applyMerge, mergeValues, withUnsubscribeFooter } from "../../shared/emailMarketing/merge";
import { complaintLike, summarizeGmassReport } from "../../shared/emailMarketing/reports";
import { chicagoLocalToIso, gmassSendTime } from "../../shared/emailMarketing/schedule";
import { matchSendingAccount, normalizeSendingAccounts } from "../../shared/emailMarketing/sendingAccounts";
import { buildSuppression } from "../../shared/emailMarketing/suppression";
import { clientNotifyLive } from "../../shared/clientNotify";
import { isHostedDeployment, liveServerEnv } from "../../shared/tempAdmin";
import {
  DEFAULT_MARKETING_SETTINGS,
  EMPTY_SEGMENT_FILTER,
  type AudienceConfirmation,
  type MarketingCampaign,
  type MarketingSettings,
  type MarketingTemplate,
} from "../../shared/emailMarketing/types";
import { getMarketingStore, syncCustomerContacts, type CachedReport, type MarketingStore } from "../services/marketingStore";
import { getGmassClient, GmassSendBlocked, type GmassClient } from "../services/gmassClient";

const router = Router();

function requireMarketing(permission: MarketingPermission) {
  return async (req: AuthenticatedRequest, res: Parameters<typeof requireStaff>[1], next: Parameters<typeof requireStaff>[2]) => {
    await requireStaff(req, res, () => {
      if (!hasMarketingPermission(req.staffRole, permission)) {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      next();
    });
  };
}

function originOf(req: AuthenticatedRequest): string {
  const configured = process.env.APP_URL || process.env.FRONTEND_URL || "";
  if (configured) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function blankCampaign(now: string, settings: MarketingSettings): MarketingCampaign {
  return {
    id: crypto.randomUUID(),
    name: "Untitled campaign",
    status: "draft",
    audienceMode: "all",
    segmentId: "",
    tags: [],
    subject: "",
    preheader: "",
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    replyTo: settings.replyTo,
    html: "<p>Hi {FirstName|there},</p>\n<p></p>",
    templateId: "",
    scheduledAt: "",
    overlapOverride: false,
    confirmation: null,
    gmassDraftId: "",
    gmassCampaignId: "",
    recipientEmails: [],
    sentAt: "",
    createdAt: now,
    updatedAt: now,
  };
}

async function prepareAudience(store: MarketingStore, campaign: MarketingCampaign, sendAt: string, overlapOverride: boolean, scheduleKey: string) {
  await store.ensureSeed();
  await syncCustomerContacts(store);
  const [contacts, suppression, sends, campaigns, segments, settings] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listSends(),
    store.listCampaigns(),
    store.listSegments(),
    store.getSettings(),
  ]);
  const segment = segments.find((item) => item.id === campaign.segmentId);
  const filter = campaign.audienceMode === "segment"
    ? (segment?.filter || { ...EMPTY_SEGMENT_FILTER, tagsAll: ["__no-such-segment__"] })
    : campaign.audienceMode === "tags"
      ? { ...EMPTY_SEGMENT_FILTER, tagsAny: campaign.tags }
      : null;
  const overlap: OverlapCampaign[] = campaigns
    .filter((item) => item.id !== campaign.id && item.recipientEmails.length && item.status !== "draft" && item.status !== "cancelled")
    .map((item) => ({
      id: item.id,
      name: item.name,
      status: item.sentAt ? "sent" : item.status,
      sentAt: item.sentAt,
      scheduledAt: item.scheduledAt,
      recipientEmails: item.recipientEmails,
    }));
  const dayStart = new Date(sendAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const sentToday = sends.filter((send) => Date.parse(send.sentAt) >= dayStart.getTime()).length;
  const audience = resolveAudience({
    contacts,
    suppression,
    sends,
    campaigns: overlap,
    settings,
    filter,
    sendAt,
    excludeCampaignId: campaign.id,
    overlapOverride,
  });
  const warnings = deliverabilityWarnings({ audience, settings, sentToday });
  const token = crypto.createHash("sha256").update(JSON.stringify({
    emails: audience.recipients.map((contact) => contact.email).sort(),
    overlapOverride,
    scheduleKey,
    fromEmail: campaign.fromEmail,
  })).digest("hex").slice(0, 24);
  const confirmation: AudienceConfirmation = {
    token,
    sendAt,
    overlapOverride,
    recipientCount: audience.recipients.length,
    recipientEmails: audience.recipients.map((contact) => contact.email),
    suppressed: audience.suppressed,
    frequencyCapped: audience.frequencyCapped,
    overlapHeld: audience.overlapHeld,
    duplicatesRemoved: audience.duplicatesRemoved,
    unverified: audience.unverified,
    warnings,
    removedPreview: audience.removed.slice(0, 40).map((item) => ({ email: item.email, reason: item.reason, detail: item.detail })),
    fromEmail: campaign.fromEmail,
    at: new Date().toISOString(),
  };
  return { confirmation, settings, audience };
}

function readCampaign(body: Partial<MarketingCampaign>, current: MarketingCampaign, now: string): MarketingCampaign {
  const mode = body.audienceMode === "segment" || body.audienceMode === "tags" ? body.audienceMode : body.audienceMode === "all" ? "all" : current.audienceMode;
  return {
    ...current,
    name: String(body.name ?? current.name).trim() || current.name,
    audienceMode: mode,
    segmentId: String(body.segmentId ?? current.segmentId),
    tags: Array.isArray(body.tags) ? body.tags.map(String) : current.tags,
    subject: String(body.subject ?? current.subject),
    preheader: String(body.preheader ?? current.preheader),
    fromName: String(body.fromName ?? current.fromName),
    fromEmail: normalizeEmail(body.fromEmail ?? current.fromEmail) || current.fromEmail,
    replyTo: normalizeEmail(body.replyTo ?? current.replyTo) || current.replyTo,
    html: String(body.html ?? current.html),
    templateId: String(body.templateId ?? current.templateId),
    scheduledAt: String(body.scheduledAt ?? current.scheduledAt),
    overlapOverride: Boolean(body.overlapOverride ?? current.overlapOverride),
    confirmation: null,
    updatedAt: now,
  };
}

const UNKNOWN_FROM = "Choose a saved sending account. photos@iconicimagestx.com is ready today. Add a future address such as news@ on the GMass page before a campaign can use it.";

function knownFrom(settings: MarketingSettings, email: string, res: { status: (code: number) => { json: (body: unknown) => void } }): string {
  const match = matchSendingAccount(email, settings.sendingAccounts);
  if (!match) res.status(400).json({ error: UNKNOWN_FROM });
  return match;
}

function sendBlocked(res: { status: (code: number) => { json: (body: unknown) => void } }, gmass: GmassClient): boolean {
  if (!clientNotifyLive()) {
    res.status(503).json({
      error: "Marketing email is off. Set CLIENT_NOTIFY_LIVE=true and leave CLIENT_COMMS_ZONE unset (not RED).",
      suppressed: true,
    });
    return true;
  }
  if (!gmass.configured) {
    res.status(503).json({ error: "Set GMASS_API_KEY on the server before sending." });
    return true;
  }
  if (!gmass.writesEnabled) {
    res.status(503).json({ error: "Set GMASS_SEND_ENABLED=true before a live GMass send." });
    return true;
  }
  return false;
}

router.get("/dashboard", requireMarketing("view"), async (_req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression, segments, campaigns, reports] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listSegments(),
    store.listCampaigns(),
    store.listReports(),
  ]);
  const reportById = new Map(reports.map((report) => [report.campaignId, report]));
  const rows = campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((campaign) => {
    const report = reportById.get(campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      status: report?.derived.pauseRecommended ? "pause-recommended" : campaign.status,
      subject: campaign.subject,
      updatedAt: campaign.updatedAt,
      sentAt: campaign.sentAt,
      recipients: campaign.recipientEmails.length,
      sample: Boolean(report?.sample),
      stats: report?.derived || null,
    };
  });
  res.json({
    contacts: contacts.length,
    customers: contacts.filter((contact) => contact.clientId).length,
    unverified: contacts.filter((contact) => !contact.emailVerified).length,
    suppressed: suppression.length,
    segments: segments.length,
    campaigns: rows,
    alerts: rows.filter((row) => row.stats?.pauseRecommended),
  });
});

router.get("/campaigns", requireMarketing("view"), async (_req, res) => {
  const campaigns = await getMarketingStore().listCampaigns();
  res.json({ campaigns: campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
});

router.post("/campaigns", requireMarketing("manage"), async (req, res) => {
  const store = getMarketingStore();
  const now = new Date().toISOString();
  const settings = await store.getSettings();
  const created = blankCampaign(now, settings);
  const campaign = readCampaign(req.body || {}, created, now);
  const fromEmail = knownFrom(settings, campaign.fromEmail, res);
  if (!fromEmail) return;
  campaign.fromEmail = fromEmail;
  campaign.confirmation = null;
  await store.saveCampaign(campaign);
  res.status(201).json({ campaign });
});

router.get("/campaigns/:id", requireMarketing("view"), async (req, res) => {
  const campaign = await getMarketingStore().getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign });
});

router.post("/campaigns/:id", requireMarketing("manage"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  if (current.status === "sent" || current.status === "sending") {
    return res.status(400).json({ error: "This campaign already went to GMass. Duplicate it to make changes." });
  }
  const settings = await store.getSettings();
  const campaign = readCampaign(req.body || {}, current, new Date().toISOString());
  const fromEmail = knownFrom(settings, campaign.fromEmail, res);
  if (!fromEmail) return;
  campaign.fromEmail = fromEmail;
  await store.saveCampaign(campaign);
  res.json({ campaign });
});

router.post("/campaigns/:id/duplicate", requireMarketing("manage"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  const now = new Date().toISOString();
  const copy: MarketingCampaign = {
    ...current,
    id: crypto.randomUUID(),
    name: `${current.name} copy`,
    status: "draft",
    confirmation: null,
    gmassDraftId: "",
    gmassCampaignId: "",
    recipientEmails: [],
    sentAt: "",
    scheduledAt: "",
    createdAt: now,
    updatedAt: now,
  };
  await store.saveCampaign(copy);
  res.status(201).json({ campaign: copy });
});

router.post("/campaigns/:id/preview", requireMarketing("send"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  const overlapOverride = req.body?.overlapOverride === true;
  const scheduleKey = typeof req.body?.scheduleLocal === "string" ? req.body.scheduleLocal : "";
  let sendAt = new Date().toISOString();
  if (scheduleKey) {
    try {
      sendAt = chicagoLocalToIso(scheduleKey);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Choose a valid Chicago time." });
    }
  }
  const { confirmation } = await prepareAudience(store, current, sendAt, overlapOverride, scheduleKey);
  const campaign = { ...current, overlapOverride, confirmation, updatedAt: new Date().toISOString() };
  await store.saveCampaign(campaign);
  res.json({ confirmation });
});

router.post("/campaigns/:id/test", requireMarketing("send"), async (req: AuthenticatedRequest, res) => {
  const to = normalizeEmail(req.body?.to);
  if (!isValidEmail(to)) return res.status(400).json({ error: "Enter a test email address." });
  const gmass = getGmassClient();
  if (sendBlocked(res, gmass)) return;
  const store = getMarketingStore();
  const campaign = await store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  const fromEmail = knownFrom(await store.getSettings(), campaign.fromEmail, res);
  if (!fromEmail) return;
  const contacts = await store.listContacts();
  const contact = contacts.find((item) => item.email === to) || { firstName: "there", lastName: "", email: to, company: "" };
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET || "";
  const url = new URL("/unsubscribe", originOf(req));
  url.searchParams.set("email", to);
  if (secret) url.searchParams.set("token", crypto.createHmac("sha256", secret).update(to).digest("hex"));
  const html = withUnsubscribeFooter(applyMerge(campaign.html, mergeValues(contact, url.toString())), url.toString());
  try {
    await gmass.sendTransactional({
      fromEmail,
      fromName: campaign.fromName,
      to,
      subject: campaign.subject || campaign.name,
      message: html,
      settings: { openTrack: true, clickTrack: true, messageType: "html" },
    });
  } catch (err) {
    const message = err instanceof GmassSendBlocked ? err.message : err instanceof Error ? err.message : "Test send failed.";
    return res.status(503).json({ error: message });
  }
  res.json({ ok: true, to });
});

router.post("/campaigns/:id/send", requireMarketing("send"), async (req: AuthenticatedRequest, res) => {
  const store = getMarketingStore();
  const current = await store.getCampaign(req.params.id);
  if (!current) return res.status(404).json({ error: "Campaign not found." });
  if (current.status === "sent" || current.status === "sending") {
    return res.status(400).json({ error: "This campaign was already sent." });
  }
  const overlapOverride = req.body?.overlapOverride === true;
  const scheduleKey = typeof req.body?.scheduleLocal === "string" ? req.body.scheduleLocal : "";
  let sendAt = new Date().toISOString();
  let sendTime = "";
  if (scheduleKey) {
    try {
      sendTime = gmassSendTime(scheduleKey);
      sendAt = chicagoLocalToIso(scheduleKey);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Choose a valid Chicago time." });
    }
    if (Date.parse(sendAt) <= Date.now()) return res.status(400).json({ error: "Schedule a time in the future." });
  }
  const { confirmation, settings } = await prepareAudience(store, current, sendAt, overlapOverride, scheduleKey);
  if (!current.confirmation || current.confirmation.token !== confirmation.token || req.body?.token !== confirmation.token) {
    await store.saveCampaign({ ...current, confirmation, overlapOverride, updatedAt: new Date().toISOString() });
    return res.status(409).json({
      error: "Review the recipient count again. The list changed since the last confirm.",
      confirmation,
    });
  }
  if (confirmation.recipientCount === 0) return res.status(400).json({ error: "Nobody is left to email after suppression." });
  if (confirmation.recipientCount > 5000) return res.status(400).json({ error: "Split this send. One campaign can include 5,000 addresses." });
  const fromEmail = knownFrom(settings, current.fromEmail, res);
  if (!fromEmail) return;
  const gmass = getGmassClient();
  if (sendBlocked(res, gmass)) return;

  const page = `${originOf(req)}/unsubscribe`;
  const html = withUnsubscribeFooter(applyMerge(current.html, mergeValues({}, page)), page);
  try {
    const draft = await gmass.createDraft({
      subject: current.subject,
      message: html,
      messageType: "html",
      fromEmail,
      emailAddresses: confirmation.recipientEmails.join(","),
    });
    const draftId = String((draft as { campaignDraftId?: string })?.campaignDraftId || "");
    if (!draftId) return res.status(502).json({ error: "GMass did not return a draft id. Nothing was marked sent." });
    const sent = await gmass.sendCampaign(draftId, {
      openTracking: true,
      clickTracking: true,
      fromName: current.fromName,
      replyTo: current.replyTo,
      previewText: current.preheader,
      friendlyName: current.name,
      ...(sendTime ? { sendTime } : {}),
      emailsPerDay: settings.gmailDailyLimit,
      suppressionDays: settings.frequencyDays,
    });
    const gmassCampaignId = String((sent as { campaignId?: unknown })?.campaignId || "");
    const now = new Date().toISOString();
    const campaign: MarketingCampaign = {
      ...current,
      status: sendTime ? "scheduled" : "sent",
      scheduledAt: sendTime ? sendAt : "",
      sentAt: sendTime ? "" : now,
      gmassDraftId: draftId,
      gmassCampaignId,
      recipientEmails: confirmation.recipientEmails,
      confirmation,
      overlapOverride,
      updatedAt: now,
    };
    await store.saveCampaign(campaign);
    if (!sendTime) {
      await store.addSends(confirmation.recipientEmails.map((email) => ({ email, campaignId: campaign.id, sentAt: now })));
      await store.addEvents(confirmation.recipientEmails.map((email) => ({
        id: crypto.randomUUID(),
        email,
        campaignId: campaign.id,
        campaignName: campaign.name,
        type: "sent" as const,
        at: now,
        detail: campaign.subject || campaign.name,
      })));
    }
    res.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GMass send failed.";
    return res.status(502).json({ error: message });
  }
});

router.get("/campaigns/:id/report", requireMarketing("view"), async (req, res) => {
  const store = getMarketingStore();
  const [campaign, report] = await Promise.all([
    store.getCampaign(req.params.id),
    store.getReport(req.params.id),
  ]);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign, report });
});

router.post("/campaigns/:id/report", requireMarketing("view"), async (req, res) => {
  const store = getMarketingStore();
  const campaign = await store.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  if (!campaign.gmassCampaignId) return res.status(400).json({ error: "GMass has not returned a campaign id for this send yet." });
  const cached = await store.getReport(campaign.id);
  const fresh = req.body?.force === true || !cached || Date.now() - Date.parse(cached.fetchedAt) > 5 * 60 * 1000;
  if (!fresh && cached) return res.json({ campaign, report: cached, cached: true });
  const gmass = getGmassClient();
  if (!gmass.configured) return res.status(503).json({ error: "Set GMASS_API_KEY to refresh GMass reports." });
  try {
    const aggregate = await gmass.getCampaign(campaign.gmassCampaignId);
    const metrics = ["recipients", "opens", "clicks", "bounces", "blocks", "unsubscribes", "replies"] as const;
    const raw: Record<string, unknown> = { aggregate };
    for (const metric of metrics) {
      const rows: unknown[] = [];
      let offset = 0;
      for (let page = 0; page < 20; page += 1) {
        const payload = await gmass.report(campaign.gmassCampaignId, metric, { limit: 200, offset });
        const data = Array.isArray(payload) ? payload : ((payload as { data?: unknown[] })?.data || []);
        rows.push(...data);
        const total = (payload as { metadata?: { totalRecords?: number } })?.metadata?.totalRecords;
        if (!data.length || data.length < 200 || (typeof total === "number" && rows.length >= total)) break;
        offset += data.length;
      }
      raw[metric] = rows;
    }
    const settings = await store.getSettings();
    const stats = (aggregate as { statistics?: Record<string, number> })?.statistics;
    const derived = summarizeGmassReport({
      recipients: raw.recipients,
      opens: raw.opens,
      clicks: raw.clicks,
      bounces: raw.bounces,
      blocks: raw.blocks,
      unsubscribes: raw.unsubscribes,
      replies: raw.replies,
      aggregate: stats || null,
      warnRate: settings.bounceWarnRate,
      pauseRate: settings.bouncePauseRate,
    });
    const report: CachedReport = {
      campaignId: campaign.id,
      gmassCampaignId: campaign.gmassCampaignId,
      fetchedAt: new Date().toISOString(),
      sample: false,
      derived,
      raw,
    };
    await store.saveReport(report);
    const now = new Date().toISOString();
    const suppressionWrites = [];
    for (const row of (raw.bounces as { emailAddress?: string; bounceReason?: string }[]) || []) {
      if (!row?.emailAddress) continue;
      const reason = complaintLike(String(row.bounceReason || "")) ? "complained" as const : "bounced" as const;
      const entry = buildSuppression(now, { kind: "email", value: row.emailAddress, reason, note: String(row.bounceReason || reason), source: "gmass" });
      if (entry) suppressionWrites.push(entry);
    }
    for (const row of (raw.blocks as { emailAddress?: string; blockReason?: string }[]) || []) {
      const entry = row?.emailAddress ? buildSuppression(now, { kind: "email", value: row.emailAddress, reason: "blocked", note: String(row.blockReason || "Blocked by GMass"), source: "gmass" }) : null;
      if (entry) suppressionWrites.push(entry);
    }
    for (const row of (raw.unsubscribes as { emailAddress?: string }[]) || []) {
      const entry = row?.emailAddress ? buildSuppression(now, { kind: "email", value: row.emailAddress, reason: "unsubscribed", note: "Unsubscribed in GMass", source: "gmass" }) : null;
      if (entry) suppressionWrites.push(entry);
    }
    for (const entry of suppressionWrites) await store.saveSuppression(entry);
    if (derived.pauseRecommended && campaign.status === "sent") {
      await store.saveCampaign({ ...campaign, status: "pause-recommended", updatedAt: now });
    }
    res.json({ campaign, report, cached: false });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not refresh the GMass report." });
  }
});

router.get("/templates", requireMarketing("view"), async (_req, res) => {
  const templates = await getMarketingStore().listTemplates();
  res.json({ templates });
});

router.post("/templates", requireMarketing("manage"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const html = String(req.body?.html || "");
  if (!name || !html) return res.status(400).json({ error: "A template needs a name and HTML." });
  const template: MarketingTemplate = {
    id: String(req.body?.id || crypto.randomUUID()),
    name,
    subject: String(req.body?.subject || ""),
    preheader: String(req.body?.preheader || ""),
    html,
    updatedAt: new Date().toISOString(),
  };
  await getMarketingStore().saveTemplate(template);
  res.json({ template });
});

router.delete("/templates/:id", requireMarketing("manage"), async (req, res) => {
  await getMarketingStore().deleteTemplate(req.params.id);
  res.json({ ok: true });
});

router.get("/settings", requireMarketing("view"), async (_req, res) => {
  const settings = await getMarketingStore().getSettings();
  res.json({ settings });
});

router.get("/account", requireMarketing("view"), async (_req, res) => {
  const settings = await getMarketingStore().getSettings();
  const gmass = getGmassClient();
  const base = {
    configured: gmass.configured,
    writesEnabled: gmass.writesEnabled,
    settings,
    links: GMASS_LINKS,
    inPortal: GMASS_IN_PORTAL,
    linkOut: GMASS_LINK_OUT,
    sendingAccount: settings.fromEmail,
    sendingAccounts: settings.sendingAccounts,
  };
  if (!gmass.configured) return res.json({ ...base, user: null, warmup: null, domains: null });
  const [user, warmup, domains] = await Promise.all([
    gmass.getUser().catch((err: Error) => ({ error: err.message })),
    gmass.getWarmup().catch((err: Error) => ({ error: err.message })),
    gmass.listUnsubscribeDomains().catch((err: Error) => ({ error: err.message })),
  ]);
  res.json({ ...base, user, warmup, domains });
});

router.post("/settings", requireMarketing("send"), async (req, res) => {
  const store = getMarketingStore();
  const current = await store.getSettings();
  const next: MarketingSettings = {
    ...current,
    frequencyMax: Number(req.body?.frequencyMax ?? current.frequencyMax),
    frequencyDays: Number(req.body?.frequencyDays ?? current.frequencyDays),
    overlapHours: Number(req.body?.overlapHours ?? current.overlapHours),
    gmailDailyLimit: Number(req.body?.gmailDailyLimit ?? current.gmailDailyLimit),
    bounceWarnRate: Number(req.body?.bounceWarnRate ?? current.bounceWarnRate),
    bouncePauseRate: Number(req.body?.bouncePauseRate ?? current.bouncePauseRate),
    fromName: String(req.body?.fromName ?? current.fromName),
    replyTo: normalizeEmail(req.body?.replyTo ?? current.replyTo) || current.replyTo,
    sendingAccounts: normalizeSendingAccounts(req.body?.sendingAccounts ?? current.sendingAccounts),
    fromEmail: "",
  };
  next.fromEmail = matchSendingAccount(String(req.body?.fromEmail ?? current.fromEmail), next.sendingAccounts) || next.sendingAccounts[0].email;
  if (next.frequencyMax < 0 || next.frequencyDays < 1 || next.gmailDailyLimit < 1) {
    return res.status(400).json({ error: "Check the frequency cap and daily limit." });
  }
  await store.saveSettings(next);
  res.json({ settings: next });
});

router.post("/account/unsubscribes", requireMarketing("send"), async (req, res) => {
  const gmass = getGmassClient();
  if (!gmass.configured) return res.status(503).json({ error: "Set GMASS_API_KEY before syncing a suppression to GMass." });
  const email = normalizeEmail(req.body?.email);
  const domain = String(req.body?.domain || "").replace(/^@/, "").trim().toLowerCase();
  try {
    if (domain) {
      if (req.body?.action === "remove") await gmass.removeUnsubscribeDomain(domain);
      else await gmass.addUnsubscribeDomain(domain);
    } else if (isValidEmail(email)) {
      if (req.body?.action === "remove") await gmass.removeUnsubscribe(email);
      else await gmass.addUnsubscribe(email);
    } else {
      return res.status(400).json({ error: "Provide an email or a domain." });
    }
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "GMass unsubscribe update failed." });
  }
  res.json({ ok: true });
});

router.post("/demo/sample-report", requireMarketing("send"), async (req, res) => {
  if (process.env.MARKETING_DEMO !== "true" || isHostedDeployment(liveServerEnv())) {
    return res.status(404).json({ error: "Not found." });
  }
  const store = getMarketingStore();
  const now = new Date().toISOString();
  const settings = await store.getSettings();
  const campaign = blankCampaign(now, settings);
  campaign.name = "Sample report (no email sent)";
  campaign.subject = "Listing prep notes";
  campaign.status = "pause-recommended";
  campaign.html = "<p>Hi {FirstName|there},</p>";
  campaign.sentAt = now;
  campaign.recipientEmails = ["sample@example.com"];
  const recipients = Array.from({ length: 100 }, (_, index) => ({ emailAddress: `agent${index}@example.com`, sentTime: now }));
  const derived = summarizeGmassReport({
    recipients,
    opens: [{ emailAddress: "agent20@example.com", openCount: 2, lastOpenTime: now }],
    clicks: [{ emailAddress: "agent20@example.com", url: "https://iconicimagestx.com/book", clickTime: now }],
    bounces: recipients.slice(0, 12).map((row) => ({ ...row, bounceReason: "user unknown", bounceTime: now })),
    blocks: [],
    unsubscribes: [],
    replies: [{ emailAddress: "agent21@example.com", replyTime: now }],
    warnRate: settings.bounceWarnRate,
    pauseRate: settings.bouncePauseRate,
  });
  const report: CachedReport = {
    campaignId: campaign.id,
    gmassCampaignId: "",
    fetchedAt: now,
    sample: true,
    derived,
    raw: {},
  };
  await store.saveCampaign(campaign);
  await store.saveReport(report);
  res.json({ campaign, report });
});

export default router;

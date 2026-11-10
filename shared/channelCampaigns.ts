/**
 * Multi-channel campaigns (email, SMS, social handoff).
 * Email still uses the marketing contact list, suppression list, and merge tags.
 * The Holy Grail sheet is read-only here. Columns H–N and P are never written.
 * CAMPAIGN_SEND_LIVE is the only switch for a real recipient send.
 */

import { applyMerge, mergeValues, withUnsubscribeFooter } from "./emailMarketing/merge";
import { contactMatchesFilter, isValidEmail, normalizeEmail } from "./emailMarketing/contacts";
import { matchSuppression } from "./emailMarketing/suppression";
import { resolveAudience, type OverlapCampaign } from "./emailMarketing/audience";
import type { MarketingContact, MarketingSettings, Segment, SuppressionEntry } from "./emailMarketing/types";
import { DEFAULT_MARKETING_SETTINGS } from "./emailMarketing/types";
import { columnLetter, parseSheetRange } from "./holyGrailSync";

export const CAMPAIGN_STATUSES = ["idea", "draft", "ready", "approved", "scheduled", "sent", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  ready: "Ready for review",
  approved: "Approved",
  scheduled: "Scheduled",
  sent: "Sent",
  archived: "Archived",
};

export const POST_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

export type PostPlatform = (typeof POST_PLATFORMS)[number]["id"];

/** Contacts columns the campaign tools must never write, whatever the header says. */
export const CAMPAIGN_SHEET_NEVER_WRITE = ["H", "I", "J", "K", "L", "M", "N", "P"] as const;

export const SEND_BATCH_SIZE = 25;
export const AUDIENCE_PAGE_SIZE = 200;
export const AUDIENCE_MAX_PAGES = 10;

export function campaignSendLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.CAMPAIGN_SEND_LIVE === "true";
}

export function campaignSheetAccess(method: string, range: string): void {
  const verb = method.toLowerCase();
  if (verb === "get" || verb === "values.get") return;
  let letters: string[] = [];
  try {
    const parsed = parseSheetRange(range);
    for (let col = parsed.startCol; col <= parsed.endCol; col += 1) letters.push(columnLetter(col));
  } catch {
    letters = [];
  }
  const blocked = letters.filter((letter) => (CAMPAIGN_SHEET_NEVER_WRITE as readonly string[]).includes(letter));
  if (blocked.length) {
    throw new Error(`Refusing to write Marketing Holy Grail columns ${blocked.join(", ")}.`);
  }
  throw new Error("Campaign audience is read-only. Refusing to write the Marketing Holy Grail sheet.");
}

export interface EmailBlock {
  id: string;
  type: "heading" | "text" | "image" | "button";
  text: string;
  url: string;
  href: string;
}

export interface CampaignPost {
  id: string;
  platform: PostPlatform;
  copy: string;
  mediaUrl: string;
  mediaName: string;
  scheduledAt: string;
  queuedAt: string;
}

export interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  replies: number;
  failed: number;
}

export interface ChannelEmail {
  enabled: boolean;
  mode: "builder" | "html";
  subject: string;
  preheader: string;
  html: string;
  blocks: EmailBlock[];
  scheduledAt: string;
}

export interface ChannelSms {
  enabled: boolean;
  body: string;
  scheduledAt: string;
}

export interface ChannelCampaign {
  id: string;
  name: string;
  purpose: string;
  status: CampaignStatus;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  startsOn: string;
  endsOn: string;
  segmentId: string;
  email: ChannelEmail;
  sms: ChannelSms;
  posts: CampaignPost[];
  stats: CampaignStats;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelPerson {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  tags: string[];
  emailVerified: boolean;
  source: "client" | "import" | "manual" | "sheet";
  doNotContact: boolean;
}

export interface AudienceCounts {
  emailCount: number;
  smsCount: number;
  unsubscribe: number;
  bounce: number;
  doNotContact: number;
  held: number;
}

export interface AudiencePreview extends AudienceCounts {
  recipients: { name: string; email: string; phone: string; channels: ("email" | "sms")[] }[];
  removed: { name: string; email: string; reason: string }[];
  source: "sheet+contacts" | "contacts";
  sheetConfigured: boolean;
  sheetNote: string;
  truncated: boolean;
  emailPeople: ChannelPerson[];
  smsPeople: ChannelPerson[];
}

export function emptyStats(): CampaignStats {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0, replies: 0, failed: 0 };
}

export function emptyEmail(): ChannelEmail {
  return { enabled: true, mode: "builder", subject: "", preheader: "", html: "", blocks: [], scheduledAt: "" };
}

export function emptySms(): ChannelSms {
  return { enabled: false, body: "", scheduledAt: "" };
}

export function personName(person: Pick<ChannelPerson, "firstName" | "lastName" | "email" | "phone">): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || person.email || person.phone || "Contact";
}

export function phoneDigits(value: string): string {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function hasChannelSchedule(campaign: Pick<ChannelCampaign, "email" | "sms" | "posts">): boolean {
  if (campaign.email.scheduledAt) return true;
  if (campaign.sms.scheduledAt) return true;
  return campaign.posts.some((post) => post.scheduledAt);
}

export function statusChangeError(input: {
  from: CampaignStatus;
  to: CampaignStatus;
  isAdmin: boolean;
  hasSchedule: boolean;
}): string | null {
  if (!CAMPAIGN_STATUSES.includes(input.to)) return "Unknown status.";
  if (input.from === input.to) return null;
  if (input.to === "approved") {
    if (input.from === "scheduled") return null;
    if (!input.isAdmin) return "Only an admin can approve a campaign.";
    if (input.from !== "ready") return "Move the campaign to Ready for review before approving it.";
    return null;
  }
  if (input.to === "scheduled") {
    if (input.from !== "approved") return "Approve the campaign before scheduling it.";
    if (!input.hasSchedule) return "Add a date on the email, text, or a post before scheduling.";
    return null;
  }
  if (input.to === "sent") return "Sent is set by a live send.";
  const allowed: Record<CampaignStatus, CampaignStatus[]> = {
    idea: ["draft", "archived"],
    draft: ["idea", "ready", "archived"],
    ready: ["draft", "archived"],
    approved: ["ready", "archived"],
    scheduled: ["approved", "archived"],
    sent: ["archived"],
    archived: ["draft"],
  };
  if (!allowed[input.from].includes(input.to)) {
    return `Cannot move from ${STATUS_LABEL[input.from]} to ${STATUS_LABEL[input.to]}.`;
  }
  if ((input.from === "approved" || input.from === "scheduled") && input.to === "ready" && !input.isAdmin) {
    return "Only an admin can move an approved campaign back to review.";
  }
  return null;
}

const GSM = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const GSM_EXT = new Set("^{}\\[~]|€");

export function smsMetrics(body: string): { encoding: "gsm" | "unicode"; chars: number; segments: number } {
  let septets = 0;
  for (const char of body) {
    if (GSM.has(char)) septets += 1;
    else if (GSM_EXT.has(char)) septets += 2;
    else {
      const chars = [...body].length;
      return { encoding: "unicode", chars, segments: chars === 0 ? 0 : chars <= 70 ? 1 : Math.ceil(chars / 67) };
    }
  }
  return {
    encoding: "gsm",
    chars: septets,
    segments: septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153),
  };
}

const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];

export function isStopKeyword(body: string): boolean {
  return STOP_WORDS.includes(body.trim().toUpperCase());
}

/** Personalize and keep the carrier STOP line on every campaign text. */
export function campaignSmsBody(template: string, firstName: string): string {
  const name = firstName.trim() || "there";
  let body = template.replace(/\{FirstName\}/g, name).trim();
  if (!/\bSTOP\b/i.test(body)) body = `${body}\nReply STOP to opt out.`.trim();
  return body.slice(0, 1600);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function compileBlocks(blocks: EmailBlock[], preheader: string): string {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : "";
  const rows = blocks.map((block) => {
    if (block.type === "heading") {
      return `<h1 style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:28px;line-height:1.2;color:#111827;">${escapeHtml(block.text)}</h1>`;
    }
    if (block.type === "image" && block.url) {
      return `<p style="margin:0 0 16px;"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.text)}" style="max-width:100%;border-radius:12px;display:block;" /></p>`;
    }
    if (block.type === "button" && block.href) {
      return `<p style="margin:0 0 16px;"><a href="${escapeHtml(block.href)}" style="display:inline-block;background:#0d9488;color:#ffffff;font-family:Inter,Arial,sans-serif;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:12px 18px;border-radius:12px;">${escapeHtml(block.text || "Open")}</a></p>`;
    }
    return `<p style="margin:0 0 14px;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1f2937;">${escapeHtml(block.text)}</p>`;
  }).join("");
  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f2ea;">${hidden}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ea;"><tr><td align="center" style="padding:24px;"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;"><tr><td style="padding:28px;">${rows || `<p style="font-family:Inter,Arial,sans-serif;color:#1f2937;">Hello {FirstName},</p>`}</td></tr></table></td></tr></table></body></html>`;
}

export function campaignHtml(email: ChannelEmail): string {
  if (email.mode === "html") {
    const html = email.html || "";
    if (email.preheader && !html.includes(email.preheader)) {
      return `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(email.preheader)}</div>${html}`;
    }
    return html;
  }
  return compileBlocks(email.blocks, email.preheader);
}

export function renderCampaignEmail(
  email: ChannelEmail,
  person: Pick<ChannelPerson, "firstName" | "lastName" | "email" | "company">,
  unsubscribeUrl: string,
): { subject: string; html: string; text: string } {
  const values = mergeValues(person, unsubscribeUrl);
  const subject = applyMerge(email.subject || "Iconic Images", values);
  const html = withUnsubscribeFooter(applyMerge(campaignHtml(email), values), unsubscribeUrl);
  const text = [
    applyMerge(email.preheader || email.subject || "", values),
    `Hello ${person.firstName || "there"},`,
    "Iconic Images, 26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

export function toMarketingContact(person: ChannelPerson, now: string): MarketingContact {
  return {
    email: normalizeEmail(person.email),
    firstName: person.firstName,
    lastName: person.lastName,
    company: person.company,
    phone: person.phone,
    tags: person.tags,
    custom: {},
    source: person.source === "sheet" ? "import" : person.source,
    clientId: "",
    emailVerified: person.emailVerified,
    createdAt: now,
    updatedAt: now,
  };
}

function suppressionBucket(entry: SuppressionEntry | null, doNotContact: boolean): "ok" | "unsubscribe" | "bounce" | "doNotContact" {
  if (doNotContact) return "doNotContact";
  if (!entry) return "ok";
  if (entry.reason === "unsubscribed") return "unsubscribe";
  if (entry.reason === "bounced") return "bounce";
  return "doNotContact";
}

export function buildChannelAudience(input: {
  people: ChannelPerson[];
  suppression: SuppressionEntry[];
  phoneStops: string[];
  segment: Segment | null;
  settings?: MarketingSettings;
  sends?: { email: string; campaignId: string; sentAt: string }[];
  overlap?: OverlapCampaign[];
  sendAt?: string;
  excludeCampaignId?: string;
  source?: AudiencePreview["source"];
  sheetConfigured?: boolean;
  sheetNote?: string;
  truncated?: boolean;
}): AudiencePreview {
  const now = input.sendAt || new Date().toISOString();
  const settings = input.settings || DEFAULT_MARKETING_SETTINGS;
  const pool = input.segment
    ? input.people.filter((person) => contactMatchesFilter(toMarketingContact(person, now), input.segment!.filter))
    : input.people;

  const counts: AudienceCounts = { emailCount: 0, smsCount: 0, unsubscribe: 0, bounce: 0, doNotContact: 0, held: 0 };
  const removed: AudiencePreview["removed"] = [];
  const emailCandidates: ChannelPerson[] = [];
  const smsPeople: ChannelPerson[] = [];
  const stops = new Set(input.phoneStops.map(phoneDigits).filter(Boolean));

  for (const person of pool) {
    const bucket = suppressionBucket(matchSuppression(toMarketingContact(person, now), input.suppression), person.doNotContact);
    if (bucket === "unsubscribe") counts.unsubscribe += 1;
    if (bucket === "bounce") counts.bounce += 1;
    if (bucket === "doNotContact") counts.doNotContact += 1;
    if (bucket !== "ok") {
      removed.push({ name: personName(person), email: person.email, reason: bucket === "doNotContact" ? "Do not contact" : bucket === "bounce" ? "Bounced" : "Unsubscribed" });
    }
    if (bucket === "ok" && isValidEmail(person.email)) emailCandidates.push({ ...person, email: normalizeEmail(person.email) });
    const phone = phoneDigits(person.phone);
    const smsBlocked = bucket === "doNotContact" || (phone && stops.has(phone));
    if (phone && !smsBlocked) smsPeople.push(person);
  }

  const resolved = resolveAudience({
    contacts: emailCandidates.map((person) => toMarketingContact(person, now)),
    suppression: input.suppression,
    sends: input.sends || [],
    campaigns: input.overlap || [],
    settings,
    filter: null,
    sendAt: now,
    excludeCampaignId: input.excludeCampaignId,
  });
  const emailAllowedSet = new Set(resolved.recipients.map((contact) => contact.email));
  const emailPeople = emailCandidates.filter((person) => emailAllowedSet.has(person.email));
  counts.held = resolved.removed.filter((item) => item.reason === "frequency" || item.reason === "overlap" || item.reason === "duplicate" || item.reason === "invalid").length;
  for (const item of resolved.removed) {
    if (item.reason === "suppressed") continue;
    removed.push({ name: item.name, email: item.email, reason: item.detail || item.reason });
  }
  counts.emailCount = emailPeople.length;
  counts.smsCount = smsPeople.length;

  const byEmail = new Map<string, AudiencePreview["recipients"][number]>();
  for (const person of emailPeople) {
    byEmail.set(person.email, { name: personName(person), email: person.email, phone: phoneDigits(person.phone), channels: ["email"] });
  }
  for (const person of smsPeople) {
    const key = person.email || phoneDigits(person.phone);
    const existing = byEmail.get(key);
    if (existing) existing.channels.push("sms");
    else byEmail.set(key, { name: personName(person), email: person.email, phone: phoneDigits(person.phone), channels: ["sms"] });
  }

  return {
    ...counts,
    recipients: [...byEmail.values()],
    removed,
    source: input.source || "contacts",
    sheetConfigured: Boolean(input.sheetConfigured),
    sheetNote: input.sheetNote || "",
    truncated: Boolean(input.truncated),
    emailPeople,
    smsPeople,
  };
}

export interface DeliveryLine {
  channel: "email" | "sms" | "post";
  to: string;
  name: string;
  detail: string;
}

export function planDelivery(
  campaign: ChannelCampaign,
  audience: Pick<AudiencePreview, "emailPeople" | "smsPeople">,
  unsubscribeUrlFor: (email: string) => string,
): DeliveryLine[] {
  const lines: DeliveryLine[] = [];
  if (campaign.email.enabled) {
    for (const person of audience.emailPeople) {
      const rendered = renderCampaignEmail(campaign.email, person, unsubscribeUrlFor(person.email));
      lines.push({
        channel: "email",
        to: person.email,
        name: personName(person),
        detail: `${rendered.subject} — ${campaign.email.preheader || "no preheader"}`,
      });
    }
  }
  if (campaign.sms.enabled) {
    for (const person of audience.smsPeople) {
      lines.push({
        channel: "sms",
        to: phoneDigits(person.phone),
        name: personName(person),
        detail: campaignSmsBody(campaign.sms.body, person.firstName),
      });
    }
  }
  for (const post of campaign.posts) {
    lines.push({
      channel: "post",
      to: post.platform,
      name: campaign.name,
      detail: post.copy,
    });
  }
  return lines;
}

export interface CalendarItem {
  date: string;
  campaignId: string;
  campaignName: string;
  channel: "email" | "sms" | "post" | "window";
  label: string;
  /** GMass email campaigns open their own editor. Omitted for multi-channel. */
  kind?: "email";
}

export function chicagoDay(isoOrDay: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDay)) return isoOrDay;
  const ms = Date.parse(isoOrDay);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function calendarItems(campaigns: ChannelCampaign[]): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const campaign of campaigns) {
    if (campaign.status === "archived") continue;
    if (campaign.startsOn) {
      items.push({ date: campaign.startsOn, campaignId: campaign.id, campaignName: campaign.name, channel: "window", label: "Starts" });
    }
    if (campaign.email.enabled && campaign.email.scheduledAt) {
      const date = chicagoDay(campaign.email.scheduledAt);
      if (date) items.push({ date, campaignId: campaign.id, campaignName: campaign.name, channel: "email", label: "Email" });
    }
    if (campaign.sms.enabled && campaign.sms.scheduledAt) {
      const date = chicagoDay(campaign.sms.scheduledAt);
      if (date) items.push({ date, campaignId: campaign.id, campaignName: campaign.name, channel: "sms", label: "Text" });
    }
    for (const post of campaign.posts) {
      if (!post.scheduledAt) continue;
      const date = chicagoDay(post.scheduledAt);
      if (date) items.push({ date, campaignId: campaign.id, campaignName: campaign.name, channel: "post", label: post.platform });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.campaignName.localeCompare(b.campaignName));
}

export function batchItems<T>(items: T[], size = SEND_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

const PLATFORM_SET = new Set<string>(POST_PLATFORMS.map((item) => item.id));

export function normalizeCampaign(raw: Partial<ChannelCampaign>, now: string, id: string): ChannelCampaign {
  const status = CAMPAIGN_STATUSES.includes(raw.status as CampaignStatus) ? raw.status as CampaignStatus : "draft";
  const email = { ...emptyEmail(), ...(raw.email || {}) };
  email.mode = email.mode === "html" ? "html" : "builder";
  email.blocks = Array.isArray(email.blocks) ? email.blocks.slice(0, 40).map((block, index) => ({
    id: String(block?.id || `block-${index}`),
    type: block?.type === "heading" || block?.type === "image" || block?.type === "button" || block?.type === "text" ? block.type : "text",
    text: String(block?.text || "").slice(0, 5000),
    url: String(block?.url || "").slice(0, 2000),
    href: String(block?.href || "").slice(0, 2000),
  })) : [];
  const sms = { ...emptySms(), ...(raw.sms || {}) };
  const posts = Array.isArray(raw.posts) ? raw.posts.slice(0, 20).flatMap((post, index) => {
    const platform = String(post?.platform || "");
    if (!PLATFORM_SET.has(platform)) return [];
    return [{
      id: String(post?.id || `post-${index}`),
      platform: platform as PostPlatform,
      copy: String(post?.copy || "").slice(0, 5000),
      mediaUrl: String(post?.mediaUrl || "").slice(0, 2000),
      mediaName: String(post?.mediaName || "").slice(0, 180),
      scheduledAt: String(post?.scheduledAt || ""),
      queuedAt: String(post?.queuedAt || ""),
    }];
  }) : [];
  return {
    id,
    name: String(raw.name || "Untitled campaign").slice(0, 120),
    purpose: String(raw.purpose || "").slice(0, 2000),
    status,
    ownerUid: String(raw.ownerUid || ""),
    ownerName: String(raw.ownerName || "").slice(0, 120),
    ownerEmail: normalizeEmail(raw.ownerEmail || ""),
    startsOn: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.startsOn || "")) ? String(raw.startsOn) : "",
    endsOn: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.endsOn || "")) ? String(raw.endsOn) : "",
    segmentId: String(raw.segmentId || "").slice(0, 80),
    email: {
      ...email,
      subject: String(email.subject || "").slice(0, 200),
      preheader: String(email.preheader || "").slice(0, 200),
      html: String(email.html || "").slice(0, 100000),
      scheduledAt: String(email.scheduledAt || ""),
      enabled: email.enabled !== false,
    },
    sms: {
      enabled: Boolean(sms.enabled),
      body: String(sms.body || "").slice(0, 1600),
      scheduledAt: String(sms.scheduledAt || ""),
    },
    posts,
    stats: { ...emptyStats(), ...(raw.stats || {}) },
    sentAt: String(raw.sentAt || ""),
    createdAt: String(raw.createdAt || now),
    updatedAt: now,
  };
}

export function publicCampaign(campaign: ChannelCampaign) {
  return campaign;
}

export function publicAudience(preview: AudiencePreview) {
  return {
    emailCount: preview.emailCount,
    smsCount: preview.smsCount,
    unsubscribe: preview.unsubscribe,
    bounce: preview.bounce,
    doNotContact: preview.doNotContact,
    held: preview.held,
    recipients: preview.recipients.slice(0, 50),
    recipientTotal: preview.recipients.length,
    removed: preview.removed.slice(0, 50),
    source: preview.source,
    sheetConfigured: preview.sheetConfigured,
    sheetNote: preview.sheetNote,
    truncated: preview.truncated,
  };
}

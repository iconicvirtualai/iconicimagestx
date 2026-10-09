export interface ReportDerived {
  sent: number;
  delivered: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  replies: number;
  bounces: number;
  blocks: number;
  unsubscribes: number;
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
  links: { url: string; clicks: number; unique: number }[];
  recipients: {
    email: string;
    sentAt: string;
    opens: number;
    clicks: number;
    replied: boolean;
    bounced: boolean;
    blocked: boolean;
    unsubscribed: boolean;
  }[];
  timeline: { at: string; type: string; email: string; detail: string }[];
  bounceRate: number;
  warn: boolean;
  pauseRecommended: boolean;
}

function list(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return ((value as { data: unknown[] }).data).filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }
  return [];
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key] ?? row[key[0].toUpperCase() + key.slice(1)];
  return value == null ? "" : String(value);
}

function rate(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function summarizeGmassReport(input: {
  recipients?: unknown;
  opens?: unknown;
  clicks?: unknown;
  bounces?: unknown;
  blocks?: unknown;
  unsubscribes?: unknown;
  replies?: unknown;
  aggregate?: { recipients?: number; opens?: number; clicks?: number; replies?: number; unsubscribes?: number; bounces?: number; blocks?: number } | null;
  warnRate: number;
  pauseRate: number;
}): ReportDerived {
  const recipients = list(input.recipients);
  const opens = list(input.opens);
  const clicks = list(input.clicks);
  const bounces = list(input.bounces);
  const blocks = list(input.blocks);
  const unsubscribes = list(input.unsubscribes);
  const replies = list(input.replies);

  const sent = recipients.length || Number(input.aggregate?.recipients || 0);
  const bounceEmails = new Set(bounces.map((row) => text(row, "emailAddress").toLowerCase()).filter(Boolean));
  const blockEmails = new Set(blocks.map((row) => text(row, "emailAddress").toLowerCase()).filter(Boolean));
  const delivered = Math.max(0, sent - new Set([...bounceEmails, ...blockEmails]).size);
  const uniqueOpens = new Set(opens.map((row) => text(row, "emailAddress").toLowerCase()).filter(Boolean)).size || (recipients.length ? 0 : Number(input.aggregate?.opens || 0));
  const openTotal = opens.reduce((sum, row) => sum + Number(row.openCount || row.OpenCount || 1), 0) || uniqueOpens;
  const clickEmails = new Set(clicks.map((row) => text(row, "emailAddress").toLowerCase()).filter(Boolean));
  const uniqueClicks = clickEmails.size || (recipients.length ? 0 : Number(input.aggregate?.clicks || 0));
  const replyCount = replies.length || Number(input.aggregate?.replies || 0);
  const bounceCount = bounces.length || Number(input.aggregate?.bounces || 0);
  const blockCount = blocks.length || Number(input.aggregate?.blocks || 0);
  const unsubCount = unsubscribes.length || Number(input.aggregate?.unsubscribes || 0);

  const linkMap = new Map<string, { clicks: number; emails: Set<string> }>();
  for (const row of clicks) {
    const url = text(row, "url") || "(unknown link)";
    const current = linkMap.get(url) || { clicks: 0, emails: new Set<string>() };
    current.clicks += 1;
    const email = text(row, "emailAddress").toLowerCase();
    if (email) current.emails.add(email);
    linkMap.set(url, current);
  }

  const byEmail = new Map<string, ReportDerived["recipients"][number]>();
  const ensure = (email: string) => {
    const key = email.toLowerCase();
    if (!key) return null;
    if (!byEmail.has(key)) {
      byEmail.set(key, { email: key, sentAt: "", opens: 0, clicks: 0, replied: false, bounced: false, blocked: false, unsubscribed: false });
    }
    return byEmail.get(key)!;
  };
  for (const row of recipients) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.sentAt = text(row, "sentTime");
  }
  for (const row of opens) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.opens = Number(row.openCount || row.OpenCount || 1);
  }
  for (const row of clicks) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.clicks += 1;
  }
  for (const row of replies) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.replied = true;
  }
  for (const row of bounces) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.bounced = true;
  }
  for (const row of blocks) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.blocked = true;
  }
  for (const row of unsubscribes) {
    const item = ensure(text(row, "emailAddress"));
    if (item) item.unsubscribed = true;
  }

  const timeline = [
    ...recipients.map((row) => ({ at: text(row, "sentTime"), type: "sent", email: text(row, "emailAddress"), detail: "Sent" })),
    ...opens.map((row) => ({ at: text(row, "lastOpenTime"), type: "open", email: text(row, "emailAddress"), detail: `${row.openCount || 1} opens` })),
    ...clicks.map((row) => ({ at: text(row, "clickTime"), type: "click", email: text(row, "emailAddress"), detail: text(row, "url") })),
    ...replies.map((row) => ({ at: text(row, "replyTime"), type: "reply", email: text(row, "emailAddress"), detail: "Replied" })),
    ...bounces.map((row) => ({ at: text(row, "bounceTime"), type: "bounce", email: text(row, "emailAddress"), detail: text(row, "bounceReason") || "Bounced" })),
    ...blocks.map((row) => ({ at: text(row, "blockTime"), type: "block", email: text(row, "emailAddress"), detail: text(row, "blockReason") || "Blocked" })),
    ...unsubscribes.map((row) => ({ at: text(row, "unsubscribeTime"), type: "unsubscribe", email: text(row, "emailAddress"), detail: "Unsubscribed" })),
  ].filter((item) => item.at).sort((a, b) => b.at.localeCompare(a.at));

  const bounceRate = sent ? bounceCount / sent : 0;
  return {
    sent,
    delivered,
    opens: openTotal,
    uniqueOpens,
    clicks: clicks.length || uniqueClicks,
    uniqueClicks,
    replies: replyCount,
    bounces: bounceCount,
    blocks: blockCount,
    unsubscribes: unsubCount,
    rates: {
      open: rate(uniqueOpens, delivered || sent),
      click: rate(uniqueClicks, delivered || sent),
      bounce: rate(bounceCount, sent),
      unsubscribe: rate(unsubCount, sent),
    },
    links: [...linkMap.entries()].map(([url, value]) => ({ url, clicks: value.clicks, unique: value.emails.size })).sort((a, b) => b.clicks - a.clicks),
    recipients: [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)),
    timeline,
    bounceRate,
    warn: sent >= 25 && bounceRate >= input.warnRate,
    pauseRecommended: sent >= 25 && bounceRate >= input.pauseRate,
  };
}

export function complaintLike(reason: string): boolean {
  return /complain|spam|abuse/i.test(reason);
}

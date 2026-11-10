import admin from "firebase-admin";
import { phoneDigits, type CampaignStats, type ChannelCampaign } from "../../shared/channelCampaigns";
import { isStopKeyword } from "../../shared/channelCampaigns";

export interface CampaignLog {
  id: string;
  campaignId: string;
  kind: "dry-run" | "send" | "test";
  at: string;
  live: boolean;
  lines: { channel: string; to: string; name: string; detail: string }[];
  note: string;
}

export interface StatusCounter {
  total: number;
  byStatus: Record<string, number>;
}

export interface SmsIndex {
  phone: string;
  campaignId: string;
  updatedAt: string;
}

export interface SocialHandoff {
  id: string;
  campaignId: string;
  campaignName: string;
  platform: string;
  copy: string;
  mediaUrl: string;
  mediaName: string;
  scheduledAt: string;
  status: "queued";
  createdAt: string;
}

export interface ChannelCampaignStore {
  list(limit: number, cursor?: string): Promise<{ campaigns: ChannelCampaign[]; nextCursor: string; counter: StatusCounter }>;
  listAll(limit: number): Promise<ChannelCampaign[]>;
  get(id: string): Promise<ChannelCampaign | null>;
  save(campaign: ChannelCampaign, previousStatus?: string): Promise<void>;
  addLog(log: CampaignLog): Promise<void>;
  listLogs(campaignId: string, limit: number, cursor?: string): Promise<{ logs: CampaignLog[]; nextCursor: string }>;
  bump(id: string, field: keyof CampaignStats, amount?: number): Promise<void>;
  rememberPhone(phone: string, campaignId: string, at: string): Promise<void>;
  phoneIndex(phone: string): Promise<SmsIndex | null>;
  suppressPhone(phone: string, at: string): Promise<void>;
  phoneStops(): Promise<string[]>;
  markEvent(id: string): Promise<boolean>;
  queuePost(item: SocialHandoff): Promise<void>;
  listQueue(limit: number): Promise<SocialHandoff[]>;
}

function emptyCounter(): StatusCounter {
  return { total: 0, byStatus: {} };
}

function applyCounter(counter: StatusCounter, from: string | undefined, to: string | undefined, created: boolean): StatusCounter {
  const byStatus = { ...counter.byStatus };
  if (created && to) {
    byStatus[to] = (byStatus[to] || 0) + 1;
    return { total: counter.total + 1, byStatus };
  }
  if (from && to && from !== to) {
    byStatus[from] = Math.max(0, (byStatus[from] || 0) - 1);
    byStatus[to] = (byStatus[to] || 0) + 1;
  }
  return { total: counter.total, byStatus };
}

export function createMemoryChannelCampaignStore(): ChannelCampaignStore {
  const campaigns = new Map<string, ChannelCampaign>();
  const logs: CampaignLog[] = [];
  const phones = new Map<string, SmsIndex>();
  const stops = new Set<string>();
  const events = new Set<string>();
  const queue: SocialHandoff[] = [];
  let counter = emptyCounter();

  return {
    async list(limit, cursor) {
      const sorted = [...campaigns.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const start = cursor ? sorted.findIndex((item) => item.id === cursor) + 1 : 0;
      const page = sorted.slice(Math.max(0, start), Math.max(0, start) + limit);
      const next = sorted[Math.max(0, start) + limit];
      return { campaigns: page, nextCursor: next?.id || "", counter };
    },
    async listAll(limit) {
      return [...campaigns.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
    },
    async get(id) {
      return campaigns.get(id) || null;
    },
    async save(campaign, previousStatus) {
      const created = !campaigns.has(campaign.id);
      campaigns.set(campaign.id, campaign);
      counter = applyCounter(counter, created ? undefined : previousStatus, campaign.status, created);
    },
    async addLog(log) {
      logs.unshift(log);
    },
    async listLogs(campaignId, limit, cursor) {
      const rows = logs.filter((log) => log.campaignId === campaignId);
      const start = cursor ? rows.findIndex((log) => log.id === cursor) + 1 : 0;
      const page = rows.slice(Math.max(0, start), Math.max(0, start) + limit);
      const next = rows[Math.max(0, start) + limit];
      return { logs: page, nextCursor: next?.id || "" };
    },
    async bump(id, field, amount = 1) {
      const campaign = campaigns.get(id);
      if (!campaign) return;
      campaign.stats = { ...campaign.stats, [field]: (campaign.stats[field] || 0) + amount };
      campaigns.set(id, campaign);
    },
    async rememberPhone(phone, campaignId, at) {
      const key = phoneDigits(phone);
      if (!key) return;
      phones.set(key, { phone: key, campaignId, updatedAt: at });
    },
    async phoneIndex(phone) {
      return phones.get(phoneDigits(phone)) || null;
    },
    async suppressPhone(phone, at) {
      const key = phoneDigits(phone);
      if (!key) return;
      stops.add(key);
      void at;
    },
    async phoneStops() {
      return [...stops];
    },
    async markEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
    async queuePost(item) {
      const existing = queue.findIndex((row) => row.id === item.id);
      if (existing >= 0) queue[existing] = item;
      else queue.unshift(item);
    },
    async listQueue(limit) {
      return queue.slice(0, limit);
    },
  };
}

const memoryStore = createMemoryChannelCampaignStore();
let testStore: ChannelCampaignStore | null = null;

export function resetChannelCampaignStoreForTests(): ChannelCampaignStore {
  testStore = createMemoryChannelCampaignStore();
  return testStore;
}

export function getChannelCampaignStore(): ChannelCampaignStore {
  if (testStore) return testStore;
  if (process.env.CHANNEL_CAMPAIGN_STORE === "memory" || !admin.apps.length) return memoryStore;
  return firestoreStore;
}

function db() {
  return admin.firestore();
}

const COL = "channelCampaigns";

const firestoreStore: ChannelCampaignStore = {
  async list(limit, cursor) {
    let query = db().collection(COL).orderBy("updatedAt", "desc").limit(limit) as FirebaseFirestore.Query;
    if (cursor) {
      const cursorDoc = await db().collection(COL).doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const [snap, counterDoc] = await Promise.all([
      query.get(),
      db().collection("channelCampaignCounters").doc("summary").get(),
    ]);
    const campaigns = snap.docs.map((doc) => doc.data() as ChannelCampaign);
    const counter = counterDoc.exists ? counterDoc.data() as StatusCounter : emptyCounter();
    const nextCursor = snap.size === limit ? snap.docs[snap.docs.length - 1]?.id || "" : "";
    return { campaigns, nextCursor, counter };
  },
  async listAll(limit) {
    const snap = await db().collection(COL).orderBy("updatedAt", "desc").limit(limit).get();
    return snap.docs.map((doc) => doc.data() as ChannelCampaign);
  },
  async get(id) {
    const doc = await db().collection(COL).doc(id).get();
    return doc.exists ? doc.data() as ChannelCampaign : null;
  },
  async save(campaign, previousStatus) {
    const ref = db().collection(COL).doc(campaign.id);
    const counterRef = db().collection("channelCampaignCounters").doc("summary");
    await db().runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const counterSnap = await tx.get(counterRef);
      const counter = counterSnap.exists ? counterSnap.data() as StatusCounter : emptyCounter();
      const created = !existing.exists;
      const from = created ? undefined : (previousStatus || (existing.data() as ChannelCampaign | undefined)?.status);
      tx.set(ref, campaign);
      tx.set(counterRef, applyCounter(counter, from, campaign.status, created));
    });
  },
  async addLog(log) {
    await db().collection(COL).doc(log.campaignId).collection("logs").doc(log.id).set(log);
  },
  async listLogs(campaignId, limit, cursor) {
    let query = db().collection(COL).doc(campaignId).collection("logs").orderBy(admin.firestore.FieldPath.documentId(), "desc").limit(limit) as FirebaseFirestore.Query;
    if (cursor) {
      const cursorDoc = await db().collection(COL).doc(campaignId).collection("logs").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snap = await query.get();
    return {
      logs: snap.docs.map((doc) => doc.data() as CampaignLog),
      nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1]?.id || "" : "",
    };
  },
  async bump(id, field, amount = 1) {
    await db().collection(COL).doc(id).update({ [`stats.${field}`]: admin.firestore.FieldValue.increment(amount) });
  },
  async rememberPhone(phone, campaignId, at) {
    const key = phoneDigits(phone);
    if (!key) return;
    await db().collection("channelSmsIndex").doc(key).set({ phone: key, campaignId, updatedAt: at });
  },
  async phoneIndex(phone) {
    const key = phoneDigits(phone);
    if (!key) return null;
    const doc = await db().collection("channelSmsIndex").doc(key).get();
    return doc.exists ? doc.data() as SmsIndex : null;
  },
  async suppressPhone(phone, at) {
    const key = phoneDigits(phone);
    if (!key) return;
    await db().collection("channelSmsStops").doc(key).set({ phone: key, at, reason: "stop" });
  },
  async phoneStops() {
    const stops: string[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    for (let page = 0; page < 10; page += 1) {
      let query = db().collection("channelSmsStops").orderBy(admin.firestore.FieldPath.documentId()).limit(200) as FirebaseFirestore.Query;
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      stops.push(...snap.docs.map((doc) => doc.id));
      if (snap.size < 200) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return stops;
  },
  async markEvent(id) {
    const ref = db().collection("channelCampaignEvents").doc(id);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { id, at: new Date().toISOString() });
      return true;
    });
  },
  async queuePost(item) {
    await db().collection("socialHandoff").doc(item.id).set(item);
  },
  async listQueue(limit) {
    const snap = await db().collection("socialHandoff").orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((doc) => doc.data() as SocialHandoff);
  },
};

export async function noteCampaignSmsInbound(from: string, body: string): Promise<void> {
  const store = getChannelCampaignStore();
  const at = new Date().toISOString();
  const phone = phoneDigits(from);
  if (!phone) return;
  if (isStopKeyword(body)) await store.suppressPhone(from, at);
  const index = await store.phoneIndex(from);
  if (!index) return;
  if (isStopKeyword(body)) await store.bump(index.campaignId, "unsubscribed");
  else if (!["HELP", "INFO"].includes(body.trim().toUpperCase())) await store.bump(index.campaignId, "replies");
}

export async function recordCampaignUnsubscribe(campaignId: string, email: string): Promise<void> {
  const store = getChannelCampaignStore();
  const campaign = await store.get(campaignId);
  if (!campaign) return;
  const fresh = await store.markEvent(`${campaignId}_${email}_unsubscribe`);
  if (fresh) await store.bump(campaignId, "unsubscribed");
}

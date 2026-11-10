/**
 * Team chat storage.
 * The browser listens to two documents per open screen: teamChatInbox/{uid}
 * and, while a thread is open, teamThreadLive/{threadId}. Phone numbers stay
 * in the staff record and in teamSmsRoutes, which clients cannot read.
 */

import { createHmac, randomUUID } from "node:crypto";
import admin from "firebase-admin";
import {
  TEAM_CHAT_INBOX,
  TEAM_CHAT_PREFS,
  TEAM_PUSH_SUBSCRIPTIONS,
  TEAM_SMS_LOG,
  TEAM_SMS_ROUTES,
  TEAM_THREAD_LIVE,
  TEAM_THREADS,
  canonicalPhone,
  emptyTeamChatPrefs,
  phoneDigits,
  type TeamChatMessage,
  type TeamChatPrefs,
  type TeamChatThreadSummary,
  type TeamDirectoryPerson,
  type TeamSmsLogEntry,
  type TeamThreadKind,
} from "../../shared/teamChat.ts";

export interface TeamStaffRecord extends TeamDirectoryPerson {
  phone: string | null;
}

export interface StoredThread {
  id: string;
  kind: TeamThreadKind;
  name: string;
  code: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  clientId: string | null;
  clientName: string | null;
  photographerId: string | null;
  orderId: string | null;
  listingId: string | null;
  address: string | null;
  createdBy: string;
  preview: string;
  updatedAt: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface TeamChatRepo {
  listStaff(): Promise<TeamStaffRecord[]>;
  getStaff(uid: string): Promise<TeamStaffRecord | null>;
  findStaffByPhone(phone: string): Promise<TeamStaffRecord | null>;
  listThreads(): Promise<StoredThread[]>;
  getThread(id: string): Promise<StoredThread | null>;
  saveThread(thread: StoredThread): Promise<void>;
  listMessages(threadId: string, limit: number): Promise<TeamChatMessage[]>;
  addMessage(message: TeamChatMessage): Promise<void>;
  hasMessageSid(sid: string): Promise<boolean>;
  rememberMessageSid(sid: string): Promise<void>;
  getInbox(uid: string): Promise<TeamChatThreadSummary[]>;
  saveInbox(uid: string, threads: TeamChatThreadSummary[]): Promise<void>;
  saveLive(thread: StoredThread, messages: TeamChatMessage[]): Promise<void>;
  getPrefs(uid: string): Promise<TeamChatPrefs>;
  savePrefs(uid: string, prefs: TeamChatPrefs): Promise<void>;
  listPush(uid: string): Promise<PushSubscriptionRecord[]>;
  savePush(uid: string, subs: PushSubscriptionRecord[]): Promise<void>;
  addSmsLog(entry: TeamSmsLogEntry): Promise<void>;
  listSmsLog(limit: number): Promise<TeamSmsLogEntry[]>;
  getActiveThread(phone: string): Promise<string | null>;
  setActiveThread(phone: string, threadId: string): Promise<void>;
}

function routeKey(phone: string): string {
  return phoneRouteId(canonicalPhone(phone) || phone);
}

export function phoneRouteId(phone: string, env: Record<string, string | undefined> = process.env): string {
  const salt = env.TEAM_SMS_ROUTE_SALT || env.TWILIO_AUTH_TOKEN || "iconic-team-chat";
  return createHmac("sha256", salt).update(phone).digest("hex").slice(0, 40);
}

function staffName(data: Record<string, unknown>, uid: string): string {
  const first = typeof data.firstName === "string" ? data.firstName.trim() : "";
  const last = typeof data.lastName === "string" ? data.lastName.trim() : "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if (typeof data.name === "string" && data.name.trim()) return data.name.trim();
  if (typeof data.email === "string" && data.email.includes("@")) return data.email.split("@")[0] || uid;
  return "Staff";
}

function asStaff(id: string, data: Record<string, unknown>): TeamStaffRecord | null {
  const role = typeof data.role === "string" ? data.role : "";
  if (!["admin", "coordinator", "photographer", "editor"].includes(role)) return null;
  if (data.isActive === false) return null;
  const phone = typeof data.phone === "string" && data.phone.trim() ? data.phone.trim() : null;
  return { uid: id, name: staffName(data, id), role, phone };
}

export class MemoryTeamChatRepo implements TeamChatRepo {
  staff = new Map<string, TeamStaffRecord>();
  threads = new Map<string, StoredThread>();
  messages = new Map<string, TeamChatMessage[]>();
  inboxes = new Map<string, TeamChatThreadSummary[]>();
  prefs = new Map<string, TeamChatPrefs>();
  push = new Map<string, PushSubscriptionRecord[]>();
  logs: TeamSmsLogEntry[] = [];
  routes = new Map<string, string>();
  sids = new Set<string>();

  async listStaff() {
    return [...this.staff.values()];
  }

  async getStaff(uid: string) {
    return this.staff.get(uid) || null;
  }

  async findStaffByPhone(phone: string) {
    const target = phoneDigits(phone);
    for (const person of this.staff.values()) {
      if (person.phone && phoneDigits(person.phone) === target) return person;
    }
    return null;
  }

  async listThreads() {
    return [...this.threads.values()];
  }

  async getThread(id: string) {
    return this.threads.get(id) || null;
  }

  async saveThread(thread: StoredThread) {
    this.threads.set(thread.id, thread);
  }

  async listMessages(threadId: string, limit: number) {
    const rows = this.messages.get(threadId) || [];
    return rows.slice(-limit);
  }

  async addMessage(message: TeamChatMessage) {
    const rows = this.messages.get(message.threadId) || [];
    rows.push(message);
    this.messages.set(message.threadId, rows);
  }

  async hasMessageSid(sid: string) {
    return this.sids.has(sid);
  }

  async rememberMessageSid(sid: string) {
    this.sids.add(sid);
  }

  async getInbox(uid: string) {
    return this.inboxes.get(uid) || [];
  }

  async saveInbox(uid: string, threads: TeamChatThreadSummary[]) {
    this.inboxes.set(uid, threads);
  }

  async saveLive() {
    return undefined;
  }

  async getPrefs(uid: string) {
    return this.prefs.get(uid) || emptyTeamChatPrefs();
  }

  async savePrefs(uid: string, prefs: TeamChatPrefs) {
    this.prefs.set(uid, prefs);
  }

  async listPush(uid: string) {
    return this.push.get(uid) || [];
  }

  async savePush(uid: string, subs: PushSubscriptionRecord[]) {
    this.push.set(uid, subs);
  }

  async addSmsLog(entry: TeamSmsLogEntry) {
    this.logs.unshift(entry);
    this.logs = this.logs.slice(0, 100);
  }

  async listSmsLog(limit: number) {
    return this.logs.slice(0, limit);
  }

  async getActiveThread(phone: string) {
    return this.routes.get(routeKey(phone)) || null;
  }

  async setActiveThread(phone: string, threadId: string) {
    this.routes.set(routeKey(phone), threadId);
  }
}

const memory = new MemoryTeamChatRepo();
let override: TeamChatRepo | null = null;

export function resetMemoryTeamChat(): MemoryTeamChatRepo {
  memory.staff.clear();
  memory.threads.clear();
  memory.messages.clear();
  memory.inboxes.clear();
  memory.prefs.clear();
  memory.push.clear();
  memory.logs = [];
  memory.routes.clear();
  memory.sids.clear();
  override = memory;
  return memory;
}

export function setTeamChatRepoForTests(repo: TeamChatRepo | null) {
  override = repo;
}

function db() {
  return admin.firestore();
}

function threadFrom(id: string, data: Record<string, unknown>): StoredThread {
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds.map(String) : [];
  const memberNames = data.memberNames && typeof data.memberNames === "object"
    ? data.memberNames as Record<string, string>
    : {};
  return {
    id,
    kind: (data.kind as StoredThread["kind"]) || "group",
    name: String(data.name || ""),
    code: String(data.code || ""),
    memberIds,
    memberNames,
    clientId: typeof data.clientId === "string" ? data.clientId : null,
    clientName: typeof data.clientName === "string" ? data.clientName : null,
    photographerId: typeof data.photographerId === "string" ? data.photographerId : null,
    orderId: typeof data.orderId === "string" ? data.orderId : null,
    listingId: typeof data.listingId === "string" ? data.listingId : null,
    address: typeof data.address === "string" ? data.address : null,
    createdBy: String(data.createdBy || ""),
    preview: String(data.preview || ""),
    updatedAt: String(data.updatedAt || ""),
  };
}

const firestoreRepo: TeamChatRepo = {
  async listStaff() {
    const snap = await db().collection("staff").limit(200).get();
    return snap.docs
      .map((doc) => asStaff(doc.id, doc.data() as Record<string, unknown>))
      .filter((person): person is TeamStaffRecord => Boolean(person));
  },
  async getStaff(uid: string) {
    const doc = await db().collection("staff").doc(uid).get();
    if (!doc.exists) return null;
    return asStaff(doc.id, doc.data() as Record<string, unknown>);
  },
  async findStaffByPhone(phone: string) {
    const people = await this.listStaff();
    const target = phoneDigits(phone);
    return people.find((person) => person.phone && phoneDigits(person.phone) === target) || null;
  },
  async listThreads() {
    const snap = await db().collection(TEAM_THREADS).limit(200).get();
    return snap.docs.map((doc) => threadFrom(doc.id, doc.data() as Record<string, unknown>));
  },
  async getThread(id: string) {
    const doc = await db().collection(TEAM_THREADS).doc(id).get();
    if (!doc.exists) return null;
    return threadFrom(doc.id, doc.data() as Record<string, unknown>);
  },
  async saveThread(thread: StoredThread) {
    await db().collection(TEAM_THREADS).doc(thread.id).set(thread, { merge: true });
  },
  async listMessages(threadId: string, limit: number) {
    const snap = await db().collection(TEAM_THREADS).doc(threadId).collection("messages")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snap.docs
      .map((doc) => doc.data() as TeamChatMessage)
      .reverse();
  },
  async addMessage(message: TeamChatMessage) {
    await db().collection(TEAM_THREADS).doc(message.threadId).collection("messages").doc(message.id).set(message);
  },
  async hasMessageSid(sid: string) {
    const doc = await db().collection("teamSmsInbound").doc(sid).get();
    return doc.exists;
  },
  async rememberMessageSid(sid: string) {
    await db().collection("teamSmsInbound").doc(sid).set({ at: new Date().toISOString() });
  },
  async getInbox(uid: string) {
    const doc = await db().collection(TEAM_CHAT_INBOX).doc(uid).get();
    const threads = doc.data()?.threads;
    return Array.isArray(threads) ? threads as TeamChatThreadSummary[] : [];
  },
  async saveInbox(uid: string, threads: TeamChatThreadSummary[]) {
    await db().collection(TEAM_CHAT_INBOX).doc(uid).set({
      threads,
      unread: threads.reduce((sum, thread) => sum + (thread.unread || 0), 0),
      updatedAt: new Date().toISOString(),
    });
  },
  async saveLive(thread: StoredThread, messages: TeamChatMessage[]) {
    await db().collection(TEAM_THREAD_LIVE).doc(thread.id).set({
      memberIds: thread.memberIds,
      clientId: thread.clientId,
      messages: messages.slice(-40),
      updatedAt: new Date().toISOString(),
    });
  },
  async getPrefs(uid: string) {
    const doc = await db().collection(TEAM_CHAT_PREFS).doc(uid).get();
    return { ...emptyTeamChatPrefs(), ...(doc.data() || {}) };
  },
  async savePrefs(uid: string, prefs: TeamChatPrefs) {
    await db().collection(TEAM_CHAT_PREFS).doc(uid).set({ ...prefs, updatedAt: new Date().toISOString() });
  },
  async listPush(uid: string) {
    const doc = await db().collection(TEAM_PUSH_SUBSCRIPTIONS).doc(uid).get();
    const subs = doc.data()?.subscriptions;
    return Array.isArray(subs) ? subs as PushSubscriptionRecord[] : [];
  },
  async savePush(uid: string, subs: PushSubscriptionRecord[]) {
    await db().collection(TEAM_PUSH_SUBSCRIPTIONS).doc(uid).set({ subscriptions: subs, updatedAt: new Date().toISOString() });
  },
  async addSmsLog(entry: TeamSmsLogEntry) {
    await db().collection(TEAM_SMS_LOG).doc(entry.id).set(entry);
  },
  async listSmsLog(limit: number) {
    const snap = await db().collection(TEAM_SMS_LOG).orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((doc) => doc.data() as TeamSmsLogEntry);
  },
  async getActiveThread(phone: string) {
    const doc = await db().collection(TEAM_SMS_ROUTES).doc(routeKey(phone)).get();
    const threadId = doc.data()?.threadId;
    return typeof threadId === "string" ? threadId : null;
  },
  async setActiveThread(phone: string, threadId: string) {
    await db().collection(TEAM_SMS_ROUTES).doc(routeKey(phone)).set({
      threadId,
      updatedAt: new Date().toISOString(),
    });
  },
};

export function getTeamChatRepo(): TeamChatRepo {
  if (override) return override;
  if (admin.apps.length) return firestoreRepo;
  return memory;
}

export function newId(): string {
  return randomUUID();
}

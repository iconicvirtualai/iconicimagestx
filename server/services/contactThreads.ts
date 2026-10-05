import { randomBytes, timingSafeEqual } from "node:crypto";
import admin from "firebase-admin";
import type { ContactThreadMessage, ContactThreadView } from "../../shared/contactThread";
import type { LiveChatMessage } from "./liveChat";

const COLLECTION = "contactThreads";
const MAX_THREAD_MESSAGES = 200;
const TOKEN_BYTES = 32;

export interface ContactThreadRecord {
  id: string;
  accessToken: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  messages: ContactThreadMessage[];
}

interface ContactThreadStore {
  get(id: string): Promise<ContactThreadRecord | null>;
  insert(thread: ContactThreadRecord): Promise<void>;
  /**
   * Apply `change` to the current record.
   * Return null from `change` to leave the record untouched (bad token).
   * Return null from the store when the thread does not exist.
   */
  update(
    id: string,
    change: (current: ContactThreadRecord) => ContactThreadRecord | null,
  ): Promise<ContactThreadRecord | null>;
  listRecent(limit: number): Promise<ContactThreadRecord[]>;
  clear(): void;
}

export interface ClientThreadResult {
  thread: ContactThreadView;
  accessToken: string;
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function tokensMatch(stored: string, provided: string): boolean {
  if (!stored || !provided || stored.length !== provided.length || stored.length > 128) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(provided));
}

function trimMessages(messages: ContactThreadMessage[]): ContactThreadMessage[] {
  if (messages.length <= MAX_THREAD_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_THREAD_MESSAGES);
}

export function toContactThreadView(thread: ContactThreadRecord): ContactThreadView {
  return {
    id: thread.id,
    name: thread.name,
    ...(thread.email ? { email: thread.email } : {}),
    ...(thread.phone ? { phone: thread.phone } : {}),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: thread.messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      senderName: message.senderName,
      text: message.text,
      createdAt: message.createdAt,
    })),
  };
}

function asRecord(data: unknown): ContactThreadRecord | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.accessToken !== "string") return null;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const msg = item as Record<string, unknown>;
        if (typeof msg.id !== "string" || typeof msg.text !== "string") return [];
        if (msg.sender !== "client" && msg.sender !== "staff") return [];
        return [{
          id: msg.id,
          sender: msg.sender,
          senderName: typeof msg.senderName === "string" && msg.senderName.trim() ? msg.senderName : "Iconic Images",
          text: msg.text,
          createdAt: typeof msg.createdAt === "string" ? msg.createdAt : new Date(0).toISOString(),
        } satisfies ContactThreadMessage];
      })
    : [];

  return {
    id: raw.id,
    accessToken: raw.accessToken,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Visitor",
    ...(typeof raw.email === "string" && raw.email ? { email: raw.email } : {}),
    ...(typeof raw.phone === "string" && raw.phone ? { phone: raw.phone } : {}),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    messages,
  };
}

function createMemoryStore(): ContactThreadStore {
  const rows = new Map<string, ContactThreadRecord>();
  return {
    async get(id) {
      return rows.get(id) ?? null;
    },
    async insert(thread) {
      rows.set(thread.id, thread);
    },
    async update(id, change) {
      const current = rows.get(id);
      if (!current) return null;
      const next = change(current);
      if (!next) return null;
      rows.set(id, next);
      return next;
    },
    async listRecent(limit) {
      return [...rows.values()]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
        .slice(0, limit);
    },
    clear() {
      rows.clear();
    },
  };
}

function createFirestoreStore(): ContactThreadStore {
  const db = () => admin.firestore();
  const col = () => db().collection(COLLECTION);
  return {
    async get(id) {
      const snap = await col().doc(id).get();
      if (!snap.exists) return null;
      return asRecord(snap.data());
    },
    async insert(thread) {
      await col().doc(thread.id).set(thread);
    },
    async update(id, change) {
      const ref = col().doc(id);
      return db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const current = asRecord(snap.data());
        if (!current) return null;
        const next = change(current);
        if (!next) return null;
        tx.set(ref, next);
        return next;
      });
    },
    async listRecent(limit) {
      const snap = await col().orderBy("updatedAt", "desc").limit(limit).get();
      return snap.docs
        .map((doc) => asRecord(doc.data()))
        .filter((row): row is ContactThreadRecord => Boolean(row));
    },
    clear() {
      // Tests use the memory store. Firestore rows are not wiped from here.
    },
  };
}

const memoryStore = createMemoryStore();
let firestoreStore: ContactThreadStore | null = null;

function activeStore(): ContactThreadStore {
  if (process.env.CONTACT_THREAD_STORE === "memory" || admin.apps.length === 0) {
    return memoryStore;
  }
  if (!firestoreStore) firestoreStore = createFirestoreStore();
  return firestoreStore;
}

export function resetContactThreadStoreForTests(): void {
  memoryStore.clear();
}

function clientMessage(input: LiveChatMessage, createdAt: string): ContactThreadMessage {
  return {
    id: newId(),
    sender: "client",
    senderName: input.name,
    text: input.message,
    createdAt,
  };
}

function withClientMessage(current: ContactThreadRecord, input: LiveChatMessage, createdAt: string): ContactThreadRecord {
  return {
    ...current,
    name: input.name,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    updatedAt: createdAt,
    messages: trimMessages([...current.messages, clientMessage(input, createdAt)]),
  };
}

/**
 * Save a visitor message on a portal thread.
 * Does not email or text the visitor or the office.
 */
export async function startClientThread(input: LiveChatMessage): Promise<ClientThreadResult> {
  const createdAt = new Date().toISOString();
  const accessToken = newToken();
  const thread: ContactThreadRecord = {
    id: newId(),
    accessToken,
    name: input.name,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    createdAt,
    updatedAt: createdAt,
    messages: [clientMessage(input, createdAt)],
  };
  await activeStore().insert(thread);
  return { thread: toContactThreadView(thread), accessToken };
}

export async function continueClientThread(
  id: string,
  accessToken: string,
  input: LiveChatMessage,
): Promise<ClientThreadResult | null> {
  const createdAt = new Date().toISOString();
  const updated = await activeStore().update(id, (current) => {
    if (!tokensMatch(current.accessToken, accessToken)) return null;
    return withClientMessage(current, input, createdAt);
  });
  if (!updated) return null;
  return { thread: toContactThreadView(updated), accessToken: updated.accessToken };
}

export async function readClientThread(id: string, accessToken: string): Promise<ContactThreadView | null> {
  const thread = await activeStore().get(id);
  if (!thread || !tokensMatch(thread.accessToken, accessToken)) return null;
  return toContactThreadView(thread);
}

export async function listContactThreads(): Promise<ContactThreadView[]> {
  const threads = await activeStore().listRecent(100);
  return threads.map(toContactThreadView);
}

export async function appendStaffReply(
  id: string,
  text: string,
  senderName = "Iconic Images",
): Promise<ContactThreadView | null> {
  const createdAt = new Date().toISOString();
  const message: ContactThreadMessage = {
    id: newId(),
    sender: "staff",
    senderName: senderName.trim() || "Iconic Images",
    text,
    createdAt,
  };
  const updated = await activeStore().update(id, (current) => ({
    ...current,
    updatedAt: createdAt,
    messages: trimMessages([...current.messages, message]),
  }));
  return updated ? toContactThreadView(updated) : null;
}

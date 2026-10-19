import admin from "firebase-admin";
import {
  buildUnifiedThreads,
  threadVisibleTo,
  type CommunicationsSnapshot,
  type PortalScope,
  type UnifiedThread,
} from "../../shared/communications/threads";
import { listContactThreads } from "./contactThreads";
import { rememberedCommunications } from "./communicationLog";

async function readCollection(name: string): Promise<Array<Record<string, unknown>>> {
  if (!admin.apps.length) return [];
  const collection = admin.firestore().collection(name);
  try {
    const snap = await collection.orderBy("createdAt", "desc").limit(200).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`[Communications] ${name} ordered read failed.`, error);
    try {
      const snap = await collection.limit(200).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (fallback) {
      console.warn(`[Communications] ${name} read failed.`, fallback);
      return [];
    }
  }
}

export async function loadCommunicationsSnapshot(): Promise<CommunicationsSnapshot> {
  const [messages, conversations, smsLogs, orderRequests, contactThreads] = await Promise.all([
    readCollection("messages"),
    readCollection("conversations"),
    readCollection("smsLogs"),
    readCollection("orderRequests"),
    listContactThreads().catch((error) => {
      console.warn("[Communications] Contact threads failed.", error);
      return [];
    }),
  ]);
  return {
    messages: [...messages, ...rememberedCommunications()],
    conversations,
    smsLogs,
    orderRequests,
    contactThreads,
  };
}

export async function listUnifiedThreads(): Promise<UnifiedThread[]> {
  return buildUnifiedThreads(await loadCommunicationsSnapshot());
}

export async function findUnifiedThread(id: string): Promise<UnifiedThread | null> {
  const threads = await listUnifiedThreads();
  return threads.find((thread) => thread.id === id) || null;
}

export function threadsForPortal(threads: UnifiedThread[], scope: PortalScope): UnifiedThread[] {
  return threads.filter((thread) => threadVisibleTo(thread, scope));
}

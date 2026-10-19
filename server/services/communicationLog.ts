import { randomBytes } from "node:crypto";
import admin from "firebase-admin";

export interface CommunicationLogEntry {
  id?: string;
  threadId: string;
  orderId?: string;
  clientId?: string;
  photographerId?: string;
  participantIds?: string[];
  senderId: string;
  senderType: string;
  senderName: string;
  recipient?: string;
  email?: string;
  phone?: string;
  content: string;
  channel: "email" | "sms" | "in-app" | "contact";
  direction: "inbound" | "outbound";
  delivery: "sent" | "suppressed" | "logged" | "failed" | "allowlist";
  isRead?: boolean;
  createdAt?: string;
}

const remembered: Array<Record<string, unknown>> = [];

export function rememberedCommunications(): Array<Record<string, unknown>> {
  return remembered.map((row) => ({ ...row }));
}

export function resetRememberedCommunications(): void {
  remembered.length = 0;
}

/**
 * Persist one inbound or outbound communications message.
 * Without Firebase Admin the row stays in memory so local and tests still show it.
 * This does not send email or SMS.
 */
export async function logCommunicationMessage(entry: CommunicationLogEntry): Promise<Record<string, unknown>> {
  const row: Record<string, unknown> = {
    id: entry.id || randomBytes(8).toString("hex"),
    threadId: entry.threadId,
    orderId: entry.orderId || null,
    clientId: entry.clientId || null,
    photographerId: entry.photographerId || null,
    participantIds: entry.participantIds || [],
    senderId: entry.senderId,
    senderType: entry.senderType,
    senderName: entry.senderName,
    recipient: entry.recipient || null,
    email: entry.email || null,
    phone: entry.phone || null,
    content: entry.content,
    channel: entry.channel,
    direction: entry.direction,
    delivery: entry.delivery,
    isRead: entry.isRead ?? entry.direction === "outbound",
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  if (!admin.apps.length) {
    remembered.push(row);
    return row;
  }

  const firestore = admin.firestore();
  const stored = {
    ...row,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await firestore.collection("messages").add(stored);
  if (entry.channel === "sms") {
    await firestore.collection("smsLogs").add({
      direction: entry.direction,
      to: entry.phone || entry.recipient || null,
      body: entry.content,
      status: entry.delivery,
      orderId: entry.orderId || null,
      threadId: entry.threadId,
      sentBy: entry.senderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return { ...row, id: ref.id };
}

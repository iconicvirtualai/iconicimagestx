/**
 * Marketing opt-in records and STOP state.
 * Firestore writes use the Admin SDK. Tests keep an in-memory copy when
 * Firebase is not initialized. This module never sends a text.
 */

import admin from "firebase-admin";
import {
  MARKETING_SMS_CONSENT_TEXT,
  MARKETING_SMS_CONSENT_VERSION,
  explicitMarketingSmsOptIn,
  phoneDigits10,
  phoneLookupValues,
} from "../../shared/a2p";
import { getMarketingStore } from "./marketingStore";
import { getChannelCampaignStore } from "./channelCampaignStore";

export interface MarketingOptInRecord {
  phone: string;
  name: string;
  firstName: string;
  lastName: string;
  marketingSmsOptIn: boolean;
  smsOptIn: boolean;
  smsStopped: boolean;
  consentText: string;
  consentTextVersion: string;
  source: "/sms";
  ip: string;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
  stoppedAt?: string;
}

const memoryOptIns = new Map<string, MarketingOptInRecord>();
const memoryStops = new Set<string>();

export function resetSmsProgramForTests(): void {
  memoryOptIns.clear();
  memoryStops.clear();
}

export function readMarketingOptInForTests(phone: string): MarketingOptInRecord | null {
  return memoryOptIns.get(phoneDigits10(phone)) || null;
}

function useMemory(): boolean {
  return !admin.apps?.length;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function stamp(existing?: string): string {
  return existing || new Date().toISOString();
}

export async function isSmsStopped(phone: string): Promise<boolean> {
  const digits = phoneDigits10(phone);
  if (!digits) return false;
  if (memoryStops.has(digits)) return true;
  if (useMemory()) return false;
  try {
    const snap = await admin.firestore().collection("smsStops").doc(digits).get();
    return snap.exists && snap.data()?.stopped !== false;
  } catch (error) {
    console.error("[SMS] Stop lookup failed:", error);
    return false;
  }
}

async function rememberStop(digits: string, at: string): Promise<void> {
  memoryStops.add(digits);
  const existing = memoryOptIns.get(digits);
  if (existing) {
    memoryOptIns.set(digits, {
      ...existing,
      marketingSmsOptIn: false,
      smsOptIn: false,
      smsStopped: true,
      stoppedAt: at,
      updatedAt: at,
    });
  }
  if (useMemory()) return;
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("smsStops").doc(digits).set({
    phone: digits,
    stopped: true,
    stoppedAt: now,
    source: "inbound",
    updatedAt: now,
  }, { merge: true });
  await db.collection("marketingSmsOptIns").doc(digits).set({
    phone: digits,
    marketingSmsOptIn: false,
    smsOptIn: false,
    smsStopped: true,
    stoppedAt: now,
    updatedAt: now,
  }, { merge: true });
}

async function patchPeople(digits: string, patch: Record<string, unknown>): Promise<void> {
  const values = phoneLookupValues(digits);
  if (!useMemory() && values.length) {
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const firestorePatch = { ...patch, updatedAt: now };
    for (const collection of ["clients", "marketingContacts"]) {
      const snap = await db.collection(collection).where("phone", "in", values).limit(20).get();
      await Promise.all(snap.docs.map((doc) => doc.ref.set(firestorePatch, { merge: true })));
    }
  }
  try {
    const store = getMarketingStore();
    const contacts = await store.listContacts();
    let changed = false;
    for (const contact of contacts) {
      if (phoneDigits10(contact.phone) !== digits) continue;
      Object.assign(contact, {
        marketingSmsOptIn: patch.marketingSmsOptIn === true,
        smsStopped: patch.smsStopped === true,
        updatedAt: new Date().toISOString(),
      });
      changed = true;
    }
    if (changed) await store.saveContacts(contacts);
  } catch (error) {
    console.error("[SMS] Contact opt-in update failed:", error);
  }
}

export async function saveMarketingOptIn(input: {
  name: string;
  phone: string;
  ip: string;
  userAgent: string;
}): Promise<MarketingOptInRecord> {
  const phone = phoneDigits10(input.phone);
  const name = input.name.trim().slice(0, 120);
  const { firstName, lastName } = splitName(name);
  const now = new Date().toISOString();
  const prior = memoryOptIns.get(phone);
  const record: MarketingOptInRecord = {
    phone,
    name,
    firstName,
    lastName,
    marketingSmsOptIn: true,
    smsOptIn: true,
    smsStopped: false,
    consentText: MARKETING_SMS_CONSENT_TEXT,
    consentTextVersion: MARKETING_SMS_CONSENT_VERSION,
    source: "/sms",
    ip: input.ip.slice(0, 80),
    userAgent: input.userAgent.slice(0, 400),
    createdAt: stamp(prior?.createdAt),
    updatedAt: now,
  };
  memoryOptIns.set(phone, record);
  memoryStops.delete(phone);
  if (!useMemory()) {
    const db = admin.firestore();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    await db.collection("marketingSmsOptIns").doc(phone).set({
      ...record,
      createdAt: prior ? record.createdAt : serverNow,
      updatedAt: serverNow,
    }, { merge: true });
    await db.collection("smsStops").doc(phone).set({
      phone,
      stopped: false,
      clearedAt: serverNow,
    }, { merge: true });
  }
  await patchPeople(phone, {
    smsOptIn: true,
    marketingSmsOptIn: true,
    smsStopped: false,
    marketingSmsConsentVersion: MARKETING_SMS_CONSENT_VERSION,
    marketingSmsConsentSource: "/sms",
  });
  try {
    await getChannelCampaignStore().clearPhoneStop(phone);
  } catch (error) {
    console.error("[SMS] Clearing a prior STOP failed:", error);
  }
  return record;
}

/** STOP on an inbound webhook. Marks the number out of marketing and transactional sends. */
export async function optOutEverywhere(from: string): Promise<void> {
  const digits = phoneDigits10(from);
  if (!digits) return;
  const at = new Date().toISOString();
  await rememberStop(digits, at);
  await patchPeople(digits, {
    smsOptIn: false,
    marketingSmsOptIn: false,
    smsStopped: true,
  });
  try {
    await getChannelCampaignStore().suppressPhone(from, at);
  } catch (error) {
    console.error("[SMS] Campaign stop index failed:", error);
  }
}

export function marketingRecipientAllowed(record: {
  phone?: unknown;
  marketingSmsOptIn?: unknown;
  smsOptIn?: unknown;
  smsStopped?: unknown;
  doNotContact?: unknown;
}): boolean {
  return Boolean(record.phone) && explicitMarketingSmsOptIn(record);
}

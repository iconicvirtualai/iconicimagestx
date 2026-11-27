import admin from "firebase-admin";
import { syncClientsIntoContacts, normalizePersonName } from "../../shared/emailMarketing/contacts";
import { getMarketingStore } from "./marketingStore";
import { readHolyGrailAudience } from "./holyGrailAudience";
import { getChannelCampaignStore } from "./channelCampaignStore";
import {
  AUDIENCE_MAX_PAGES,
  AUDIENCE_PAGE_SIZE,
  buildChannelAudience,
  phoneDigits,
  type AudiencePreview,
  type ChannelPerson,
} from "../../shared/channelCampaigns";
import type { ClientSource, MarketingContact, Segment, SuppressionEntry } from "../../shared/emailMarketing/types";
import type { OverlapCampaign } from "../../shared/emailMarketing/audience";

function memoryMarketing(): boolean {
  return process.env.MARKETING_STORE === "memory" || process.env.NODE_ENV === "test" || !admin.apps.length;
}

async function pageDocs(collection: string): Promise<{ rows: FirebaseFirestore.DocumentData[]; truncated: boolean }> {
  const rows: FirebaseFirestore.DocumentData[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (let page = 0; page < AUDIENCE_MAX_PAGES; page += 1) {
    let query = admin.firestore().collection(collection).orderBy(admin.firestore.FieldPath.documentId()).limit(AUDIENCE_PAGE_SIZE) as FirebaseFirestore.Query;
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    rows.push(...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    if (snap.size < AUDIENCE_PAGE_SIZE) return { rows, truncated: false };
    cursor = snap.docs[snap.docs.length - 1];
  }
  return { rows, truncated: true };
}

function asContact(row: FirebaseFirestore.DocumentData): MarketingContact {
  return {
    email: String(row.email || ""),
    firstName: String(row.firstName || ""),
    lastName: String(row.lastName || ""),
    company: String(row.company || ""),
    phone: String(row.phone || ""),
    marketingSmsOptIn: row.marketingSmsOptIn === true,
    smsStopped: row.smsStopped === true,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    custom: row.custom && typeof row.custom === "object" ? row.custom as Record<string, string> : {},
    source: row.source === "client" || row.source === "manual" ? row.source : "import",
    clientId: String(row.clientId || ""),
    emailVerified: row.emailVerified !== false,
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
  };
}

function asClient(row: FirebaseFirestore.DocumentData): ClientSource {
  return {
    id: String(row.id || ""),
    email: String(row.email || ""),
    firstName: String(row.firstName || ""),
    lastName: String(row.lastName || ""),
    phone: String(row.phone || ""),
    company: String(row.company || ""),
  };
}

function optedInPhone(row: { phone?: unknown; id?: unknown; marketingSmsOptIn?: unknown; smsOptIn?: unknown; smsStopped?: unknown; stopped?: unknown }): string {
  if (row.smsStopped === true || row.stopped === true) return "";
  if (row.marketingSmsOptIn !== true && row.smsOptIn !== true) return "";
  return phoneDigits(String(row.phone || row.id || ""));
}

async function explicitOptInPhones(): Promise<Set<string>> {
  if (memoryMarketing() || !admin.apps.length) return new Set();
  const [optIns, clients, contacts] = await Promise.all([
    pageDocs("marketingSmsOptIns"),
    pageDocs("clients"),
    pageDocs("marketingContacts"),
  ]);
  const phones = new Set<string>();
  for (const row of [...optIns.rows, ...clients.rows, ...contacts.rows]) {
    const phone = optedInPhone(row);
    if (phone) phones.add(phone);
  }
  return phones;
}

async function stoppedPhones(): Promise<string[]> {
  if (memoryMarketing() || !admin.apps.length) return [];
  const page = await pageDocs("smsStops");
  return page.rows
    .filter((row) => row.stopped !== false)
    .map((row) => phoneDigits(String(row.phone || row.id || "")))
    .filter(Boolean);
}

async function loadContacts(): Promise<{ contacts: MarketingContact[]; clients: ClientSource[]; suppression: SuppressionEntry[]; truncated: boolean }> {
  const store = getMarketingStore();
  await store.ensureSeed();
  if (memoryMarketing()) {
    const [contacts, clients, suppression] = await Promise.all([
      store.listContacts(),
      store.listClients(),
      store.listSuppression(),
    ]);
    return { contacts, clients, suppression, truncated: false };
  }
  const [contactsPage, clientsPage, suppressionPage] = await Promise.all([
    pageDocs("marketingContacts"),
    pageDocs("clients"),
    pageDocs("marketingSuppression"),
  ]);
  return {
    contacts: contactsPage.rows.map(asContact),
    clients: clientsPage.rows.map(asClient),
    suppression: suppressionPage.rows as SuppressionEntry[],
    truncated: contactsPage.truncated || clientsPage.truncated || suppressionPage.truncated,
  };
}

function fromContact(contact: MarketingContact): ChannelPerson {
  return {
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    company: contact.company,
    tags: contact.tags,
    emailVerified: contact.emailVerified,
    source: contact.source,
    doNotContact: false,
    marketingSmsOptIn: contact.marketingSmsOptIn === true && contact.smsStopped !== true,
  };
}

export async function loadChannelAudience(segmentId = "", excludeCampaignId = ""): Promise<AudiencePreview> {
  const store = getMarketingStore();
  const loaded = await loadContacts();
  const now = new Date().toISOString();
  const merged = syncClientsIntoContacts(loaded.contacts, loaded.clients, now).contacts;
  const sheet = await readHolyGrailAudience();
  const byEmail = new Map<string, ChannelPerson>();
  for (const person of sheet.people) {
    if (!person.email) continue;
    byEmail.set(person.email, person);
  }
  for (const contact of merged) {
    const previous = byEmail.get(contact.email);
    const person = fromContact(contact);
    if (previous) {
      person.doNotContact = previous.doNotContact;
      person.marketingSmsOptIn = person.marketingSmsOptIn || previous.marketingSmsOptIn;
      person.phone = person.phone || previous.phone;
      person.tags = [...new Set([...previous.tags, ...person.tags])];
      if (!person.firstName) person.firstName = previous.firstName;
      if (!person.lastName) person.lastName = previous.lastName;
    }
    byEmail.set(contact.email, person);
  }
  for (const person of sheet.people) {
    if (person.email || !person.phone) continue;
    byEmail.set(`phone:${phoneDigits(person.phone)}`, person);
  }
  const blockedEmails = new Set(sheet.blockedEmails);
  const blockedPhones = new Set(sheet.blockedPhones.map((phone) => phoneDigits(phone) || phone));
  const blockedNames = new Set(sheet.blockedNames);
  for (const person of byEmail.values()) {
    const name = normalizePersonName(`${person.firstName} ${person.lastName}`);
    if (blockedEmails.has(person.email) || blockedPhones.has(phoneDigits(person.phone)) || (name && blockedNames.has(name))) {
      person.doNotContact = true;
    }
  }
  const [segments, settings, sends, campaigns, stops, extraOptIns, extraStops] = await Promise.all([
    store.listSegments(),
    store.getSettings(),
    memoryMarketing() ? store.listSends() : pageDocs("marketingSends").then((page) => page.rows.map((row) => ({
      email: String(row.email || ""),
      campaignId: String(row.campaignId || ""),
      sentAt: String(row.sentAt || ""),
    }))),
    memoryMarketing()
      ? store.listCampaigns()
      : admin.firestore().collection("marketingCampaigns").limit(50).get().then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    getChannelCampaignStore().phoneStops(),
    explicitOptInPhones(),
    stoppedPhones(),
  ]);
  for (const person of byEmail.values()) {
    if (extraOptIns.has(phoneDigits(person.phone))) person.marketingSmsOptIn = true;
  }
  for (const phone of extraOptIns) {
    if ([...byEmail.values()].some((person) => phoneDigits(person.phone) === phone)) continue;
    byEmail.set(`phone:${phone}`, {
      email: "",
      firstName: "",
      lastName: "",
      phone,
      company: "",
      tags: [],
      emailVerified: false,
      source: "manual",
      doNotContact: false,
      marketingSmsOptIn: true,
    });
  }
  const segment = segments.find((item: Segment) => item.id === segmentId) || null;
  const overlap: OverlapCampaign[] = (campaigns as { id?: string; name?: string; status?: string; sentAt?: string; scheduledAt?: string; recipientEmails?: string[] }[]).map((campaign) => ({
    id: String(campaign.id || ""),
    name: String(campaign.name || ""),
    status: String(campaign.status || ""),
    sentAt: String(campaign.sentAt || ""),
    scheduledAt: String(campaign.scheduledAt || ""),
    recipientEmails: Array.isArray(campaign.recipientEmails) ? campaign.recipientEmails.map(String) : [],
  }));
  return buildChannelAudience({
    people: [...byEmail.values()],
    suppression: loaded.suppression,
    phoneStops: [...stops, ...extraStops],
    segment,
    settings,
    sends,
    overlap,
    sendAt: now,
    excludeCampaignId,
    source: sheet.configured && sheet.people.length ? "sheet+contacts" : "contacts",
    sheetConfigured: sheet.configured,
    sheetNote: sheet.note,
    truncated: loaded.truncated || sheet.truncated,
  });
}

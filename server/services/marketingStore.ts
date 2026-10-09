import admin from "firebase-admin";
import { syncClientsIntoContacts } from "../../shared/emailMarketing/contacts";
import { seedSuppression } from "../../shared/emailMarketing/suppression";
import { normalizeSendingAccounts, matchSendingAccount, PHOTOS_SENDING_ACCOUNT } from "../../shared/emailMarketing/sendingAccounts";
import {
  DEFAULT_MARKETING_SETTINGS,
  type ActivityEvent,
  type ClientSource,
  type MarketingContact,
  type MarketingSettings,
  type Segment,
  type SuppressionEntry,
  type MarketingCampaign,
  type MarketingTemplate,
} from "../../shared/emailMarketing/types";
import type { ReportDerived } from "../../shared/emailMarketing/reports";

export interface CachedReport {
  campaignId: string;
  gmassCampaignId: string;
  fetchedAt: string;
  sample: boolean;
  derived: ReportDerived;
  raw: Record<string, unknown>;
}

export interface MarketingStore {
  ensureSeed(): Promise<void>;
  listContacts(): Promise<MarketingContact[]>;
  saveContacts(contacts: MarketingContact[]): Promise<void>;
  deleteContacts(emails: string[]): Promise<void>;
  listSegments(): Promise<Segment[]>;
  saveSegment(segment: Segment): Promise<void>;
  deleteSegment(id: string): Promise<void>;
  listSuppression(): Promise<SuppressionEntry[]>;
  saveSuppression(entry: SuppressionEntry): Promise<void>;
  deleteSuppression(id: string): Promise<void>;
  listEvents(email?: string): Promise<ActivityEvent[]>;
  addEvents(events: ActivityEvent[]): Promise<void>;
  getSettings(): Promise<MarketingSettings>;
  saveSettings(settings: MarketingSettings): Promise<void>;
  listClients(): Promise<ClientSource[]>;
  /** Memory store only. Firestore reads the live clients collection. */
  replaceClients?(clients: ClientSource[]): void;
  listCampaigns(): Promise<MarketingCampaign[]>;
  getCampaign(id: string): Promise<MarketingCampaign | null>;
  saveCampaign(campaign: MarketingCampaign): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  listTemplates(): Promise<MarketingTemplate[]>;
  saveTemplate(template: MarketingTemplate): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  listSends(): Promise<{ email: string; campaignId: string; sentAt: string }[]>;
  addSends(sends: { email: string; campaignId: string; sentAt: string }[]): Promise<void>;
  getReport(campaignId: string): Promise<CachedReport | null>;
  saveReport(report: CachedReport): Promise<void>;
  listReports(): Promise<CachedReport[]>;
}

function settingsFrom(raw: Partial<MarketingSettings> | undefined): MarketingSettings {
  const merged = { ...DEFAULT_MARKETING_SETTINGS, ...(raw || {}) };
  const sendingAccounts = normalizeSendingAccounts(
    raw && Array.isArray(raw.sendingAccounts) ? raw.sendingAccounts : DEFAULT_MARKETING_SETTINGS.sendingAccounts,
  );
  const fromEmail = matchSendingAccount(merged.fromEmail, sendingAccounts) || sendingAccounts[0]?.email || PHOTOS_SENDING_ACCOUNT;
  return { ...merged, sendingAccounts, fromEmail };
}

export function createMemoryMarketingStore(): MarketingStore {
  const contacts = new Map<string, MarketingContact>();
  const segments = new Map<string, Segment>();
  const suppression = new Map<string, SuppressionEntry>();
  const events: ActivityEvent[] = [];
  const campaigns = new Map<string, MarketingCampaign>();
  const templates = new Map<string, MarketingTemplate>();
  const sends: { email: string; campaignId: string; sentAt: string }[] = [];
  const reports = new Map<string, CachedReport>();
  let settings: MarketingSettings = { ...DEFAULT_MARKETING_SETTINGS };
  let clients: ClientSource[] = [];

  return {
    async ensureSeed() {
      if (settings.suppressionSeededAt) return;
      const now = new Date().toISOString();
      for (const item of seedSuppression(now)) suppression.set(item.id, item);
      settings = { ...settings, suppressionSeededAt: now };
    },
    async listContacts() {
      return [...contacts.values()];
    },
    async saveContacts(next) {
      for (const contact of next) contacts.set(contact.email, contact);
    },
    async deleteContacts(emails) {
      for (const email of emails) contacts.delete(email);
    },
    async listSegments() {
      return [...segments.values()];
    },
    async saveSegment(segment) {
      segments.set(segment.id, segment);
    },
    async deleteSegment(id) {
      segments.delete(id);
    },
    async listSuppression() {
      return [...suppression.values()];
    },
    async saveSuppression(entry) {
      suppression.set(entry.id, entry);
    },
    async deleteSuppression(id) {
      suppression.delete(id);
    },
    async listEvents(email) {
      return events.filter((event) => !email || event.email === email);
    },
    async addEvents(next) {
      events.push(...next);
    },
    async getSettings() {
      settings = settingsFrom(settings);
      return settings;
    },
    async saveSettings(next) {
      settings = next;
    },
    async listClients() {
      return clients;
    },
    replaceClients(next) {
      clients = next;
    },
    async listCampaigns() {
      return [...campaigns.values()];
    },
    async getCampaign(id) {
      return campaigns.get(id) || null;
    },
    async saveCampaign(campaign) {
      campaigns.set(campaign.id, campaign);
    },
    async deleteCampaign(id) {
      campaigns.delete(id);
    },
    async listTemplates() {
      return [...templates.values()];
    },
    async saveTemplate(template) {
      templates.set(template.id, template);
    },
    async deleteTemplate(id) {
      templates.delete(id);
    },
    async listSends() {
      return sends;
    },
    async addSends(next) {
      sends.push(...next);
    },
    async getReport(campaignId) {
      return reports.get(campaignId) || null;
    },
    async saveReport(report) {
      reports.set(report.campaignId, report);
    },
    async listReports() {
      return [...reports.values()];
    },
  };
}

const memoryStore = createMemoryMarketingStore();
let testStore: MarketingStore | null = null;

export function resetMarketingStoreForTests(): MarketingStore {
  testStore = createMemoryMarketingStore();
  return testStore;
}

export function getMarketingStore(): MarketingStore {
  if (testStore) return testStore;
  if (process.env.MARKETING_STORE === "memory" || !admin.apps.length) return memoryStore;
  return firestoreStore;
}

function db() {
  return admin.firestore();
}

async function writeAll(collection: string, docs: { id: string; data: object }[]) {
  for (let index = 0; index < docs.length; index += 400) {
    const batch = db().batch();
    for (const doc of docs.slice(index, index + 400)) {
      batch.set(db().collection(collection).doc(doc.id), doc.data);
    }
    await batch.commit();
  }
}

const firestoreStore: MarketingStore = {
  async ensureSeed() {
    const settings = await this.getSettings();
    if (settings.suppressionSeededAt) return;
    const now = new Date().toISOString();
    await writeAll("marketingSuppression", seedSuppression(now).map((item) => ({ id: item.id, data: item })));
    await this.saveSettings({ ...settings, suppressionSeededAt: now });
  },
  async listContacts() {
    const snap = await db().collection("marketingContacts").get();
    return snap.docs.map((doc) => doc.data() as MarketingContact);
  },
  async saveContacts(contacts) {
    await writeAll("marketingContacts", contacts.map((contact) => ({ id: contact.email, data: contact })));
  },
  async deleteContacts(emails) {
    for (let index = 0; index < emails.length; index += 400) {
      const batch = db().batch();
      for (const email of emails.slice(index, index + 400)) {
        batch.delete(db().collection("marketingContacts").doc(email));
      }
      await batch.commit();
    }
  },
  async listSegments() {
    const snap = await db().collection("marketingSegments").get();
    return snap.docs.map((doc) => doc.data() as Segment);
  },
  async saveSegment(segment) {
    await db().collection("marketingSegments").doc(segment.id).set(segment);
  },
  async deleteSegment(id) {
    await db().collection("marketingSegments").doc(id).delete();
  },
  async listSuppression() {
    const snap = await db().collection("marketingSuppression").get();
    return snap.docs.map((doc) => doc.data() as SuppressionEntry);
  },
  async saveSuppression(entry) {
    await db().collection("marketingSuppression").doc(entry.id).set(entry);
  },
  async deleteSuppression(id) {
    await db().collection("marketingSuppression").doc(id).delete();
  },
  async listEvents(email) {
    const query = email
      ? db().collection("marketingEvents").where("email", "==", email)
      : db().collection("marketingEvents");
    const snap = await query.get();
    return snap.docs.map((doc) => doc.data() as ActivityEvent);
  },
  async addEvents(events) {
    await writeAll("marketingEvents", events.map((event) => ({ id: event.id, data: event })));
  },
  async getSettings() {
    const doc = await db().collection("marketingSettings").doc("default").get();
    return settingsFrom(doc.exists ? doc.data() as Partial<MarketingSettings> : undefined);
  },
  async saveSettings(settings) {
    await db().collection("marketingSettings").doc("default").set(settings);
  },
  async listClients() {
    const snap = await db().collection("clients").get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: String(data.email || ""),
        firstName: String(data.firstName || ""),
        lastName: String(data.lastName || ""),
        phone: String(data.phone || ""),
        company: String(data.company || ""),
      };
    });
  },
  async listCampaigns() {
    const snap = await db().collection("marketingCampaigns").get();
    return snap.docs.map((doc) => doc.data() as MarketingCampaign);
  },
  async getCampaign(id) {
    const doc = await db().collection("marketingCampaigns").doc(id).get();
    return doc.exists ? doc.data() as MarketingCampaign : null;
  },
  async saveCampaign(campaign) {
    await db().collection("marketingCampaigns").doc(campaign.id).set(campaign);
  },
  async deleteCampaign(id) {
    await db().collection("marketingCampaigns").doc(id).delete();
  },
  async listTemplates() {
    const snap = await db().collection("marketingTemplates").get();
    return snap.docs.map((doc) => doc.data() as MarketingTemplate);
  },
  async saveTemplate(template) {
    await db().collection("marketingTemplates").doc(template.id).set(template);
  },
  async deleteTemplate(id) {
    await db().collection("marketingTemplates").doc(id).delete();
  },
  async listSends() {
    const snap = await db().collection("marketingSends").get();
    return snap.docs.map((doc) => doc.data() as { email: string; campaignId: string; sentAt: string });
  },
  async addSends(sends) {
    await writeAll("marketingSends", sends.map((send) => ({
      id: `${send.campaignId}_${send.email}`.replace(/[^\w@.-]+/g, "_"),
      data: send,
    })));
  },
  async getReport(campaignId) {
    const doc = await db().collection("marketingReports").doc(campaignId).get();
    return doc.exists ? doc.data() as CachedReport : null;
  },
  async saveReport(report) {
    await db().collection("marketingReports").doc(report.campaignId).set(report);
  },
  async listReports() {
    const snap = await db().collection("marketingReports").get();
    return snap.docs.map((doc) => doc.data() as CachedReport);
  },
};

export async function syncCustomerContacts(store: MarketingStore = getMarketingStore()) {
  const now = new Date().toISOString();
  const [contacts, clients] = await Promise.all([store.listContacts(), store.listClients()]);
  const result = syncClientsIntoContacts(contacts, clients, now);
  const nextEmails = new Set(result.contacts.map((contact) => contact.email));
  const removed = contacts.map((contact) => contact.email).filter((email) => !nextEmails.has(email));
  await store.saveContacts(result.contacts);
  if (removed.length) await store.deleteContacts(removed);
  return {
    created: result.created,
    relinked: result.relinked,
    refreshed: result.refreshed,
    total: result.contacts.length,
  };
}

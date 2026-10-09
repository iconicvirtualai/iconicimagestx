import { Router } from "express";
import crypto from "crypto";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { hasMarketingPermission, type MarketingPermission } from "../../shared/emailMarketing/permissions";
import { applyTagChange, contactMatchesFilter, contactName, isValidEmail, normalizeEmail } from "../../shared/emailMarketing/contacts";
import { buildImportPlan, mapTable, suggestMapping, type ColumnMapping } from "../../shared/emailMarketing/importContacts";
import { buildSuppression, matchSuppression, reasonLabel } from "../../shared/emailMarketing/suppression";
import { getMarketingStore, syncCustomerContacts } from "../services/marketingStore";
import { parseTabularUpload } from "../services/spreadsheetParse";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import type { MarketingContact, Segment, SegmentFilter, SuppressionEntry } from "../../shared/emailMarketing/types";
import { EMPTY_SEGMENT_FILTER } from "../../shared/emailMarketing/types";

const router = Router();
const MAX_ROWS = 10000;
const unsubscribeLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

function requireMarketing(permission: MarketingPermission) {
  return async (req: AuthenticatedRequest, res: Parameters<typeof requireStaff>[1], next: Parameters<typeof requireStaff>[2]) => {
    await requireStaff(req, res, () => {
      if (!hasMarketingPermission(req.staffRole, permission)) {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      next();
    });
  };
}

function asFilter(value: unknown): SegmentFilter {
  const raw = value && typeof value === "object" ? value as Partial<SegmentFilter> : {};
  return {
    query: String(raw.query || ""),
    tagsAll: Array.isArray(raw.tagsAll) ? raw.tagsAll.map(String) : [],
    tagsAny: Array.isArray(raw.tagsAny) ? raw.tagsAny.map(String) : [],
    tagsNone: Array.isArray(raw.tagsNone) ? raw.tagsNone.map(String) : [],
    source: raw.source === "client" || raw.source === "import" || raw.source === "manual" ? raw.source : "",
    verified: raw.verified === "yes" || raw.verified === "no" ? raw.verified : "",
    fields: Array.isArray(raw.fields)
      ? raw.fields.filter((field) => field && typeof field === "object").map((field) => ({
        key: String((field as { key?: unknown }).key || ""),
        value: String((field as { value?: unknown }).value || ""),
      }))
      : [],
  };
}

function publicContact(contact: MarketingContact, suppression: SuppressionEntry[]) {
  const blocked = matchSuppression(contact, suppression);
  return {
    ...contact,
    name: contactName(contact),
    suppressed: blocked ? reasonLabel(blocked.reason, blocked.hold) : "",
  };
}

router.get("/overview", requireMarketing("view"), async (_req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression, segments] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listSegments(),
  ]);
  res.json({
    contacts: contacts.length,
    customers: contacts.filter((contact) => contact.clientId).length,
    unverified: contacts.filter((contact) => !contact.emailVerified).length,
    suppressed: suppression.length,
    segments: segments.length,
  });
});

router.get("/contacts", requireMarketing("view"), async (req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression] = await Promise.all([store.listContacts(), store.listSuppression()]);
  const query = String(req.query.q || "").trim().toLowerCase();
  const tag = String(req.query.tag || "").trim().toLowerCase();
  const source = String(req.query.source || "");
  const filtered = contacts
    .filter((contact) => {
      if (tag && !contact.tags.some((item) => item.toLowerCase() === tag)) return false;
      if (source && contact.source !== source) return false;
      if (!query) return true;
      return `${contact.email} ${contact.firstName} ${contact.lastName} ${contact.company} ${contact.tags.join(" ")}`.toLowerCase().includes(query);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((contact) => publicContact(contact, suppression));
  const tags = [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) => a.localeCompare(b));
  res.json({ contacts: filtered, tags, total: contacts.length });
});

router.get("/contacts/detail", requireMarketing("view"), async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required." });
  const store = getMarketingStore();
  await store.ensureSeed();
  const [contacts, suppression, events] = await Promise.all([
    store.listContacts(),
    store.listSuppression(),
    store.listEvents(email),
  ]);
  const contact = contacts.find((item) => item.email === email);
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  res.json({
    contact: publicContact(contact, suppression),
    activity: events.sort((a, b) => b.at.localeCompare(a.at)),
  });
});

router.post("/contacts", requireMarketing("manage"), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required." });
  const store = getMarketingStore();
  const contacts = await store.listContacts();
  const now = new Date().toISOString();
  const existing = contacts.find((contact) => contact.email === email);
  const contact: MarketingContact = {
    email,
    firstName: String(req.body?.firstName || existing?.firstName || "").trim(),
    lastName: String(req.body?.lastName || existing?.lastName || "").trim(),
    company: String(req.body?.company || existing?.company || "").trim(),
    phone: String(req.body?.phone || existing?.phone || "").trim(),
    tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : existing?.tags || [],
    custom: existing?.custom || {},
    source: existing?.source || "manual",
    clientId: existing?.clientId || "",
    emailVerified: existing?.emailVerified ?? req.body?.emailVerified === true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (req.body?.emailVerified === true) contact.emailVerified = true;
  await store.saveContacts([contact]);
  res.json({ contact });
});

router.post("/contacts/tags", requireMarketing("manage"), async (req, res) => {
  const emails = Array.isArray(req.body?.emails) ? req.body.emails.map((email: unknown) => normalizeEmail(email)) : [];
  const add = Array.isArray(req.body?.add) ? req.body.add.map(String) : [];
  const remove = Array.isArray(req.body?.remove) ? req.body.remove.map(String) : [];
  if (!emails.length) return res.status(400).json({ error: "Choose at least one contact." });
  const store = getMarketingStore();
  const contacts = await store.listContacts();
  const now = new Date().toISOString();
  const wanted = new Set(emails);
  const next = contacts.filter((contact) => wanted.has(contact.email)).map((contact) => applyTagChange(contact, add, remove, now));
  await store.saveContacts(next);
  res.json({ updated: next.length });
});

router.post("/contacts/sync", requireMarketing("manage"), async (_req, res) => {
  const result = await syncCustomerContacts();
  res.json(result);
});

router.post("/imports/parse", requireMarketing("manage"), async (req, res) => {
  try {
    const table = parseTabularUpload({
      text: typeof req.body?.text === "string" ? req.body.text : "",
      base64: typeof req.body?.base64 === "string" ? req.body.base64 : "",
      filename: typeof req.body?.filename === "string" ? req.body.filename : "",
    });
    if (table.rows.length > MAX_ROWS) {
      return res.status(400).json({ error: `Imports are limited to ${MAX_ROWS} rows.` });
    }
    res.json({
      headers: table.headers,
      rows: table.rows,
      rowCount: table.rows.length,
      suggested: suggestMapping(table.headers),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not read that file." });
  }
});

router.post("/imports/commit", requireMarketing("manage"), async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers.map(String) : [];
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.map((row: unknown) => Array.isArray(row) ? row.map(String) : []) : [];
  const mapping = (req.body?.mapping && typeof req.body.mapping === "object" ? req.body.mapping : {}) as ColumnMapping;
  if (!headers.length) return res.status(400).json({ error: "Map at least an email column." });
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Imports are limited to ${MAX_ROWS} rows.` });
  if (!Object.values(mapping).includes("email")) return res.status(400).json({ error: "Choose which column contains the email address." });
  const store = getMarketingStore();
  const existing = await store.listContacts();
  const plan = buildImportPlan({
    rows: mapTable({ headers, rows }, mapping),
    existing,
    now: new Date().toISOString(),
    extraTags: Array.isArray(req.body?.extraTags) ? req.body.extraTags.map(String) : [],
  });
  await store.saveContacts(plan.upserts);
  res.json({ summary: plan.summary });
});

router.get("/segments", requireMarketing("view"), async (_req, res) => {
  const store = getMarketingStore();
  const [segments, contacts] = await Promise.all([store.listSegments(), store.listContacts()]);
  res.json({
    segments: segments
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((segment) => ({
        ...segment,
        count: contacts.filter((contact) => contactMatchesFilter(contact, segment.filter)).length,
      })),
  });
});

router.post("/segments", requireMarketing("manage"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name the segment." });
  const store = getMarketingStore();
  const now = new Date().toISOString();
  const id = String(req.body?.id || crypto.randomUUID());
  const existing = (await store.listSegments()).find((segment) => segment.id === id);
  const segment: Segment = {
    id,
    name,
    filter: { ...EMPTY_SEGMENT_FILTER, ...asFilter(req.body?.filter) },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await store.saveSegment(segment);
  res.json({ segment });
});

router.delete("/segments/:id", requireMarketing("manage"), async (req, res) => {
  await getMarketingStore().deleteSegment(req.params.id);
  res.json({ ok: true });
});

router.get("/suppression", requireMarketing("view"), async (_req, res) => {
  const store = getMarketingStore();
  await store.ensureSeed();
  const entries = await store.listSuppression();
  res.json({
    entries: entries.sort((a, b) => a.value.localeCompare(b.value)),
  });
});

router.post("/suppression", requireMarketing("manage"), async (req, res) => {
  const now = new Date().toISOString();
  const entry = buildSuppression(now, {
    kind: req.body?.kind === "domain" || req.body?.kind === "name" ? req.body.kind : "email",
    value: String(req.body?.value || ""),
    reason: ["bounced", "blocked", "unsubscribed", "complained", "manual"].includes(req.body?.reason) ? req.body.reason : "manual",
    hold: req.body?.hold === "personal" ? "personal" : "",
    note: String(req.body?.note || "").trim(),
    email: String(req.body?.email || ""),
    names: Array.isArray(req.body?.names) ? req.body.names.map(String) : undefined,
    source: "manual",
  });
  if (!entry) return res.status(400).json({ error: "That suppression entry is not valid." });
  const store = getMarketingStore();
  await store.ensureSeed();
  const existing = (await store.listSuppression()).find((item) => item.id === entry.id);
  await store.saveSuppression({ ...entry, createdAt: existing?.createdAt || now, source: existing?.source || "manual" });
  res.json({ entry });
});

router.delete("/suppression/:id", requireMarketing("manage"), async (req, res) => {
  await getMarketingStore().deleteSuppression(decodeURIComponent(req.params.id));
  res.json({ ok: true });
});

router.post("/unsubscribe", async (req, res) => {
  const limit = unsubscribeLimit.check(clientIp(req));
  if (!limit.allowed) return res.status(429).json({ error: "Too many attempts. Try again later." });
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter the email address you want removed." });
  const token = String(req.body?.token || "");
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET || "";
  if (token) {
    if (!secret || !unsubscribeTokenMatches(email, token, secret)) {
      return res.status(400).json({ error: "This unsubscribe link is not valid. Enter your email on the form instead." });
    }
  }
  const store = getMarketingStore();
  await store.ensureSeed();
  const now = new Date().toISOString();
  const entry = buildSuppression(now, {
    kind: "email",
    value: email,
    reason: "unsubscribed",
    note: "Unsubscribed from the public page.",
    source: "unsubscribe",
  });
  if (!entry) return res.status(400).json({ error: "Enter the email address you want removed." });
  await store.saveSuppression(entry);
  const contacts = await store.listContacts();
  const contact = contacts.find((item) => item.email === email);
  if (contact) {
    await store.addEvents([{
      id: crypto.randomUUID(),
      email,
      campaignId: "",
      campaignName: "",
      type: "unsubscribe",
      at: now,
      detail: "Unsubscribed from marketing email",
    }]);
  }
  res.json({ ok: true, message: `${email} will not receive Iconic marketing email.` });
});

export function signUnsubscribeEmail(email: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}

function unsubscribeTokenMatches(email: string, token: string, secret: string): boolean {
  const expected = signUnsubscribeEmail(email, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default router;

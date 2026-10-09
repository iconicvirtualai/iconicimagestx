import type { ClientSource, ContactSource, MarketingContact, SegmentFilter } from "./types";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function normalizePersonName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contactName(contact: Pick<MarketingContact, "firstName" | "lastName" | "email">): string {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  return name || contact.email;
}

export function normalizeTag(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

export function uniqueTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = normalizeTag(tag);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function splitTags(value: unknown): string[] {
  return uniqueTags(String(value || "").split(/[,;|]/));
}

export function applyTagChange(contact: MarketingContact, add: string[], remove: string[], now: string): MarketingContact {
  const removeKeys = new Set(remove.map((tag) => normalizeTag(tag).toLowerCase()).filter(Boolean));
  const next = contact.tags.filter((tag) => !removeKeys.has(tag.toLowerCase()));
  return { ...contact, tags: uniqueTags([...next, ...add]), updatedAt: now };
}

export function contactMatchesFilter(contact: MarketingContact, filter: SegmentFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query) {
    const haystack = [
      contact.email,
      contact.firstName,
      contact.lastName,
      contact.company,
      contact.phone,
      contact.tags.join(" "),
      ...Object.values(contact.custom),
    ].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  const have = new Set(contact.tags.map((tag) => tag.toLowerCase()));
  if (filter.tagsAll.some((tag) => !have.has(tag.toLowerCase()))) return false;
  if (filter.tagsAny.length && !filter.tagsAny.some((tag) => have.has(tag.toLowerCase()))) return false;
  if (filter.tagsNone.some((tag) => have.has(tag.toLowerCase()))) return false;
  if (filter.source && contact.source !== filter.source) return false;
  if (filter.verified === "yes" && !contact.emailVerified) return false;
  if (filter.verified === "no" && contact.emailVerified) return false;
  for (const field of filter.fields) {
    const key = field.key.trim().toLowerCase();
    if (!key) continue;
    const actual = Object.entries(contact.custom).find(([name]) => name.toLowerCase() === key)?.[1] || "";
    if (actual.trim().toLowerCase() !== field.value.trim().toLowerCase()) return false;
  }
  return true;
}

export function blankContact(email: string, source: ContactSource, now: string): MarketingContact {
  return {
    email: normalizeEmail(email),
    firstName: "",
    lastName: "",
    company: "",
    phone: "",
    tags: [],
    custom: {},
    source,
    clientId: "",
    emailVerified: source === "client",
    createdAt: now,
    updatedAt: now,
  };
}

function prefer(current: string, incoming: string): string {
  return incoming.trim() || current;
}

/** Customers overlay the linked contact so the CRM copy cannot drift from clients/{id}. */
export function syncClientsIntoContacts(
  contacts: MarketingContact[],
  clients: ClientSource[],
  now: string,
): { contacts: MarketingContact[]; created: number; relinked: number; refreshed: number } {
  const byEmail = new Map(contacts.map((contact) => [contact.email, { ...contact, tags: [...contact.tags], custom: { ...contact.custom } }]));
  let created = 0;
  let relinked = 0;
  let refreshed = 0;

  for (const client of clients) {
    const email = normalizeEmail(client.email);
    if (!isValidEmail(email)) continue;
    const previous = [...byEmail.values()].find((contact) => contact.clientId === client.id);
    let target = byEmail.get(email);

    if (previous && previous.email !== email) {
      relinked += 1;
      if (!target) {
        target = { ...previous, email, updatedAt: now };
        byEmail.set(email, target);
      } else {
        target = {
          ...target,
          tags: uniqueTags([...target.tags, ...previous.tags]),
          custom: { ...previous.custom, ...target.custom },
          updatedAt: now,
        };
        byEmail.set(email, target);
      }
      if (previous.email !== email) byEmail.delete(previous.email);
    }

    if (!target) {
      target = blankContact(email, "client", now);
      created += 1;
      byEmail.set(email, target);
    } else {
      refreshed += 1;
    }

    target.clientId = client.id;
    target.firstName = prefer(target.firstName, client.firstName);
    target.lastName = prefer(target.lastName, client.lastName);
    target.phone = prefer(target.phone, client.phone);
    target.company = prefer(target.company, client.company);
    target.emailVerified = true;
    target.updatedAt = now;
    if (!target.source) target.source = "client";
  }

  return {
    contacts: [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)),
    created,
    relinked,
    refreshed,
  };
}

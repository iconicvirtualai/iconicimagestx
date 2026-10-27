/**
 * Client hub settings: profile, team, CRM, and billing.
 * The same shapes are what an admin Customer Teams tab can read later.
 * Raw card numbers are never part of this model.
 */

import { clientNotifyLive } from "./clientNotify.ts";

export const HUB_SOCIAL_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
  { id: "threads", label: "Threads" },
  { id: "snapchat", label: "Snapchat" },
  { id: "googleBusiness", label: "Google Business" },
  { id: "zillow", label: "Zillow" },
  { id: "realtor", label: "Realtor.com" },
] as const;

export type HubSocialId = (typeof HUB_SOCIAL_PLATFORMS)[number]["id"];

export const TEAM_PERMISSIONS = ["view", "order", "download", "billing", "admin"] as const;
export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export const CONTACT_STATUSES = ["lead", "active", "past", "do_not_contact"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type HubSection = "profile" | "team" | "clients" | "billing" | "orders";
export type HubAction = "read" | "write";

export interface HubSocialLink {
  label: string;
  url: string;
}

export interface HubCustomSocial {
  id: string;
  label: string;
  url: string;
}

export interface ClientHubProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  headshotUrl: string;
  companyLogoUrl: string;
  brokerage: string;
  brokerageLogoUrl: string;
  website: string;
  socials: Record<HubSocialId, string>;
  customSocials: HubCustomSocial[];
}

export interface HubAgentBranding {
  name: string;
  brokerage: string;
  license: string;
  phone: string;
  email: string;
  headshotUrl: string;
  companyLogoUrl: string;
  brokerageLogoUrl: string;
  website: string;
  socials: HubSocialLink[];
}

export interface TeamMemberRecord {
  id: string;
  teamId: string;
  ownerClientId: string;
  name: string;
  email: string;
  phone: string;
  permissions: TeamPermission[];
  logoUrl: string;
  status: "invited" | "active";
  linkedClientId: string;
  inviteEmail: "paused" | "sent" | "not_sent";
}

export interface CustomerTeamRecord {
  id: string;
  ownerClientId: string;
  name: string;
  logoUrl: string;
  memberUids: string[];
  adminUids: string[];
  billingUids: string[];
  orderUids: string[];
  viewUids: string[];
  downloadUids: string[];
}

export interface AgentContactRecord {
  id: string;
  ownerClientId: string;
  teamId: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
  notes: string;
  lastContact: string;
  status: ContactStatus;
  source: "manual" | "share" | "import";
  shareRef: string;
}

export interface CardOnFile {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  squareCardId: string;
  squareCustomerId: string;
}

export interface CreditEntry {
  id: string;
  at: string;
  label: string;
  cents: number;
  kind: "credit" | "debit";
}

export interface BillingProfile {
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  card: CardOnFile | null;
  balanceCents: number;
  creditsCents: number;
  credits: CreditEntry[];
}

export interface HubGrant {
  ownerClientId: string;
  teamId: string;
  memberUids: string[];
  adminUids: string[];
  billingUids: string[];
  orderUids: string[];
  viewUids: string[];
  downloadUids: string[];
}

const SOCIAL_IDS = new Set<string>(HUB_SOCIAL_PLATFORMS.map((item) => item.id));
const PERMISSION_SET = new Set<string>(TEAM_PERMISSIONS);
const STATUS_SET = new Set<string>(CONTACT_STATUSES);

export function emptySocials(): Record<HubSocialId, string> {
  return {
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    x: "",
    linkedin: "",
    pinterest: "",
    threads: "",
    snapchat: "",
    googleBusiness: "",
    zillow: "",
    realtor: "",
  };
}

export function emptyProfile(): ClientHubProfile {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    headshotUrl: "",
    companyLogoUrl: "",
    brokerage: "",
    brokerageLogoUrl: "",
    website: "",
    socials: emptySocials(),
    customSocials: [],
  };
}

function text(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hubEmail(value: unknown): string {
  const email = text(value, 160).toLowerCase();
  if (!email || !email.includes("@") || email.includes(" ")) return "";
  return email;
}

export function hubPhone(value: unknown): string {
  return text(value, 40).replace(/[^\d+().\-\s]/g, "");
}

/** https URLs, or a same-site media path. Anything else is dropped. */
export function hubHttpUrl(value: unknown, max = 400): string {
  const raw = text(value, max);
  if (!raw) return "";
  if (raw.startsWith("/media/") && !raw.includes("..") && !raw.includes("\\")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function hubImageUrl(value: unknown): string {
  const raw = text(value, 500);
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return "";
  return hubHttpUrl(raw, 500);
}

export function profileFromClient(data: Record<string, unknown> | null | undefined): ClientHubProfile {
  const source = record(data);
  const stored = record(source.hubProfile);
  const socialSource = record(stored.socials);
  const socials = emptySocials();
  for (const platform of HUB_SOCIAL_PLATFORMS) {
    socials[platform.id] = hubHttpUrl(socialSource[platform.id]);
  }
  const customSocials = Array.isArray(stored.customSocials)
    ? stored.customSocials.slice(0, 12).map((entry, index) => {
      const row = record(entry);
      return {
        id: text(row.id, 40) || `custom-${index + 1}`,
        label: text(row.label, 40),
        url: hubHttpUrl(row.url),
      };
    }).filter((entry) => entry.label && entry.url)
    : [];
  const firstName = text(stored.firstName, 80) || text(source.firstName, 80);
  const lastName = text(stored.lastName, 80) || text(source.lastName, 80);
  return {
    firstName,
    lastName,
    phone: hubPhone(stored.phone || source.phone),
    email: hubEmail(stored.email || source.email),
    headshotUrl: hubImageUrl(stored.headshotUrl),
    companyLogoUrl: hubImageUrl(stored.companyLogoUrl),
    brokerage: text(stored.brokerage, 160) || text(source.company, 160),
    brokerageLogoUrl: hubImageUrl(stored.brokerageLogoUrl),
    website: hubHttpUrl(stored.website),
    socials,
    customSocials,
  };
}

export function sanitizeProfilePatch(input: unknown, currentEmail = ""): ClientHubProfile {
  const profile = profileFromClient({ hubProfile: record(input) });
  if (!profile.email) profile.email = hubEmail(currentEmail);
  return profile;
}

export function socialLinks(profile: ClientHubProfile): HubSocialLink[] {
  const named = HUB_SOCIAL_PLATFORMS
    .map((platform) => ({ label: platform.label, url: profile.socials[platform.id] }))
    .filter((item) => item.url);
  const custom = profile.customSocials
    .filter((item) => item.label && item.url)
    .map((item) => ({ label: item.label, url: item.url }));
  return [...named, ...custom];
}

export function profileDisplayName(profile: Pick<ClientHubProfile, "firstName" | "lastName">): string {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
}

/**
 * Listing-specific name, phone, email, and license stay when they are already set.
 * Empty brand fields fill from the client profile so flyers and listing sites
 * show the same headshot, logos, brokerage, website, and social links.
 */
export function applyProfileToAgent(
  agent: Partial<HubAgentBranding> | null | undefined,
  profile: ClientHubProfile | null | undefined,
): HubAgentBranding {
  const current = agent || {};
  const name = profile ? profileDisplayName(profile) : "";
  const links = profile ? socialLinks(profile) : [];
  return {
    name: text(current.name, 160) || name,
    brokerage: text(current.brokerage, 160) || profile?.brokerage || "",
    license: text(current.license, 40),
    phone: text(current.phone, 40) || profile?.phone || "",
    email: hubEmail(current.email) || profile?.email || "",
    headshotUrl: hubImageUrl(current.headshotUrl) || profile?.headshotUrl || "",
    companyLogoUrl: hubImageUrl(current.companyLogoUrl) || profile?.companyLogoUrl || "",
    brokerageLogoUrl: hubImageUrl(current.brokerageLogoUrl) || profile?.brokerageLogoUrl || "",
    website: hubHttpUrl(current.website) || profile?.website || "",
    socials: Array.isArray(current.socials) && current.socials.length
      ? current.socials.map((item) => ({ label: text(item.label, 40), url: hubHttpUrl(item.url) })).filter((item) => item.label && item.url)
      : links,
  };
}

export function marketingMaterialFromProfile(profile: ClientHubProfile | null | undefined): HubAgentBranding | null {
  if (!profile) return null;
  const agent = applyProfileToAgent(null, profile);
  const hasBrand = agent.name || agent.phone || agent.email || agent.brokerage || agent.headshotUrl || agent.website || agent.socials.length;
  return hasBrand ? agent : null;
}

export function normalizePermissions(value: unknown): TeamPermission[] {
  const list = Array.isArray(value) ? value : [];
  const picked = [...new Set(list.map((item) => text(item, 20)).filter((item) => PERMISSION_SET.has(item)))] as TeamPermission[];
  if (picked.includes("admin")) return [...TEAM_PERMISSIONS];
  if (picked.length === 0) return ["view"];
  if (!picked.includes("view")) picked.unshift("view");
  return picked;
}

export function grantFromMembers(ownerClientId: string, teamId: string, members: TeamMemberRecord[]): HubGrant {
  const grant: HubGrant = {
    ownerClientId,
    teamId,
    memberUids: [],
    adminUids: [],
    billingUids: [],
    orderUids: [],
    viewUids: [],
    downloadUids: [],
  };
  for (const member of members) {
    const uid = member.linkedClientId;
    if (!uid || uid === ownerClientId) continue;
    grant.memberUids.push(uid);
    if (member.permissions.includes("view")) grant.viewUids.push(uid);
    if (member.permissions.includes("order")) grant.orderUids.push(uid);
    if (member.permissions.includes("download")) grant.downloadUids.push(uid);
    if (member.permissions.includes("billing")) grant.billingUids.push(uid);
    if (member.permissions.includes("admin")) grant.adminUids.push(uid);
  }
  return grant;
}

export function hubAllows(input: {
  uid: string;
  action: HubAction;
  section: HubSection;
  ownerClientId: string;
  grant?: HubGrant | null;
}): boolean {
  const uid = text(input.uid, 128);
  const ownerClientId = text(input.ownerClientId, 128);
  if (!uid || !ownerClientId) return false;
  if (uid === ownerClientId) return true;
  const grant = input.grant;
  if (!grant || grant.ownerClientId !== ownerClientId) return false;
  if (!grant.memberUids.includes(uid)) return false;
  if (grant.adminUids.includes(uid)) return true;
  if (input.section === "profile") return false;
  if (input.section === "team") return input.action === "read" && grant.viewUids.includes(uid);
  if (input.section === "clients") {
    if (input.action === "read") return grant.viewUids.includes(uid);
    return false;
  }
  if (input.section === "billing" || input.section === "orders") return grant.billingUids.includes(uid);
  return false;
}

export function canPlaceOrder(uid: string, ownerClientId: string, grant?: HubGrant | null): boolean {
  if (!uid) return false;
  if (uid === ownerClientId) return true;
  if (!grant || grant.ownerClientId !== ownerClientId) return false;
  return grant.orderUids.includes(uid) || grant.adminUids.includes(uid);
}

/** Download does not open billing, CRM edits, or another team's records. */
export function downloadDoesNotGrant(section: HubSection): boolean {
  return section === "billing" || section === "orders" || section === "clients" || section === "profile";
}

export function contactStatus(value: unknown): ContactStatus {
  const status = text(value, 40);
  return STATUS_SET.has(status) ? status as ContactStatus : "lead";
}

export function sanitizeContact(input: unknown, ownerClientId: string, teamId = ""): Omit<AgentContactRecord, "id"> {
  const row = record(input);
  const tags = Array.isArray(row.tags)
    ? row.tags.map((tag) => text(tag, 40)).filter(Boolean).slice(0, 12)
    : text(row.tags, 200).split(/[|,]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  return {
    ownerClientId,
    teamId,
    name: text(row.name, 120),
    email: hubEmail(row.email),
    phone: hubPhone(row.phone),
    tags,
    notes: text(row.notes, 2000),
    lastContact: /^\d{4}-\d{2}-\d{2}$/.test(text(row.lastContact, 10)) ? text(row.lastContact, 10) : "",
    status: contactStatus(row.status),
    source: row.source === "share" || row.source === "import" ? row.source : "manual",
    shareRef: text(row.shareRef, 160),
  };
}

export function shareContactsFromListing(listing: Record<string, unknown>, ownerClientId: string): Array<Omit<AgentContactRecord, "id">> {
  const listingId = text(listing.id, 128) || "listing";
  const rows: Array<Omit<AgentContactRecord, "id">> = [];
  const inquiries = Array.isArray(listing.listingSiteInquiries) ? listing.listingSiteInquiries : [];
  inquiries.forEach((entry, index) => {
    const row = record(entry);
    const name = text(row.name, 120);
    const contact = text(row.contact, 160);
    if (!name && !contact) return;
    const email = hubEmail(contact);
    rows.push({
      ownerClientId,
      teamId: "",
      name: name || contact,
      email,
      phone: email ? "" : hubPhone(contact),
      tags: ["shared"],
      notes: text(row.when, 80) ? `Showing request: ${text(row.when, 80)}` : "Shared from the listing site.",
      lastContact: text(row.at, 10).slice(0, 10),
      status: "lead",
      source: "share",
      shareRef: `${listingId}:${index}`,
    });
  });
  const shares = Array.isArray(listing.shares) ? listing.shares : [];
  shares.forEach((entry, index) => {
    const row = record(entry);
    const name = text(row.name, 120);
    const email = hubEmail(row.email);
    if (!name && !email) return;
    rows.push({
      ownerClientId,
      teamId: "",
      name: name || email,
      email,
      phone: hubPhone(row.phone),
      tags: ["shared"],
      notes: "Shared listing or gallery.",
      lastContact: "",
      status: "lead",
      source: "share",
      shareRef: `${listingId}:share:${index}`,
    });
  });
  return rows;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function contactsToCsv(contacts: Array<Pick<AgentContactRecord, "name" | "email" | "phone" | "tags" | "notes" | "lastContact" | "status">>): string {
  const lines = ["name,email,phone,tags,notes,lastContact,status"];
  for (const contact of contacts) {
    lines.push([
      contact.name,
      contact.email,
      contact.phone,
      contact.tags.join("|"),
      contact.notes,
      contact.lastContact,
      contact.status,
    ].map((value) => csvCell(value)).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseContactsCsv(csv: string): { contacts: Array<Omit<AgentContactRecord, "id" | "ownerClientId" | "teamId">>; errors: string[] } {
  const rows = parseCsvRows(csv).slice(0, 201);
  if (rows.length === 0) return { contacts: [], errors: ["The file is empty."] };
  const header = rows[0].map((cell) => cell.toLowerCase());
  const nameIndex = header.indexOf("name");
  if (nameIndex < 0) return { contacts: [], errors: ["The file needs a name column."] };
  const index = (key: string) => header.indexOf(key);
  const contacts: Array<Omit<AgentContactRecord, "id" | "ownerClientId" | "teamId">> = [];
  const errors: string[] = [];
  if (rows.length > 201) errors.push("Only the first 200 contacts were read.");
  rows.slice(1, 201).forEach((cells, offset) => {
    const draft = sanitizeContact({
      name: cells[nameIndex] || "",
      email: index("email") >= 0 ? cells[index("email")] : "",
      phone: index("phone") >= 0 ? cells[index("phone")] : "",
      tags: index("tags") >= 0 ? cells[index("tags")] : "",
      notes: index("notes") >= 0 ? cells[index("notes")] : "",
      lastContact: index("lastcontact") >= 0 ? cells[index("lastcontact")] : "",
      status: index("status") >= 0 ? cells[index("status")] : "lead",
      source: "import",
    }, "");
    if (!draft.name) {
      errors.push(`Row ${offset + 2} is missing a name.`);
      return;
    }
    contacts.push(draft);
  });
  return { contacts, errors };
}

const RAW_CARD_KEYS = ["cardnumber", "card_number", "pan", "cvv", "cvc", "securitycode"];

export function containsRawCard(value: unknown): boolean {
  const row = record(value);
  for (const key of Object.keys(row)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (RAW_CARD_KEYS.includes(normalized)) return true;
    if (row[key] && typeof row[key] === "object") {
      if (containsRawCard(row[key])) return true;
    }
  }
  return false;
}

export function sanitizeBilling(input: unknown): Omit<BillingProfile, "card" | "balanceCents" | "creditsCents" | "credits"> {
  const row = record(input);
  const address = record(row.address);
  return {
    email: hubEmail(row.email || row.billingEmail),
    phone: hubPhone(row.phone || row.billingPhone),
    line1: text(row.line1 || address.line1, 120),
    line2: text(row.line2 || address.line2, 120),
    city: text(row.city || address.city, 80),
    state: text(row.state || address.state, 40),
    postalCode: text(row.postalCode || address.postalCode || address.zip, 20),
  };
}

export function billingAddressLine(billing: Pick<BillingProfile, "line1" | "line2" | "city" | "state" | "postalCode">): string {
  const locality = [billing.city, [billing.state, billing.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [billing.line1, billing.line2, locality].filter(Boolean).join(", ");
}

export function cardLabel(card: Pick<CardOnFile, "brand" | "last4"> | null | undefined): string {
  if (!card || !/^\d{4}$/.test(card.last4)) return "";
  const brand = text(card.brand, 20) || "Card";
  return `${brand} •••• ${card.last4}`;
}

export function portalBillingStamp(source: unknown): { billingEmail?: string; billingPhone?: string; billToAddress?: string } {
  const row = record(source);
  const billing = sanitizeBilling(row.billing && typeof row.billing === "object" ? row.billing : row);
  const email = hubEmail(row.billingEmail) || billing.email;
  const phone = hubPhone(row.billingPhone) || billing.phone;
  const address = text(row.billToAddress, 240) || billingAddressLine(billing);
  const stamp: { billingEmail?: string; billingPhone?: string; billToAddress?: string } = {};
  if (email) stamp.billingEmail = email;
  if (phone) stamp.billingPhone = phone;
  if (address) stamp.billToAddress = address;
  return stamp;
}

export function squareBuyerPrefill(invoice: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const email = hubEmail(invoice.billingEmail) || hubEmail(invoice.clientEmail);
  if (email) data.buyer_email = email;
  const phone = hubPhone(invoice.billingPhone) || hubPhone(invoice.clientPhone);
  if (phone) data.buyer_phone_number = phone;
  const address = text(invoice.billToAddress, 240);
  if (address) data.buyer_address = { address_line_1: address, country: "US" };
  return data;
}

export function billingPrefill(profile: ClientHubProfile, billing: BillingProfile | null): {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  brokerage: string;
  billingEmail: string;
  billingPhone: string;
  billToAddress: string;
  cardLabel: string;
} {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    brokerage: profile.brokerage,
    billingEmail: billing?.email || profile.email,
    billingPhone: billing?.phone || profile.phone,
    billToAddress: billing ? billingAddressLine(billing) : "",
    cardLabel: cardLabel(billing?.card),
  };
}

export function accountBalanceCents(invoices: Array<{ amountDue?: number | null }>, storedCents = 0): number {
  const due = invoices.reduce((sum, invoice) => sum + Math.round((Number(invoice.amountDue) || 0) * 100), 0);
  if (due !== 0) return due;
  return Number.isFinite(storedCents) ? Math.round(storedCents) : 0;
}

export function cardOnFileFromSquare(card: Record<string, unknown>, customerId: string): CardOnFile | null {
  const last4 = text(card.last_4 || card.last4, 4);
  if (!/^\d{4}$/.test(last4)) return null;
  const expMonth = Number(card.exp_month || card.expMonth);
  const expYear = Number(card.exp_year || card.expYear);
  return {
    brand: text(card.card_brand || card.brand, 20) || "Card",
    last4,
    expMonth: Number.isFinite(expMonth) ? expMonth : 0,
    expYear: Number.isFinite(expYear) ? expYear : 0,
    squareCardId: text(card.id || card.squareCardId, 80),
    squareCustomerId: text(customerId, 80),
  };
}

/** Team invite mail is a normal client template, so the notify gate decides. */
export function teamInviteDelivery(env: Record<string, string | undefined> = process.env): "send" | "paused" {
  return clientNotifyLive(env) ? "send" : "paused";
}

export function exampleProfile(): ClientHubProfile {
  const socials = emptySocials();
  socials.facebook = "https://example.com/example-facebook";
  socials.instagram = "https://example.com/example-instagram";
  socials.tiktok = "https://example.com/example-tiktok";
  socials.youtube = "https://example.com/example-youtube";
  socials.x = "https://example.com/example-x";
  socials.linkedin = "https://example.com/example-linkedin";
  socials.pinterest = "https://example.com/example-pinterest";
  socials.threads = "https://example.com/example-threads";
  socials.snapchat = "https://example.com/example-snapchat";
  socials.googleBusiness = "https://example.com/example-google-business";
  socials.zillow = "https://example.com/example-zillow";
  socials.realtor = "https://example.com/example-realtor";
  return {
    firstName: "Example",
    lastName: "Agent",
    phone: "(281) 555-0100",
    email: "example.agent@example.com",
    headshotUrl: "/media/photos/headshot-gracepoint-1.jpg",
    companyLogoUrl: "/media/brand/iconic-camera-logo.png",
    brokerage: "Example Brokerage",
    brokerageLogoUrl: "/media/brand/iconic-camera-logo.png",
    website: "https://example.com",
    socials,
    customSocials: [{ id: "custom-example", label: "Example podcast", url: "https://example.com/example-podcast" }],
  };
}

export function exampleBilling(): BillingProfile {
  return {
    email: "example.billing@example.com",
    phone: "(281) 555-0199",
    line1: "100 Example Street",
    line2: "Suite 200",
    city: "Spring",
    state: "TX",
    postalCode: "77373",
    card: {
      brand: "VISA",
      last4: "4242",
      expMonth: 12,
      expYear: 2028,
      squareCardId: "example-card",
      squareCustomerId: "example-customer",
    },
    balanceCents: 12850,
    creditsCents: 5000,
    credits: [
      { id: "example-credit", at: "2026-10-01", label: "Example credit", cents: 5000, kind: "credit" },
    ],
  };
}

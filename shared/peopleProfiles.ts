/**
 * Unified people profiles, groups, permissions, and the direct inbox.
 *
 * Staff, clients, and agent contacts stay in their own collections.
 * This module only describes a view over those records plus settings
 * that did not already have a home. It does not send email or texts.
 */

import { INTENDED_OWNER_EMAIL } from "./ownerAccess.ts";

export const PERSON_KINDS = ["staff", "client", "agent"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERSON_ROLES = [...STAFF_ROLES, "client", "agent"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const CAPABILITIES = [
  "orders.view",
  "orders.assign",
  "clients.view",
  "messages.view",
  "messages.compose",
  "tasks.view",
  "tasks.assign",
  "listings.view",
  "billing.view",
  "groups.view",
  "groups.manage",
  "permissions.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "orders.view": "See orders",
  "orders.assign": "Assign work on orders",
  "clients.view": "See clients",
  "messages.view": "See messages",
  "messages.compose": "Compose messages",
  "tasks.view": "See the task board",
  "tasks.assign": "Assign tasks",
  "listings.view": "See projects and listings",
  "billing.view": "See billing",
  "groups.view": "See groups",
  "groups.manage": "Manage groups",
  "permissions.manage": "Set roles and permissions",
};

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const CLIENT_SERVICES = ["Photos", "Video", "Drone", "Twilight", "Floor plan", "Virtual staging"] as const;
export const PRICING_TIERS = ["Standard", "Preferred", "Brokerage"] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];

export const INBOX_FOLDERS = ["inbox", "drafts", "archived", "trash", "all-groups"] as const;
export type InboxFolder = (typeof INBOX_FOLDERS)[number];

export const ROLE_LABEL: Record<PersonRole, string> = {
  admin: "Admin",
  coordinator: "Office",
  photographer: "Shooter",
  editor: "Editor",
  client: "Client",
  agent: "Agent",
};

const ROLE_COLOR: Record<PersonRole, string> = {
  admin: "#0d9488",
  coordinator: "#2563eb",
  photographer: "#7c3aed",
  editor: "#ea580c",
  client: "#0f766e",
  agent: "#b45309",
};

const ROLE_CAPS: Record<PersonRole, readonly Capability[]> = {
  admin: CAPABILITIES,
  coordinator: [
    "orders.view", "orders.assign", "clients.view", "messages.view", "messages.compose",
    "listings.view", "billing.view", "groups.view", "groups.manage",
  ],
  photographer: ["orders.view", "messages.view", "messages.compose", "listings.view", "groups.view"],
  editor: ["orders.view", "messages.view", "listings.view", "groups.view", "tasks.view"],
  client: ["messages.view", "messages.compose", "orders.view", "listings.view", "billing.view", "groups.view"],
  agent: ["messages.view", "messages.compose", "orders.view", "listings.view", "groups.view"],
};

export interface DayHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface CommPrefs {
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface ZonePrefs {
  zones: string[];
  maxDriveMiles: number | null;
  maxDriveMinutes: number | null;
}

export interface StaffProfileSettings {
  displayName: string;
  bio: string;
  photoUrl: string;
  color: string;
  hours: Record<Weekday, DayHours>;
  comms: CommPrefs;
  zones: ZonePrefs;
}

export interface CardSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface ClientProfileSettings {
  displayName: string;
  photoUrl: string;
  color: string;
  notifications: CommPrefs;
  defaultServices: string[];
  pricingTier: PricingTier;
  /** Existing customerTeams document. Not a copy of the team. */
  customerTeamId: string;
}

export interface PersonProfile {
  id: string;
  kind: PersonKind;
  sourceId: string;
  uid: string;
  role: PersonRole;
  legalName: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl: string;
  color: string;
  bio: string;
  /** Brokerage stays on the client hub profile. This is a read-through. */
  brokerage: string;
  staffSettings: StaffProfileSettings | null;
  clientSettings: ClientProfileSettings | null;
  /** Null means "use the role default". A key set to false is an explicit deny. */
  permissions: Partial<Record<Capability, boolean>> | null;
  groupIds: string[];
  card: CardSummary | null;
  preview: boolean;
}

export interface GroupShare {
  projects: boolean;
  orders: boolean;
  listings: boolean;
  billing: boolean;
}

export interface SampleProject {
  id: string;
  title: string;
  kind: "order" | "listing" | "project";
}

export interface PeopleGroup {
  id: string;
  name: string;
  kind: "internal" | "client";
  customerTeamId: string | null;
  memberProfileIds: string[];
  memberUids: string[];
  canMessageProfileIds: string[];
  canMessageUids: string[];
  shared: GroupShare;
  color: string;
  preview: boolean;
  sampleProjects: SampleProject[];
}

export interface InboxNote {
  id: string;
  senderUid: string;
  senderProfileId: string;
  senderName: string;
  body: string;
  at: string;
}

export interface InboxThread {
  id: string;
  kind: "direct" | "group";
  status: "draft" | "sent";
  subject: string;
  body: string;
  messages: InboxNote[];
  ownerUid: string;
  senderUid: string;
  senderProfileId: string;
  senderName: string;
  participantUids: string[];
  notifyUids: string[];
  recipientProfileIds: string[];
  groupId: string | null;
  groupName: string | null;
  folderByUid: Record<string, "inbox" | "archived" | "trash" | "purged">;
  createdAt: string;
  updatedAt: string;
  preview: boolean;
  notified?: boolean;
}

export interface DeskActor {
  uid: string;
  email: string;
  kind: "staff" | "client";
  role: PersonRole;
  leadAdmin: boolean;
  permissions: Partial<Record<Capability, boolean>> | null;
}

export interface ComposeInput {
  threadId?: string;
  subject?: string;
  body?: string;
  profileIds?: string[];
  groupId?: string;
}

export interface NameSighting {
  source: "order" | "task" | "message" | "appointment";
  recordId: string;
  field: string;
  name: string;
}

export interface NameMatch {
  sighting: NameSighting;
  profileId: string;
  profileName: string;
}

export interface AmbiguousName {
  sighting: NameSighting;
  profileIds: string[];
}

export interface MigrationReport {
  unique: NameMatch[];
  ambiguous: AmbiguousName[];
  unmatched: NameSighting[];
  wrote: NameMatch[];
}

type EnvLike = { VERCEL_ENV?: string; NODE_ENV?: string };

export function previewPeopleAllowed(env: EnvLike): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview") return true;
  return env.NODE_ENV !== "production";
}

export function profileId(kind: PersonKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function personHref(kind: PersonKind, sourceId: string, audience: "admin" | "portal" = "admin"): string {
  if (audience === "portal") return `/portal/people/${kind}/${sourceId}`;
  return `/admin/people/${kind}/${sourceId}`;
}

export function allows(role: string, permissions: Partial<Record<Capability, boolean>> | null | undefined, key: Capability): boolean {
  if (permissions && Object.prototype.hasOwnProperty.call(permissions, key)) {
    return permissions[key] === true;
  }
  const caps = ROLE_CAPS[role as PersonRole];
  return Boolean(caps && caps.includes(key));
}

export function permissionWriteBlocked(
  targetEmail: string,
  nextRole: string,
  nextPermissions: Partial<Record<Capability, boolean>> | null,
): string | null {
  if (targetEmail.trim().toLowerCase() !== INTENDED_OWNER_EMAIL) return null;
  if (nextRole !== "admin") return "The owner stays an admin.";
  if (nextPermissions && nextPermissions["permissions.manage"] === false) {
    return "The owner keeps permission to manage access.";
  }
  return null;
}

export function emptyHours(): Record<Weekday, DayHours> {
  return {
    mon: { enabled: true, start: "09:00", end: "17:00" },
    tue: { enabled: true, start: "09:00", end: "17:00" },
    wed: { enabled: true, start: "09:00", end: "17:00" },
    thu: { enabled: true, start: "09:00", end: "17:00" },
    fri: { enabled: true, start: "09:00", end: "17:00" },
    sat: { enabled: false, start: "09:00", end: "13:00" },
    sun: { enabled: false, start: "09:00", end: "13:00" },
  };
}

function text(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clock(value: unknown, fallback: string): string {
  const raw = text(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function colorOf(value: unknown, fallback: string): string {
  const raw = text(value, 7);
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : fallback;
}

function photoOf(value: unknown): string {
  const raw = text(value, 400);
  if (!raw) return "";
  if (raw.startsWith("https://") || raw.startsWith("/")) return raw;
  return "";
}

function miles(value: unknown): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) return null;
  return Math.round(parsed);
}

export function defaultStaffSettings(role: PersonRole, displayName = ""): StaffProfileSettings {
  return {
    displayName,
    bio: "",
    photoUrl: "",
    color: ROLE_COLOR[role] || ROLE_COLOR.coordinator,
    hours: emptyHours(),
    comms: { email: true, sms: false, push: true },
    zones: { zones: [], maxDriveMiles: 30, maxDriveMinutes: 45 },
  };
}

export function defaultClientSettings(displayName = ""): ClientProfileSettings {
  return {
    displayName,
    photoUrl: "",
    color: ROLE_COLOR.client,
    notifications: { email: true, sms: false, push: true },
    defaultServices: ["Photos"],
    pricingTier: "Standard",
    customerTeamId: "",
  };
}

export function sanitizeStaffSettings(input: unknown, role: PersonRole): StaffProfileSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = defaultStaffSettings(role);
  const hoursIn = (raw.hours && typeof raw.hours === "object" ? raw.hours : {}) as Record<string, unknown>;
  const hours = emptyHours();
  for (const day of WEEKDAYS) {
    const row = (hoursIn[day] && typeof hoursIn[day] === "object" ? hoursIn[day] : {}) as Record<string, unknown>;
    hours[day] = {
      enabled: flag(row.enabled, base.hours[day].enabled),
      start: clock(row.start, base.hours[day].start),
      end: clock(row.end, base.hours[day].end),
    };
  }
  const comms = (raw.comms && typeof raw.comms === "object" ? raw.comms : {}) as Record<string, unknown>;
  const zones = (raw.zones && typeof raw.zones === "object" ? raw.zones : {}) as Record<string, unknown>;
  const zoneList = Array.isArray(zones.zones) ? zones.zones.map((zone) => text(zone, 40)).filter(Boolean).slice(0, 12) : [];
  return {
    displayName: text(raw.displayName, 80),
    bio: text(raw.bio, 500),
    photoUrl: photoOf(raw.photoUrl),
    color: colorOf(raw.color, base.color),
    hours,
    comms: {
      email: flag(comms.email, true),
      sms: flag(comms.sms, false),
      push: flag(comms.push, true),
    },
    zones: {
      zones: zoneList,
      maxDriveMiles: miles(zones.maxDriveMiles),
      maxDriveMinutes: miles(zones.maxDriveMinutes),
    },
  };
}

export function sanitizeClientSettings(input: unknown): ClientProfileSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = defaultClientSettings();
  const notes = (raw.notifications && typeof raw.notifications === "object" ? raw.notifications : {}) as Record<string, unknown>;
  const services = Array.isArray(raw.defaultServices)
    ? raw.defaultServices.map((item) => text(item, 40)).filter((item) => (CLIENT_SERVICES as readonly string[]).includes(item)).slice(0, 8)
    : base.defaultServices;
  const tier = text(raw.pricingTier, 20);
  return {
    displayName: text(raw.displayName, 80),
    photoUrl: photoOf(raw.photoUrl),
    color: colorOf(raw.color, base.color),
    notifications: {
      email: flag(notes.email, true),
      sms: flag(notes.sms, false),
      push: flag(notes.push, true),
    },
    defaultServices: services.length ? services : ["Photos"],
    pricingTier: (PRICING_TIERS as readonly string[]).includes(tier) ? tier as PricingTier : "Standard",
    customerTeamId: text(raw.customerTeamId, 80),
  };
}

export function sanitizePermissions(input: unknown): Partial<Record<Capability, boolean>> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const next: Partial<Record<Capability, boolean>> = {};
  for (const key of CAPABILITIES) {
    if (typeof raw[key] === "boolean") next[key] = raw[key] as boolean;
  }
  return next;
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function profileFromStaff(sourceId: string, data: Record<string, unknown>, preview = false): PersonProfile {
  const role = isStaffRole(String(data.role || "")) ? String(data.role) as StaffRole : "photographer";
  const legalName = text(`${data.firstName || ""} ${data.lastName || ""}`, 120) || text(data.name, 120) || text(data.email, 120) || "Staff";
  const settings = sanitizeStaffSettings(data.profileSettings, role);
  if (!settings.displayName) settings.displayName = legalName;
  return {
    id: profileId("staff", sourceId),
    kind: "staff",
    sourceId,
    uid: text(data.uid, 128) || sourceId,
    role,
    legalName,
    displayName: settings.displayName,
    email: text(data.email, 160).toLowerCase(),
    phone: text(data.phone, 40),
    photoUrl: settings.photoUrl,
    color: settings.color,
    bio: settings.bio,
    brokerage: "",
    staffSettings: settings,
    clientSettings: null,
    permissions: data.permissions ? sanitizePermissions(data.permissions) : null,
    groupIds: Array.isArray(data.groupIds) ? data.groupIds.map((id) => text(id, 80)).filter(Boolean) : [],
    card: null,
    preview,
  };
}

export function profileFromClient(sourceId: string, data: Record<string, unknown>, card: CardSummary | null = null, preview = false): PersonProfile {
  const hub = asRecord(data.hubProfile);
  const legalName = text(`${data.firstName || hub.firstName || ""} ${data.lastName || hub.lastName || ""}`, 120) || text(data.name, 120) || "Client";
  const settings = sanitizeClientSettings(data.profileSettings);
  if (!settings.displayName) settings.displayName = legalName;
  const brokerage = text(hub.brokerage, 120);
  return {
    id: profileId("client", sourceId),
    kind: "client",
    sourceId,
    uid: sourceId,
    role: "client",
    legalName,
    displayName: settings.displayName,
    email: text(data.email || hub.email, 160).toLowerCase(),
    phone: text(data.phone || hub.phone, 40),
    photoUrl: settings.photoUrl || photoOf(hub.headshotUrl),
    color: settings.color,
    bio: "",
    brokerage,
    staffSettings: null,
    clientSettings: settings,
    permissions: null,
    groupIds: Array.isArray(data.groupIds) ? data.groupIds.map((id) => text(id, 80)).filter(Boolean) : [],
    card,
    preview,
  };
}

export function profileFromAgent(sourceId: string, data: Record<string, unknown>, preview = false): PersonProfile {
  const legalName = text(data.name, 120) || "Agent";
  const linked = text(data.linkedClientId, 128);
  return {
    id: profileId("agent", sourceId),
    kind: "agent",
    sourceId,
    uid: linked,
    role: "agent",
    legalName,
    displayName: legalName,
    email: text(data.email, 160).toLowerCase(),
    phone: text(data.phone, 40),
    photoUrl: "",
    color: ROLE_COLOR.agent,
    bio: text(data.notes, 500),
    brokerage: "",
    staffSettings: null,
    clientSettings: null,
    permissions: null,
    groupIds: [],
    card: null,
    preview,
  };
}

export function cardSummaryFrom(data: Record<string, unknown> | null | undefined): CardSummary | null {
  if (!data) return null;
  const card = asRecord(data.card);
  const last4 = text(card.last4, 4);
  if (!/^\d{4}$/.test(last4)) return null;
  return {
    brand: text(card.brand, 20) || "Card",
    last4,
    expMonth: Number(card.expMonth) || 0,
    expYear: Number(card.expYear) || 0,
  };
}

export function normalizePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function directoryHit(profile: PersonProfile, query: string, role: string): boolean {
  if (role && role !== "all" && profile.role !== role) return false;
  const needle = normalizePersonName(query);
  if (!needle) return true;
  const hay = normalizePersonName(`${profile.displayName} ${profile.legalName} ${profile.email} ${ROLE_LABEL[profile.role]}`);
  return hay.includes(needle);
}

export function groupDelivery(group: PeopleGroup, senderUid: string): { ok: true; participantUids: string[]; notifyUids: string[] } | { ok: false; error: string } {
  if (!group.canMessageUids.includes(senderUid)) {
    return { ok: false, error: "You do not have permission to message this group." };
  }
  const members = [...new Set(group.memberUids.filter(Boolean))];
  if (members.length === 0) return { ok: false, error: "This group has no members to receive a message." };
  return {
    ok: true,
    participantUids: [...new Set([...members, senderUid])],
    notifyUids: members,
  };
}

export function directDelivery(senderUid: string, recipientUids: string[]): { ok: true; participantUids: string[]; notifyUids: string[] } | { ok: false; error: string } {
  const recipients = [...new Set(recipientUids.filter((uid) => uid && uid !== senderUid))];
  if (recipients.length === 0) return { ok: false, error: "Choose at least one person with a login." };
  if (recipients.length > 20) return { ok: false, error: "Choose 20 people or fewer. A message to many people belongs in Marketing, then Campaigns." };
  return { ok: true, participantUids: [...new Set([senderUid, ...recipients])], notifyUids: recipients };
}

export function threadsForFolder(threads: InboxThread[], actor: DeskActor, folder: InboxFolder): InboxThread[] {
  return threads
    .filter((thread) => visibleInFolder(thread, actor, folder))
    .map((thread) => ({ ...thread, notified: thread.notifyUids.includes(actor.uid) }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function visibleInFolder(thread: InboxThread, actor: DeskActor, folder: InboxFolder): boolean {
  if (thread.folderByUid[actor.uid] === "purged") return false;
  if (folder === "all-groups") {
    return actor.leadAdmin && thread.kind === "group" && thread.status === "sent";
  }
  if (thread.status === "draft") {
    if (thread.ownerUid !== actor.uid) return false;
    const stored = thread.folderByUid[actor.uid];
    if (folder === "trash") return stored === "trash";
    if (folder === "drafts") return stored !== "trash" && stored !== "archived";
    if (folder === "archived") return stored === "archived";
    return false;
  }
  if (!thread.participantUids.includes(actor.uid)) return false;
  const stored = thread.folderByUid[actor.uid] || "inbox";
  if (folder === "drafts") return false;
  return stored === folder;
}

export function applyFolder(thread: InboxThread, uid: string, folder: "inbox" | "archived" | "trash" | "purge"): InboxThread | "delete" {
  if (folder === "purge") {
    if (thread.status === "draft" && thread.ownerUid === uid) return "delete";
    return { ...thread, folderByUid: { ...thread.folderByUid, [uid]: "purged" }, updatedAt: new Date().toISOString() };
  }
  return { ...thread, folderByUid: { ...thread.folderByUid, [uid]: folder }, updatedAt: new Date().toISOString() };
}

export function matchProfileNames(profiles: PersonProfile[], sightings: NameSighting[]): MigrationReport {
  const byName = new Map<string, PersonProfile[]>();
  for (const profile of profiles) {
    for (const label of [profile.displayName, profile.legalName]) {
      const key = normalizePersonName(label);
      if (!key) continue;
      const list = byName.get(key) || [];
      if (!list.some((item) => item.id === profile.id)) list.push(profile);
      byName.set(key, list);
    }
  }
  const unique: NameMatch[] = [];
  const ambiguous: AmbiguousName[] = [];
  const unmatched: NameSighting[] = [];
  for (const sighting of sightings) {
    const key = normalizePersonName(sighting.name);
    if (!key) {
      unmatched.push(sighting);
      continue;
    }
    const hits = byName.get(key) || [];
    if (hits.length === 1) {
      unique.push({ sighting, profileId: hits[0].id, profileName: hits[0].displayName });
    } else if (hits.length > 1) {
      ambiguous.push({ sighting, profileIds: hits.map((hit) => hit.id) });
    } else {
      unmatched.push(sighting);
    }
  }
  return { unique, ambiguous, unmatched, wrote: [] };
}

/** Unique matches only. Ambiguous and unmatched rows are never returned for a write. */
export function uniqueWrites(report: MigrationReport): NameMatch[] {
  return report.unique.filter((row) => !report.ambiguous.some((item) => (
    item.sighting.recordId === row.sighting.recordId && item.sighting.field === row.sighting.field
  )));
}

function person(partial: Omit<PersonProfile, "staffSettings" | "clientSettings" | "permissions" | "groupIds" | "card" | "bio" | "brokerage" | "photoUrl" | "color"> & Partial<PersonProfile>): PersonProfile {
  const role = partial.role;
  const staff = partial.kind === "staff" ? defaultStaffSettings(role, partial.displayName) : null;
  if (staff) {
    staff.color = partial.color || staff.color;
    staff.photoUrl = partial.photoUrl || "";
    staff.bio = partial.bio || "";
  }
  const client = partial.kind === "client" ? defaultClientSettings(partial.displayName) : null;
  if (client) {
    client.color = partial.color || client.color;
    client.photoUrl = partial.photoUrl || "";
  }
  return {
    bio: "",
    brokerage: "",
    photoUrl: "",
    color: ROLE_COLOR[role],
    staffSettings: staff,
    clientSettings: client,
    permissions: null,
    groupIds: partial.groupIds || [],
    card: null,
    ...partial,
  };
}

export function previewProfiles(): PersonProfile[] {
  const rows: PersonProfile[] = [
    person({ id: "staff:sample-cadi", kind: "staff", sourceId: "sample-cadi", uid: "sample-cadi", role: "admin", legalName: "Cadi Torres", displayName: "Cadi Torres", email: "cadi@iconicimagestx.com", phone: "", preview: true, color: "#0d9488" }),
    person({ id: "staff:sample-cora", kind: "staff", sourceId: "sample-cora", uid: "sample-cora", role: "coordinator", legalName: "Cora", displayName: "Cora", email: "cora@iconicimagestx.com", phone: "", preview: true, color: "#2563eb", bio: "Office desk. Preview sample." }),
    person({ id: "staff:sample-mike", kind: "staff", sourceId: "sample-mike", uid: "sample-mike", role: "photographer", legalName: "Mike Luna", displayName: "Mike Luna", email: "mike@iconicimagestx.com", phone: "(281) 555-0101", preview: true, color: "#7c3aed", bio: "Listing and video sets." }),
    person({ id: "staff:sample-daniel", kind: "staff", sourceId: "sample-daniel", uid: "sample-daniel", role: "editor", legalName: "Daniel Adaclog", displayName: "Daniel Adaclog", email: "daniel@iconicimagestx.com", phone: "", preview: true, color: "#ea580c", bio: "Video edit." }),
    person({ id: "staff:sample-armando", kind: "staff", sourceId: "sample-armando", uid: "sample-armando", role: "photographer", legalName: "Armando Reyes", displayName: "Armando Reyes", email: "armando@iconicimagestx.com", phone: "", preview: true, color: "#7c3aed", bio: "Video group. Last name is a preview placeholder." }),
    person({ id: "client:sample-jane", kind: "client", sourceId: "sample-jane", uid: "sample-jane", role: "client", legalName: "Jane Doe", displayName: "Jane Doe", email: "jane.doe@example.com", phone: "(281) 555-0199", preview: true, brokerage: "Sample Brokerage", groupIds: ["preview-admin", "preview-brokerage"] }),
    person({ id: "client:sample-riley", kind: "client", sourceId: "sample-riley", uid: "sample-riley", role: "client", legalName: "Riley Broker", displayName: "Riley Broker", email: "riley.broker@example.com", phone: "", preview: true, brokerage: "Sample Brokerage", groupIds: ["preview-brokerage"] }),
    person({ id: "agent:sample-agent", kind: "agent", sourceId: "sample-agent", uid: "", role: "agent", legalName: "Avery Agent", displayName: "Avery Agent", email: "avery.agent@example.com", phone: "", preview: true, bio: "Agent contact. No login yet, so messages wait until an account exists." }),
  ];
  const jane = rows.find((row) => row.id === "client:sample-jane");
  if (jane?.clientSettings) {
    jane.clientSettings.defaultServices = ["Photos", "Video"];
    jane.clientSettings.pricingTier = "Brokerage";
    jane.clientSettings.customerTeamId = "preview-brokerage";
    jane.brokerage = "Sample Brokerage";
  }
  const mike = rows.find((row) => row.id === "staff:sample-mike");
  if (mike) {
    mike.groupIds = ["preview-video"];
    if (mike.staffSettings) mike.staffSettings.zones.zones = ["North Houston", "Conroe"];
  }
  const daniel = rows.find((row) => row.id === "staff:sample-daniel");
  if (daniel) daniel.groupIds = ["preview-video"];
  const armando = rows.find((row) => row.id === "staff:sample-armando");
  if (armando) armando.groupIds = ["preview-video"];
  const cadi = rows.find((row) => row.id === "staff:sample-cadi");
  if (cadi) cadi.groupIds = ["preview-admin"];
  const cora = rows.find((row) => row.id === "staff:sample-cora");
  if (cora) cora.groupIds = ["preview-admin"];
  return rows;
}

export function previewGroups(): PeopleGroup[] {
  return [
    {
      id: "preview-video",
      name: "Video group",
      kind: "internal",
      customerTeamId: null,
      memberProfileIds: ["staff:sample-mike", "staff:sample-daniel", "staff:sample-armando"],
      memberUids: ["sample-mike", "sample-daniel", "sample-armando"],
      canMessageProfileIds: ["staff:sample-mike", "staff:sample-daniel", "staff:sample-armando"],
      canMessageUids: ["sample-mike", "sample-daniel", "sample-armando"],
      shared: { projects: true, orders: true, listings: true, billing: false },
      color: "#7c3aed",
      preview: true,
      sampleProjects: [
        { id: "sample-order-127", title: "Listing video reel", kind: "order" },
        { id: "sample-listing-126", title: "126 Sample Street", kind: "listing" },
      ],
    },
    {
      id: "preview-admin",
      name: "Admin Group",
      kind: "internal",
      customerTeamId: null,
      memberProfileIds: ["staff:sample-cadi", "staff:sample-cora", "client:sample-jane"],
      memberUids: ["sample-cadi", "sample-cora", "sample-jane"],
      canMessageProfileIds: ["staff:sample-cadi", "staff:sample-cora", "client:sample-jane", "client:sample-riley"],
      canMessageUids: ["sample-cadi", "sample-cora", "sample-jane", "sample-riley"],
      shared: { projects: true, orders: true, listings: false, billing: false },
      color: "#0d9488",
      preview: true,
      sampleProjects: [
        { id: "office-week", title: "Office week", kind: "project" },
      ],
    },
    {
      id: "preview-brokerage",
      name: "Sample Brokerage",
      kind: "client",
      customerTeamId: null,
      memberProfileIds: ["client:sample-jane", "client:sample-riley"],
      memberUids: ["sample-jane", "sample-riley"],
      canMessageProfileIds: ["client:sample-jane", "client:sample-riley"],
      canMessageUids: ["sample-jane", "sample-riley"],
      shared: { projects: true, orders: true, listings: true, billing: true },
      color: "#0f766e",
      preview: true,
      sampleProjects: [
        { id: "broker-order", title: "Shared brokerage order", kind: "order" },
      ],
    },
  ];
}

export function previewThreads(): InboxThread[] {
  const at = "2026-11-14T15:00:00.000Z";
  return [
    {
      id: "preview-thread-video",
      kind: "group",
      status: "sent",
      subject: "Saturday reel",
      body: "I can take the Saturday reel. Daniel, can you cut it Monday?",
      messages: [{
        id: "preview-note-video",
        senderUid: "sample-mike",
        senderProfileId: "staff:sample-mike",
        senderName: "Mike Luna",
        body: "I can take the Saturday reel. Daniel, can you cut it Monday?",
        at,
      }],
      ownerUid: "sample-mike",
      senderUid: "sample-mike",
      senderProfileId: "staff:sample-mike",
      senderName: "Mike Luna",
      participantUids: ["sample-mike", "sample-daniel", "sample-armando"],
      notifyUids: ["sample-mike", "sample-daniel", "sample-armando"],
      recipientProfileIds: ["staff:sample-mike", "staff:sample-daniel", "staff:sample-armando"],
      groupId: "preview-video",
      groupName: "Video group",
      folderByUid: {},
      createdAt: at,
      updatedAt: at,
      preview: true,
    },
    {
      id: "preview-thread-admin",
      kind: "group",
      status: "sent",
      subject: "Portal question",
      body: "Can someone on the admin desk confirm the brokerage invoice?",
      messages: [{
        id: "preview-note-admin",
        senderUid: "sample-riley",
        senderProfileId: "client:sample-riley",
        senderName: "Riley Broker",
        body: "Can someone on the admin desk confirm the brokerage invoice?",
        at,
      }],
      ownerUid: "sample-riley",
      senderUid: "sample-riley",
      senderProfileId: "client:sample-riley",
      senderName: "Riley Broker",
      participantUids: ["sample-cadi", "sample-cora", "sample-jane", "sample-riley"],
      notifyUids: ["sample-cadi", "sample-cora", "sample-jane"],
      recipientProfileIds: ["staff:sample-cadi", "staff:sample-cora", "client:sample-jane"],
      groupId: "preview-admin",
      groupName: "Admin Group",
      folderByUid: {},
      createdAt: at,
      updatedAt: at,
      preview: true,
    },
  ];
}

export function buildOutbound(
  actor: DeskActor,
  input: ComposeInput,
  profiles: PersonProfile[],
  groups: PeopleGroup[],
  now = new Date().toISOString(),
): { ok: true; thread: InboxThread } | { ok: false; error: string } {
  const subject = text(input.subject, 140) || "Message";
  const body = text(input.body, 2000);
  if (!body) return { ok: false, error: "Write a message first." };
  const sender = profiles.find((profile) => profile.uid === actor.uid) || null;
  const senderProfileId = sender?.id || profileId(actor.kind === "client" ? "client" : "staff", actor.uid);
  const senderName = sender?.displayName || actor.email || "Iconic";
  if (input.groupId) {
    const group = groups.find((item) => item.id === input.groupId);
    if (!group) return { ok: false, error: "Choose a group." };
    const delivery = groupDelivery(group, actor.uid);
    if (delivery.ok === false) return { ok: false, error: delivery.error };
    const note: InboxNote = { id: `note-${now}`, senderUid: actor.uid, senderProfileId, senderName, body, at: now };
    return {
      ok: true,
      thread: {
        id: input.threadId || `thread-${now}`,
        kind: "group",
        status: "sent",
        subject,
        body,
        messages: [note],
        ownerUid: actor.uid,
        senderUid: actor.uid,
        senderProfileId,
        senderName,
        participantUids: delivery.participantUids,
        notifyUids: delivery.notifyUids,
        recipientProfileIds: group.memberProfileIds,
        groupId: group.id,
        groupName: group.name,
        folderByUid: {},
        createdAt: now,
        updatedAt: now,
        preview: group.preview,
      },
    };
  }
  const chosen = (input.profileIds || [])
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is PersonProfile => Boolean(profile));
  const missingLogin = chosen.find((profile) => !profile.uid);
  if (missingLogin) return { ok: false, error: `${missingLogin.displayName} does not have a login yet.` };
  const delivery = directDelivery(actor.uid, chosen.map((profile) => profile.uid));
  if (delivery.ok === false) return { ok: false, error: delivery.error };
  const note: InboxNote = { id: `note-${now}`, senderUid: actor.uid, senderProfileId, senderName, body, at: now };
  return {
    ok: true,
    thread: {
      id: input.threadId || `thread-${now}`,
      kind: "direct",
      status: "sent",
      subject,
      body,
      messages: [note],
      ownerUid: actor.uid,
      senderUid: actor.uid,
      senderProfileId,
      senderName,
      participantUids: delivery.participantUids,
      notifyUids: delivery.notifyUids,
      recipientProfileIds: chosen.map((profile) => profile.id),
      groupId: null,
      groupName: null,
      folderByUid: {},
      createdAt: now,
      updatedAt: now,
      preview: chosen.every((profile) => profile.preview),
    },
  };
}

export function buildDraft(actor: DeskActor, input: ComposeInput, now = new Date().toISOString()): InboxThread {
  return {
    id: input.threadId || `draft-${now}`,
    kind: input.groupId ? "group" : "direct",
    status: "draft",
    subject: text(input.subject, 140),
    body: text(input.body, 2000),
    messages: [],
    ownerUid: actor.uid,
    senderUid: actor.uid,
    senderProfileId: profileId(actor.kind === "client" ? "client" : "staff", actor.uid),
    senderName: actor.email || "Draft",
    participantUids: [actor.uid],
    notifyUids: [],
    recipientProfileIds: input.groupId ? [] : (input.profileIds || []).slice(0, 20),
    groupId: input.groupId || null,
    groupName: null,
    folderByUid: {},
    createdAt: now,
    updatedAt: now,
    preview: true,
  };
}

/**
 * Profile, group, and direct-inbox desk.
 * Reads staff, clients, agent contacts, and customer teams.
 * Does not copy those people into a second directory.
 * Does not send email or texts. Does not touch the Holy Grail sheet.
 */

import { randomBytes } from "node:crypto";
import admin from "firebase-admin";
import { isActiveStaffRecord } from "../../shared/staffAccess.ts";
import {
  allows,
  applyFolder,
  buildDraft,
  buildOutbound,
  profileId,
  cardSummaryFrom,
  directoryHit,
  isStaffRole,
  permissionWriteBlocked,
  previewGroups,
  previewPeopleAllowed,
  previewProfiles,
  previewThreads,
  profileFromAgent,
  profileFromClient,
  profileFromStaff,
  sanitizeClientSettings,
  sanitizePermissions,
  sanitizeStaffSettings,
  threadsForFolder,
  type Capability,
  type ComposeInput,
  type DeskActor,
  type InboxFolder,
  type InboxThread,
  type PeopleGroup,
  type PersonKind,
  type PersonProfile,
  type PersonRole,
  type StaffRole,
} from "../../shared/peopleProfiles.ts";

interface Overlay {
  profiles: Map<string, PersonProfile>;
  groups: Map<string, PeopleGroup>;
  threads: Map<string, InboxThread>;
  hiddenThreadIds: Set<string>;
}

const overlay: Overlay = {
  profiles: new Map(),
  groups: new Map(),
  threads: new Map(),
  hiddenThreadIds: new Set(),
};

let actorOverride: DeskActor | null = null;

export function resetPeopleDeskForTests(): void {
  overlay.profiles.clear();
  overlay.groups.clear();
  overlay.threads.clear();
  overlay.hiddenThreadIds.clear();
  actorOverride = null;
}

export function setPeopleActorForTests(actor: DeskActor | null): void {
  if (process.env.NODE_ENV !== "test") return;
  actorOverride = actor;
}

export function peopleActorOverride(): DeskActor | null {
  return process.env.NODE_ENV === "test" ? actorOverride : null;
}

function envOf(): { VERCEL_ENV?: string; NODE_ENV?: string } {
  return { VERCEL_ENV: process.env.VERCEL_ENV, NODE_ENV: process.env.NODE_ENV };
}

function previewOn(): boolean {
  return previewPeopleAllowed(envOf());
}

function firestoreOn(): boolean {
  return admin.apps.length > 0 && process.env.NODE_ENV !== "test";
}

function db() {
  return admin.firestore();
}

async function readCollection(name: string, limit: number): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  if (!firestoreOn()) return [];
  const snap = await db().collection(name).limit(limit).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
}

export async function loadProfiles(): Promise<PersonProfile[]> {
  const map = new Map<string, PersonProfile>();
  if (previewOn()) {
    for (const profile of previewProfiles()) map.set(profile.id, profile);
  }
  if (firestoreOn()) {
    const [staff, clients, agents, billing] = await Promise.all([
      readCollection("staff", 80),
      readCollection("clients", 80),
      readCollection("agentContacts", 40),
      readCollection("clientBilling", 80),
    ]);
    const cards = new Map(billing.map((row) => [row.id, cardSummaryFrom(row.data)]));
    for (const row of staff) map.set(`staff:${row.id}`, profileFromStaff(row.id, row.data));
    for (const row of clients) map.set(`client:${row.id}`, profileFromClient(row.id, row.data, cards.get(row.id) || null));
    for (const row of agents) {
      if (row.data.linkedClientId) continue;
      map.set(`agent:${row.id}`, profileFromAgent(row.id, row.data));
    }
  }
  for (const [id, profile] of overlay.profiles) map.set(id, profile);
  return [...map.values()];
}

export async function loadGroups(): Promise<PeopleGroup[]> {
  const map = new Map<string, PeopleGroup>();
  if (previewOn()) {
    for (const group of previewGroups()) map.set(group.id, group);
  }
  if (firestoreOn()) {
    const rows = await readCollection("peopleGroups", 40);
    for (const row of rows) {
      if (row.data.preview === true) continue;
      map.set(row.id, row.data as unknown as PeopleGroup);
    }
  }
  for (const [id, group] of overlay.groups) map.set(id, group);
  return [...map.values()];
}

async function loadThreads(): Promise<InboxThread[]> {
  const map = new Map<string, InboxThread>();
  if (previewOn()) {
    for (const thread of previewThreads()) map.set(thread.id, thread);
  }
  if (firestoreOn()) {
    const rows = await readCollection("inboxThreads", 50);
    for (const row of rows) {
      if (row.data.preview === true) continue;
      map.set(row.id, { ...(row.data as unknown as InboxThread), id: row.id });
    }
  }
  for (const [id, thread] of overlay.threads) map.set(id, thread);
  for (const id of overlay.hiddenThreadIds) map.delete(id);
  return [...map.values()];
}

function deny(actor: DeskActor, key: Capability): string | null {
  if (actor.kind === "client") {
    if (key === "messages.view" || key === "messages.compose" || key === "groups.view") return null;
    return "That action is not available on a client login.";
  }
  if (!allows(actor.role, actor.permissions, key)) return "You do not have permission for that.";
  return null;
}

export async function directory(actor: DeskActor, query: string, role: string) {
  if (actor.kind === "staff" && !allows(actor.role, actor.permissions, "clients.view") && !allows(actor.role, actor.permissions, "messages.view")) {
    return { error: "You do not have permission for that.", status: 403 as const };
  }
  if (actor.kind === "client" && deny(actor, "messages.view")) {
    return { error: "You do not have permission for that.", status: 403 as const };
  }
  const groups = await loadGroups();
  const visibleGroups = visibleGroupsFor(actor, groups);
  let profiles = await loadProfiles();
  if (actor.kind === "client") {
    const allowed = new Set<string>(visibleGroups.flatMap((group) => [...group.memberProfileIds, ...group.canMessageProfileIds]));
    profiles = profiles.filter((profile) => profile.uid === actor.uid || allowed.has(profile.id));
  }
  return {
    profiles: profiles.filter((profile) => directoryHit(profile, query, role)).slice(0, 40),
    groups: visibleGroups.slice(0, 40),
    preview: previewOn(),
  };
}

function visibleGroupsFor(actor: DeskActor, groups: PeopleGroup[]): PeopleGroup[] {
  const canManage = actor.kind === "staff" && allows(actor.role, actor.permissions, "groups.manage");
  if (actor.leadAdmin || canManage) return groups;
  return groups.filter((group) => group.memberUids.includes(actor.uid) || group.canMessageUids.includes(actor.uid));
}

export async function profileFor(actor: DeskActor, kind: PersonKind, sourceId: string) {
  if (actor.kind === "client" && !(kind === "client" && sourceId === actor.uid)) {
    const groups = await loadGroups();
    const shared = groups.some((group) => (
      (group.memberUids.includes(actor.uid) || group.canMessageUids.includes(actor.uid))
      && group.memberProfileIds.includes(`${kind}:${sourceId}`)
    ));
    if (!shared) return { error: "That profile is not in a group you belong to.", status: 403 as const };
  } else if (actor.kind === "staff") {
    const self = kind === "staff" && sourceId === actor.uid;
    if (!self) {
      const blocked = deny(actor, "clients.view");
      if (blocked) return { error: blocked, status: 403 as const };
    }
  }
  const profiles = await loadProfiles();
  const found = profiles.find((profile) => profile.kind === kind && profile.sourceId === sourceId);
  if (found) return { profile: found };
  if (kind === "staff" && sourceId === actor.uid) {
    return {
      profile: profileFromStaff(actor.uid, {
        role: actor.role,
        email: actor.email,
        firstName: actor.email.split("@")[0] || "Staff",
        lastName: "",
      }),
    };
  }
  return { error: "Profile not found.", status: 404 as const };
}

export async function saveSettings(actor: DeskActor, kind: PersonKind, sourceId: string, body: unknown) {
  const self = (kind === "staff" && sourceId === actor.uid) || (kind === "client" && sourceId === actor.uid);
  if (!self && deny(actor, "permissions.manage")) return { error: "You can edit your own settings. An admin edits everyone else's.", status: 403 as const };
  const profiles = await loadProfiles();
  const current = profiles.find((profile) => profile.kind === kind && profile.sourceId === sourceId);
  if (!current) return { error: "Profile not found.", status: 404 as const };
  if (kind === "agent") return { error: "Agent contacts keep their name and email on the contact record. Add a login before saving settings.", status: 400 as const };
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if ("cardNumber" in record || "cvv" in record || "pan" in record) {
    return { error: "Card numbers stay on the billing page.", status: 400 as const };
  }
  let next = current;
  if (kind === "staff" && current.staffSettings) {
    const settings = sanitizeStaffSettings({ ...current.staffSettings, ...(asRecord(record.staffSettings) || record) }, current.role);
    next = {
      ...current,
      displayName: settings.displayName || current.legalName,
      photoUrl: settings.photoUrl,
      color: settings.color,
      bio: settings.bio,
      staffSettings: settings,
    };
  }
  if (kind === "client" && current.clientSettings) {
    const settings = sanitizeClientSettings({ ...current.clientSettings, ...(asRecord(record.clientSettings) || record) });
    const brokerage = typeof record.brokerage === "string" ? record.brokerage.replace(/\s+/g, " ").trim().slice(0, 120) : current.brokerage;
    next = {
      ...current,
      displayName: settings.displayName || current.legalName,
      photoUrl: settings.photoUrl,
      color: settings.color,
      brokerage,
      clientSettings: settings,
    };
  }
  await persistProfile(next);
  return { profile: next };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

async function persistProfile(profile: PersonProfile): Promise<void> {
  if (profile.preview || !firestoreOn()) {
    overlay.profiles.set(profile.id, profile);
    return;
  }
  const ref = db().collection(profile.kind === "staff" ? "staff" : "clients").doc(profile.sourceId);
  const patch: Record<string, unknown> = {
    groupIds: profile.groupIds,
    updatedAt: new Date().toISOString(),
  };
  if (profile.kind === "staff") patch.profileSettings = profile.staffSettings;
  if (profile.kind === "client") {
    patch.profileSettings = profile.clientSettings;
    patch["hubProfile.brokerage"] = profile.brokerage;
  }
  await ref.update(patch);
}

export async function permissionRoster(actor: DeskActor) {
  const blocked = deny(actor, "permissions.manage");
  if (blocked) return { error: blocked, status: 403 as const };
  const profiles = (await loadProfiles()).filter((profile) => profile.kind === "staff");
  return { profiles, preview: previewOn() };
}

export async function savePermission(actor: DeskActor, staffId: string, role: string, permissions: unknown) {
  const blocked = deny(actor, "permissions.manage");
  if (blocked) return { error: blocked, status: 403 as const };
  if (!isStaffRole(role)) return { error: "Choose admin, coordinator, photographer, or editor.", status: 400 as const };
  const nextPermissions = sanitizePermissions(permissions);
  const profiles = await loadProfiles();
  const current = profiles.find((profile) => profile.kind === "staff" && profile.sourceId === staffId);
  if (!current) return { error: "That staff profile was not found.", status: 404 as const };
  const ownerBlock = permissionWriteBlocked(current.email, role, nextPermissions);
  if (ownerBlock) return { error: ownerBlock, status: 400 as const };
  const next: PersonProfile = { ...current, role: role as StaffRole, permissions: nextPermissions };
  if (next.preview || !firestoreOn()) {
    overlay.profiles.set(next.id, next);
  } else {
    await db().collection("staff").doc(staffId).set({
      role,
      permissions: nextPermissions,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
  return { profile: next };
}

export async function groupsFor(actor: DeskActor) {
  const blocked = deny(actor, "groups.view");
  if (blocked) return { error: blocked, status: 403 as const };
  const groups = visibleGroupsFor(actor, await loadGroups());
  return { groups, preview: previewOn() };
}

export async function groupFor(actor: DeskActor, id: string) {
  const listed = await groupsFor(actor);
  if ("error" in listed && listed.error) return listed;
  const group = listed.groups.find((item) => item.id === id);
  if (!group) return { error: "Group not found.", status: 404 as const };
  const profiles = await loadProfiles();
  const members = group.memberProfileIds
    .map((profileId) => profiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is PersonProfile => Boolean(profile));
  return { group, members, profiles, preview: group.preview || previewOn() };
}

export async function saveGroup(actor: DeskActor, id: string | null, body: unknown) {
  const blocked = deny(actor, "groups.manage");
  if (blocked) return { error: blocked, status: 403 as const };
  const raw = asRecord(body) || {};
  const profiles = await loadProfiles();
  const existing = id ? (await loadGroups()).find((group) => group.id === id) : null;
  if (id && !existing) return { error: "Group not found.", status: 404 as const };
  if (existing?.preview && !previewOn()) return { error: "Preview groups are not stored on production.", status: 400 as const };
  const memberProfileIds = arrayOf(raw.memberProfileIds, existing?.memberProfileIds || []);
  const canMessageProfileIds = arrayOf(raw.canMessageProfileIds, existing?.canMessageProfileIds || memberProfileIds);
  const members = resolveProfiles(memberProfileIds, profiles);
  if ("error" in members) return { error: members.error, status: 400 as const };
  const messengers = resolveProfiles(canMessageProfileIds, profiles);
  if ("error" in messengers) return { error: messengers.error, status: 400 as const };
  const share = asRecord(raw.shared) || {};
  const kind = raw.kind === "client" || existing?.kind === "client" ? "client" : "internal";
  const customerTeamId = typeof raw.customerTeamId === "string" ? raw.customerTeamId.slice(0, 80) : existing?.customerTeamId || null;
  const linked = await membersFromCustomerTeam(customerTeamId, profiles);
  const group: PeopleGroup = {
    id: existing?.id || `group-${Date.now().toString(36)}`,
    name: String(raw.name || existing?.name || "Group").replace(/\s+/g, " ").trim().slice(0, 80) || "Group",
    kind,
    customerTeamId: customerTeamId || null,
    memberProfileIds: linked?.ids || members.ids,
    memberUids: linked?.uids || members.uids,
    canMessageProfileIds: messengers.ids,
    canMessageUids: messengers.uids,
    shared: {
      projects: share.projects !== false,
      orders: share.orders !== false,
      listings: share.listings !== false,
      billing: kind === "client" ? share.billing !== false : share.billing === true,
    },
    color: existing?.color || (kind === "client" ? "#0f766e" : "#0d9488"),
    preview: existing?.preview === true,
    sampleProjects: existing?.sampleProjects || [],
  };
  if (group.preview || !firestoreOn()) overlay.groups.set(group.id, group);
  else await db().collection("peopleGroups").doc(group.id).set(group);
  await syncGroupIndex(group, profiles);
  return { group };
}

function arrayOf(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40);
}

function resolveProfiles(ids: string[], profiles: PersonProfile[]): { ids: string[]; uids: string[] } | { error: string } {
  const uids: string[] = [];
  for (const id of ids) {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return { error: "One of the people on this group was not found." };
    if (!profile.uid) return { error: `${profile.displayName} does not have a login yet.` };
    uids.push(profile.uid);
  }
  return { ids, uids };
}

async function membersFromCustomerTeam(teamId: string | null, profiles: PersonProfile[]): Promise<{ ids: string[]; uids: string[] } | null> {
  if (!teamId || !firestoreOn()) return null;
  const snap = await db().collection("customerTeams").doc(teamId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const uids = Array.isArray(data.memberUids) ? data.memberUids.map((uid) => String(uid)) : [];
  const ids = uids.map((uid) => {
    const profile = profiles.find((item) => item.uid === uid);
    return profile?.id || `client:${uid}`;
  });
  return { ids, uids };
}

async function syncGroupIndex(group: PeopleGroup, profiles: PersonProfile[]): Promise<void> {
  for (const profile of profiles) {
    const should = group.memberProfileIds.includes(profile.id);
    const has = profile.groupIds.includes(group.id);
    if (should === has) continue;
    const groupIds = should ? [...profile.groupIds, group.id] : profile.groupIds.filter((id) => id !== group.id);
    await persistProfile({ ...profile, groupIds });
  }
}

export async function inboxFor(actor: DeskActor, folder: InboxFolder) {
  const blocked = deny(actor, "messages.view");
  if (blocked) return { error: blocked, status: 403 as const };
  if (folder === "all-groups" && !actor.leadAdmin) return { error: "Only a lead admin can open every group thread.", status: 403 as const };
  const threads = threadsForFolder(await loadThreads(), actor, folder);
  return { threads, preview: previewOn(), external: false };
}

export async function saveInboxDraft(actor: DeskActor, input: ComposeInput) {
  const blocked = deny(actor, "messages.compose");
  if (blocked) return { error: blocked, status: 403 as const };
  const draft = buildDraft(actor, input);
  draft.preview = previewOn();
  await persistThread(draft);
  return { thread: draft, external: false as const };
}

export async function sendInbox(actor: DeskActor, input: ComposeInput) {
  const blocked = deny(actor, "messages.compose");
  if (blocked) return { error: blocked, status: 403 as const };
  const profiles = await loadProfiles();
  const groups = await loadGroups();
  let request = input;
  if (input.threadId) {
    const existing = (await loadThreads()).find((thread) => thread.id === input.threadId);
    if (!existing || existing.ownerUid !== actor.uid || existing.status !== "draft") {
      return { error: "That draft is not yours to send.", status: 404 as const };
    }
    request = {
      threadId: existing.id,
      subject: input.subject || existing.subject,
      body: input.body || existing.body,
      profileIds: input.profileIds?.length ? input.profileIds : existing.recipientProfileIds,
      groupId: input.groupId || existing.groupId || undefined,
    };
  }
  const built = buildOutbound(actor, request, profiles, groups);
  if (built.ok === false) return { error: built.error, status: 400 as const };
  if (input.groupId || request.groupId) {
    const group = groups.find((item) => item.id === built.thread.groupId);
    if (group && !sameSet(built.thread.notifyUids, group.memberUids)) {
      return { error: "A group message can only be delivered to that group's members.", status: 400 as const };
    }
  }
  await persistThread(built.thread);
  return {
    thread: { ...built.thread, notified: built.thread.notifyUids.includes(actor.uid) },
    delivery: "in-app" as const,
    external: false as const,
    notifiedUids: built.thread.notifyUids,
  };
}

function sameSet(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort().join("|");
  const b = [...new Set(right)].sort().join("|");
  return a === b;
}

export async function visibleInboxThread(actor: DeskActor, id: string): Promise<InboxThread | null> {
  const thread = (await loadThreads()).find((item) => item.id === id);
  if (!thread) return null;
  const canSee = thread.ownerUid === actor.uid
    || thread.participantUids.includes(actor.uid)
    || (actor.leadAdmin && thread.kind === "group" && thread.status === "sent");
  return canSee ? thread : null;
}

/**
 * Append an in-app note. Group membership and notifyUids stay as they are.
 * A lead admin who is only reading the thread is not added and is not notified.
 */
export async function replyInbox(actor: DeskActor, id: string, body: string) {
  const blocked = deny(actor, "messages.compose");
  if (blocked) return { error: blocked, status: 403 as const };
  const text = body.trim();
  if (!text) return { error: "Write a reply first.", status: 400 as const };
  if (text.length > 2000) return { error: "Reply is too long. Please keep it under 2,000 characters.", status: 400 as const };
  const thread = await visibleInboxThread(actor, id);
  if (!thread || thread.status !== "sent" || !thread.participantUids.includes(actor.uid)) {
    return { error: "Message not found.", status: 404 as const };
  }
  const profiles = await loadProfiles();
  const sender = profiles.find((profile) => profile.uid === actor.uid) || null;
  const now = new Date().toISOString();
  const note = {
    id: `note-${randomBytes(4).toString("hex")}`,
    senderUid: actor.uid,
    senderProfileId: sender?.id || profileId(actor.kind === "client" ? "client" : "staff", actor.uid),
    senderName: sender?.displayName || actor.email || "Iconic",
    body: text,
    at: now,
  };
  const next: InboxThread = {
    ...thread,
    body: text,
    messages: [...thread.messages, note],
    notifyUids: thread.notifyUids,
    participantUids: thread.participantUids,
    updatedAt: now,
  };
  await persistThread(next);
  return {
    thread: { ...next, notified: next.notifyUids.includes(actor.uid) },
    delivery: "in-app" as const,
    external: false as const,
  };
}

export async function moveInbox(actor: DeskActor, id: string, folder: "inbox" | "archived" | "trash" | "purge") {
  const blocked = deny(actor, "messages.view");
  if (blocked) return { error: blocked, status: 403 as const };
  const thread = (await loadThreads()).find((item) => item.id === id);
  if (!thread) return { error: "Message not found.", status: 404 as const };
  const canSee = thread.ownerUid === actor.uid || thread.participantUids.includes(actor.uid) || (actor.leadAdmin && thread.kind === "group");
  if (!canSee) return { error: "Message not found.", status: 404 as const };
  const next = applyFolder(thread, actor.uid, folder);
  if (next === "delete") {
    overlay.hiddenThreadIds.add(thread.id);
    if (!thread.preview && firestoreOn()) await db().collection("inboxThreads").doc(thread.id).delete();
    return { ok: true, deleted: true, external: false as const };
  }
  await persistThread(next);
  return { thread: next, external: false as const };
}

async function persistThread(thread: InboxThread): Promise<void> {
  if (thread.preview || !firestoreOn()) {
    overlay.threads.set(thread.id, thread);
    overlay.hiddenThreadIds.delete(thread.id);
    return;
  }
  await db().collection("inboxThreads").doc(thread.id).set(thread);
}

export function actorFromStaff(uid: string, email: string, role: string, permissions: unknown): DeskActor {
  const staffRole: PersonRole = isStaffRole(role) ? role : "photographer";
  return {
    uid,
    email: email.toLowerCase(),
    kind: "staff",
    role: staffRole,
    leadAdmin: staffRole === "admin",
    permissions: permissions ? sanitizePermissions(permissions) : null,
  };
}

export async function resolveDeskActor(uid: string, email: string): Promise<DeskActor | null> {
  const override = peopleActorOverride();
  if (override) return override;
  if (!uid) return null;
  if (uid === "temp-admin-uid") {
    const saved = (await loadProfiles()).find((profile) => profile.kind === "staff" && profile.sourceId === uid);
    return actorFromStaff(uid, email || "temp-admin@iconicimagestx.com", saved?.role || "admin", saved?.permissions || null);
  }
  if (firestoreOn()) {
    const snap = await db().collection("staff").doc(uid).get();
    if (snap.exists) {
      const data = snap.data() || {};
      if (!isActiveStaffRecord(data)) return null;
      return actorFromStaff(uid, email || String(data.email || ""), String(data.role || ""), data.permissions);
    }
    return actorFromClient(uid, email);
  }
  const known = (await loadProfiles()).find((profile) => profile.uid === uid && profile.kind === "staff");
  if (known) return actorFromStaff(uid, email || known.email, known.role, known.permissions);
  return actorFromClient(uid, email);
}

export function actorFromClient(uid: string, email: string): DeskActor {
  return {
    uid,
    email: email.toLowerCase(),
    kind: "client",
    role: "client",
    leadAdmin: false,
    permissions: null,
  };
}

/**
 * Client hub settings stored on the customer record, customerTeams,
 * agentContacts, and clientBilling. Admin SDK writes. Callers pass the
 * signed-in uid; hubAllows decides what that uid can touch.
 */

import { randomBytes } from "node:crypto";
import admin from "firebase-admin";
import { buildClientInvoice, buildClientListing, type ClientInvoiceStatement, type ClientListingCard } from "../../shared/clientHome";
import {
  accountBalanceCents,
  containsRawCard,
  grantFromMembers,
  hubAllows,
  hubEmail,
  hubImageUrl,
  normalizePermissions,
  profileDisplayName,
  profileFromClient,
  sanitizeBilling,
  sanitizeContact,
  sanitizeProfilePatch,
  shareContactsFromListing,
  teamInviteDelivery,
  type AgentContactRecord,
  type BillingProfile,
  type CardOnFile,
  type ClientHubProfile,
  type CreditEntry,
  type CustomerTeamRecord,
  type HubGrant,
  type TeamMemberRecord,
} from "../../shared/clientHubSettings";
import { sendEmail } from "./email";

export class HubError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface HubActor {
  uid: string;
  email: string;
  clientId: string;
  client: Record<string, unknown>;
  profile: ClientHubProfile;
  ownedTeam: CustomerTeamRecord | null;
  membership: TeamMemberRecord | null;
  grant: HubGrant | null;
}

type Memory = {
  clients: Map<string, Record<string, unknown>>;
  teams: Map<string, Record<string, unknown>>;
  members: Map<string, Record<string, unknown>>;
  contacts: Map<string, Record<string, unknown>>;
  billing: Map<string, Record<string, unknown>>;
  listings: Map<string, Record<string, unknown>>;
  orders: Map<string, Record<string, unknown>>;
  invoices: Map<string, Record<string, unknown>>;
};

const memory: Memory = {
  clients: new Map(),
  teams: new Map(),
  members: new Map(),
  contacts: new Map(),
  billing: new Map(),
  listings: new Map(),
  orders: new Map(),
  invoices: new Map(),
};

export function resetClientHubMemory() {
  for (const bucket of Object.values(memory)) bucket.clear();
}

export function seedClientHubMemory(collection: keyof Memory, id: string, data: Record<string, unknown>) {
  memory[collection].set(id, { ...data });
}

function useMemory(): boolean {
  return !admin.apps.length || process.env.CLIENT_HUB_STORE === "memory";
}

function db() {
  return admin.firestore();
}

function nowStamp() {
  return useMemory() ? new Date().toISOString() : admin.firestore.FieldValue.serverTimestamp();
}

function newId(): string {
  return randomBytes(9).toString("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function readDoc(collection: keyof Memory, id: string): Promise<Record<string, unknown> | null> {
  if (useMemory()) return memory[collection].get(id) || null;
  const snap = await db().collection(collectionName(collection)).doc(id).get();
  return snap.exists ? { ...(snap.data() || {}) } : null;
}

async function writeDoc(collection: keyof Memory, id: string, data: Record<string, unknown>, merge = true) {
  if (useMemory()) {
    memory[collection].set(id, merge ? { ...(memory[collection].get(id) || {}), ...data } : { ...data });
    return;
  }
  await db().collection(collectionName(collection)).doc(id).set(data, { merge });
}

function collectionName(collection: keyof Memory): string {
  if (collection === "teams") return "customerTeams";
  if (collection === "members") return "customerTeamMembers";
  if (collection === "contacts") return "agentContacts";
  if (collection === "billing") return "clientBilling";
  if (collection === "orders") return "orderRequests";
  return collection;
}

async function queryEqual(collection: keyof Memory, field: string, value: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  if (useMemory()) {
    return [...memory[collection].entries()]
      .filter(([, row]) => row[field] === value)
      .map(([id, row]) => ({ id, data: row }));
  }
  const snap = await db().collection(collectionName(collection)).where(field, "==", value).limit(50).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
}

function teamFrom(id: string, data: Record<string, unknown>): CustomerTeamRecord {
  const list = (key: string) => Array.isArray(data[key]) ? data[key].filter((item): item is string => typeof item === "string") : [];
  return {
    id,
    ownerClientId: String(data.ownerClientId || ""),
    name: String(data.name || "Team"),
    logoUrl: hubImageUrl(data.logoUrl),
    memberUids: list("memberUids"),
    adminUids: list("adminUids"),
    billingUids: list("billingUids"),
    orderUids: list("orderUids"),
    viewUids: list("viewUids"),
    downloadUids: list("downloadUids"),
  };
}

function memberFrom(id: string, data: Record<string, unknown>): TeamMemberRecord {
  return {
    id,
    teamId: String(data.teamId || ""),
    ownerClientId: String(data.ownerClientId || ""),
    name: String(data.name || ""),
    email: hubEmail(data.email),
    phone: String(data.phone || ""),
    permissions: normalizePermissions(data.permissions),
    logoUrl: hubImageUrl(data.logoUrl),
    status: data.status === "active" ? "active" : "invited",
    linkedClientId: typeof data.linkedClientId === "string" ? data.linkedClientId : "",
    inviteEmail: data.inviteEmail === "sent" ? "sent" : data.inviteEmail === "not_sent" ? "not_sent" : "paused",
  };
}

function contactFrom(id: string, data: Record<string, unknown>): AgentContactRecord {
  const contact = sanitizeContact(data, String(data.ownerClientId || ""), String(data.teamId || ""));
  return { id, ...contact, source: data.source === "share" || data.source === "import" ? data.source : contact.source };
}

function billingFrom(data: Record<string, unknown> | null): BillingProfile {
  const source = data || {};
  const contact = sanitizeBilling(source);
  const card = asRecord(source.card);
  const last4 = typeof card.last4 === "string" ? card.last4 : "";
  const credits = Array.isArray(source.credits) ? source.credits.slice(0, 50).map((entry, index) => {
    const row = asRecord(entry);
    const cents = Math.round(Number(row.cents) || 0);
    return {
      id: typeof row.id === "string" ? row.id : `credit-${index + 1}`,
      at: typeof row.at === "string" ? row.at : "",
      label: typeof row.label === "string" ? row.label.slice(0, 120) : "Credit",
      cents,
      kind: row.kind === "debit" ? "debit" : "credit",
    } satisfies CreditEntry;
  }) : [];
  return {
    ...contact,
    card: /^\d{4}$/.test(last4) ? {
      brand: String(card.brand || "Card"),
      last4,
      expMonth: Number(card.expMonth) || 0,
      expYear: Number(card.expYear) || 0,
      squareCardId: String(card.squareCardId || ""),
      squareCustomerId: String(card.squareCustomerId || source.squareCustomerId || ""),
    } : null,
    balanceCents: Math.round(Number(source.balanceCents) || 0),
    creditsCents: credits.length
      ? credits.reduce((sum, entry) => sum + (entry.kind === "debit" ? -entry.cents : entry.cents), 0)
      : Math.round(Number(source.creditsCents) || 0),
    credits,
  };
}

export async function loadActor(uid: string, email: string): Promise<HubActor> {
  const clientId = uid;
  const stored = await readDoc("clients", clientId);
  const client = stored || { firstName: "", lastName: "", email: hubEmail(email) };
  const profile = profileFromClient(client);
  if (!profile.email) profile.email = hubEmail(email);
  const ownedRows = await queryEqual("teams", "ownerClientId", clientId);
  const ownedTeam = ownedRows[0] ? teamFrom(ownedRows[0].id, ownedRows[0].data) : null;
  const byUid = await queryEqual("members", "linkedClientId", clientId);
  const byEmail = profile.email ? await queryEqual("members", "email", profile.email) : [];
  const memberRow = byUid[0] || byEmail.find((row) => row.data.ownerClientId !== clientId) || null;
  let membership = memberRow ? memberFrom(memberRow.id, memberRow.data) : null;
  if (membership && !membership.linkedClientId) {
    membership = { ...membership, linkedClientId: clientId, status: "active" };
    await writeDoc("members", membership.id, { linkedClientId: clientId, status: "active", updatedAt: nowStamp() });
  }
  let grant: HubGrant | null = null;
  if (membership) {
    const members = await queryEqual("members", "teamId", membership.teamId);
    grant = grantFromMembers(membership.ownerClientId, membership.teamId, members.map((row) => memberFrom(row.id, row.data)));
  }
  return { uid, email: hubEmail(email) || profile.email, clientId, client, profile, ownedTeam, membership, grant };
}

function assert(ok: boolean, status: number, message: string) {
  if (!ok) throw new HubError(status, message);
}

function accessFor(actor: HubActor) {
  const team = actor.ownedTeam;
  const membership = actor.membership;
  return {
    clientId: actor.clientId,
    canOrder: true,
    team: team ? {
      id: team.id,
      ownerClientId: team.ownerClientId,
      role: "owner" as const,
      canAdmin: true,
      canBilling: true,
      canView: true,
    } : membership ? {
      id: membership.teamId,
      ownerClientId: membership.ownerClientId,
      role: membership.permissions.includes("admin") ? "admin" as const : "member" as const,
      canAdmin: membership.permissions.includes("admin"),
      canBilling: membership.permissions.includes("billing") || membership.permissions.includes("admin"),
      canView: membership.permissions.includes("view") || membership.permissions.includes("admin"),
    } : null,
  };
}

export async function getProfile(actor: HubActor) {
  return { profile: actor.profile, access: accessFor(actor) };
}

export async function saveProfile(actor: HubActor, input: unknown) {
  if (containsRawCard(input)) throw new HubError(400, "Card numbers are not stored on the profile.");
  const profile = sanitizeProfilePatch(input, actor.email || actor.profile.email);
  if (!profile.firstName) throw new HubError(400, "First name is required.");
  await writeDoc("clients", actor.clientId, {
    firebaseUid: actor.uid,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    email: actor.email || actor.profile.email || profile.email,
    company: profile.brokerage,
    hubProfile: profile,
    portalAccess: true,
    status: actor.client.status || "active",
    updatedAt: nowStamp(),
  });
  await stampOwnedListings(actor.clientId, profile);
  return { profile };
}

async function stampOwnedListings(clientId: string, profile: ClientHubProfile) {
  const listings = await queryEqual("listings", "clientId", clientId);
  for (const listing of listings.slice(0, 40)) {
    const patch: Record<string, unknown> = { clientHubProfile: profile, updatedAt: nowStamp() };
    if (!listing.data.agentName && profileDisplayName(profile)) patch.agentName = profileDisplayName(profile);
    if (!listing.data.agentPhone && profile.phone) patch.agentPhone = profile.phone;
    if (!listing.data.agentEmail && profile.email) patch.agentEmail = profile.email;
    if (!listing.data.brokerage && !listing.data.brokerageName && profile.brokerage) patch.brokerage = profile.brokerage;
    await writeDoc("listings", listing.id, patch);
  }
}

export async function saveProfileAsset(actor: HubActor, kind: string, dataUrl: string): Promise<{ url: string }> {
  const allowed = new Set(["headshot", "companyLogo", "brokerageLogo", "teamLogo", "memberLogo"]);
  if (!allowed.has(kind)) throw new HubError(400, "That image is not a profile asset.");
  const parsed = parseImage(dataUrl);
  if (!parsed) throw new HubError(400, "Upload a JPEG, PNG, or WebP image under 700 KB.");
  const url = await storeImage(actor.clientId, kind, parsed);
  return { url };
}

function parseImage(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > 700_000) return null;
  return { mime: match[1].toLowerCase(), bytes };
}

async function storeImage(clientId: string, kind: string, image: { mime: string; bytes: Buffer }): Promise<string> {
  const ext = image.mime === "image/png" ? "png" : image.mime === "image/webp" ? "webp" : "jpg";
  const path = `client-hub/${clientId}/${kind}-${Date.now()}.${ext}`;
  if (useMemory()) return `data:${image.mime};base64,${image.bytes.toString("base64")}`;
  try {
    const bucket = admin.storage().bucket();
    const token = randomBytes(16).toString("hex");
    const file = bucket.file(path);
    await file.save(image.bytes, {
      contentType: image.mime,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch (err) {
    console.error("[Client hub] Image upload failed", err);
    throw new HubError(503, "Image storage is not configured yet.");
  }
}

async function membersOf(teamId: string): Promise<TeamMemberRecord[]> {
  const rows = await queryEqual("members", "teamId", teamId);
  return rows.map((row) => memberFrom(row.id, row.data));
}

async function teamBoard(team: CustomerTeamRecord) {
  const members = await membersOf(team.id);
  const ids = [...new Set([team.ownerClientId, ...members.map((member) => member.linkedClientId).filter(Boolean)])];
  const listings: ClientListingCard[] = [];
  const orders: Array<{ id: string; address: string; status: string; href: string; clientId: string }> = [];
  for (const clientId of ids.slice(0, 20)) {
    const listingRows = await queryEqual("listings", "clientId", clientId);
    listingRows.forEach((row) => listings.push(buildClientListing(row.id, row.data)));
    const orderRows = await queryEqual("orders", "clientId", clientId);
    orderRows.forEach((row) => {
      const listingId = typeof row.data.listingId === "string" ? row.data.listingId : "";
      orders.push({
        id: row.id,
        address: String(row.data.address || row.data.shootLocation || "Order"),
        status: String(row.data.status || "new"),
        href: listingId ? `/portal/listings/${listingId}` : "/portal/settings/billing",
        clientId,
      });
    });
  }
  return { team, members, listings, orders };
}

export async function getTeam(actor: HubActor) {
  if (actor.ownedTeam) return { ...(await teamBoard(actor.ownedTeam)), access: accessFor(actor) };
  if (!actor.membership || !actor.grant) return { team: null, members: [], listings: [], orders: [], access: accessFor(actor) };
  assert(hubAllows({ uid: actor.uid, action: "read", section: "team", ownerClientId: actor.membership.ownerClientId, grant: actor.grant }), 403, "You do not have access to this team.");
  const stored = await readDoc("teams", actor.membership.teamId);
  if (!stored) return { team: null, members: [], listings: [], orders: [], access: accessFor(actor) };
  return { ...(await teamBoard(teamFrom(actor.membership.teamId, stored))), access: accessFor(actor) };
}

function teamOwnerId(actor: HubActor): string {
  return actor.ownedTeam?.ownerClientId || actor.membership?.ownerClientId || actor.clientId;
}

function requireTeamAdmin(actor: HubActor, ownerClientId: string) {
  if (actor.clientId === ownerClientId) return;
  assert(Boolean(actor.grant && hubAllows({ uid: actor.uid, action: "write", section: "team", ownerClientId, grant: actor.grant })), 403, "You do not have permission to edit this team.");
}

export async function saveTeam(actor: HubActor, input: unknown) {
  const row = asRecord(input);
  const name = String(row.name || "").trim().slice(0, 80);
  if (!name) throw new HubError(400, "Team name is required.");
  const logoUrl = hubImageUrl(row.logoUrl);
  if (actor.ownedTeam) {
    await writeDoc("teams", actor.ownedTeam.id, { name, logoUrl, updatedAt: nowStamp() });
    return getTeam(actor);
  }
  if (actor.membership) {
    requireTeamAdmin(actor, actor.membership.ownerClientId);
    await writeDoc("teams", actor.membership.teamId, { name, logoUrl, updatedAt: nowStamp() });
    return getTeam(actor);
  }
  const id = newId();
  await writeDoc("teams", id, {
    ownerClientId: actor.clientId,
    name,
    logoUrl,
    memberUids: [],
    adminUids: [],
    billingUids: [],
    orderUids: [],
    viewUids: [],
    downloadUids: [],
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
  }, false);
  actor.ownedTeam = teamFrom(id, { ownerClientId: actor.clientId, name, logoUrl });
  return getTeam(actor);
}

async function refreshGrant(teamId: string, ownerClientId: string) {
  const members = await membersOf(teamId);
  const grant = grantFromMembers(ownerClientId, teamId, members);
  await writeDoc("teams", teamId, { ...grant, updatedAt: nowStamp() });
  const contacts = await queryEqual("contacts", "ownerClientId", ownerClientId);
  const readerUids = [...new Set([ownerClientId, ...grant.viewUids, ...grant.adminUids])];
  const editorUids = [...new Set([ownerClientId, ...grant.adminUids])];
  for (const contact of contacts.slice(0, 200)) {
    await writeDoc("contacts", contact.id, { readerUids, editorUids });
  }
  const billing = await readDoc("billing", ownerClientId);
  if (billing) {
    await writeDoc("billing", ownerClientId, {
      readerUids: [...new Set([ownerClientId, ...grant.billingUids, ...grant.adminUids])],
    });
  }
}

export async function addTeamMember(actor: HubActor, input: unknown, invite: boolean) {
  const board = await ensureTeam(actor);
  requireTeamAdmin(actor, board.team.ownerClientId);
  const row = asRecord(input);
  const name = String(row.name || "").trim().slice(0, 120);
  const email = hubEmail(row.email);
  if (!name || !email) throw new HubError(400, "Name and email are required.");
  const id = newId();
  const member: TeamMemberRecord = {
    id,
    teamId: board.team.id,
    ownerClientId: board.team.ownerClientId,
    name,
    email,
    phone: String(row.phone || "").trim().slice(0, 40),
    permissions: normalizePermissions(row.permissions),
    logoUrl: hubImageUrl(row.logoUrl),
    status: "invited",
    linkedClientId: "",
    inviteEmail: "not_sent",
  };
  await writeDoc("members", id, { ...member, createdAt: nowStamp(), updatedAt: nowStamp() }, false);
  await refreshGrant(board.team.id, board.team.ownerClientId);
  if (invite) return sendTeamInvite(actor, id);
  return getTeam(actor);
}

async function ensureTeam(actor: HubActor) {
  const current = await getTeam(actor);
  if (current.team) return current as typeof current & { team: CustomerTeamRecord };
  await saveTeam(actor, { name: "My team" });
  const created = await getTeam(actor);
  if (!created.team) throw new HubError(500, "The team could not be created.");
  return created as typeof created & { team: CustomerTeamRecord };
}

export async function updateTeamMember(actor: HubActor, memberId: string, input: unknown) {
  const existing = await readDoc("members", memberId);
  if (!existing) throw new HubError(404, "Teammate not found.");
  const member = memberFrom(memberId, existing);
  requireTeamAdmin(actor, member.ownerClientId);
  const row = asRecord(input);
  const next = {
    name: String(row.name || member.name).trim().slice(0, 120),
    phone: String(row.phone ?? member.phone).trim().slice(0, 40),
    permissions: row.permissions ? normalizePermissions(row.permissions) : member.permissions,
    logoUrl: row.logoUrl !== undefined ? hubImageUrl(row.logoUrl) : member.logoUrl,
    updatedAt: nowStamp(),
  };
  await writeDoc("members", memberId, next);
  await refreshGrant(member.teamId, member.ownerClientId);
  return getTeam(await loadActor(actor.uid, actor.email));
}

export async function removeTeamMember(actor: HubActor, memberId: string) {
  const existing = await readDoc("members", memberId);
  if (!existing) throw new HubError(404, "Teammate not found.");
  const member = memberFrom(memberId, existing);
  requireTeamAdmin(actor, member.ownerClientId);
  if (useMemory()) memory.members.delete(memberId);
  else await db().collection("customerTeamMembers").doc(memberId).delete();
  await refreshGrant(member.teamId, member.ownerClientId);
  return getTeam(await loadActor(actor.uid, actor.email));
}

export async function sendTeamInvite(actor: HubActor, memberId: string) {
  const existing = await readDoc("members", memberId);
  if (!existing) throw new HubError(404, "Teammate not found.");
  const member = memberFrom(memberId, existing);
  requireTeamAdmin(actor, member.ownerClientId);
  const ownerName = profileDisplayName(actor.profile) || "Your team";
  let inviteEmail: TeamMemberRecord["inviteEmail"] = "paused";
  try {
    const result = await sendEmail({
      to: member.email,
      template: "team_invite",
      audience: "client",
      lockHtml: true,
      subject: `${ownerName} invited you to an Iconic Images team`,
      text: `${ownerName} added you to their Iconic Images team. Sign in at the client portal when you are ready.`,
      html: `<p>${ownerName} added you to their Iconic Images team.</p><p><a href="https://iconicimagestx.com/portal">Open the client portal</a></p>`,
    });
    inviteEmail = result.sent && teamInviteDelivery() === "send" ? "sent" : "paused";
  } catch (err) {
    console.error("[Client hub] Team invite failed", err);
    inviteEmail = "paused";
  }
  await writeDoc("members", memberId, { inviteEmail, status: "invited", updatedAt: nowStamp() });
  const team = await getTeam(await loadActor(actor.uid, actor.email));
  return { ...team, inviteEmail };
}

function crmOwner(actor: HubActor): { ownerClientId: string; teamId: string; grant: HubGrant | null } {
  if (actor.membership && actor.grant) {
    return { ownerClientId: actor.membership.ownerClientId, teamId: actor.membership.teamId, grant: actor.grant };
  }
  return { ownerClientId: actor.clientId, teamId: actor.ownedTeam?.id || "", grant: null };
}

function assertCrm(actor: HubActor, action: "read" | "write") {
  const scope = crmOwner(actor);
  assert(hubAllows({
    uid: actor.uid,
    action,
    section: "clients",
    ownerClientId: scope.ownerClientId,
    grant: scope.grant,
  }), 403, "You do not have permission to use these clients.");
  return scope;
}

export async function listContacts(actor: HubActor) {
  const scope = assertCrm(actor, "read");
  const stored = await queryEqual("contacts", "ownerClientId", scope.ownerClientId);
  const contacts = stored.map((row) => contactFrom(row.id, row.data));
  const listings = await queryEqual("listings", "clientId", scope.ownerClientId);
  const shares = listings.flatMap((listing) => shareContactsFromListing({ id: listing.id, ...listing.data }, scope.ownerClientId));
  const seen = new Set(contacts.map((contact) => contact.email).filter(Boolean));
  for (const share of shares) {
    if (share.email && seen.has(share.email)) continue;
    contacts.push({ id: `share:${share.shareRef}`, ...share, teamId: scope.teamId });
  }
  return { contacts, access: accessFor(actor) };
}

export async function saveContact(actor: HubActor, contactId: string | null, input: unknown) {
  const scope = assertCrm(actor, "write");
  if (containsRawCard(input)) throw new HubError(400, "Card numbers are not stored on a contact.");
  const contact = sanitizeContact(input, scope.ownerClientId, scope.teamId);
  if (!contact.name) throw new HubError(400, "Name is required.");
  const id = contactId || newId();
  if (contactId) {
    const existing = await readDoc("contacts", contactId);
    if (!existing || existing.ownerClientId !== scope.ownerClientId) throw new HubError(404, "Contact not found.");
  }
  const grant = scope.grant;
  const readerUids = [...new Set([scope.ownerClientId, ...(grant?.viewUids || []), ...(grant?.adminUids || [])])];
  const editorUids = [...new Set([scope.ownerClientId, ...(grant?.adminUids || [])])];
  await writeDoc("contacts", id, { ...contact, readerUids, editorUids, updatedAt: nowStamp(), ...(contactId ? {} : { createdAt: nowStamp() }) }, Boolean(contactId));
  return { contact: { id, ...contact } };
}

export async function deleteContact(actor: HubActor, contactId: string) {
  const scope = assertCrm(actor, "write");
  const existing = await readDoc("contacts", contactId);
  if (!existing || existing.ownerClientId !== scope.ownerClientId) throw new HubError(404, "Contact not found.");
  if (useMemory()) memory.contacts.delete(contactId);
  else await db().collection("agentContacts").doc(contactId).delete();
  return { ok: true };
}

export async function importContacts(actor: HubActor, contacts: Array<Omit<AgentContactRecord, "id">>) {
  const scope = assertCrm(actor, "write");
  const saved: AgentContactRecord[] = [];
  for (const contact of contacts.slice(0, 200)) {
    const row = await saveContact(actor, null, { ...contact, ownerClientId: scope.ownerClientId });
    saved.push(row.contact);
  }
  return { contacts: saved };
}

function billingOwner(actor: HubActor, requested: string): string {
  const ownerClientId = requested || actor.clientId;
  if (ownerClientId === actor.clientId) return ownerClientId;
  assert(hubAllows({
    uid: actor.uid,
    action: "read",
    section: "billing",
    ownerClientId,
    grant: actor.grant,
  }), 403, "You do not have billing permission for that account.");
  return ownerClientId;
}

export async function getBilling(actor: HubActor, requestedOwner = "") {
  const ownerClientId = billingOwner(actor, requestedOwner);
  const stored = await readDoc("billing", ownerClientId);
  const billing = billingFrom(stored);
  const invoiceRows = await queryEqual("invoices", "clientId", ownerClientId);
  const invoices = invoiceRows.map((row) => buildClientInvoice(row.id, row.data));
  billing.balanceCents = accountBalanceCents(invoices, billing.balanceCents);
  const payments = invoices
    .filter((invoice) => (invoice.amountPaid || 0) > 0)
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      amount: invoice.amountPaid,
      issuedOn: invoice.issuedOn,
    }));
  return {
    billing: publicBillingShape(billing),
    invoices,
    payments,
    access: accessFor(actor),
    ownerClientId,
  };
}

function publicBillingShape(billing: BillingProfile) {
  return {
    ...billing,
    card: billing.card ? {
      brand: billing.card.brand,
      last4: billing.card.last4,
      expMonth: billing.card.expMonth,
      expYear: billing.card.expYear,
    } : null,
    square: {
      applicationId: process.env.SQUARE_APPLICATION_ID || process.env.VITE_SQUARE_APPLICATION_ID || "",
      locationId: process.env.SQUARE_LOCATION_ID || "",
      environment: process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
    },
  };
}

export async function saveBilling(actor: HubActor, requestedOwner: string, input: unknown) {
  const ownerClientId = requestedOwner || actor.clientId;
  assert(hubAllows({
    uid: actor.uid,
    action: "write",
    section: "billing",
    ownerClientId,
    grant: ownerClientId === actor.clientId ? null : actor.grant,
  }), 403, "You do not have billing permission for that account.");
  if (containsRawCard(input)) throw new HubError(400, "Card numbers are not stored. Use the Square card form.");
  const contact = sanitizeBilling(input);
  const existing = billingFrom(await readDoc("billing", ownerClientId));
  const grant = ownerClientId === actor.clientId ? null : actor.grant;
  const readerUids = [...new Set([ownerClientId, ...(grant?.billingUids || []), ...(grant?.adminUids || [])])];
  await writeDoc("billing", ownerClientId, {
    ownerClientId,
    ...contact,
    readerUids,
    updatedAt: nowStamp(),
  });
  return getBilling(actor, ownerClientId === actor.clientId ? "" : ownerClientId);
}

export async function saveCard(actor: HubActor, requestedOwner: string, card: CardOnFile) {
  const ownerClientId = requestedOwner || actor.clientId;
  assert(hubAllows({
    uid: actor.uid,
    action: "write",
    section: "billing",
    ownerClientId,
    grant: ownerClientId === actor.clientId ? null : actor.grant,
  }), 403, "You do not have billing permission for that account.");
  const existing = await readDoc("billing", ownerClientId);
  await writeDoc("billing", ownerClientId, {
    ownerClientId,
    ...(existing || sanitizeBilling({})),
    card: {
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      squareCardId: card.squareCardId,
      squareCustomerId: card.squareCustomerId,
    },
    squareCustomerId: card.squareCustomerId,
    updatedAt: nowStamp(),
  });
  return getBilling(actor, ownerClientId === actor.clientId ? "" : ownerClientId);
}

export type { ClientInvoiceStatement };

/**
 * A client note on one gallery photo, plus the staff sent/received timeline.
 * Saving a request does not invoice, charge, or notify the client.
 */

export const PHOTO_EDIT_NOTE_LIMIT = 2000;
export const PHOTO_EDIT_REQUEST_LIMIT = 100;

export const PHOTO_EDIT_REPLACEMENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoEditReplacementType = (typeof PHOTO_EDIT_REPLACEMENT_TYPES)[number];
export type PhotoEditRequestStatus = "requested" | "sent_out" | "received_back";

export interface PhotoEditTimelineEntry {
  status: PhotoEditRequestStatus;
  at: string;
  actor: "client" | "staff";
  actorId: string;
}

export interface PhotoEditReplacement {
  name: string;
  url: string;
  path: string;
  contentType: PhotoEditReplacementType;
  attachedAt: string;
  attachedBy: string;
}

export interface PhotoEditRequest {
  id: string;
  listingId: string;
  photoId: string;
  photoName: string;
  photoUrl: string;
  note: string;
  status: PhotoEditRequestStatus;
  timeline: PhotoEditTimelineEntry[];
  replacement: PhotoEditReplacement | null;
  clientId: string;
  createdAt: string;
  updatedAt: string;
}

export type PhotoEditWrite =
  | { ok: true; request: PhotoEditRequest; requests: PhotoEditRequest[] }
  | { ok: false; status: 400 | 404 | 409; error: string };

const STATUSES = new Set<PhotoEditRequestStatus>(["requested", "sent_out", "received_back"]);
const REPLACEMENT_TYPES = new Set<string>(PHOTO_EDIT_REPLACEMENT_TYPES);

function text(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function noteText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, PHOTO_EDIT_NOTE_LIMIT);
}

function stamp(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return "";
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function idText(value: unknown, limit = 80): string {
  const id = text(value, limit);
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : "";
}

function photoIdText(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim().slice(0, 180);
  if (!id || /[\u0000-\u001f]/.test(id)) return "";
  return id;
}

function sortRequests(requests: PhotoEditRequest[]): PhotoEditRequest[] {
  return [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

function timelineEntry(value: unknown): PhotoEditTimelineEntry | null {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!row || !STATUSES.has(row.status as PhotoEditRequestStatus)) return null;
  const at = stamp(row.at);
  const actorId = text(row.actorId, 128);
  if (!at || !actorId) return null;
  if (row.actor !== "client" && row.actor !== "staff") return null;
  return { status: row.status as PhotoEditRequestStatus, at, actor: row.actor, actorId };
}

function replacementEntry(value: unknown, listingId: string): PhotoEditReplacement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name, 180);
  const path = typeof row.path === "string" ? row.path.trim() : "";
  const contentType = typeof row.contentType === "string" ? row.contentType.trim().toLowerCase() : "";
  const attachedAt = stamp(row.attachedAt);
  const attachedBy = text(row.attachedBy, 128);
  const url = httpsUrl(row.url);
  if (!name || !attachedAt || !attachedBy || !url || !REPLACEMENT_TYPES.has(contentType)) return null;
  if (!replacementPath(listingId, path)) return null;
  return {
    name,
    url,
    path,
    contentType: contentType as PhotoEditReplacementType,
    attachedAt,
    attachedBy,
  };
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function replacementPath(listingId: string, storagePath: string): boolean {
  if (!listingId || storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `listings/${listingId}/replacements/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

function parseRequest(value: unknown): PhotoEditRequest | null {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!row) return null;
  const id = idText(row.id);
  const listingId = idText(row.listingId, 128) || text(row.listingId, 128);
  const photoId = photoIdText(row.photoId);
  const note = noteText(row.note);
  const clientId = text(row.clientId, 128);
  const createdAt = stamp(row.createdAt);
  const updatedAt = stamp(row.updatedAt);
  if (!id || !listingId || !photoId || !note || !clientId || !createdAt || !updatedAt) return null;
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(listingId)) return null;
  if (!STATUSES.has(row.status as PhotoEditRequestStatus)) return null;
  const timeline = Array.isArray(row.timeline)
    ? row.timeline.map(timelineEntry).filter((entry): entry is PhotoEditTimelineEntry => Boolean(entry))
    : [];
  if (timeline.length === 0) return null;
  return {
    id,
    listingId,
    photoId,
    photoName: text(row.photoName, 180) || "Photo",
    photoUrl: httpsUrl(row.photoUrl),
    note,
    status: row.status as PhotoEditRequestStatus,
    timeline,
    replacement: replacementEntry(row.replacement, listingId),
    clientId,
    createdAt,
    updatedAt,
  };
}

export function readPhotoEditRequests(value: unknown): PhotoEditRequest[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const requests: PhotoEditRequest[] = [];
  for (const item of value) {
    const request = parseRequest(item);
    if (!request || seen.has(request.id)) continue;
    seen.add(request.id);
    requests.push(request);
  }
  return sortRequests(requests);
}

export function photoEditStatusLabel(status: PhotoEditRequestStatus): string {
  if (status === "sent_out") return "Sent out";
  if (status === "received_back") return "Received back";
  return "Requested";
}

export function openPhotoEditForPhoto(requests: PhotoEditRequest[], photoId: string): PhotoEditRequest | null {
  return requests.find((request) => request.photoId === photoId && request.status !== "received_back") || null;
}

export function createPhotoEditRequest(input: {
  id: string;
  listingId: string;
  photoId: string;
  photoName: string;
  photoUrl?: string;
  note: string;
  clientId: string;
  at: string;
  knownPhotoIds: string[];
  existing: PhotoEditRequest[];
}): PhotoEditWrite {
  const id = idText(input.id);
  const listingId = text(input.listingId, 128);
  const photoId = photoIdText(input.photoId);
  const note = noteText(input.note);
  const clientId = text(input.clientId, 128);
  const at = stamp(input.at);
  if (!id) return { ok: false, status: 400, error: "Could not save that edit request." };
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(listingId)) return { ok: false, status: 400, error: "Listing id is not valid." };
  if (!photoId || !input.knownPhotoIds.includes(photoId)) {
    return { ok: false, status: 400, error: "That photo is not on this listing." };
  }
  if (!note) return { ok: false, status: 400, error: "Add a note for the change you want." };
  if (!clientId) return { ok: false, status: 400, error: "Sign in again before requesting an edit." };
  if (!at) return { ok: false, status: 400, error: "Could not save that edit request." };
  if (input.existing.length >= PHOTO_EDIT_REQUEST_LIMIT) {
    return { ok: false, status: 409, error: "This listing already has the maximum number of photo edit requests." };
  }
  if (openPhotoEditForPhoto(input.existing, photoId)) {
    return { ok: false, status: 409, error: "This photo already has an open edit request." };
  }

  const request: PhotoEditRequest = {
    id,
    listingId,
    photoId,
    photoName: text(input.photoName, 180) || "Photo",
    photoUrl: httpsUrl(input.photoUrl),
    note,
    status: "requested",
    timeline: [{ status: "requested", at, actor: "client", actorId: clientId }],
    replacement: null,
    clientId,
    createdAt: at,
    updatedAt: at,
  };
  return { ok: true, request, requests: sortRequests([...input.existing, request]) };
}

export function advancePhotoEditRequest(input: {
  requests: PhotoEditRequest[];
  requestId: string;
  to: "sent_out" | "received_back";
  actorId: string;
  at: string;
}): PhotoEditWrite {
  const requestId = idText(input.requestId);
  const actorId = text(input.actorId, 128);
  const at = stamp(input.at);
  if (!requestId || !actorId || !at) return { ok: false, status: 400, error: "Could not update that edit request." };
  const current = input.requests.find((request) => request.id === requestId);
  if (!current) return { ok: false, status: 404, error: "Edit request not found." };
  if (input.to === "sent_out" && current.status !== "requested") {
    return {
      ok: false,
      status: 400,
      error: current.status === "sent_out" ? "This request is already sent out." : "This request is already received back.",
    };
  }
  if (input.to === "received_back" && current.status !== "sent_out") {
    return {
      ok: false,
      status: 400,
      error: current.status === "requested"
        ? "Mark this request sent out before marking it received back."
        : "This request is already received back.",
    };
  }
  const request: PhotoEditRequest = {
    ...current,
    status: input.to,
    updatedAt: at,
    timeline: [...current.timeline, { status: input.to, at, actor: "staff", actorId }],
  };
  return {
    ok: true,
    request,
    requests: sortRequests(input.requests.map((item) => item.id === request.id ? request : item)),
  };
}

export function attachPhotoEditReplacement(input: {
  requests: PhotoEditRequest[];
  requestId: string;
  listingId: string;
  replacement: PhotoEditReplacement;
}): PhotoEditWrite {
  const requestId = idText(input.requestId);
  const current = input.requests.find((request) => request.id === requestId);
  if (!current) return { ok: false, status: 404, error: "Edit request not found." };
  if (current.listingId !== input.listingId) return { ok: false, status: 404, error: "Edit request not found." };
  const replacement = replacementEntry(input.replacement, input.listingId);
  if (!replacement) return { ok: false, status: 400, error: "Attach a JPG, PNG, or WebP file." };
  const request: PhotoEditRequest = {
    ...current,
    replacement,
    updatedAt: replacement.attachedAt,
  };
  return {
    ok: true,
    request,
    requests: sortRequests(input.requests.map((item) => item.id === request.id ? request : item)),
  };
}

/**
 * Persists a per-photo edit request on the listing.
 * Does not invoice, charge, publish a gallery, or notify the client.
 */

import { randomUUID } from "crypto";
import admin from "firebase-admin";
import { safeStorageFileName } from "../../shared/listingAccess";
import {
  advancePhotoEditRequest,
  attachPhotoEditReplacement,
  createPhotoEditRequest,
  readPhotoEditRequests,
  replacementPath,
  type PhotoEditReplacementType,
  type PhotoEditRequest,
  type PhotoEditWrite,
} from "../../shared/photoEditRequest";
import { firebaseDownloadUrl } from "./listingMedia";

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.VITE_FIREBASE_STORAGE_BUCKET ||
  "iconic-images-aicon.firebasestorage.app";

const REPLACEMENT_LIMIT = 4_000_000;
const REPLACEMENT_TYPES = new Set<PhotoEditReplacementType>(["image/jpeg", "image/png", "image/webp"]);

export class PhotoEditRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const db = () => admin.firestore();

async function writeRequests(
  listingId: string,
  change: (current: PhotoEditRequest[]) => PhotoEditWrite,
): Promise<PhotoEditRequest> {
  const ref = db().collection("listings").doc(listingId);
  let saved: PhotoEditRequest | null = null;
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PhotoEditRequestError(404, "Listing not found.");
    const result = change(readPhotoEditRequests(snap.data()?.photoEditRequests));
    if (result.ok === false) throw new PhotoEditRequestError(result.status, result.error);
    tx.update(ref, {
      photoEditRequests: result.requests,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    saved = result.request;
  });
  if (!saved) throw new PhotoEditRequestError(500, "Could not save the photo edit request.");
  return saved;
}

export async function filePhotoEditRequest(input: {
  listingId: string;
  photoId: string;
  photoName: string;
  photoUrl?: string;
  note: string;
  clientId: string;
  knownPhotoIds: string[];
  at: string;
}): Promise<PhotoEditRequest> {
  return writeRequests(input.listingId, (existing) => createPhotoEditRequest({
    id: randomUUID(),
    listingId: input.listingId,
    photoId: input.photoId,
    photoName: input.photoName,
    photoUrl: input.photoUrl,
    note: input.note,
    clientId: input.clientId,
    at: input.at,
    knownPhotoIds: input.knownPhotoIds,
    existing,
  }));
}

export async function markPhotoEditRequest(input: {
  listingId: string;
  requestId: string;
  to: "sent_out" | "received_back";
  actorId: string;
  at: string;
}): Promise<PhotoEditRequest> {
  return writeRequests(input.listingId, (requests) => advancePhotoEditRequest({
    requests,
    requestId: input.requestId,
    to: input.to,
    actorId: input.actorId,
    at: input.at,
  }));
}

export function decodeReplacementBytes(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!trimmed || trimmed.length > 8_000_000 || !/^[A-Za-z0-9+/=]+$/.test(trimmed)) return null;
  const bytes = Buffer.from(trimmed, "base64");
  return bytes.length ? bytes : null;
}

export async function savePhotoEditReplacement(input: {
  listingId: string;
  requestId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  actorId: string;
  at: string;
}): Promise<PhotoEditRequest> {
  const contentType = input.contentType.trim().toLowerCase();
  if (!REPLACEMENT_TYPES.has(contentType as PhotoEditReplacementType)) {
    throw new PhotoEditRequestError(415, "Attach a JPG, PNG, or WebP file.");
  }
  if (!input.bytes.length) throw new PhotoEditRequestError(400, "The replacement file was empty.");
  if (input.bytes.length > REPLACEMENT_LIMIT) {
    throw new PhotoEditRequestError(413, "That replacement is over 4 MB.");
  }
  if (!admin.apps.length) {
    throw new PhotoEditRequestError(503, "File storage is not configured.");
  }

  const existing = await db().collection("listings").doc(input.listingId).get();
  if (!existing.exists) throw new PhotoEditRequestError(404, "Listing not found.");
  const known = readPhotoEditRequests(existing.data()?.photoEditRequests);
  if (!known.some((request) => request.id === input.requestId)) {
    throw new PhotoEditRequestError(404, "Edit request not found.");
  }

  const name = safeStorageFileName(input.fileName);
  const storagePath = `listings/${input.listingId}/replacements/${Date.now()}_${name}`;
  if (!replacementPath(input.listingId, storagePath)) {
    throw new PhotoEditRequestError(400, "Could not store that replacement.");
  }
  const token = randomUUID();
  const bucket = admin.storage().bucket(BUCKET);
  await bucket.file(storagePath).save(input.bytes, {
    resumable: false,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const url = firebaseDownloadUrl(bucket.name, storagePath, token);

  return writeRequests(input.listingId, (requests) => attachPhotoEditReplacement({
    requests,
    requestId: input.requestId,
    listingId: input.listingId,
    replacement: {
      name,
      url,
      path: storagePath,
      contentType: contentType as PhotoEditReplacementType,
      attachedAt: input.at,
      attachedBy: input.actorId,
    },
  }));
}

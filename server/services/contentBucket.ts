/**
 * Staff content library.
 *
 * Storage choice: Firebase Storage, the bucket already used for listing
 * uploads (FIREBASE_SERVICE_ACCOUNT + VITE_FIREBASE_STORAGE_BUCKET).
 * Cloudflare R2 is the preferred long-term object store, but this repo has
 * no R2 client or bucket, and adding one would ship a feature that cannot
 * run on the current Vercel preview. Objects stay under content-bucket/ so
 * gallery and listing paths are untouched.
 *
 * Metadata: Firestore collection `contentAssets`. Neon is the future system
 * of record; this collection is server-written with the Admin SDK.
 *
 * Public assets get a Firebase download-token URL. Staff-only assets get a
 * one-hour signed read URL and no published token.
 */

import { randomUUID } from "crypto";
import admin from "firebase-admin";
import {
  CONTENT_COLLECTION,
  CONTENT_LIST_LIMIT,
  buildContentStoragePath,
  contentKind,
  isContentAssetId,
  isContentBucketPath,
  matchesContentFilters,
  maxBytesForKind,
  presentContentAsset,
  type ContentAssetRecord,
  type ContentListQuery,
  type ContentPurpose,
  type ContentVisibility,
  type ContentWrite,
} from "../../shared/contentBucket";
import { jsonSafe } from "../lib/firestoreJson";
import { ensureBucketCors, firebaseDownloadUrl } from "./listingMedia";

const db = () => admin.firestore();
const bucket = () => admin.storage().bucket();

const READ_URL_TTL_MS = 60 * 60 * 1000;
const WRITE_URL_TTL_MS = 15 * 60 * 1000;

export async function createContentUploadUrl(assetId: string, write: ContentWrite) {
  await ensureBucketCors();
  const storagePath = buildContentStoragePath(assetId, write.purpose, write.fileName);
  const file = bucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + WRITE_URL_TTL_MS,
    contentType: write.contentType,
  });
  return {
    assetId,
    uploadUrl,
    storagePath,
    contentType: write.contentType,
    expiresAt: new Date(Date.now() + WRITE_URL_TTL_MS).toISOString(),
  };
}

export async function saveContentBytes(assetId: string, write: ContentWrite, bytes: Buffer) {
  if (!bytes.length) {
    throw Object.assign(new Error("Upload body was empty."), { status: 400 });
  }
  if (write.sizeBytes != null && bytes.length > maxBytesForKind(write.kind)) {
    throw Object.assign(new Error("File is too large."), { status: 413 });
  }
  const storagePath = buildContentStoragePath(assetId, write.purpose, write.fileName);
  await bucket().file(storagePath).save(bytes, {
    resumable: false,
    metadata: { contentType: write.contentType },
  });
  return storagePath;
}

export async function registerContentAsset(options: {
  assetId: string;
  storagePath: string;
  write: ContentWrite;
  uploadedBy: string;
  uploadedByEmail?: string;
}) {
  const { assetId, storagePath, write, uploadedBy } = options;
  if (!isContentBucketPath(assetId, write.purpose, storagePath)) {
    throw Object.assign(new Error("Storage path is not inside this content asset."), { status: 400 });
  }

  const file = bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw Object.assign(new Error("Uploaded file was not found in storage."), { status: 400 });
  }

  const [metadata] = await file.getMetadata();
  const sizeBytes = Number(metadata.size || 0);
  const storedType = String(metadata.contentType || write.contentType);
  const kind = contentKind(storedType) || contentKind(write.contentType);
  if (!kind) {
    throw Object.assign(new Error("Stored file type is not an allowed image or video."), { status: 400 });
  }
  if (!sizeBytes || sizeBytes > maxBytesForKind(kind)) {
    throw Object.assign(new Error("Stored file is empty or larger than the limit."), { status: 400 });
  }

  const publicUrl = write.visibility === "public"
    ? await publishDownloadUrl(file, storagePath, storedType)
    : await revokeDownloadUrl(file, storedType);

  const ref = db().collection(CONTENT_COLLECTION).doc(assetId);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.storagePath !== storagePath) {
    throw Object.assign(new Error("This asset id is already used."), { status: 409 });
  }

  const record = {
    fileName: write.fileName,
    contentType: storedType,
    kind,
    sizeBytes,
    storagePath,
    purpose: write.purpose,
    tags: write.tags,
    folder: write.folder,
    visibility: write.visibility,
    alt: write.alt,
    publicUrl,
    uploadedBy,
    uploadedByEmail: options.uploadedByEmail || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
  };
  await ref.set(record, { merge: true });
  const saved = await ref.get();
  return toRecord(saved.id, saved.data() || record, publicUrl || "");
}

export async function listContentAssets(filters: ContentListQuery, viewer: { staff: boolean }) {
  const snap = await db().collection(CONTENT_COLLECTION).orderBy("createdAt", "desc").limit(CONTENT_LIST_LIMIT).get();
  const assets: ContentAssetRecord[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!matchesContentFilters(data, filters)) continue;
    if (data.visibility !== "public" && !viewer.staff) continue;
    const url = await readUrlFor(data, viewer.staff);
    const presented = presentContentAsset(toRecord(doc.id, data, url), viewer);
    if (presented) assets.push(presented);
  }
  return assets;
}

export async function getContentAsset(id: string, viewer: { staff: boolean }) {
  if (!isContentAssetId(id)) return null;
  const snap = await db().collection(CONTENT_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.visibility !== "public" && !viewer.staff) return null;
  const url = await readUrlFor(data, viewer.staff);
  return presentContentAsset(toRecord(snap.id, data, url), viewer);
}

export async function updateContentAsset(id: string, patch: {
  purpose?: ContentPurpose;
  tags?: string[];
  folder?: string;
  visibility?: ContentVisibility;
  alt?: string;
}) {
  if (!isContentAssetId(id)) {
    throw Object.assign(new Error("Asset not found."), { status: 404 });
  }
  const ref = db().collection(CONTENT_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("Asset not found."), { status: 404 });
  const current = snap.data() || {};
  const visibility = patch.visibility || (current.visibility === "public" ? "public" : "staff");
  const contentType = String(current.contentType || "application/octet-stream");
  let publicUrl = typeof current.publicUrl === "string" ? current.publicUrl : null;

  if (patch.visibility && patch.visibility !== current.visibility && typeof current.storagePath === "string") {
    const file = bucket().file(current.storagePath);
    publicUrl = patch.visibility === "public"
      ? await publishDownloadUrl(file, current.storagePath, contentType)
      : await revokeDownloadUrl(file, contentType);
  }

  await ref.update({
    ...(patch.purpose ? { purpose: patch.purpose } : {}),
    ...(patch.tags ? { tags: patch.tags } : {}),
    ...(patch.folder != null ? { folder: patch.folder } : {}),
    ...(patch.visibility ? { visibility: patch.visibility, publicUrl } : {}),
    ...(patch.alt != null ? { alt: patch.alt } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  const data = saved.data() || {};
  const url = visibility === "public" && publicUrl ? publicUrl : await readUrlFor(data, true);
  return toRecord(saved.id, data, url);
}

export async function deleteContentAsset(id: string) {
  if (!isContentAssetId(id)) throw Object.assign(new Error("Asset not found."), { status: 404 });
  const ref = db().collection(CONTENT_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("Asset not found."), { status: 404 });
  const storagePath = snap.data()?.storagePath;
  if (typeof storagePath === "string" && storagePath.startsWith("content-bucket/")) {
    await bucket().file(storagePath).delete({ ignoreNotFound: true });
  }
  await ref.delete();
}

export function newContentAssetId(): string {
  return db().collection(CONTENT_COLLECTION).doc().id;
}

async function publishDownloadUrl(file: ReturnType<ReturnType<typeof bucket>["file"]>, storagePath: string, contentType: string) {
  const token = randomUUID();
  await file.setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return firebaseDownloadUrl(bucket().name, storagePath, token);
}

async function revokeDownloadUrl(file: ReturnType<ReturnType<typeof bucket>["file"]>, contentType: string) {
  await file.setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: randomUUID() },
  });
  return null;
}

async function readUrlFor(data: FirebaseFirestore.DocumentData, staff: boolean) {
  if (data.visibility === "public" && typeof data.publicUrl === "string" && data.publicUrl) {
    return data.publicUrl;
  }
  if (!staff || typeof data.storagePath !== "string") return "";
  const [url] = await bucket().file(data.storagePath).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + READ_URL_TTL_MS,
  });
  return url;
}

function toRecord(id: string, data: FirebaseFirestore.DocumentData, url: string): ContentAssetRecord {
  const safe = jsonSafe({ id, ...data, url }) as ContentAssetRecord;
  return {
    id,
    fileName: String(data.fileName || ""),
    contentType: String(data.contentType || ""),
    kind: data.kind === "video" ? "video" : "image",
    sizeBytes: Number(data.sizeBytes || 0),
    purpose: data.purpose,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    folder: String(data.folder || ""),
    visibility: data.visibility === "public" ? "public" : "staff",
    alt: String(data.alt || ""),
    url,
    createdAt: typeof safe.createdAt === "string" ? safe.createdAt : null,
    updatedAt: typeof safe.updatedAt === "string" ? safe.updatedAt : null,
    storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
    uploadedBy: typeof data.uploadedBy === "string" ? data.uploadedBy : undefined,
    uploadedByEmail: typeof data.uploadedByEmail === "string" ? data.uploadedByEmail : undefined,
  };
}

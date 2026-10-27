import { randomUUID } from "crypto";
import admin from "firebase-admin";
import { recordAddressText } from "../../shared/addressText";
import {
  addressSlug,
  applyPhotoOrder,
  sequenceKeptShots,
  shotKey,
  type SequenceShot,
} from "../../shared/gallerySequence";
import { galleryStatusAfterStudioAdd } from "../../shared/iconicStudio";
import {
  contentTypeForUpload,
  isListingStoragePath,
  safeStorageFileName,
} from "../../shared/listingAccess";
import { jsonSafe } from "../lib/firestoreJson";

const db = () => admin.firestore();
const bucket = () => admin.storage().bucket();

const BROWSER_ORIGINS = [
  "https://iconicimagestx.vercel.app",
  "https://iconicimagestx.com",
  "https://www.iconicimagestx.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

let corsAttempt: Promise<void> | null = null;

/** Let the browser PUT signed URLs from the live site. Failure is non-fatal. */
export function ensureBucketCors(): Promise<void> {
  if (!corsAttempt) {
    corsAttempt = bucket().setCorsConfiguration([{
      origin: BROWSER_ORIGINS,
      method: ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
      responseHeader: ["Content-Type", "Authorization", "Content-Length", "x-goog-resumable"],
      maxAgeSeconds: 3600,
    }]).then(() => {
      console.log("[Storage] Bucket CORS allows portal photo uploads.");
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[Storage] Could not update bucket CORS:", message);
    });
  }
  return corsAttempt;
}

export function firebaseDownloadUrl(bucketName: string, storagePath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

export async function createListingUploadUrl(listingId: string, fileName: string, contentType: string | undefined, folder: "photos" | "raw") {
  await ensureBucketCors();
  const safeName = safeStorageFileName(fileName);
  const resolvedType = contentTypeForUpload(safeName, contentType);
  const storagePath = `listings/${listingId}/${folder}/${Date.now()}_${safeName}`;
  const file = bucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType: resolvedType,
  });
  return { uploadUrl, storagePath, contentType: resolvedType };
}

export async function saveListingBytes(listingId: string, fileName: string, contentType: string | undefined, folder: "photos" | "raw", bytes: Buffer) {
  const safeName = safeStorageFileName(fileName);
  const resolvedType = contentTypeForUpload(safeName, contentType);
  const storagePath = `listings/${listingId}/${folder}/${Date.now()}_${safeName}`;
  const token = randomUUID();
  const file = bucket().file(storagePath);
  await file.save(bytes, {
    resumable: false,
    metadata: {
      contentType: resolvedType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const url = firebaseDownloadUrl(bucket().name, storagePath, token);
  return { storagePath, contentType: resolvedType, url, token };
}

export async function registerListingPhoto(options: {
  listingId: string;
  storagePath: string;
  fileName: string;
  contentType?: string;
  uploadedBy: string;
  existingUrl?: string;
  /** Optional Iconic Studio markers. Cannot override url, path, or name. */
  extra?: Record<string, unknown>;
}) {
  const { listingId, storagePath, fileName, uploadedBy } = options;
  if (!isListingStoragePath(listingId, storagePath)) {
    throw Object.assign(new Error("Storage path is not inside this listing."), { status: 400 });
  }

  const listingRef = db().collection("listings").doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw Object.assign(new Error("Listing not found."), { status: 404 });
  }

  const file = bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw Object.assign(new Error("Uploaded file was not found in storage."), { status: 400 });
  }

  let url = options.existingUrl || "";
  if (!url) {
    const [metadata] = await file.getMetadata();
    const current = metadata.metadata?.firebaseStorageDownloadTokens;
    const token = typeof current === "string" && current ? current.split(",")[0] : randomUUID();
    if (!current) {
      await file.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token },
        contentType: contentTypeForUpload(fileName, options.contentType || metadata.contentType),
      });
    }
    url = firebaseDownloadUrl(bucket().name, storagePath, token);
  }

  const listing = listingSnap.data() || {};
  const images = Array.isArray(listing.images) ? listing.images : [];
  const maxOrder = images.reduce((max: number, item: { sortOrder?: unknown }) => {
    const value = Number(item?.sortOrder);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  const image = {
    id: storagePath,
    url,
    name: safeStorageFileName(fileName),
    path: storagePath,
    contentType: contentTypeForUpload(fileName, options.contentType),
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    sortOrder: maxOrder + 1,
    culled: false,
    ...studioImageExtra(options.extra),
  };
  const already = images.find((item: { path?: string }) => item?.path === storagePath);
  if (!already) {
    await listingRef.update({
      images: admin.firestore.FieldValue.arrayUnion(image),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await syncPlaytestGallery(listingId, listing, image);
    await syncListingGallery(listing, image);
  }

  return { image: already || image, listingId };
}

/** Keep studio markers off the identity fields the media library and portal read. */
export function studioImageExtra(extra: unknown): Record<string, unknown> {
  if (!extra || typeof extra !== "object") return {};
  const src = extra as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (src.studioApproved === true) out.studioApproved = true;
  if (src.studioRole === "adjusted" || src.studioRole === "final") out.studioRole = src.studioRole;
  if (typeof src.sourcePath === "string" && src.sourcePath.length <= 500) out.sourcePath = src.sourcePath;
  return out;
}

export function galleryMediaItem(image: {
  url: string;
  name: string;
  path: string;
  contentType?: string;
  uploadedAt: string;
  uploadedBy: string;
  deliveryName?: string;
  sortOrder?: number;
}) {
  const fileName = image.deliveryName || image.name;
  const item: Record<string, unknown> = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url: image.url,
    shareUrl: image.url,
    fileName,
    title: fileName,
    name: fileName,
    type: image.contentType?.startsWith("video/") ? "video" : "photo",
    storagePath: image.path,
    downloadable: true,
    uploadedBy: image.uploadedBy,
    uploadedAt: image.uploadedAt,
  };
  if (Number.isFinite(image.sortOrder)) item.sortOrder = image.sortOrder;
  return item;
}

/** Copy an upload onto the gallery the delivery queue already lists. Leaves the pay lock alone. */
async function syncListingGallery(
  listing: FirebaseFirestore.DocumentData,
  image: { url: string; name: string; path: string; contentType?: string; uploadedAt: string; uploadedBy: string },
) {
  const galleryId = typeof listing.galleryId === "string" ? listing.galleryId.trim() : "";
  if (!galleryId) return;
  const ref = db().collection("galleries").doc(galleryId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const items = Array.isArray(snap.data()?.mediaItems) ? snap.data()!.mediaItems : [];
  if (items.some((item: { storagePath?: string }) => item?.storagePath === image.path)) return;
  await ref.update({
    mediaItems: admin.firestore.FieldValue.arrayUnion(galleryMediaItem(image)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function syncPlaytestGallery(
  listingId: string,
  listing: FirebaseFirestore.DocumentData,
  image: { url: string; name: string; path: string; contentType?: string; uploadedAt: string; uploadedBy: string },
) {
  const galleryIds = new Set<string>();
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) {
    galleryIds.add(listing.playtestGalleryId);
  }
  if (listing.playtest === true) {
    const snap = await db().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    snap.docs.forEach((doc) => {
      if (doc.data().playtest === true) galleryIds.add(doc.id);
    });
  }
  if (galleryIds.size === 0) return;

  const mediaItem = galleryMediaItem(image);

  for (const galleryId of galleryIds) {
    const ref = db().collection("galleries").doc(galleryId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.playtest !== true) continue;
    const items = Array.isArray(snap.data()?.mediaItems) ? snap.data()!.mediaItems : [];
    if (items.some((item: { storagePath?: string }) => item?.storagePath === image.path)) continue;
    await ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(mediaItem),
      status: "delivered",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export async function saveListingPhotoOrder(
  listingId: string,
  order: Array<{ key: string; culled?: boolean }>,
) {
  const ref = db().collection("listings").doc(listingId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("Listing not found."), { status: 404 });
  const images = Array.isArray(snap.data()?.images) ? snap.data()!.images : [];
  const next = applyPhotoOrder(images, order);
  await ref.update({
    images: next,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { images: next };
}

async function linkedGalleryIds(listingId: string, listing: FirebaseFirestore.DocumentData) {
  const ids = new Set<string>();
  if (typeof listing.galleryId === "string" && listing.galleryId.trim()) ids.add(listing.galleryId.trim());
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId.trim()) ids.add(listing.playtestGalleryId.trim());
  const snap = await db().collection("galleries").where("listingId", "==", listingId).limit(10).get();
  snap.docs.forEach((doc) => ids.add(doc.id));
  return [...ids];
}

/**
 * Rename the kept set and write it onto the galleries this listing already uses.
 * Culled shots are removed from those galleries. No client email or SMS is sent.
 */
export async function publishListingGallerySequence(listingId: string, uploadedBy: string, addressOverride = "") {
  const ref = db().collection("listings").doc(listingId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("Listing not found."), { status: 404 });
  const listing = snap.data() || {};
  const images = (Array.isArray(listing.images) ? listing.images : []) as Array<Record<string, unknown>>;
  const address = addressOverride.trim().slice(0, 180) || recordAddressText(listing) || "listing";
  const sequenced = sequenceKeptShots(images as SequenceShot[], address);
  const byKey = new Map(sequenced.map((row) => [shotKey(row.shot), row]));
  const nextImages: Array<Record<string, unknown>> = images.map((image, index) => {
    const row = byKey.get(shotKey(image, index));
    if (!row) {
      const rest = { ...image };
      delete rest.deliveryName;
      return { ...rest, culled: true };
    }
    return {
      ...image,
      culled: false,
      sortOrder: row.sortOrder,
      deliveryName: row.deliveryName,
    };
  });
  await ref.update({
    images: nextImages,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const culledPaths = new Set(
    nextImages
      .filter((image) => image.culled === true && typeof image.path === "string")
      .map((image) => String(image.path)),
  );
  const galleryIds = await linkedGalleryIds(listingId, listing);
  for (const galleryId of galleryIds) {
    const galleryRef = db().collection("galleries").doc(galleryId);
    const gallerySnap = await galleryRef.get();
    if (!gallerySnap.exists) continue;
    const data = gallerySnap.data() || {};
    const current = Array.isArray(data.mediaItems) ? data.mediaItems : [];
    const sequencedPaths = new Set(
      sequenced
        .map((row) => (typeof row.shot.path === "string" ? row.shot.path : ""))
        .filter(Boolean),
    );
    const kept = current.filter((item: { storagePath?: string }) => {
      const path = typeof item?.storagePath === "string" ? item.storagePath : "";
      if (!path) return true;
      if (sequencedPaths.has(path) || culledPaths.has(path)) return false;
      return true;
    });
    const additions = sequenced
      .filter((row) => typeof row.shot.path === "string" && typeof row.shot.url === "string")
      .map((row) => {
        const shot = row.shot as Record<string, unknown>;
        return galleryMediaItem({
          url: String(shot.url),
          name: typeof shot.name === "string" ? shot.name : row.deliveryName,
          path: String(shot.path),
          contentType: typeof shot.contentType === "string" ? shot.contentType : "image/jpeg",
          uploadedAt: typeof shot.uploadedAt === "string" ? shot.uploadedAt : new Date().toISOString(),
          uploadedBy: typeof shot.uploadedBy === "string" ? shot.uploadedBy : uploadedBy,
          deliveryName: row.deliveryName,
          sortOrder: row.sortOrder,
        });
      });
    await galleryRef.update({
      mediaItems: [...kept, ...additions],
      status: galleryStatusAfterStudioAdd(typeof data.status === "string" ? data.status : undefined),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const names = sequenced.map((row) => row.deliveryName);
  return {
    names,
    galleries: galleryIds,
    addressSlug: addressSlug(address),
    note: galleryIds.length
      ? "Gallery files follow the photographer order. Culled shots were left out. No client email was sent."
      : "Order saved on the listing. No gallery is linked yet, and no client email was sent.",
  };
}

export function serializeDoc(id: string, data: FirebaseFirestore.DocumentData): Record<string, any> {
  return jsonSafe({ id, ...data }) as Record<string, any>;
}

import { randomUUID } from "crypto";
import admin from "firebase-admin";
import { isIconicUploadOrigin } from "../../shared/contentBucket";
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

const extraOrigins = new Set<string>();
let corsAttempt: Promise<void> | null = null;

/** Remember an Iconic Vercel preview so signed browser uploads can succeed there. */
export function allowUploadOrigin(origin: string | undefined) {
  if (!origin || BROWSER_ORIGINS.includes(origin) || extraOrigins.has(origin)) return;
  if (!isIconicUploadOrigin(origin)) return;
  extraOrigins.add(origin);
  corsAttempt = null;
}

/** Let the browser PUT signed URLs from the live site. Failure is non-fatal. */
export function ensureBucketCors(): Promise<void> {
  if (!corsAttempt) {
    corsAttempt = bucket().setCorsConfiguration([{
      origin: [...BROWSER_ORIGINS, ...extraOrigins],
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

  const image = {
    url,
    name: safeStorageFileName(fileName),
    path: storagePath,
    contentType: contentTypeForUpload(fileName, options.contentType),
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };

  const listing = listingSnap.data() || {};
  const images = Array.isArray(listing.images) ? listing.images : [];
  const already = images.find((item: { path?: string }) => item?.path === storagePath);
  if (!already) {
    await listingRef.update({
      images: admin.firestore.FieldValue.arrayUnion(image),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await syncPlaytestGallery(listingId, listing, image);
  }

  return { image: already || image, listingId };
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

  const mediaItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url: image.url,
    shareUrl: image.url,
    fileName: image.name,
    title: image.name,
    type: image.contentType?.startsWith("video/") ? "video" : "photo",
    storagePath: image.path,
    downloadable: true,
    uploadedBy: image.uploadedBy,
    uploadedAt: image.uploadedAt,
  };

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

export function serializeDoc(id: string, data: FirebaseFirestore.DocumentData): Record<string, any> {
  return jsonSafe({ id, ...data }) as Record<string, any>;
}

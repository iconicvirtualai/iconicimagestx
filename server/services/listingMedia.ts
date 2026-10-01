import { randomUUID } from "crypto";
import admin from "firebase-admin";
import {
  contentTypeForUpload,
  isListingStoragePath,
  safeStorageFileName,
} from "../../shared/listingAccess";
import {
  AI_EDIT_QUEUE_NOTE,
  buildCubiCasaLibraryRequest,
  byteSize,
  createFolderId,
  normalizeMediaFile,
  normalizeMediaFolders,
  planFileMove,
  sanitizeFolderName,
  type MediaFileRecord,
} from "../../shared/mediaLibrary";
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
  size?: number | null;
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
    id: randomUUID(),
    url,
    name: safeStorageFileName(fileName),
    path: storagePath,
    contentType: contentTypeForUpload(fileName, options.contentType),
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    size: byteSize(options.size),
    folderId: null,
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

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function listingRef(listingId: string) {
  return db().collection("listings").doc(listingId);
}

async function readListing(listingId: string) {
  const snap = await listingRef(listingId).get();
  if (!snap.exists) throw httpError(404, "Listing not found.");
  return { id: snap.id, ref: listingRef(listingId), data: snap.data() || {} };
}

function imageList(data: FirebaseFirestore.DocumentData): unknown[] {
  return Array.isArray(data.images) ? data.images : [];
}

function findRawImage(images: unknown[], storagePath: string) {
  return images.find((item) => {
    const file = normalizeMediaFile(item);
    return file?.path === storagePath;
  });
}

async function patchListing(
  listingId: string,
  mutate: (data: FirebaseFirestore.DocumentData) => Record<string, unknown>,
) {
  const ref = listingRef(listingId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw httpError(404, "Listing not found.");
    const data = snap.data() || {};
    const patch = mutate(data);
    tx.update(ref, {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return data;
  });
}

export async function createListingMediaFolder(listingId: string, nameInput: unknown, createdBy: string) {
  const name = sanitizeFolderName(nameInput);
  if (!name) throw httpError(400, "Folder name is required.");
  const reserved = new Set(["all", "photos", "raw", "all files"]);
  if (reserved.has(name.toLowerCase())) throw httpError(400, "That folder name is reserved.");
  const folder = {
    id: createFolderId(),
    name,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  await patchListing(listingId, (data) => {
    const folders = normalizeMediaFolders(data.mediaFolders);
    if (folders.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      throw httpError(409, "A folder with that name already exists.");
    }
    return { mediaFolders: [...folders, folder] };
  });
  return folder;
}

export async function deleteListingMediaFolder(listingId: string, folderId: string) {
  if (!folderId) throw httpError(400, "folderId is required.");
  let removed = 0;
  await patchListing(listingId, (data) => {
    const folders = normalizeMediaFolders(data.mediaFolders);
    if (!folders.some((folder) => folder.id === folderId)) throw httpError(404, "Folder not found.");
    const images = imageList(data).map((item) => {
      if (!item || typeof item !== "object") return item;
      const record = item as Record<string, unknown>;
      if (record.folderId !== folderId) return item;
      removed += 1;
      const next = { ...record };
      delete next.folderId;
      return next;
    });
    return {
      mediaFolders: folders.filter((folder) => folder.id !== folderId),
      images,
    };
  });
  return { deleted: true, filesReturned: removed };
}

export async function assignListingFiles(listingId: string, paths: string[], folderId: string | null) {
  if (!paths.length) throw httpError(400, "Choose at least one file.");
  for (const path of paths) {
    if (!isListingStoragePath(listingId, path)) throw httpError(400, "That file is not stored on this listing.");
  }
  await patchListing(listingId, (data) => {
    if (folderId && !normalizeMediaFolders(data.mediaFolders).some((folder) => folder.id === folderId)) {
      throw httpError(404, "Folder not found.");
    }
    const wanted = new Set(paths);
    let touched = 0;
    const images = imageList(data).map((item) => {
      const file = normalizeMediaFile(item);
      if (!file || !wanted.has(file.path) || !item || typeof item !== "object") return item;
      touched += 1;
      const next = { ...(item as Record<string, unknown>) };
      if (folderId) next.folderId = folderId;
      else delete next.folderId;
      return next;
    });
    if (touched !== paths.length) throw httpError(404, "One or more files were not found on this listing.");
    return { images };
  });
  return { updated: paths.length, folderId };
}

async function deleteStorageObject(storagePath: string) {
  const file = bucket().file(storagePath);
  const [exists] = await file.exists();
  if (exists) await file.delete();
}

async function removePlaytestGalleryItem(listingId: string, listing: FirebaseFirestore.DocumentData, storagePath: string) {
  const galleryIds = new Set<string>();
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) galleryIds.add(listing.playtestGalleryId);
  if (listing.playtest === true) {
    const snap = await db().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    snap.docs.forEach((doc) => {
      if (doc.data().playtest === true) galleryIds.add(doc.id);
    });
  }
  for (const galleryId of galleryIds) {
    const ref = db().collection("galleries").doc(galleryId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.playtest !== true) continue;
    const items = Array.isArray(snap.data()?.mediaItems) ? snap.data()!.mediaItems : [];
    const next = items.filter((item: { storagePath?: string }) => item?.storagePath !== storagePath);
    if (next.length === items.length) continue;
    await ref.update({
      mediaItems: next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export async function deleteListingFiles(listingId: string, paths: string[]) {
  if (!paths.length) throw httpError(400, "Choose at least one file.");
  for (const path of paths) {
    if (!isListingStoragePath(listingId, path)) throw httpError(400, "That file is not stored on this listing.");
  }
  const listing = await readListing(listingId);
  const wanted = new Set(paths);
  await patchListing(listingId, (data) => {
    const images = imageList(data);
    const found = images.filter((item) => {
      const file = normalizeMediaFile(item);
      return file && wanted.has(file.path);
    }).length;
    if (found !== paths.length) throw httpError(404, "One or more files were not found on this listing.");
    return {
      images: images.filter((item) => {
        const file = normalizeMediaFile(item);
        return !file || !wanted.has(file.path);
      }),
    };
  });
  for (const path of paths) {
    await deleteStorageObject(path);
    await removePlaytestGalleryItem(listingId, listing.data, path);
  }
  return { deleted: paths };
}

async function copyListingObject(sourcePath: string, destPath: string, fileName: string, contentType?: string) {
  const source = bucket().file(sourcePath);
  const [exists] = await source.exists();
  if (!exists) throw httpError(400, "Uploaded file was not found in storage.");
  const dest = bucket().file(destPath);
  await source.copy(dest);
  const [metadata] = await source.getMetadata();
  const token = randomUUID();
  const resolvedType = contentTypeForUpload(fileName, contentType || metadata.contentType);
  await dest.setMetadata({
    contentType: resolvedType,
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return {
    url: firebaseDownloadUrl(bucket().name, destPath, token),
    size: byteSize(metadata.size),
    contentType: resolvedType,
  };
}

function withoutPaths(images: unknown[], paths: Set<string>) {
  return images.filter((item) => {
    const file = normalizeMediaFile(item);
    return !file || !paths.has(file.path);
  });
}

export async function moveListingFiles(options: {
  sourceListingId: string;
  destinationListingId: string;
  paths: string[];
  destinationStorageFolder: "photos" | "raw";
  destinationFolderId: string | null;
  movedBy: string;
}) {
  const { sourceListingId, destinationListingId, paths, destinationStorageFolder, destinationFolderId, movedBy } = options;
  if (!paths.length) throw httpError(400, "Choose at least one file.");
  if (paths.some((path) => !isListingStoragePath(sourceListingId, path))) {
    throw httpError(400, "That file is not stored on this listing.");
  }
  const source = await readListing(sourceListingId);
  const destination = sourceListingId === destinationListingId ? source : await readListing(destinationListingId);
  if (destinationFolderId && !normalizeMediaFolders(destination.data.mediaFolders).some((folder) => folder.id === destinationFolderId)) {
    throw httpError(404, "Destination folder not found.");
  }

  const moved: Array<{ from: string; to: string; listingId: string }> = [];
  for (const path of paths) {
    const currentSource = await readListing(sourceListingId);
    const currentRaw = findRawImage(imageList(currentSource.data), path);
    if (!currentRaw) throw httpError(404, "One or more files were not found on this listing.");
    const file = normalizeMediaFile(currentRaw) as MediaFileRecord;
    const storageFolder = destinationFolderId
      ? (file.storageFolder === "raw" ? "raw" : "photos")
      : destinationStorageFolder;
    const plan = planFileMove({
      file,
      sourceListingId,
      destinationListingId,
      destinationStorageFolder: storageFolder,
    });
    const base = currentRaw as Record<string, unknown>;
    const nextRecord: Record<string, unknown> = {
      ...base,
      folderId: destinationFolderId || undefined,
    };
    if (!destinationFolderId) delete nextRecord.folderId;

    if (plan.mode === "metadata") {
      await patchListing(sourceListingId, (data) => ({
        images: imageList(data).map((item) => (normalizeMediaFile(item)?.path === path ? nextRecord : item)),
      }));
      moved.push({ from: path, to: path, listingId: destinationListingId });
      continue;
    }

    const copied = await copyListingObject(path, plan.nextPath, file.name, file.contentType);
    const relocated = {
      ...nextRecord,
      id: randomUUID(),
      url: copied.url,
      path: plan.nextPath,
      contentType: copied.contentType,
      size: copied.size ?? file.size,
      movedFrom: {
        listingId: sourceListingId,
        path,
        movedAt: new Date().toISOString(),
        movedBy,
      },
    };
    try {
      if (sourceListingId === destinationListingId) {
        await patchListing(sourceListingId, (data) => ({
          images: imageList(data).map((item) => (normalizeMediaFile(item)?.path === path ? relocated : item)),
        }));
      } else {
        await db().runTransaction(async (tx) => {
          const sourceSnap = await tx.get(listingRef(sourceListingId));
          const destSnap = await tx.get(listingRef(destinationListingId));
          if (!sourceSnap.exists || !destSnap.exists) throw httpError(404, "Listing not found.");
          const sourceImages = imageList(sourceSnap.data() || {});
          if (!findRawImage(sourceImages, path)) throw httpError(404, "One or more files were not found on this listing.");
          tx.update(listingRef(sourceListingId), {
            images: withoutPaths(sourceImages, new Set([path])),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          tx.update(listingRef(destinationListingId), {
            images: [...imageList(destSnap.data() || {}), relocated],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      }
    } catch (err) {
      await deleteStorageObject(plan.nextPath);
      throw err;
    }
    await deleteStorageObject(path);
    await removePlaytestGalleryItem(sourceListingId, currentSource.data, path);
    if (destination.data.playtest === true || destinationListingId !== sourceListingId) {
      const destListing = destinationListingId === sourceListingId ? currentSource.data : destination.data;
      await syncPlaytestGallery(destinationListingId, destListing, {
        url: copied.url,
        name: file.name,
        path: plan.nextPath,
        contentType: copied.contentType,
        uploadedAt: file.uploadedAt || new Date().toISOString(),
        uploadedBy: file.uploadedBy || movedBy,
      });
    }
    moved.push({ from: path, to: plan.nextPath, listingId: destinationListingId });
  }
  return {
    moved,
    limitation: "The file follows the destination listing. Client and photographer stay whatever is already set on that listing.",
  };
}

export async function queueListingCubiCasa(listingId: string, paths: string[], requestedBy: string) {
  const listing = await readListing(listingId);
  const files = imageList(listing.data)
    .map((item) => normalizeMediaFile(item))
    .filter((file): file is MediaFileRecord => Boolean(file && paths.includes(file.path)));
  if (!paths.length) throw httpError(400, "Choose at least one file.");
  if (files.length !== paths.length) throw httpError(404, "One or more files were not found on this listing.");
  for (const file of files) {
    if (!isListingStoragePath(listingId, file.path)) throw httpError(400, "That file is not stored on this listing.");
  }
  const request = buildCubiCasaLibraryRequest({
    listingId,
    requestedBy,
    files: files.map((file) => ({ name: file.name, path: file.path, url: file.url })),
  });
  const job = await db().collection("mediaJobs").add({
    listingId,
    orderId: listing.data.orderId || listing.data.orderRequestId || null,
    provider: "cubicasa-manual",
    preset: "floorplan_from_library",
    notes: request.nextStep,
    externalApiCalled: false,
    apiConnected: false,
    requirements: { source: "media-library", priority: "normal" },
    mediaItems: files.map((file) => ({
      id: file.id,
      name: file.name,
      url: file.url,
      storagePath: file.path,
      type: "photo",
      status: "queued",
    })),
    status: "queued",
    priority: "normal",
    attempts: 0,
    requiresHumanReview: true,
    createdBy: requestedBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await listing.ref.update({
    cubiCasaImports: admin.firestore.FieldValue.arrayUnion({ ...request, mediaJobId: job.id }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return {
    success: true,
    mode: "manual_queue",
    apiConnected: false,
    jobId: job.id,
    nextStep: request.nextStep,
  };
}

export async function queueListingAiEdit(listingId: string, paths: string[], requestedBy: string) {
  const listing = await readListing(listingId);
  const files = imageList(listing.data)
    .map((item) => normalizeMediaFile(item))
    .filter((file): file is MediaFileRecord => Boolean(file && paths.includes(file.path)));
  if (!paths.length) throw httpError(400, "Choose at least one file.");
  if (files.length !== paths.length) throw httpError(404, "One or more files were not found on this listing.");
  for (const file of files) {
    if (!isListingStoragePath(listingId, file.path)) throw httpError(400, "That file is not stored on this listing.");
  }
  const provider = process.env.AI_PHOTO_PROVIDER || "aicon";
  const job = await db().collection("mediaJobs").add({
    listingId,
    orderId: listing.data.orderId || listing.data.orderRequestId || null,
    provider,
    preset: "real_estate_standard",
    notes: AI_EDIT_QUEUE_NOTE,
    externalApiCalled: false,
    requirements: { source: "media-library", priority: "normal" },
    mediaItems: files.map((file) => ({
      id: file.id,
      name: file.name,
      url: file.url,
      storagePath: file.path,
      type: file.contentType.startsWith("video/") ? "video" : "photo",
      status: "queued",
    })),
    status: "queued",
    priority: "normal",
    attempts: 0,
    requiresHumanReview: true,
    createdBy: requestedBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db().collection("agentLogs").add({
    agent: "aicon-editor",
    action: "Media job queued",
    summary: `${files.length} library file(s) queued for ${provider}`,
    status: "queued",
    relatedId: job.id,
    relatedType: "mediaJob",
    priority: "normal",
    requiresHumanReview: true,
    details: AI_EDIT_QUEUE_NOTE,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return {
    success: true,
    mode: "internal_queue",
    apiConnected: false,
    provider,
    jobId: job.id,
    nextStep: AI_EDIT_QUEUE_NOTE,
  };
}

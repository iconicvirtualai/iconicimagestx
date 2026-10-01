/**
 * Iconic Studio queue.
 * Writes editJobs and copies approved JPEG/WebP/PNG files onto
 * listings/{id}/finals/. Does not send client email or SMS.
 */

import { randomUUID } from "crypto";
import admin from "firebase-admin";
import {
  aiEditStub,
  clampAdjustments,
  finalsObjectPath,
  frameFromListingImage,
  galleryStatusAfterStudioAdd,
  ingestJobId,
  isRawStudioFile,
  isStudioPreviewable,
  listingAddressLabel,
  type AiEditRequest,
  type StudioAdjustments,
  type StudioFrame,
} from "../../shared/iconicStudio";
import { isListingStoragePath, safeStorageFileName } from "../../shared/listingAccess";
import { jsonSafe } from "../lib/firestoreJson";
import { firebaseDownloadUrl, registerListingPhoto, saveListingBytes } from "./listingMedia";

const db = () => admin.firestore();
const bucket = () => admin.storage().bucket();

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

export async function bumpRawIngestJob(input: {
  listingId: string;
  image: { path: string; url?: string; name?: string; contentType?: string };
  uploadedBy: string;
}) {
  const file = {
    path: input.image.path,
    url: input.image.url || "",
    name: input.image.name || input.image.path.split("/").pop() || "raw",
    contentType: input.image.contentType || "",
  };
  const ref = db().collection("editJobs").doc(ingestJobId(input.listingId));
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      kind: "raw_ingest",
      type: "raw_ingest",
      listingId: input.listingId,
      status: "pending",
      note: "Edits begin",
      sourceFiles: [file],
      fileCount: 1,
      createdBy: input.uploadedBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: ref.id, created: true, fileCount: 1 };
  }

  const data = snap.data() || {};
  const files = Array.isArray(data.sourceFiles) ? data.sourceFiles : [];
  if (files.some((item: { path?: string }) => item?.path === file.path)) {
    return { id: ref.id, created: false, fileCount: files.length };
  }
  await ref.update({
    sourceFiles: admin.firestore.FieldValue.arrayUnion(file),
    fileCount: admin.firestore.FieldValue.increment(1),
    status: "pending",
    note: "Edits begin",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id, created: false, fileCount: files.length + 1 };
}

async function loadListing(listingId: string) {
  const snap = await db().collection("listings").doc(listingId).get();
  if (!snap.exists) throw httpError(404, "Listing not found.");
  return { id: snap.id, ref: snap.ref, data: snap.data() || {} };
}

async function listingsForRole(uid: string, role: string) {
  if (role === "photographer") {
    const [byUid, byIds] = await Promise.all([
      db().collection("listings").where("photographerUid", "==", uid).limit(50).get(),
      db().collection("listings").where("photographerIds", "array-contains", uid).limit(50).get(),
    ]);
    const merged = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...byUid.docs, ...byIds.docs]) merged.set(doc.id, doc);
    return [...merged.values()].map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const snap = await db().collection("listings").limit(80).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

export async function assertStudioAccess(uid: string, role: string, listingId: string) {
  if (role !== "photographer") {
    await loadListing(listingId);
    return;
  }
  const mine = await listingsForRole(uid, "photographer");
  if (!mine.some((item) => item.id === listingId)) {
    throw httpError(403, "This job is not assigned to you.");
  }
}

export async function enqueueAiEdit(input: AiEditRequest & { createdBy: string }) {
  const listing = await loadListing(input.listingId);
  const frames = (Array.isArray(listing.data.images) ? listing.data.images : [])
    .map((item, index) => frameFromListingImage(item, index))
    .filter((frame): frame is StudioFrame => Boolean(frame));
  const frame = frames.find((item) => item.path === input.sourcePath);
  if (!frame) throw httpError(404, "That file is not on this listing.");

  const stub = aiEditStub(process.env, input.imageUrl);
  const ref = await db().collection("editJobs").add({
    kind: "ai_edit",
    type: input.type,
    listingId: input.listingId,
    status: stub.status,
    pipeline: stub.pipeline,
    provider: stub.provider,
    prompt: input.prompt,
    sourcePath: input.sourcePath,
    sourceUrl: input.imageUrl,
    beforeUrl: stub.beforeUrl,
    afterUrl: stub.afterUrl,
    placeholder: stub.placeholder,
    note: stub.note,
    createdBy: input.createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id, ...stub };
}

export async function saveAdjustedJpeg(input: {
  listingId: string;
  sourcePath: string;
  fileName: string;
  adjustments: Partial<StudioAdjustments>;
  bytes: Buffer;
  uploadedBy: string;
}) {
  if (!input.bytes.length) throw httpError(400, "Adjusted JPEG was empty.");
  if (input.bytes.length > 4_500_000) throw httpError(413, "Adjusted JPEG is too large.");
  if (!isListingStoragePath(input.listingId, input.sourcePath)) {
    throw httpError(400, "sourcePath must belong to this listing.");
  }
  const adjustments = clampAdjustments(input.adjustments);
  const saved = await saveListingBytes(
    input.listingId,
    input.fileName.replace(/\.\w+$/, "") + "-adjusted.jpg",
    "image/jpeg",
    "photos",
    input.bytes,
  );
  const registered = await registerListingPhoto({
    listingId: input.listingId,
    storagePath: saved.storagePath,
    fileName: input.fileName.replace(/\.\w+$/, "") + "-adjusted.jpg",
    contentType: "image/jpeg",
    uploadedBy: input.uploadedBy,
    existingUrl: saved.url,
    extra: { studioRole: "adjusted", sourcePath: input.sourcePath },
  });
  const job = await db().collection("editJobs").add({
    kind: "adjust",
    type: "adjust",
    listingId: input.listingId,
    status: "review",
    sourcePath: input.sourcePath,
    resultPath: saved.storagePath,
    beforeUrl: "",
    afterUrl: saved.url,
    adjustments,
    provider: "canvas",
    note: "Client-side JPEG saved to the listing photos folder.",
    createdBy: input.uploadedBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { jobId: job.id, image: registered.image, adjustments };
}

async function copyToFinals(listingId: string, sourcePath: string, fileName: string) {
  if (!isListingStoragePath(listingId, sourcePath)) {
    throw httpError(400, "That file is not stored on this listing.");
  }
  if (sourcePath.includes("/finals/")) {
    const file = bucket().file(sourcePath);
    const [exists] = await file.exists();
    if (!exists) throw httpError(400, "Final file was not found in storage.");
    const [metadata] = await file.getMetadata();
    const current = metadata.metadata?.firebaseStorageDownloadTokens;
    const token = typeof current === "string" && current ? current.split(",")[0] : randomUUID();
    return {
      storagePath: sourcePath,
      url: firebaseDownloadUrl(bucket().name, sourcePath, token),
      contentType: metadata.contentType || "image/jpeg",
      copied: false,
    };
  }
  if (isRawStudioFile(fileName, "")) {
    throw httpError(400, `${fileName} is RAW. Import it for the AI queue, then approve a JPEG, PNG, or WebP final.`);
  }
  if (!isStudioPreviewable(fileName)) {
    throw httpError(400, "Approve a JPEG, PNG, or WebP. RAW stays in the AI queue.");
  }
  const destPath = finalsObjectPath(listingId, fileName);
  const source = bucket().file(sourcePath);
  const [exists] = await source.exists();
  if (!exists) throw httpError(400, "Source file was not found in storage.");
  const dest = bucket().file(destPath);
  await source.copy(dest);
  const [metadata] = await source.getMetadata();
  const token = randomUUID();
  const contentType = metadata.contentType || "image/jpeg";
  await dest.setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return {
    storagePath: destPath,
    url: firebaseDownloadUrl(bucket().name, destPath, token),
    contentType,
    copied: true,
  };
}

async function addFinalToGalleries(listingId: string, listing: FirebaseFirestore.DocumentData, image: {
  url: string;
  name: string;
  path: string;
  contentType?: string;
  uploadedBy: string;
}) {
  const ids = new Set<string>();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  const snap = await db().collection("galleries").where("listingId", "==", listingId).limit(10).get();
  snap.docs.forEach((doc) => ids.add(doc.id));

  const updated: string[] = [];
  for (const galleryId of ids) {
    const ref = db().collection("galleries").doc(galleryId);
    const gallerySnap = await ref.get();
    if (!gallerySnap.exists) continue;
    const data = gallerySnap.data() || {};
    const items = Array.isArray(data.mediaItems) ? data.mediaItems : [];
    if (items.some((item: { storagePath?: string }) => item?.storagePath === image.path)) {
      updated.push(galleryId);
      continue;
    }
    const mediaItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: image.url,
      shareUrl: image.url,
      fileName: image.name,
      title: image.name,
      type: "photo",
      storagePath: image.path,
      downloadable: true,
      isEdited: true,
      isRaw: false,
      uploadedBy: image.uploadedBy,
      uploadedAt: new Date().toISOString(),
    };
    await ref.update({
      mediaItems: [...items, mediaItem],
      status: galleryStatusAfterStudioAdd(typeof data.status === "string" ? data.status : undefined),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updated.push(galleryId);
  }
  return updated;
}

export async function approveStudioFinal(input: {
  listingId: string;
  sourcePath: string;
  fileName?: string;
  uploadedBy: string;
  jobId?: string;
}) {
  const listing = await loadListing(input.listingId);
  const name = safeStorageFileName(input.fileName || input.sourcePath.split("/").pop() || "final.jpg");
  const copied = await copyToFinals(input.listingId, input.sourcePath, name);
  const registered = await registerListingPhoto({
    listingId: input.listingId,
    storagePath: copied.storagePath,
    fileName: name,
    contentType: copied.contentType,
    uploadedBy: input.uploadedBy,
    existingUrl: copied.url,
    extra: { studioApproved: true, studioRole: "final", sourcePath: input.sourcePath },
  });
  const galleries = await addFinalToGalleries(input.listingId, listing.data, {
    url: copied.url,
    name,
    path: copied.storagePath,
    contentType: copied.contentType,
    uploadedBy: input.uploadedBy,
  });
  if (input.jobId) {
    await db().collection("editJobs").doc(input.jobId).set({
      status: "approved",
      resultPath: copied.storagePath,
      resultUrl: copied.url,
      afterUrl: copied.url,
      approvedBy: input.uploadedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return {
    image: registered.image,
    galleries,
    copied: copied.copied,
    note: galleries.length
      ? "Final copied onto the listing and added to the gallery. No client email was sent."
      : "Final copied onto the listing images. No gallery is linked yet, and no client email was sent.",
  };
}

export async function loadStudioWorkspace(input: {
  uid: string;
  role: string;
  listingId?: string;
}) {
  const listings = await listingsForRole(input.uid, input.role);
  const allowed = new Set(listings.map((item) => item.id));
  const jobSnap = await db().collection("editJobs").limit(150).get();
  const jobs = jobSnap.docs
    .map((doc) => jsonSafe({ id: doc.id, ...doc.data() }) as Record<string, unknown>)
    .filter((job) => {
      const listingId = String(job.listingId || "");
      if (input.role === "photographer") return allowed.has(listingId);
      return true;
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  let listing: Record<string, unknown> | null = null;
  if (input.listingId) {
    if (input.role === "photographer" && !allowed.has(input.listingId)) {
      throw httpError(403, "This job is not assigned to you.");
    }
    const loaded = await loadListing(input.listingId);
    const images = (Array.isArray(loaded.data.images) ? loaded.data.images : [])
      .map((item, index) => frameFromListingImage(item, index))
      .filter(Boolean);
    listing = {
      id: loaded.id,
      address: listingAddressLabel(loaded.data),
      status: loaded.data.status || "",
      galleryId: loaded.data.galleryId || loaded.data.playtestGalleryId || "",
      images,
    };
  }

  return {
    flags: {
      teamStudio: true,
      agentUpsell: false,
      outsidePhotographerSaas: false,
      canvaBrand: false,
    },
    listings: listings.map((item) => ({
      id: item.id,
      address: listingAddressLabel(item.data),
      status: item.data.status || "",
      imageCount: Array.isArray(item.data.images) ? item.data.images.length : 0,
    })),
    jobs,
    listing,
  };
}

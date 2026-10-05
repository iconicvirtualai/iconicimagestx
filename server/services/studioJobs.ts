/**
 * Iconic Studio queue.
 * Writes editJobs and copies approved JPEG/WebP/PNG files onto
 * listings/{id}/finals/. Does not send client email or SMS.
 */

import { randomUUID } from "crypto";
import admin from "firebase-admin";
import {
  AI_EDIT_MISSING_KEY_NOTE,
  AI_EDIT_READY_NOTE,
  clampAdjustments,
  finalsObjectPath,
  frameFromListingImage,
  galleryStatusAfterStudioAdd,
  ingestJobId,
  isRawStudioFile,
  isStudioPreviewable,
  listingAddressLabel,
  realEstateEditPrompt,
  resolveStudioApprovePath,
  type AiEditRequest,
  type StudioAdjustments,
  type StudioFrame,
} from "../../shared/iconicStudio";
import { isListingStoragePath, safeStorageFileName, contentTypeForUpload } from "../../shared/listingAccess";
import {
  orderQueueAdvancePlan,
  type OrderQueueJob,
} from "../../shared/orderEditQueue";
import {
  orderEditDocId,
  orderEditDrafts,
  planOrderEdits,
  type OrderEditPlan,
} from "../../shared/orderEditPlan";
import { jsonSafe } from "../lib/firestoreJson";
import { firebaseDownloadUrl, registerListingPhoto, saveListingBytes } from "./listingMedia";
import {
  INSPECTION_FAILED_NOTE,
  OPENAI_IMAGE_EDIT_MODEL,
  OpenAiEditError,
  editListingPhotoWithOpenAI,
  inspectFinishedListingJpeg,
  readOpenAiApiKey,
  type DeliveryInspection,
} from "./openaiImageEdit";

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

function listingFrames(data: FirebaseFirestore.DocumentData): StudioFrame[] {
  return (Array.isArray(data.images) ? data.images : [])
    .map((item, index) => frameFromListingImage(item, index))
    .filter((frame): frame is StudioFrame => Boolean(frame));
}

async function downloadListingImage(listingId: string, sourcePath: string, fileName: string, contentType: string) {
  if (!isListingStoragePath(listingId, sourcePath)) {
    throw new OpenAiEditError("That photo is not stored on this listing.");
  }
  if (!isStudioPreviewable(fileName, contentType)) {
    throw new OpenAiEditError("OpenAI can edit a JPEG, PNG, or WebP. RAW files stay in the queue until a preview exists.");
  }
  const file = bucket().file(sourcePath);
  const [exists] = await file.exists();
  if (!exists) throw new OpenAiEditError("Source photo was not found in storage.");
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  if (size > 20_000_000) {
    throw new OpenAiEditError("That photo is over 20 MB. Export a smaller JPEG and queue the edit again.");
  }
  const resolved = contentTypeForUpload(fileName, String(metadata.contentType || contentType || ""));
  if (resolved !== "image/jpeg" && resolved !== "image/png" && resolved !== "image/webp") {
    throw new OpenAiEditError("OpenAI can edit a JPEG, PNG, or WebP. RAW files stay in the queue until a preview exists.");
  }
  const [bytes] = await file.download();
  return { bytes, contentType: resolved };
}

/** One real Images API edit. The prompt is already the order or staff instruction. */
async function runOpenAiEdit(input: {
  listingId: string;
  sourcePath: string;
  fileName: string;
  contentType: string;
  prompt: string;
}) {
  const apiKey = readOpenAiApiKey(process.env);
  if (!apiKey) throw new OpenAiEditError(AI_EDIT_MISSING_KEY_NOTE);
  const source = await downloadListingImage(input.listingId, input.sourcePath, input.fileName, input.contentType);
  const edited = await editListingPhotoWithOpenAI({
    apiKey,
    prompt: realEstateEditPrompt(input.prompt),
    bytes: source.bytes,
    contentType: source.contentType,
  });
  const base = input.fileName.replace(/\.\w+$/, "") || "edit";
  const saved = await saveListingBytes(input.listingId, `${base}-ai.jpg`, "image/jpeg", "photos", edited.bytes);
  return { afterUrl: saved.url, resultPath: saved.storagePath, bytes: edited.bytes };
}

/** Inspection never fails the edit that already saved. */
async function inspectOrderEditJpeg(bytes: Buffer): Promise<DeliveryInspection> {
  try {
    return await inspectFinishedListingJpeg({
      apiKey: readOpenAiApiKey(process.env),
      bytes,
    });
  } catch (err) {
    console.error("[Studio inspection]", err instanceof Error ? err.message : err);
    return { status: "flag", notes: [INSPECTION_FAILED_NOTE] };
  }
}

function failureNote(err: unknown): string {
  if (err instanceof OpenAiEditError) return err.message;
  return "The AI edit failed before a finished image was saved.";
}

export async function loadOrderEditContext(listingId: string): Promise<{ listing: Awaited<ReturnType<typeof loadListing>>; plan: OrderEditPlan }> {
  const listing = await loadListing(listingId);
  let order: FirebaseFirestore.DocumentData | null = null;
  const orderId = typeof listing.data.orderId === "string" ? listing.data.orderId : "";
  if (orderId) {
    const snap = await db().collection("orders").doc(orderId).get();
    if (snap.exists) order = snap.data() || {};
  }
  const plan = planOrderEdits({
    lineItems: listing.data.lineItems || order?.lineItems || order?.services,
    services: listing.data.services,
    serviceIds: listing.data.serviceIds,
    iconicPolish: listing.data.iconicPolish === true,
  });
  return { listing, plan };
}

export async function setIconicPolish(input: { listingId: string; iconicPolish: boolean }) {
  const listing = await loadListing(input.listingId);
  await listing.ref.update({
    iconicPolish: input.iconicPolish,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const { plan } = await loadOrderEditContext(input.listingId);
  return { iconicPolish: plan.iconicPolish, plan };
}

function jobUpdatedAtMs(data: FirebaseFirestore.DocumentData): number | null {
  const value = data.updatedAt;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function queueJobsFromSnap(docs: FirebaseFirestore.QueryDocumentSnapshot[]): OrderQueueJob[] {
  return docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      origin: typeof data.origin === "string" ? data.origin : "",
      status: typeof data.status === "string" ? data.status : "",
      type: typeof data.type === "string" ? data.type : "",
      sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
      updatedAtMs: jobUpdatedAtMs(data),
    };
  });
}

/**
 * Write order-driven edit jobs without calling OpenAI.
 * Failed jobs stay failed unless retryFailed is set (manual Run next).
 * Reels and gallery delivery are not queued here.
 */
export async function prepareOrderEditJobs(input: { listingId: string; createdBy: string; retryFailed?: boolean }) {
  const { listing, plan } = await loadOrderEditContext(input.listingId);
  const frames = listingFrames(listing.data);
  const drafts = orderEditDrafts(plan, frames);
  const settled = new Set(["review", "approved", "rejected", "processing", "failed"]);
  if (input.retryFailed) settled.delete("failed");
  let prepared = 0;

  for (const draft of drafts) {
    const ref = db().collection("editJobs").doc(orderEditDocId(input.listingId, draft.slot));
    const snap = await ref.get();
    const current = snap.data() || {};
    if (snap.exists && settled.has(String(current.status || ""))) continue;
    const payload: Record<string, unknown> = {
      kind: "ai_edit",
      origin: "order",
      slot: draft.slot,
      type: draft.type,
      label: draft.label,
      listingId: input.listingId,
      status: "pending",
      provider: "openai",
      model: OPENAI_IMAGE_EDIT_MODEL,
      prompt: draft.prompt,
      sourcePath: draft.sourcePath,
      sourceUrl: draft.imageUrl,
      beforeUrl: draft.imageUrl,
      afterUrl: "",
      resultPath: "",
      placeholder: false,
      iconicPolish: plan.iconicPolish,
      note: draft.sourcePath
        ? "Queued from the order. OpenAI has not run this photo yet."
        : draft.waitingNote,
      createdBy: input.createdBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!snap.exists) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(payload, { merge: true });
    prepared += 1;
  }

  const jobSnap = await db().collection("editJobs").where("listingId", "==", input.listingId).limit(200).get();
  const jobs = queueJobsFromSnap(jobSnap.docs);
  const advance = orderQueueAdvancePlan(jobs);
  const waiting = jobs.filter((job) => job.origin === "order" && job.status === "pending" && !job.sourcePath).length;
  return { plan, prepared, pending: advance.runnable, waiting, shouldFollowUp: advance.shouldFollowUp };
}

async function claimOrderEdit(ref: FirebaseFirestore.DocumentReference, now = Date.now()) {
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("missing");
      const data = snap.data() || {};
      const claimable = orderQueueAdvancePlan([{
        id: ref.id,
        origin: "order",
        status: String(data.status || ""),
        type: String(data.type || ""),
        sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
        updatedAtMs: jobUpdatedAtMs(data),
      }], now).nextId === ref.id;
      if (!claimable) throw new Error("busy");
      tx.update(ref, {
        status: "processing",
        note: "Editing this photo with OpenAI.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && (err.message === "busy" || err.message === "missing")) return false;
    throw err;
  }
}

/**
 * Prepare order jobs, then run exactly one OpenAI edit.
 * remaining / shouldFollowUp tell the caller to tick again.
 */
export async function advanceOrderEditQueue(input: { listingId: string; createdBy: string; retryFailed?: boolean }) {
  const prepared = await prepareOrderEditJobs(input);
  const jobSnap = await db().collection("editJobs").where("listingId", "==", input.listingId).limit(200).get();
  const advance = orderQueueAdvancePlan(queueJobsFromSnap(jobSnap.docs));
  const waiting = queueJobsFromSnap(jobSnap.docs).filter((job) => job.origin === "order" && job.status === "pending" && !job.sourcePath).length;
  if (!advance.nextId) {
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      ran: null,
      remaining: 0,
      waiting,
      shouldFollowUp: false,
    };
  }

  const next = jobSnap.docs.find((doc) => doc.id === advance.nextId) || null;
  if (!next) {
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      ran: null,
      remaining: advance.runnable,
      waiting,
      shouldFollowUp: advance.shouldFollowUp,
    };
  }

  const claimed = await claimOrderEdit(next.ref);
  if (!claimed) {
    const still = Math.max(0, advance.runnable - 1);
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      ran: null,
      remaining: still,
      waiting,
      shouldFollowUp: still > 0,
    };
  }

  const data = next.data() || {};
  const fileName = String(data.sourcePath || "").split("/").pop() || "photo.jpg";
  const beforeUrl = String(data.beforeUrl || data.sourceUrl || "");
  try {
    const saved = await runOpenAiEdit({
      listingId: input.listingId,
      sourcePath: String(data.sourcePath),
      fileName,
      contentType: "",
      prompt: String(data.prompt || prepared.plan.photoPrompt),
    });
    await next.ref.update({
      status: "review",
      beforeUrl,
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE,
      pipeline: ["pending", "processing", "review"],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const inspection = await inspectOrderEditJpeg(saved.bytes);
    try {
      await next.ref.update({
        inspection,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("[Studio inspection] The edit is in review, but the inspection note was not stored.", err instanceof Error ? err.message : err);
    }
    const remaining = Math.max(0, advance.remainingAfter);
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      remaining,
      waiting,
      shouldFollowUp: remaining > 0,
      ran: {
        jobId: next.id,
        status: "review" as const,
        slot: String(data.slot || ""),
        type: String(data.type || ""),
        beforeUrl,
        afterUrl: saved.afterUrl,
        resultPath: saved.resultPath,
        placeholder: false,
        note: AI_EDIT_READY_NOTE,
        inspection,
      },
    };
  } catch (err) {
    const note = failureNote(err);
    console.error("[Studio AI]", err instanceof Error ? err.message : err);
    await next.ref.update({
      status: "failed",
      placeholder: false,
      afterUrl: "",
      note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const remaining = Math.max(0, advance.remainingAfter);
    return {
      plan: prepared.plan,
      prepared: prepared.prepared,
      remaining,
      waiting,
      shouldFollowUp: remaining > 0,
      ran: {
        jobId: next.id,
        status: "failed" as const,
        slot: String(data.slot || ""),
        type: String(data.type || ""),
        beforeUrl,
        afterUrl: "",
        placeholder: false,
        note,
      },
    };
  }
}

/** Manual "Run next" retries a failed frame, then edits one photo. */
export async function queueOrderEdits(input: { listingId: string; createdBy: string }) {
  return advanceOrderEditQueue({ ...input, retryFailed: true });
}

/** After a photographer upload, enqueue every order edit. The caller advances one photo per request. */
export async function enqueueOrderEditsFromUpload(input: { listingId: string; createdBy: string }) {
  return prepareOrderEditJobs({ ...input, retryFailed: false });
}

/** Next listing with a pending order edit that has a source photo. Used by the cron tick. */
export async function nextOrderEditListingId(): Promise<string | null> {
  const snap = await db().collection("editJobs").where("status", "==", "pending").limit(40).get();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.origin === "order" && data.sourcePath && typeof data.listingId === "string" && data.listingId) {
      return data.listingId;
    }
  }
  return null;
}

/** Staff override for one frame. The default path is queueOrderEdits. */
export async function enqueueAiEdit(input: AiEditRequest & { createdBy: string }) {
  const listing = await loadListing(input.listingId);
  const frame = listingFrames(listing.data).find((item) => item.path === input.sourcePath);
  if (!frame) throw httpError(404, "That file is not on this listing.");
  if (!isStudioPreviewable(frame.name, frame.contentType)) {
    throw httpError(400, "Choose a JPEG, PNG, or WebP. RAW stays in the queue until a preview exists.");
  }

  const beforeUrl = frame.url || input.imageUrl;
  const ref = await db().collection("editJobs").add({
    kind: "ai_edit",
    origin: "staff_override",
    type: input.type,
    listingId: input.listingId,
    status: "processing",
    provider: "openai",
    model: OPENAI_IMAGE_EDIT_MODEL,
    prompt: input.prompt,
    sourcePath: input.sourcePath,
    sourceUrl: beforeUrl,
    beforeUrl,
    afterUrl: "",
    placeholder: false,
    note: "Editing this photo with OpenAI.",
    createdBy: input.createdBy,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    const saved = await runOpenAiEdit({
      listingId: input.listingId,
      sourcePath: input.sourcePath,
      fileName: frame.name,
      contentType: frame.contentType,
      prompt: input.prompt,
    });
    await ref.update({
      status: "review",
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE,
      pipeline: ["pending", "processing", "review"],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      id: ref.id,
      status: "review" as const,
      provider: "openai" as const,
      beforeUrl,
      afterUrl: saved.afterUrl,
      resultPath: saved.resultPath,
      placeholder: false,
      note: AI_EDIT_READY_NOTE,
    };
  } catch (err) {
    const note = failureNote(err);
    console.error("[Studio AI]", err instanceof Error ? err.message : err);
    await ref.update({
      status: "failed",
      placeholder: false,
      afterUrl: "",
      note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      id: ref.id,
      status: "failed" as const,
      provider: "openai" as const,
      beforeUrl,
      afterUrl: "",
      placeholder: false,
      note,
    };
  }
}

export async function rejectStudioJob(input: { listingId: string; jobId: string; rejectedBy: string }) {
  const ref = db().collection("editJobs").doc(input.jobId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "Edit job not found.");
  const job = snap.data() || {};
  if (job.listingId !== input.listingId) throw httpError(400, "That job is for a different listing.");
  if (job.status === "approved") throw httpError(400, "Approved finals stay on the listing.");
  const note = job.status === "failed"
    ? String(job.note || "Rejected.")
    : "Rejected before approval. The edited image was not added to the gallery.";
  await ref.set({
    status: "rejected",
    rejectedBy: input.rejectedBy,
    note,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: input.jobId, status: "rejected" as const, note };
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
    const images = listingFrames(loaded.data);
    let editPlan: OrderEditPlan | null = null;
    try {
      editPlan = (await loadOrderEditContext(input.listingId)).plan;
    } catch (err) {
      console.error("[Studio AI] Order plan failed:", err instanceof Error ? err.message : err);
    }
    listing = {
      id: loaded.id,
      address: listingAddressLabel(loaded.data),
      status: loaded.data.status || "",
      galleryId: loaded.data.galleryId || loaded.data.playtestGalleryId || "",
      iconicPolish: loaded.data.iconicPolish === true,
      images,
      editPlan,
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

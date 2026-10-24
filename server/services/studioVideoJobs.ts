/**
 * Studio video jobs and gallery attach.
 * Firestore when the Admin SDK is configured. Tests stay in memory so a
 * suite never writes a production gallery or videoJobs document.
 * Adding a video does not email, text, or change the gallery release.
 */

import admin from "firebase-admin";
import { randomBytes } from "node:crypto";
import {
  buildGalleryVideoAttachment,
  resolveGalleryTarget,
  searchGalleryOrders,
  type GalleryOrderRecord,
  type GalleryRecord,
  type GallerySearchHit,
  type ListingRecord,
} from "../../shared/videoGalleryAttach";
import { validateTemplateJob, type TemplateJobRequest } from "../../shared/studioVideoTemplates";

export type VideoJobKind = "template" | "timeline";
export type VideoJobStatus = "queued" | "rendering" | "ready" | "failed" | "needs_upload";

export interface VideoJob {
  id: string;
  kind: VideoJobKind;
  status: VideoJobStatus;
  progress: number;
  request: Record<string, unknown>;
  listingId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  message: string;
  rendererConnected: boolean;
  outputPath: string | null;
  manifestPath: string | null;
  posterPath: string | null;
  outputUrl: string | null;
  error: string | null;
}

export interface MemoryGalleryState {
  orders: GalleryOrderRecord[];
  galleries: GalleryRecord[];
  listings: ListingRecord[];
  jobs: VideoJob[];
}

const memory: MemoryGalleryState = { orders: [], galleries: [], listings: [], jobs: [] };

export function videoJobsUseMemory(): boolean {
  return process.env.NODE_ENV === "test" || !admin.apps.length;
}

export function resetStudioVideoMemory(): void {
  memory.orders = [];
  memory.galleries = [];
  memory.listings = [];
  memory.jobs = [];
}

export function seedStudioVideoMemory(seed: Partial<MemoryGalleryState>): void {
  if (process.env.NODE_ENV !== "test") return;
  if (seed.orders) memory.orders = seed.orders;
  if (seed.galleries) memory.galleries = seed.galleries.map((gallery) => ({
    ...gallery,
    videoLinks: Array.isArray(gallery.videoLinks) ? [...gallery.videoLinks] : [],
    mediaItems: Array.isArray(gallery.mediaItems) ? [...gallery.mediaItems] : [],
  }));
  if (seed.listings) memory.listings = seed.listings.map((listing) => ({
    ...listing,
    videos: Array.isArray(listing.videos) ? [...listing.videos] : [],
  }));
}

function nowIso(): string {
  return new Date().toISOString();
}

function jobId(): string {
  return `vj_${randomBytes(8).toString("hex")}`;
}

export function createQueuedJob(input: {
  kind: VideoJobKind;
  request: Record<string, unknown>;
  listingId: string;
  createdBy: string;
  rendererConnected: boolean;
  message: string;
  status?: VideoJobStatus;
}): VideoJob {
  const stamp = nowIso();
  const job: VideoJob = {
    id: jobId(),
    kind: input.kind,
    status: input.status ?? "queued",
    progress: 0,
    request: input.request,
    listingId: input.listingId,
    createdBy: input.createdBy,
    createdAt: stamp,
    updatedAt: stamp,
    message: input.message,
    rendererConnected: input.rendererConnected,
    outputPath: null,
    manifestPath: null,
    posterPath: null,
    outputUrl: null,
    error: null,
  };
  if (videoJobsUseMemory()) {
    memory.jobs.unshift(job);
    return job;
  }
  return job;
}

export async function saveJob(job: VideoJob): Promise<VideoJob> {
  job.updatedAt = nowIso();
  if (videoJobsUseMemory()) {
    const index = memory.jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) memory.jobs[index] = job;
    else memory.jobs.unshift(job);
    return job;
  }
  await admin.firestore().collection("videoJobs").doc(job.id).set(job);
  return job;
}

export async function getJob(id: string): Promise<VideoJob | null> {
  if (videoJobsUseMemory()) return memory.jobs.find((job) => job.id === id) ?? null;
  const snap = await admin.firestore().collection("videoJobs").doc(id).get();
  return snap.exists ? snap.data() as VideoJob : null;
}

export async function listJobs(listingId: string): Promise<VideoJob[]> {
  if (videoJobsUseMemory()) return memory.jobs.filter((job) => job.listingId === listingId);
  const snap = await admin.firestore().collection("videoJobs").where("listingId", "==", listingId).limit(40).get();
  return snap.docs.map((doc) => doc.data() as VideoJob);
}

export async function updateJob(id: string, patch: Partial<VideoJob>): Promise<VideoJob | null> {
  const current = await getJob(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id, updatedAt: nowIso() };
  await saveJob(next);
  return next;
}

export function queueMessage(connected: boolean): string {
  return connected ? "Render queued." : "Renderer not connected yet";
}

export function assertTemplateRequest(input: unknown): TemplateJobRequest {
  const result = validateTemplateJob(input);
  if (result.ok === false) {
    const error = new Error(result.error) as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return result.request;
}

export async function searchOrders(query: string): Promise<GallerySearchHit[]> {
  if (videoJobsUseMemory()) return searchGalleryOrders(memory.orders, query);
  const db = admin.firestore();
  const trimmed = query.trim();
  const hits = new Map<string, GalleryOrderRecord>();
  if (/^[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
    const direct = await db.collection("orders").doc(trimmed).get();
    if (direct.exists) hits.set(direct.id, { id: direct.id, ...direct.data() });
  }
  const exact = await db.collection("orders").where("orderNumber", "==", trimmed).limit(8).get();
  exact.docs.forEach((doc) => hits.set(doc.id, { id: doc.id, ...doc.data() }));
  const recent = await db.collection("orders").orderBy("createdAt", "desc").limit(400).get();
  recent.docs.forEach((doc) => hits.set(doc.id, { id: doc.id, ...doc.data() }));
  return searchGalleryOrders([...hits.values()], query);
}

async function loadGalleryContext(): Promise<{ galleries: GalleryRecord[]; listings: ListingRecord[] }> {
  if (videoJobsUseMemory()) return { galleries: memory.galleries, listings: memory.listings };
  const db = admin.firestore();
  const [galleries, listings] = await Promise.all([
    db.collection("galleries").limit(500).get(),
    db.collection("listings").limit(500).get(),
  ]);
  return {
    galleries: galleries.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    listings: listings.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
}

export async function attachVideoToGallery(input: {
  orderId: string;
  query?: string;
  url: string;
  storagePath: string;
  fileName: string;
  presetId: string;
  jobId: string;
  width: number;
  height: number;
  fps: number;
  poster?: string | null;
}): Promise<{ hit: GallerySearchHit; galleryId: string | null; listingId: string | null; videoSectionUrl: string | null; notifyClient: false }> {
  const orders = videoJobsUseMemory()
    ? memory.orders
    : [{ id: input.orderId }];
  const matches = videoJobsUseMemory()
    ? searchGalleryOrders(memory.orders, input.query || input.orderId).filter((hit) => hit.orderId === input.orderId)
    : await findProductionHit(input.orderId, input.query);
  const hit = matches[0];
  if (!hit) {
    const error = new Error("No order matched that address or order number.") as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  void orders;
  const context = await loadGalleryContext();
  const resolved = resolveGalleryTarget(hit, context.galleries, context.listings);
  if (resolved.error || (!resolved.gallery && !resolved.listing)) {
    const error = new Error(resolved.error || "This order has no gallery yet.") as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  const item = buildGalleryVideoAttachment(input);
  const listingId = resolved.listing?.id || hit.listingId;
  const galleryId = resolved.gallery?.id || hit.galleryId;
  if (videoJobsUseMemory()) {
    if (resolved.gallery) {
      const gallery = memory.galleries.find((entry) => entry.id === resolved.gallery?.id);
      if (gallery) {
        const videos = Array.isArray(gallery.videoLinks) ? gallery.videoLinks : [];
        const media = Array.isArray(gallery.mediaItems) ? gallery.mediaItems : [];
        gallery.videoLinks = [...videos, item];
        gallery.mediaItems = [...media, item];
      }
    }
    if (listingId) {
      const listing = memory.listings.find((entry) => entry.id === listingId);
      if (listing) {
        const videos = Array.isArray(listing.videos) ? listing.videos : [];
        listing.videos = [...videos, item];
      }
    }
  } else {
    const db = admin.firestore();
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    if (galleryId) {
      await db.collection("galleries").doc(galleryId).update({
        videoLinks: admin.firestore.FieldValue.arrayUnion(item),
        mediaItems: admin.firestore.FieldValue.arrayUnion(item),
        updatedAt: stamp,
      });
    }
    if (listingId) {
      await db.collection("listings").doc(listingId).update({
        videos: admin.firestore.FieldValue.arrayUnion(item),
        updatedAt: stamp,
      });
    }
  }
  return {
    hit: {
      ...hit,
      galleryId,
      listingId,
      videoSectionUrl: listingId ? `/admin/listing/${encodeURIComponent(listingId)}?tab=video` : null,
      studioVideoUrl: listingId ? `/studio/${encodeURIComponent(listingId)}?tab=videos` : null,
      galleryUrl: galleryId ? `/gallery/${encodeURIComponent(galleryId)}` : null,
    },
    galleryId,
    listingId,
    videoSectionUrl: listingId ? `/admin/listing/${encodeURIComponent(listingId)}?tab=video` : null,
    notifyClient: false,
  };
}

async function findProductionHit(orderId: string, query?: string): Promise<GallerySearchHit[]> {
  const db = admin.firestore();
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) return [];
  const order = { id: snap.id, ...snap.data() } as GalleryOrderRecord;
  const hits = searchGalleryOrders([order], query || orderId || snap.id);
  if (hits.length) return hits;
  return searchGalleryOrders([order], String(order.orderNumber || snap.id));
}

export function memoryGallery(id: string): GalleryRecord | undefined {
  return memory.galleries.find((gallery) => gallery.id === id);
}

export function memoryListing(id: string): ListingRecord | undefined {
  return memory.listings.find((listing) => listing.id === id);
}

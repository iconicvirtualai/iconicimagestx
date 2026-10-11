/**
 * Loads an order edit plan and measures it against approved finals.
 * Used by gallery deliver/status and the Iconic Studio workspace.
 * Does not send client email or SMS.
 */

import admin from "firebase-admin";
import {
  assessGalleryRelease,
  releaseForPlaytestDeliveryQaGallery,
  unlinkedGalleryRelease,
  type GalleryReleaseEvidence,
  type GalleryReleaseFile,
  type GalleryReleaseJob,
  type GalleryReleaseMedia,
  type GalleryReleaseReport,
} from "../../shared/galleryRelease";
import { frameFromListingImage } from "../../shared/iconicStudio";
import { planOrderEdits } from "../../shared/orderEditPlan";
import { loadOrderEditContext } from "./studioJobs";

const db = () => admin.firestore();

function asMedia(value: unknown): GalleryReleaseMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    return [{
      type: typeof row.type === "string" ? row.type : "",
      title: typeof row.title === "string" ? row.title : "",
      fileName: typeof row.fileName === "string" ? row.fileName : "",
    }];
  });
}

function filesFromListing(data: FirebaseFirestore.DocumentData): { uploads: GalleryReleaseFile[]; finals: GalleryReleaseFile[] } {
  const images = Array.isArray(data.images) ? data.images : [];
  const uploads: GalleryReleaseFile[] = [];
  const finals: GalleryReleaseFile[] = [];
  images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    if (!frame) return;
    const sourcePath = item && typeof item === "object" && typeof (item as { sourcePath?: unknown }).sourcePath === "string"
      ? (item as { sourcePath: string }).sourcePath
      : "";
    const file = {
      path: frame.path,
      name: frame.name,
      raw: frame.raw,
      previewable: frame.previewable,
      sourcePath,
    };
    if (frame.studioApproved || frame.studioRole === "final" || frame.path.includes("/finals/")) finals.push(file);
    if (!frame.path.includes("/finals/") && frame.studioRole !== "final") uploads.push(file);
  });
  return { uploads, finals };
}

async function galleryMediaForListing(
  listingId: string,
  listing: FirebaseFirestore.DocumentData,
  extra?: FirebaseFirestore.DocumentData,
): Promise<GalleryReleaseMedia[]> {
  const media = [
    ...asMedia(extra?.mediaItems),
    ...asMedia(extra?.videoLinks),
    ...asMedia(extra?.tourLinks),
  ];
  const ids = new Set<string>();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  const snap = await db().collection("galleries").where("listingId", "==", listingId).limit(10).get();
  snap.docs.forEach((doc) => ids.add(doc.id));
  for (const galleryId of ids) {
    if (extra && galleryId === extra.id) continue;
    const doc = await db().collection("galleries").doc(galleryId).get();
    if (!doc.exists) continue;
    const data = doc.data() || {};
    media.push(...asMedia(data.mediaItems), ...asMedia(data.videoLinks), ...asMedia(data.tourLinks));
  }
  return media;
}

export async function loadGalleryReleaseReport(
  listingId: string,
  gallery?: FirebaseFirestore.DocumentData,
): Promise<GalleryReleaseReport> {
  const { listing, plan } = await loadOrderEditContext(listingId);
  const files = filesFromListing(listing.data);
  const jobSnap = await db().collection("editJobs").where("listingId", "==", listingId).limit(200).get();
  const jobs: GalleryReleaseJob[] = jobSnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      slot: typeof data.slot === "string" ? data.slot : "",
      type: typeof data.type === "string" ? data.type : "",
      status: typeof data.status === "string" ? data.status : "",
      sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
      resultPath: typeof data.resultPath === "string" ? data.resultPath : "",
      fileName: typeof data.fileName === "string" ? data.fileName : "",
    };
  });
  const evidence: GalleryReleaseEvidence = {
    jobs,
    finals: files.finals,
    uploads: files.uploads,
    media: await galleryMediaForListing(listingId, listing.data, gallery),
  };
  const report = assessGalleryRelease(plan, evidence);
  if (report.required === 0 && plan.photoScope === "none" && plan.twilight.length === 0 && plan.deliverables.length === 0) {
    return unlinkedGalleryRelease();
  }
  return report;
}

export async function loadGalleryReleaseForGallery(galleryId: string): Promise<GalleryReleaseReport> {
  const snap = await db().collection("galleries").doc(galleryId).get();
  if (!snap.exists) {
    throw Object.assign(new Error("Gallery not found."), { status: 404 });
  }
  const gallery = { id: snap.id, ...(snap.data() || {}) } as FirebaseFirestore.DocumentData & { id: string };
  const playtestRelease = releaseForPlaytestDeliveryQaGallery(gallery);
  if (playtestRelease) return playtestRelease;
  const listingId = typeof gallery.listingId === "string" ? gallery.listingId.trim() : "";
  if (listingId) {
    const listingSnap = await db().collection("listings").doc(listingId).get();
    if (listingSnap.exists) return loadGalleryReleaseReport(listingId, gallery);
  }

  const orderId = typeof gallery.orderId === "string" ? gallery.orderId.trim() : "";
  let order: FirebaseFirestore.DocumentData | null = null;
  if (orderId) {
    const orderSnap = await db().collection("orders").doc(orderId).get();
    if (orderSnap.exists) order = orderSnap.data() || {};
  }
  const plan = planOrderEdits({
    lineItems: order?.lineItems || gallery.lineItems,
    services: order?.services || gallery.services,
    serviceIds: order?.serviceIds || gallery.serviceIds,
  });
  if (plan.photoScope === "none" && plan.twilight.length === 0 && plan.deliverables.length === 0) {
    return unlinkedGalleryRelease();
  }
  return assessGalleryRelease(plan, {
    jobs: [],
    finals: [],
    uploads: [],
    media: [...asMedia(gallery.mediaItems), ...asMedia(gallery.videoLinks), ...asMedia(gallery.tourLinks)],
  });
}

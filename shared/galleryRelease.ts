/**
 * Gallery release gate.
 * Client delivery (gallery status approved or delivered) stays held until
 * the order plan's photo, twilight, aerial, and file deliverables are met.
 * Same-day delivery is a promise, not a file, so it does not block release.
 * This module does not send email or SMS.
 */

import { RELEASED_GALLERY_STATUSES } from "./clientGalleryLink";
import { isPlaytestDeliveryQaGallery } from "./deliveryQaClient";
import { ORDER_GALLERY_RELEASE, type OrderEditPlan } from "./orderEditPlan";

export interface GalleryReleaseJob {
  slot?: string;
  type?: string;
  status?: string;
  sourcePath?: string;
  resultPath?: string;
  fileName?: string;
}

export interface GalleryReleaseFile {
  path: string;
  name: string;
  raw?: boolean;
  previewable?: boolean;
  sourcePath?: string;
}

export interface GalleryReleaseMedia {
  type?: string;
  title?: string;
  fileName?: string;
}

export interface GalleryReleaseEvidence {
  jobs: GalleryReleaseJob[];
  finals: GalleryReleaseFile[];
  uploads: GalleryReleaseFile[];
  media: GalleryReleaseMedia[];
}

export interface GalleryReleaseGap {
  id: string;
  label: string;
  required: number;
  satisfied: number;
}

export interface GalleryReleaseReport {
  galleryRelease: typeof ORDER_GALLERY_RELEASE;
  complete: boolean;
  linked: boolean;
  percent: number;
  required: number;
  satisfied: number;
  gaps: GalleryReleaseGap[];
  message: string;
}

const AERIAL_NAME = /aerial|drone/i;

export function galleryStatusNeedsReleaseGate(status: string): boolean {
  return (RELEASED_GALLERY_STATUSES as readonly string[]).includes(status);
}

export function isAerialAssetName(value: string): boolean {
  return AERIAL_NAME.test(value);
}

function mediaBlob(media: GalleryReleaseMedia): string {
  return `${media.type || ""} ${media.title || ""} ${media.fileName || ""}`.toLowerCase();
}

function fileBlob(file: GalleryReleaseFile): string {
  return `${file.name} ${file.path}`.toLowerCase();
}

export function mediaMatchesDeliverable(id: string, media: GalleryReleaseMedia): boolean {
  const blob = mediaBlob(media);
  const type = String(media.type || "").toLowerCase();
  if (id === "snap-reel") {
    if (/animated|walk-?through|cinematic/.test(blob)) return false;
    return type === "reel" || /snap/.test(blob);
  }
  if (id === "animated-reel") return /animated|walk-?through/.test(blob);
  if (id === "cinematic-video") return /cinematic/.test(blob);
  if (id === "floorplan") return /floor\s*plan|floorplan/.test(blob);
  if (id === "tour-3d") return type === "tour" || type === "matterport" || /matterport|3d tour/.test(blob);
  return false;
}

function fileMatchesDeliverable(id: string, file: GalleryReleaseFile): boolean {
  const blob = fileBlob(file);
  if (id === "floorplan") return /floor\s*plan|floorplan/.test(blob);
  if (id === "tour-3d") return /matterport|3d tour/.test(blob);
  if (id === "snap-reel") return /snap/.test(blob) && /reel/.test(blob);
  if (id === "animated-reel") return /animated|walk-?through/.test(blob);
  if (id === "cinematic-video") return /cinematic/.test(blob);
  return false;
}

function isTwilightJob(job: GalleryReleaseJob): boolean {
  return job.type === "twilight" || String(job.slot || "").startsWith("twilight-");
}

function approvedJobs(evidence: GalleryReleaseEvidence): GalleryReleaseJob[] {
  return evidence.jobs.filter((job) => job.status === "approved");
}

function previewableUploads(files: GalleryReleaseFile[]): GalleryReleaseFile[] {
  return files.filter((file) => file.raw !== true && file.previewable !== false && !file.path.includes("/finals/"));
}

export function unlinkedGalleryRelease(): GalleryReleaseReport {
  return {
    galleryRelease: ORDER_GALLERY_RELEASE,
    complete: true,
    linked: false,
    percent: 100,
    required: 0,
    satisfied: 0,
    gaps: [],
    message: "No package is linked to this gallery, so the order gate does not hold it.",
  };
}

/**
 * Deliver Gallery on the playtest QA gallery must not 409.
 * The seeded line is not a package. This still clears the hold when the
 * gallery is the playtest document, so a later package match cannot block it.
 * A gallery with that id and playtest not true keeps the normal gate.
 */
export function releaseForPlaytestDeliveryQaGallery(
  gallery: { id?: unknown; playtest?: unknown } | null | undefined,
): GalleryReleaseReport | null {
  if (!isPlaytestDeliveryQaGallery(gallery)) return null;
  return {
    ...unlinkedGalleryRelease(),
    message: "Playtest delivery QA gallery. The order gate does not hold it.",
  };
}

function gapLine(id: string, label: string, required: number, satisfied: number): GalleryReleaseGap {
  return { id, label, required, satisfied: Math.max(0, satisfied) };
}

function releaseMessage(complete: boolean, percent: number, gaps: GalleryReleaseGap[], required: number): string {
  if (required === 0) {
    return "No image or file requirements are on this order. The gallery is not held.";
  }
  if (complete) {
    return "Order plan is 100% complete. The gallery can be marked delivered or approved.";
  }
  const missing = gaps.map((gap) => (
    gap.required > 1 || gap.satisfied > 0
      ? `${gap.label} (${gap.satisfied}/${gap.required})`
      : gap.label
  ));
  return `Gallery stays held until the order is 100% complete (${percent}%). Missing: ${missing.join(", ")}.`;
}

export function assessGalleryRelease(plan: OrderEditPlan, evidence: GalleryReleaseEvidence): GalleryReleaseReport {
  const lines: GalleryReleaseGap[] = [];
  const approved = approvedJobs(evidence);
  const twilightResults = new Set(
    approved.filter(isTwilightJob).map((job) => job.resultPath).filter((path): path is string => Boolean(path)),
  );
  const photoSources = new Set<string>();
  const aerialKeys = new Set<string>();

  for (const job of approved) {
    if (isTwilightJob(job)) continue;
    const name = `${job.fileName || ""} ${job.sourcePath || ""} ${job.resultPath || ""}`;
    if (isAerialAssetName(name)) {
      const key = job.sourcePath || job.resultPath || job.slot || name;
      aerialKeys.add(key);
      continue;
    }
    const key = job.sourcePath || job.resultPath || job.slot;
    if (key) photoSources.add(key);
  }

  for (const final of evidence.finals) {
    if (twilightResults.has(final.path)) continue;
    const name = `${final.name} ${final.path}`;
    if (isAerialAssetName(name)) {
      aerialKeys.add(final.path || final.name);
      continue;
    }
    const key = final.sourcePath || final.path;
    if (!key || photoSources.has(key)) continue;
    photoSources.add(key);
  }

  if (plan.photoScope === "count" && (plan.photoCount || 0) > 0) {
    lines.push(gapLine("photos", "Photos", plan.photoCount || 0, photoSources.size));
  } else if (plan.photoScope === "full") {
    const uploads = previewableUploads(evidence.uploads).filter((file) => !isAerialAssetName(fileBlob(file)));
    if (uploads.length === 0) {
      lines.push(gapLine("photos", "Photos", 1, 0));
    } else {
      const satisfied = uploads.filter((file) => (
        photoSources.has(file.path)
        || approved.some((job) => !isTwilightJob(job) && job.sourcePath === file.path)
      )).length;
      lines.push(gapLine("photos", "Photos", uploads.length, satisfied));
    }
  }

  if (plan.twilight.length > 0) {
    const approvedSlots = new Set(approved.filter(isTwilightJob).map((job) => String(job.slot || "")));
    const satisfied = plan.twilight.filter((slot) => approvedSlots.has(slot.slot)).length;
    lines.push(gapLine("twilight", "Twilight renders", plan.twilight.length, satisfied));
  }

  const aerial = plan.deliverables.find((item) => item.id === "aerials");
  if (aerial) {
    if (typeof aerial.count === "number" && aerial.count > 0) {
      lines.push(gapLine("aerials", aerial.label, aerial.count, aerialKeys.size));
    } else {
      const uploads = previewableUploads(evidence.uploads).filter((file) => isAerialAssetName(fileBlob(file)));
      if (uploads.length === 0) {
        lines.push(gapLine("aerials", "Aerial stills", 1, 0));
      } else {
        const satisfied = uploads.filter((file) => (
          aerialKeys.has(file.path)
          || approved.some((job) => job.sourcePath === file.path && isAerialAssetName(`${job.fileName || ""} ${job.sourcePath || ""}`))
        )).length;
        lines.push(gapLine("aerials", "Aerial stills", uploads.length, satisfied));
      }
    }
  }

  const usedMedia = new Set<number>();
  for (const item of plan.deliverables) {
    if (item.id === "aerials" || item.kind === "delivery") continue;
    if (item.kind !== "video" && item.kind !== "floorplan" && item.id !== "tour-3d") continue;
    const fileHit = [...evidence.finals, ...evidence.uploads].some((file) => fileMatchesDeliverable(item.id, file));
    let mediaHit = false;
    if (!fileHit) {
      for (let index = 0; index < evidence.media.length; index += 1) {
        if (usedMedia.has(index)) continue;
        if (!mediaMatchesDeliverable(item.id, evidence.media[index])) continue;
        usedMedia.add(index);
        mediaHit = true;
        break;
      }
    }
    lines.push(gapLine(item.id, item.label, 1, fileHit || mediaHit ? 1 : 0));
  }

  const measurable = lines.filter((line) => line.required > 0);
  const gaps = measurable.filter((line) => line.satisfied < line.required);
  const required = measurable.reduce((sum, line) => sum + line.required, 0);
  const satisfied = measurable.reduce((sum, line) => sum + Math.min(line.satisfied, line.required), 0);
  const percent = required === 0 ? 100 : Math.floor((satisfied / required) * 100);
  const complete = gaps.length === 0;
  return {
    galleryRelease: ORDER_GALLERY_RELEASE,
    complete,
    linked: true,
    percent,
    required,
    satisfied,
    gaps,
    message: releaseMessage(complete, percent, gaps, required),
  };
}

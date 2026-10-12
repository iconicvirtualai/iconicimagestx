/**
 * Site-editor uploads. Images are re-encoded to WebP. Videos are stored as-is
 * after a magic-byte check. Files land in Firebase Storage under site-content/
 * when a bucket is configured. Otherwise they are served from this process.
 */

import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import admin from "firebase-admin";
import {
  SITE_IMAGE_BYTES,
  SITE_VIDEO_BYTES,
  isAllowedDropboxHost,
  isPrivateAddress,
  prepareDropboxUrl,
  sniffMedia,
} from "../../shared/siteEditor.ts";

const blobs = new Map<string, { body: Buffer; type: string }>();

export function siteMediaBlob(id: string) {
  return blobs.get(id) ?? null;
}

function bucketName() {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "";
}

async function optimizeImage(bytes: Buffer): Promise<{ body: Buffer; type: string; ext: string }> {
  const sharp = (await import("sharp")).default;
  const body = await sharp(bytes, { failOn: "none" }).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return { body, type: "image/webp", ext: "webp" };
}

async function saveObject(pageId: string, ext: string, body: Buffer, type: string): Promise<string> {
  const safePage = pageId.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "page";
  const objectPath = `site-content/${safePage}/${Date.now()}-${randomUUID()}.${ext}`;
  const bucket = bucketName();
  if (admin.apps.length && bucket && process.env.NODE_ENV !== "test" && process.env.SITE_CONTENT_STORE !== "memory") {
    const token = randomUUID();
    await admin.storage().bucket(bucket).file(objectPath).save(body, {
      resumable: false,
      metadata: { contentType: type, metadata: { firebaseStorageDownloadTokens: token } },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  }
  const id = randomUUID();
  blobs.set(id, { body, type });
  return `/api/site-content/blob/${id}`;
}

export async function storeSiteUpload(pageId: string, bytes: Buffer): Promise<{ url: string; kind: "image" | "video" }> {
  const kind = sniffMedia(bytes);
  if (!kind) {
    const error = new Error("Upload a JPG, PNG, WebP, MP4, or MOV file.");
    (error as { status?: number }).status = 415;
    throw error;
  }
  if (kind === "image" && bytes.length > SITE_IMAGE_BYTES) {
    const error = new Error("That image is over 25 MB.");
    (error as { status?: number }).status = 413;
    throw error;
  }
  if (kind === "video" && bytes.length > SITE_VIDEO_BYTES) {
    const error = new Error("That video is over 80 MB.");
    (error as { status?: number }).status = 413;
    throw error;
  }
  if (kind === "video") {
    const brand = bytes.length >= 12 ? String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) : "";
    const ext = brand.toLowerCase().includes("qt") ? "mov" : "mp4";
    const url = await saveObject(pageId, ext, bytes, ext === "mov" ? "video/quicktime" : "video/mp4");
    return { url, kind };
  }
  const optimized = await optimizeImage(bytes);
  const url = await saveObject(pageId, optimized.ext, optimized.body, optimized.type);
  return { url, kind: "image" };
}

async function assertPublicHost(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error("That Dropbox link could not be resolved.");
  for (const record of records) {
    if (isPrivateAddress(record.address)) throw new Error("That Dropbox link is not allowed.");
  }
}

export async function importDropboxFile(rawUrl: string): Promise<{ bytes: Buffer; kind: "image" | "video" }> {
  const start = prepareDropboxUrl(rawUrl);
  if (!start) {
    const error = new Error("Paste a Dropbox file link. Folder links need Dropbox connect, which is not set up yet.");
    (error as { status?: number }).status = 400;
    throw error;
  }
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHost(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(current, { redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Dropbox redirected without a destination.");
      const next = new URL(location, current);
      if (next.protocol !== "https:" || next.username || next.password || !isAllowedDropboxHost(next.hostname)) {
        throw new Error("Dropbox redirected to a host that is not allowed.");
      }
      current = next;
      continue;
    }
    if (!response.ok || !response.body) throw new Error("Dropbox did not return the file.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > SITE_VIDEO_BYTES) throw new Error("That Dropbox file is over the upload limit.");
      chunks.push(step.value);
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const kind = sniffMedia(bytes);
    if (!kind) throw new Error("That Dropbox file is not a JPG, PNG, WebP, MP4, or MOV.");
    if (kind === "image" && bytes.length > SITE_IMAGE_BYTES) throw new Error("That image is over 25 MB.");
    return { bytes, kind };
  }
  throw new Error("Dropbox redirected too many times.");
}

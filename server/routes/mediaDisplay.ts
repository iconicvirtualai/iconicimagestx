/**
 * Resized JPEG for one display image.
 *   GET /api/media/display/:listingId/:index — public studio share, only while that share is open
 *   GET /api/media/display/p/:token/:index — one presentation's photos, while the token is active
 *   GET /api/media/display/o/:signedToken/:index — locked owner or gallery, HMAC scoped to that view
 * Source URLs stay on the server. A lock change is not cached for a day:
 * s-maxage is 5 minutes, with a short stale window.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RequestHandler } from "express";
import admin from "firebase-admin";
import sharp from "sharp";
import { publicStudioShareOpen } from "../../shared/clientGalleryLink";
import { readOwnerDisplayToken } from "../../shared/ownerDisplayGrant";
import { presentationPhotoSources } from "../../shared/presentation";
import {
  galleryOwnerDisplayItems,
  listingOwnerDisplayItems,
  shareDisplayItems,
  type ShareDisplayItem,
  type ShareListing,
} from "../../shared/publicShare";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=60";
const MAX_EDGE = 1600;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_DEFAULT = 180;
const ALLOWED_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
const PROJECT_HOSTS = new Set(["iconicimagestx.vercel.app"]);
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

const displayLimiter = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  max: () => {
    const raw = Number(process.env.MEDIA_DISPLAY_RATE_MAX);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 10_000) return Math.floor(raw);
    return RATE_MAX_DEFAULT;
  },
});

export function resetMediaDisplayRateLimit() {
  displayLimiter.reset();
}

function notFound(res: { status: (code: number) => { json: (body: unknown) => unknown }; setHeader: (name: string, value: string) => void }) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(404).json({ error: "Not found." });
}

function mediaRoot(): string {
  return path.resolve(process.cwd(), "public", "media");
}

function isVideoSource(sourceUrl: string): boolean {
  const pathOnly = sourceUrl.split("?")[0].split("#")[0];
  return VIDEO_EXT.test(pathOnly);
}

function localCandidate(sourceUrl: string, allowVideo = false): string | null {
  let pathname = "";
  if (sourceUrl.startsWith("/")) pathname = sourceUrl.split("?")[0].split("#")[0];
  else {
    try {
      pathname = new URL(sourceUrl).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith("/media/")) return null;
  const relative = pathname.slice("/media/".length);
  if (!relative || relative.includes("..") || relative.includes("\\")) return null;
  if (!IMAGE_EXT.test(relative) && !(allowVideo && VIDEO_EXT.test(relative))) return null;
  const root = mediaRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

async function readLocal(sourceUrl: string, allowVideo = false): Promise<Buffer | null> {
  const file = localCandidate(sourceUrl, allowVideo);
  if (!file) return null;
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_SOURCE_BYTES) return null;
    const root = await realpath(mediaRoot());
    const real = await realpath(file);
    if (real !== root && !real.startsWith(root + path.sep)) return null;
    return await readFile(real);
  } catch {
    return null;
  }
}

function remoteUrl(sourceUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.toString();
}

function onVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/**
 * Local disk is a dev/test fallback. Production functions have no public/ tree.
 * vercel.json excludeFiles keeps public/media out of the function package,
 * because the file tracer would otherwise follow this directory.
 */
function allowDiskRead(): boolean {
  if (onVercel()) return false;
  return process.env.NODE_ENV !== "production";
}

function hostnameOf(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function deploymentHosts(): Set<string> {
  const hosts = new Set(PROJECT_HOSTS);
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (vercel) hosts.add(vercel);
  return hosts;
}

/**
 * This deployment's host. APP_URL is the Wix site and must not be used:
 * it 301s, and the fetch refuses redirects. VERCEL_URL wins. The request
 * host is used only when it is this Vercel project.
 */
function chooseOwnHost(req: { headers?: { host?: string | string[] } }): string {
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (vercel) return vercel;
  const header = req.headers?.host;
  const raw = Array.isArray(header) ? header[0] : header;
  const requestHost = hostnameOf(typeof raw === "string" ? raw.split(",")[0] : "");
  if (requestHost && deploymentHosts().has(requestHost)) return requestHost;
  return "";
}

function mediaPathname(sourceUrl: string, allowVideo = false): string | null {
  let pathname = "";
  if (sourceUrl.startsWith("/")) pathname = sourceUrl.split("?")[0].split("#")[0];
  else {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith("/media/") || pathname.includes("..") || pathname.includes("\\") || pathname.includes("//")) return null;
  if (!IMAGE_EXT.test(pathname) && !(allowVideo && VIDEO_EXT.test(pathname))) return null;
  return pathname;
}

/** Same-origin /media fetch. Never the foreign host the path was copied from. */
function ownMediaUrl(sourceUrl: string, req: { headers?: { host?: string | string[] } }, allowVideo = false): string | null {
  const pathname = mediaPathname(sourceUrl, allowVideo);
  const host = chooseOwnHost(req);
  if (!pathname || !host || !deploymentHosts().has(host)) return null;
  return `https://${host}${pathname}`;
}

async function readRemote(target: string): Promise<Buffer | null> {
  let response: Response;
  try {
    response = await fetch(target, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > MAX_SOURCE_BYTES) return null;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type && !type.startsWith("image/")) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function loadSource(sourceUrl: string, req: { headers?: { host?: string | string[] } }, allowVideo = false): Promise<Buffer | null> {
  if (allowDiskRead()) {
    const local = await readLocal(sourceUrl, allowVideo);
    if (local) return local;
  }
  const remote = remoteUrl(sourceUrl);
  if (remote) return readRemote(remote);
  const own = ownMediaUrl(sourceUrl, req, allowVideo);
  if (own) return readRemote(own);
  return null;
}

/** One JPEG frame from a video. The MP4 itself is never written to the response. */
async function ffmpegPoster(source: Buffer): Promise<Buffer | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "display-poster-"));
  const file = path.join(dir, "source.bin");
  try {
    await writeFile(file, source);
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value: Buffer | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const child = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-ss", "0.2",
        "-i", file,
        "-frames:v", "1",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1",
      ], { stdio: ["ignore", "pipe", "ignore"] });
      const chunks: Buffer[] = [];
      let total = 0;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(null);
      }, FETCH_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > 8 * 1024 * 1024) {
          child.kill("SIGKILL");
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      child.on("error", () => {
        clearTimeout(timer);
        finish(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const frame = chunks.length ? Buffer.concat(chunks) : null;
        finish(code === 0 && frame && frame.length > 16 ? frame : null);
      });
    });
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function galleriesForShare(listingId: string, listing: ShareListing): Promise<Array<Record<string, unknown>>> {
  const docs: Array<Record<string, unknown>> = [];
  const ids = new Set<string>();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  for (const id of ids) {
    try {
      const snap = await admin.firestore().collection("galleries").doc(id).get();
      if (snap.exists) docs.push({ id: snap.id, ...(snap.data() || {}) });
    } catch {
      // A missing gallery must not hide the listing photos.
    }
  }
  try {
    const linked = await admin.firestore().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    linked.docs.forEach((doc) => {
      if (!docs.some((item) => item.id === doc.id)) docs.push({ id: doc.id, ...(doc.data() || {}) });
    });
  } catch {
    // Listing-photo indexes do not depend on this query.
  }
  return docs;
}

type DisplayTarget =
  | { kind: "share"; listingId: string; index: number }
  | { kind: "presentation"; token: string; index: number }
  | { kind: "owner"; token: string; index: number };

function parseIndex(value: string): number | null {
  if (!/^\d{1,4}$/.test(value) || String(Number(value)) !== value) return null;
  return Number(value);
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function requestPath(req: { url?: string }): string {
  if (!req.url) return "";
  try {
    return new URL(req.url, "https://display.local").pathname;
  } catch {
    return req.url.split("?")[0] || "";
  }
}

function displayTarget(req: {
  params?: { listingId?: string; index?: string; token?: string; signedToken?: string };
  url?: string;
}): DisplayTarget | null {
  const path = requestPath(req);
  const presentation = path.match(/\/api\/media\/display\/p\/([^/]+)\/([^/]+)\/?$/);
  if (presentation) {
    const index = parseIndex(decodePart(presentation[2]));
    if (index === null) return null;
    return { kind: "presentation", token: decodePart(presentation[1]), index };
  }
  const owner = path.match(/\/api\/media\/display\/o\/([^/]+)\/([^/]+)\/?$/);
  if (owner) {
    const index = parseIndex(decodePart(owner[2]));
    if (index === null) return null;
    return { kind: "owner", token: decodePart(owner[1]), index };
  }
  const share = path.match(/\/api\/media\/display\/([^/]+)\/([^/]+)\/?$/);
  if (share) {
    const listingId = decodePart(share[1]);
    const index = parseIndex(decodePart(share[2]));
    if (!listingId || listingId === "p" || listingId === "o" || index === null) return null;
    return { kind: "share", listingId, index };
  }
  const params = req.params || {};
  const index = parseIndex(String(params.index || ""));
  if (index === null) return null;
  if (params.token) return { kind: "presentation", token: String(params.token), index };
  if (params.signedToken) return { kind: "owner", token: String(params.signedToken), index };
  if (params.listingId && params.listingId !== "p" && params.listingId !== "o") {
    return { kind: "share", listingId: String(params.listingId), index };
  }
  return null;
}

async function loadListing(listingId: string): Promise<ShareListing | null> {
  const snap = await admin.firestore().collection("listings").doc(listingId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

async function listingByPresentationToken(token: string): Promise<ShareListing | null> {
  const snap = await admin.firestore().collection("listings").where("presentationToken", "==", token).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...(doc.data() || {}) };
}

async function galleryMedia(galleryId: string): Promise<unknown[] | null> {
  const snap = await admin.firestore().collection("galleries").doc(galleryId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return [
    ...(Array.isArray(data.mediaItems) ? data.mediaItems : []),
    ...(Array.isArray(data.videoLinks) ? data.videoLinks : []),
    ...(Array.isArray(data.tourLinks) ? data.tourLinks : []),
  ];
}

async function resolveItem(target: DisplayTarget): Promise<ShareDisplayItem | null> {
  if (target.kind === "share") {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(target.listingId)) return null;
    const listing = await loadListing(target.listingId);
    if (!listing || !publicStudioShareOpen(listing)) return null;
    return shareDisplayItems(listing)[target.index] || null;
  }
  if (target.kind === "presentation") {
    if (!/^[A-Za-z0-9_-]{22,80}$/.test(target.token)) return null;
    const listing = await listingByPresentationToken(target.token);
    if (!listing || listing.presentationEnabled === false) return null;
    const galleries = await galleriesForShare(listing.id, listing);
    const sourceUrl = presentationPhotoSources({ token: target.token, listing, galleries })[target.index];
    if (!sourceUrl) return null;
    return { name: "Photo", sourceUrl, kind: "image" };
  }
  const claims = readOwnerDisplayToken(target.token);
  if (!claims) return null;
  if (claims.scope === "listing") {
    const listing = await loadListing(claims.id);
    if (!listing) return null;
    return listingOwnerDisplayItems(listing)[target.index] || null;
  }
  const media = await galleryMedia(claims.id);
  if (!media) return null;
  return galleryOwnerDisplayItems(media)[target.index] || null;
}

async function renderJpeg(source: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(source, { limitInputPixels: 80_000_000, failOn: "error" })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

function etagFor(bytes: Buffer): string {
  return `"${createHash("sha1").update(bytes).digest("hex")}"`;
}

function etagMatches(header: unknown, etag: string): boolean {
  const raw = Array.isArray(header) ? header.join(",") : typeof header === "string" ? header : "";
  if (!raw) return false;
  return raw.split(",").some((part) => {
    const token = part.trim();
    return token === "*" || token === etag || token === `W/${etag}`;
  });
}

export const handleMediaDisplay: RequestHandler = async (req, res) => {
  const limit = displayLimiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Too many requests." });
  }

  const target = displayTarget(req);
  if (!target) return notFound(res);
  if (!admin.apps.length) return notFound(res);

  let item: ShareDisplayItem | null = null;
  try {
    item = await resolveItem(target);
  } catch {
    console.error("[media-display] lookup failed");
    return notFound(res);
  }
  if (!item) return notFound(res);

  const video = item.kind === "poster" && isVideoSource(item.sourceUrl);
  let source = await loadSource(item.sourceUrl, req, video);
  if (source && video) source = await ffmpegPoster(source);
  const jpeg = source ? await renderJpeg(source) : null;
  if (!jpeg) {
    console.error("[media-display] could not build a display image");
    return notFound(res);
  }

  const etag = etagFor(jpeg);
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("ETag", etag);
  if (etagMatches(req.headers["if-none-match"], etag)) {
    return res.status(304).end();
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Length", String(jpeg.length));
  return res.status(200).end(jpeg);
};

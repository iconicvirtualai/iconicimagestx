/**
 * GET /api/media/display/:listingId/:index
 * Resized JPEG for one public-share image. The index matches shareDisplayItems.
 * Source URLs stay on the server. MLS and full-res rasters are resized here
 * instead of being dropped from the share.
 */

import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "express";
import admin from "firebase-admin";
import sharp from "sharp";
import { shareDisplayItems, type ShareListing } from "../../shared/publicShare";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";

const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";
const MAX_EDGE = 1600;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_DEFAULT = 180;
const ALLOWED_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
const STATIC_OWN_HOSTS = new Set([
  "iconicimagestx.com",
  "www.iconicimagestx.com",
  "iconicimagestx.vercel.app",
]);

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

function localCandidate(sourceUrl: string): string | null {
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
  if (!/\.(jpe?g|png|webp|gif)$/i.test(relative)) return null;
  const root = mediaRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

async function readLocal(sourceUrl: string): Promise<Buffer | null> {
  const file = localCandidate(sourceUrl);
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

function trustedOwnHosts(): Set<string> {
  const hosts = new Set(STATIC_OWN_HOSTS);
  const app = hostnameOf(process.env.APP_URL);
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (app) hosts.add(app);
  if (vercel) hosts.add(vercel);
  return hosts;
}

function chooseOwnHost(req: { headers?: { host?: string | string[] } }): string {
  const trusted = trustedOwnHosts();
  const app = hostnameOf(process.env.APP_URL);
  if (app && trusted.has(app)) return app;
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (vercel && trusted.has(vercel)) return vercel;
  const header = req.headers?.host;
  const raw = Array.isArray(header) ? header[0] : header;
  const requestHost = hostnameOf(typeof raw === "string" ? raw.split(",")[0] : "");
  if (requestHost && trusted.has(requestHost)) return requestHost;
  return trusted.has("iconicimagestx.com") ? "iconicimagestx.com" : "";
}

function mediaPathname(sourceUrl: string): string | null {
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
  if (!/\.(jpe?g|png|webp|gif)$/i.test(pathname)) return null;
  return pathname;
}

/** Same-origin /media fetch. Never the foreign host the path was copied from. */
function ownMediaUrl(sourceUrl: string, req: { headers?: { host?: string | string[] } }): string | null {
  const pathname = mediaPathname(sourceUrl);
  const host = chooseOwnHost(req);
  if (!pathname || !host || !trustedOwnHosts().has(host)) return null;
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

async function loadSource(sourceUrl: string, req: { headers?: { host?: string | string[] } }): Promise<Buffer | null> {
  if (allowDiskRead()) {
    const local = await readLocal(sourceUrl);
    if (local) return local;
  }
  const remote = remoteUrl(sourceUrl);
  if (remote) return readRemote(remote);
  const own = ownMediaUrl(sourceUrl, req);
  if (own) return readRemote(own);
  return null;
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

function displayParams(req: { params?: { listingId?: string; index?: string }; url?: string }): { listingId: string; index: string } {
  const params = req.params || {};
  let listingId = String(params.listingId || "");
  let index = String(params.index || "");
  if (listingId && index) return { listingId, index };
  if (!req.url) return { listingId, index };
  try {
    const url = new URL(req.url, "https://iconicimagestx.com");
    const match = url.pathname.match(/\/api\/media\/display\/([^/]+)\/([^/]+)\/?$/);
    if (!listingId && match) listingId = decodeURIComponent(match[1]);
    if (!index && match) index = decodeURIComponent(match[2]);
    if (!listingId) listingId = url.searchParams.get("listingId") || "";
    if (!index) index = url.searchParams.get("index") || "";
  } catch {
    // Fall through to the 404 below.
  }
  return { listingId, index };
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

  const { listingId, index: indexRaw } = displayParams(req);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId) || !/^\d{1,4}$/.test(indexRaw) || String(Number(indexRaw)) !== indexRaw) {
    return notFound(res);
  }

  if (!admin.apps.length) return notFound(res);

  let listing: ShareListing | null = null;
  try {
    const snap = await admin.firestore().collection("listings").doc(listingId).get();
    if (!snap.exists) return notFound(res);
    listing = { id: snap.id, ...(snap.data() || {}) };
  } catch {
    console.error("[media-display] listing lookup failed");
    return notFound(res);
  }

  const galleries = await galleriesForShare(listingId, listing);
  const item = shareDisplayItems(listing, { galleries })[Number(indexRaw)];
  if (!item) return notFound(res);

  const source = await loadSource(item.sourceUrl, req);
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

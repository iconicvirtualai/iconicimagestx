/**
 * GET /api/media/display/:listingId/:index
 * Resized JPEG for one public-share image. The index matches shareDisplayItems.
 * Source URLs stay on the server.
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

async function readRemote(sourceUrl: string): Promise<Buffer | null> {
  const target = remoteUrl(sourceUrl);
  if (!target) return null;
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

async function loadSource(sourceUrl: string): Promise<Buffer | null> {
  const local = await readLocal(sourceUrl);
  if (local) return local;
  return readRemote(sourceUrl);
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

  const listingId = String(req.params.listingId || "");
  const indexRaw = String(req.params.index || "");
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

  const item = shareDisplayItems(listing)[Number(indexRaw)];
  if (!item) return notFound(res);

  const source = await loadSource(item.sourceUrl);
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

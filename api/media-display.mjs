import "dotenv/config";
import admin from "firebase-admin";
import { createHash } from "node:crypto";
import { stat, realpath, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const RASTER = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const VIDEO_FILE = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;
const BLOCKED_EXT = /\.(zip|pdf|dng|cr2|cr3|nef|nrw|arw|srf|sr2|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic|heif|mp4|m4v|mov|webm)(\?|#|$)/i;
const FILE_KEYS = ["downloadUrl", "fileUrl", "originalUrl", "fullResUrl", "mlsUrl", "zipUrl", "printUrl", "reelUrl", "mp4Url", "rawUrl", "src"];
const DISPLAY_KEYS = ["previewUrl", "displayUrl", "webUrl", "thumbnailUrl"];
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function rowOf(item) {
  return item && typeof item === "object" ? item : null;
}
function shareableUrl(value) {
  const url = text(value);
  if (!url || url.startsWith("//") || url.includes("\\") || url.includes("..")) return "";
  if (url.startsWith("/")) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}
function mediaName(row, fallback) {
  return text(row.name) || text(row.fileName) || text(row.title) || fallback;
}
function labelOf(row) {
  return `${text(row.fileName)} ${text(row.name)} ${text(row.title)} ${text(row.path)} ${text(row.storagePath)}`.toLowerCase();
}
function isMls(row) {
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (category === "mls" || type === "mls") return true;
  const label = labelOf(row);
  if (/(^|[^a-z0-9])mls([^a-z0-9]|$)/.test(label)) return true;
  return /\/mls\//.test(label);
}
function isFullRes(row) {
  const category = text(row.category).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (category === "full-res" || category === "fullres" || type === "full-res" || type === "fullres") return true;
  const label = labelOf(row);
  if (/(^|[^a-z0-9])full[\s_-]?res([^a-z0-9]|$)/.test(label)) return true;
  return /\/full\//.test(label);
}
function isRasterUrl(url, row) {
  if (!url || BLOCKED_EXT.test(url.split("#")[0]) || VIDEO_FILE.test(url.split("#")[0])) return false;
  if (RASTER.test(url.split("#")[0])) return true;
  const content = text(row.contentType).toLowerCase();
  return /^image\/(jpeg|jpg|png|webp|gif)/.test(content);
}
function blockedFileUrls(row, includeOwnUrl) {
  const blocked = /* @__PURE__ */ new Set();
  for (const key of FILE_KEYS) {
    const url = shareableUrl(row[key]);
    if (url) blocked.add(url);
  }
  if (includeOwnUrl) {
    const own = shareableUrl(row.url);
    const share = shareableUrl(row.shareUrl);
    if (own) blocked.add(own);
    if (share) blocked.add(share);
  }
  return blocked;
}
function separateDisplay(row) {
  const blocked = blockedFileUrls(row, isFullRes(row));
  for (const key of DISPLAY_KEYS) {
    const url = shareableUrl(row[key]);
    if (!url || !isRasterUrl(url, row) || blocked.has(url)) continue;
    if (/\/mls\//i.test(url) || /\/full\//i.test(url)) continue;
    return url;
  }
  return "";
}
function rasterShareSource(row, legacyDropTagged = false) {
  if (legacyDropTagged && isMls(row)) return "";
  const type = text(row.type).toLowerCase();
  if (type === "video" || type === "reel" || type === "file" || type === "matterport") return "";
  const content = text(row.contentType).toLowerCase();
  if (content.startsWith("video/") || content === "application/pdf" || content === "application/zip") return "";
  const path2 = `${text(row.path)} ${text(row.storagePath)}`.toLowerCase();
  if (/\/(raw|downloads?|print|zips?)\//.test(path2)) return "";
  const display = separateDisplay(row);
  if (legacyDropTagged && isFullRes(row)) return display;
  if (display) return display;
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !isRasterUrl(url, row)) return "";
  if (legacyDropTagged && /\/(mls|full)\//i.test(url)) return "";
  if (/\/(raw|downloads?|print|zips?)\//i.test(url)) return "";
  return url;
}
function rasterPoster(row, legacyDropTagged = false) {
  if (legacyDropTagged && isMls(row)) return "";
  for (const key of ["poster", "posterUrl", "thumbnailUrl"]) {
    const url = shareableUrl(row[key]);
    if (!url || !isRasterUrl(url, row)) continue;
    if (legacyDropTagged && /\/(mls|full)\//i.test(url)) continue;
    return url;
  }
  return "";
}
function floorSource(row, legacyDropTagged = false) {
  if (legacyDropTagged && (isMls(row) || isFullRes(row))) return separateDisplay(row);
  return rasterShareSource(row, legacyDropTagged) || rasterPoster(row, legacyDropTagged);
}
function shareDisplayItems(listing, options = {}) {
  const legacy = options.legacyDropTagged === true;
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (name, sourceUrl, kind) => {
    if (!sourceUrl || seen.has(sourceUrl) || items.length >= 240) return;
    seen.add(sourceUrl);
    items.push({ name, sourceUrl, kind });
  };
  if (Array.isArray(listing.images)) {
    listing.images.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      push(mediaName(row, `Photo ${index + 1}`), rasterShareSource(row, legacy), "image");
    });
  }
  for (const group of [listing.floorplans, listing.floorPlans]) {
    if (!Array.isArray(group)) continue;
    group.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      push(mediaName(row, `Floor plan ${index + 1}`), floorSource(row, legacy), "floorPlan");
    });
  }
  if (Array.isArray(listing.videos)) {
    listing.videos.forEach((item) => {
      const row = rowOf(item);
      if (!row) return;
      push(mediaName(row, "Video"), rasterPoster(row, legacy), "poster");
    });
  }
  const extras = [];
  for (const gallery of options.galleries || []) {
    for (const bucket of [gallery.mediaItems, gallery.images]) {
      if (!Array.isArray(bucket)) continue;
      bucket.forEach((item, index) => {
        const row = rowOf(item);
        if (!row) return;
        const sourceUrl = rasterShareSource(row, legacy);
        if (!sourceUrl) return;
        extras.push({ name: mediaName(row, `Photo ${index + 1}`), sourceUrl });
      });
    }
  }
  extras.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl) || a.name.localeCompare(b.name));
  for (const extra of extras) push(extra.name, extra.sourceUrl, "image");
  return items;
}
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0].trim().slice(0, 80);
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
function createRateLimiter(options) {
  const hits = /* @__PURE__ */ new Map();
  return {
    check(key) {
      const now = options.now ? options.now() : Date.now();
      const windowStart = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
      const max = typeof options.max === "function" ? options.max() : options.max;
      if (recent.length >= max) {
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1e3));
        hits.set(key, recent);
        return { allowed: false, retryAfterSec };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5e3) {
        const oldest = hits.keys().next().value;
        if (oldest) hits.delete(oldest);
      }
      return { allowed: true, retryAfterSec: 0 };
    },
    reset() {
      hits.clear();
    }
  };
}
const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";
const MAX_EDGE = 1600;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8e3;
const RATE_WINDOW_MS = 6e4;
const RATE_MAX_DEFAULT = 180;
const ALLOWED_HOSTS = /* @__PURE__ */ new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
const STATIC_OWN_HOSTS = /* @__PURE__ */ new Set([
  "iconicimagestx.com",
  "www.iconicimagestx.com",
  "iconicimagestx.vercel.app"
]);
const displayLimiter = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  max: () => {
    const raw = Number(process.env.MEDIA_DISPLAY_RATE_MAX);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 1e4) return Math.floor(raw);
    return RATE_MAX_DEFAULT;
  }
});
function notFound(res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(404).json({ error: "Not found." });
}
function mediaRoot() {
  return path.resolve(process.cwd(), "public", "media");
}
function localCandidate(sourceUrl) {
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
async function readLocal(sourceUrl) {
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
function remoteUrl(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.toString();
}
function onVercel() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}
function allowDiskRead() {
  if (onVercel()) return false;
  return process.env.NODE_ENV !== "production";
}
function hostnameOf(value) {
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
function trustedOwnHosts() {
  const hosts = new Set(STATIC_OWN_HOSTS);
  const app = hostnameOf(process.env.APP_URL);
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (app) hosts.add(app);
  if (vercel) hosts.add(vercel);
  return hosts;
}
function chooseOwnHost(req) {
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
function mediaPathname(sourceUrl) {
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
function ownMediaUrl(sourceUrl, req) {
  const pathname = mediaPathname(sourceUrl);
  const host = chooseOwnHost(req);
  if (!pathname || !host || !trustedOwnHosts().has(host)) return null;
  return `https://${host}${pathname}`;
}
async function readRemote(target) {
  let response;
  try {
    response = await fetch(target, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "image/jpeg,image/png,image/webp,image/gif" }
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
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel().catch(() => void 0);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}
async function loadSource(sourceUrl, req) {
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
async function galleriesForShare(listingId, listing) {
  const docs = [];
  const ids = /* @__PURE__ */ new Set();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  for (const id of ids) {
    try {
      const snap = await admin.firestore().collection("galleries").doc(id).get();
      if (snap.exists) docs.push({ id: snap.id, ...snap.data() || {} });
    } catch {
    }
  }
  try {
    const linked = await admin.firestore().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    linked.docs.forEach((doc) => {
      if (!docs.some((item) => item.id === doc.id)) docs.push({ id: doc.id, ...doc.data() || {} });
    });
  } catch {
  }
  return docs;
}
function displayParams(req) {
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
  }
  return { listingId, index };
}
async function renderJpeg(source) {
  try {
    return await sharp(source, { limitInputPixels: 8e7, failOn: "error" }).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch {
    return null;
  }
}
function etagFor(bytes) {
  return `"${createHash("sha1").update(bytes).digest("hex")}"`;
}
function etagMatches(header, etag) {
  const raw = Array.isArray(header) ? header.join(",") : typeof header === "string" ? header : "";
  if (!raw) return false;
  return raw.split(",").some((part) => {
    const token = part.trim();
    return token === "*" || token === etag || token === `W/${etag}`;
  });
}
const handleMediaDisplay = async (req, res) => {
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
  let listing = null;
  try {
    const snap = await admin.firestore().collection("listings").doc(listingId).get();
    if (!snap.exists) return notFound(res);
    listing = { id: snap.id, ...snap.data() || {} };
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
if (!admin.apps.length) {
  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      storageBucket: bucket
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: bucket
    });
  }
  if (admin.apps.length) {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
}
function adapt(res) {
  const wrapped = res;
  wrapped.status = (code) => {
    res.statusCode = code;
    return wrapped;
  };
  wrapped.json = (body) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
  };
  return wrapped;
}
function mediaDisplayHandler(req, res) {
  return handleMediaDisplay(req, adapt(res));
}
export {
  mediaDisplayHandler as default
};

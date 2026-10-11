import "dotenv/config";
import admin from "firebase-admin";
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, stat, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
const RAW_EXT$1 = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq)$/i;
const PREVIEW_EXT = /\.(jpe?g|png|webp|gif)$/i;
function isRawStudioFile(name, contentType) {
  if (RAW_EXT$1.test(name)) return true;
  const type = String(contentType || "").toLowerCase();
  return type.includes("raw") || type.includes("dng") || type.includes("canon-cr") || type.includes("nikon");
}
function isStudioPreviewable(name, contentType) {
  if (isRawStudioFile(name, contentType)) return false;
  const type = String(contentType || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif") return true;
  return PREVIEW_EXT.test(name);
}
function frameFromListingImage(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw;
  const path2 = typeof item.path === "string" ? item.path : "";
  const url = typeof item.url === "string" ? item.url : "";
  if (!path2 && !url) return null;
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : path2.split("/").pop() || `photo-${index + 1}`;
  const contentType = typeof item.contentType === "string" ? item.contentType : "";
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : path2 || `idx-${index}`,
    name,
    path: path2,
    url,
    contentType,
    raw: isRawStudioFile(name, contentType),
    previewable: isStudioPreviewable(name, contentType),
    studioApproved: item.studioApproved === true || path2.includes("/finals/"),
    studioRole: typeof item.studioRole === "string" ? item.studioRole : void 0
  };
}
function isHostedDeployment(env) {
  if (env.VERCEL === "1" || env.VERCEL_ENV) return true;
  return env.NODE_ENV === "production";
}
const DEV_SECRET = "iconic-owner-display-dev-v1";
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
function ownerDisplaySecret(env = process.env) {
  const explicit = env.OWNER_SESSION_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount && serviceAccount.length >= 32) {
    return createHmac("sha256", "iconic-owner-display-v1").update(serviceAccount).digest("hex");
  }
  const sheetsKey = env.OWNER_SHEETS_SA_KEY;
  if (sheetsKey && sheetsKey.length >= 32) {
    return createHmac("sha256", "iconic-owner-display-v1").update(sheetsKey).digest("hex");
  }
  if (!isHostedDeployment(env)) return DEV_SECRET;
  return null;
}
function readOwnerDisplayToken(token, now = Date.now(), env = process.env) {
  if (!token || token.length > 512) return null;
  const secret = ownerDisplaySecret(env);
  if (!secret) return null;
  const splitAt = token.indexOf(".");
  if (splitAt <= 0 || splitAt !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, splitAt);
  const sig = token.slice(splitAt + 1);
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (parsed.s !== "listing" && parsed.s !== "gallery") return null;
    if (typeof parsed.id !== "string" || !ID_PATTERN.test(parsed.id)) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp < now) return null;
    return { scope: parsed.s, id: parsed.id, exp: parsed.exp };
  } catch {
    return null;
  }
}
const RASTER = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const VIDEO_FILE = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;
const BLOCKED_EXT = /\.(zip|pdf|dng|cr2|cr3|nef|nrw|arw|srf|sr2|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic|heif|mp4|m4v|mov|webm)(\?|#|$)/i;
const FILE_KEYS = ["downloadUrl", "fileUrl", "originalUrl", "fullResUrl", "mlsUrl", "zipUrl", "printUrl", "reelUrl", "mp4Url", "rawUrl", "src"];
const DISPLAY_KEYS = ["previewUrl", "displayUrl", "webUrl", "thumbnailUrl"];
function text$2(value) {
  return typeof value === "string" ? value.trim() : "";
}
function rowOf(item) {
  return item && typeof item === "object" ? item : null;
}
function shareableUrl(value) {
  const url = text$2(value);
  if (!url || url.startsWith("//") || url.includes("\\") || url.includes("..")) return "";
  if (url.startsWith("/")) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}
function mediaName(row, fallback) {
  return text$2(row.name) || text$2(row.fileName) || text$2(row.title) || fallback;
}
function labelOf(row) {
  return `${text$2(row.fileName)} ${text$2(row.name)} ${text$2(row.title)} ${text$2(row.path)} ${text$2(row.storagePath)}`.toLowerCase();
}
function isMls(row) {
  const category = text$2(row.category).toLowerCase();
  const type = text$2(row.type).toLowerCase();
  if (category === "mls" || type === "mls") return true;
  const label = labelOf(row);
  if (/(^|[^a-z0-9])mls([^a-z0-9]|$)/.test(label)) return true;
  return /\/mls\//.test(label);
}
function isFullRes(row) {
  const category = text$2(row.category).toLowerCase();
  const type = text$2(row.type).toLowerCase();
  if (category === "full-res" || category === "fullres" || type === "full-res" || type === "fullres") return true;
  const label = labelOf(row);
  if (/(^|[^a-z0-9])full[\s_-]?res([^a-z0-9]|$)/.test(label)) return true;
  return /\/full\//.test(label);
}
function isRasterUrl(url, row) {
  if (!url || BLOCKED_EXT.test(url.split("#")[0]) || VIDEO_FILE.test(url.split("#")[0])) return false;
  if (RASTER.test(url.split("#")[0])) return true;
  const content = text$2(row.contentType).toLowerCase();
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
  const type = text$2(row.type).toLowerCase();
  if (type === "video" || type === "reel" || type === "file" || type === "matterport") return "";
  const content = text$2(row.contentType).toLowerCase();
  if (content.startsWith("video/") || content === "application/pdf" || content === "application/zip") return "";
  const path2 = `${text$2(row.path)} ${text$2(row.storagePath)}`.toLowerCase();
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
function pushDisplay(items, seen, name, sourceUrl, kind) {
  if (!sourceUrl || seen.has(sourceUrl) || items.length >= 240) return;
  seen.add(sourceUrl);
  items.push({ name, sourceUrl, kind });
}
function shareDisplayItems(listing, options = {}) {
  const legacy = options.legacyDropTagged === true;
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  if (Array.isArray(listing.images)) {
    listing.images.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      pushDisplay(items, seen, mediaName(row, `Photo ${index + 1}`), rasterShareSource(row, legacy), "image");
    });
  }
  for (const group of [listing.floorplans, listing.floorPlans]) {
    if (!Array.isArray(group)) continue;
    group.forEach((item, index) => {
      const row = rowOf(item);
      if (!row) return;
      pushDisplay(items, seen, mediaName(row, `Floor plan ${index + 1}`), floorSource(row, legacy), "floorPlan");
    });
  }
  if (Array.isArray(listing.videos)) {
    listing.videos.forEach((item) => {
      const row = rowOf(item);
      if (!row) return;
      pushDisplay(items, seen, mediaName(row, "Video"), rasterPoster(row, legacy), "poster");
    });
  }
  return items;
}
function videoFileUrl(row) {
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !VIDEO_FILE.test(url.split("#")[0])) return "";
  return url;
}
function listingOwnerDisplayItems(listing) {
  const items = [...shareDisplayItems(listing)];
  const seen = new Set(items.map((item) => item.sourceUrl));
  if (!Array.isArray(listing.videos)) return items;
  listing.videos.forEach((item) => {
    const row = rowOf(item);
    if (!row || rasterPoster(row)) return;
    pushDisplay(items, seen, mediaName(row, "Video"), videoFileUrl(row), "poster");
  });
  return items;
}
function isGalleryFloor(row) {
  const type = text$2(row.type).toLowerCase();
  const category = text$2(row.category).toLowerCase();
  return type === "floorplan" || type === "floor-plan" || category === "floorplan" || category === "floor-plan";
}
function galleryOwnerDisplayItems(media) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const rows = media.map(rowOf).filter((row) => Boolean(row));
  for (const row of rows) {
    const type = text$2(row.type).toLowerCase();
    if (type === "video" || type === "reel" || type === "matterport" || type === "tour" || type === "file" || type === "pdf") continue;
    const source = rasterShareSource(row);
    if (!source) continue;
    const floor = isGalleryFloor(row);
    pushDisplay(items, seen, mediaName(row, floor ? "Floor plan" : "Photo"), source, floor ? "floorPlan" : "image");
  }
  for (const row of rows) {
    const type = text$2(row.type).toLowerCase();
    if (type !== "video" && type !== "reel") continue;
    const poster = rasterPoster(row);
    if (poster) {
      pushDisplay(items, seen, mediaName(row, "Video"), poster, "poster");
      continue;
    }
    pushDisplay(items, seen, mediaName(row, "Video"), videoFileUrl(row), "poster");
  }
  return items;
}
function statusOf(doc) {
  return typeof doc?.status === "string" ? doc.status : "";
}
function publicStudioShareOpen(listing) {
  return listingBlock(listing, []) === null;
}
function listingBlock(listing, related) {
  const linked = related.slice(0, 3).map((doc) => `${doc.id} (${statusOf(doc) || "unknown"})`).join(", ");
  const linkedSentence = linked ? ` Linked gallery: ${linked}.` : " No gallery document is linked to this project.";
  if (listing.lockStudio === true) {
    return {
      ok: false,
      httpStatus: 403,
      code: "studio_locked",
      message: `Project ${listing.id} exists in listings, but Lock Studio is on. Turn Lock Studio off on the project file before /studio/${listing.id} will open. This id is not missing.${linkedSentence}`
    };
  }
  if (listing.studioEnabled === false) {
    return {
      ok: false,
      httpStatus: 403,
      code: "studio_disabled",
      message: `Project ${listing.id} exists in listings, but Client Studio is turned off, so /studio/${listing.id} stays closed. Turn Client Studio on from the project file.${linkedSentence}`
    };
  }
  return null;
}
const APPRENTICESHIP_RULES = [
  "Apprentices are learning.",
  "We do not make additional trips.",
  "We do not edit out anything additional — you get what you pay for.",
  "You're helping us help you.",
  "Once apprentices graduate we will have new apprentices. Graduates become vetted Iconic shooters, just like the OGs. It's a lifetime cycle — clients help all along the way.",
  "But we don't play: be prepped and ready to go when we arrive."
];
function isApprenticeshipPackage(id) {
  return id.startsWith("apprentice-");
}
const basicsList = [
  {
    id: "photos-20",
    name: "20 Photos",
    price: 99,
    description: "Essential photo package for smaller listings.",
    features: [
      "20 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "photos-35",
    name: "35 Photos",
    price: 150,
    description: "Standard photo package for most residential listings.",
    features: [
      "35 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "photos-50",
    name: "50 Photos",
    price: 200,
    description: "Complete photo package for large homes and detailed spaces.",
    features: [
      "50 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "apprentice-25",
    name: "The Apprenticeship Program — 25 Photos",
    cardTitle: "25 photos",
    price: 75,
    kicker: "The cheap one",
    appointmentLimit: "20 Minute Appointment ONLY",
    aside: "Twenty-five photos. Twenty minutes. You'll feel the savings — and the stopwatch.",
    description: "25 photos, shot by an apprentice. 20 Minute Appointment ONLY. Overages billed at $25 per 15-minute increment.",
    features: [
      "25 Photos",
      "20 Minute Appointment ONLY",
      "Photos only",
      "Overages: $25 per 15-minute increment"
    ],
    rules: APPRENTICESHIP_RULES
  },
  {
    id: "apprentice-50",
    name: "The Apprenticeship Program — 50 Photos",
    cardTitle: "50 photos",
    price: 125,
    kicker: "Slightly less cheap",
    appointmentLimit: "1 Hour Appointment ONLY",
    aside: "Fifty photos and a full hour. You still walked past the real packages.",
    description: "50 photos, shot by an apprentice. 1 Hour Appointment ONLY. Overages billed at $25 per 15-minute increment.",
    features: [
      "50 Photos",
      "1 Hour Appointment ONLY",
      "Photos only",
      "Overages: $25 per 15-minute increment"
    ],
    rules: APPRENTICESHIP_RULES
  }
];
basicsList.filter((item) => isApprenticeshipPackage(item.id));
basicsList.filter((item) => !isApprenticeshipPackage(item.id));
const BOOKING_PACKAGE_CATEGORY_ORDER = [
  "photography",
  "video",
  "virtual_staging",
  "marketing",
  "addon"
];
new Set(BOOKING_PACKAGE_CATEGORY_ORDER);
const PHOTO_EDIT_REPLACEMENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
new Set(PHOTO_EDIT_REPLACEMENT_TYPES);
function hiddenPresentationKeys(listing) {
  const keys = /* @__PURE__ */ new Set();
  const photos = readMediaStore(listing?.portalMedia).photos;
  for (const [id, prefs] of Object.entries(photos)) {
    if (prefs.hidden && id) keys.add(id);
  }
  return keys;
}
function rowHiddenFromPresentation(row, hiddenKeys) {
  if (row.hiddenFromPresentation === true || row.portalHidden === true) return true;
  const id = text$1(row.id);
  const path2 = text$1(row.path) || text$1(row.storagePath);
  const url = text$1(row.url) || text$1(row.shareUrl);
  return [id, path2, url].some((key) => Boolean(key) && hiddenKeys.has(key));
}
function readMediaStore(value) {
  const row = value && typeof value === "object" ? value : {};
  return {
    photos: readPrefs(row.photos),
    videos: readPrefs(row.videos),
    floorplans: readPrefs(row.floorplans),
    tours: readPrefs(row.tours)
  };
}
function readPrefs(value) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [id, prefs] of Object.entries(value)) {
    if (!id || !prefs || typeof prefs !== "object") continue;
    const row = prefs;
    out[id] = {
      hidden: row.hidden === true,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0
    };
  }
  return out;
}
function text$1(value) {
  return typeof value === "string" ? value.trim() : "";
}
const DEFAULT_SITE_ORIGIN = "https://iconicimagestx.vercel.app";
function readConfiguredOrigin() {
  const nodeOrigin = typeof process !== "undefined" ? process.env?.VITE_SITE_ORIGIN : "";
  return String(nodeOrigin || "").trim().replace(/\/$/, "");
}
readConfiguredOrigin() || DEFAULT_SITE_ORIGIN;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,80}$/;
const RAW_EXT = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)$/i;
const IMAGE_EXT$1 = /\.(jpe?g|png|webp|gif)$/i;
const SKIP_TYPES = /* @__PURE__ */ new Set(["video", "reel", "tour", "matterport", "file", "document"]);
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function roomFromFields(row, folders) {
  for (const key of ["room", "roomName", "roomType", "scene"]) {
    const value = text(row[key]);
    if (value && value.length <= 48 && !IMAGE_EXT$1.test(value) && !RAW_EXT.test(value)) return value;
  }
  const folderId = text(row.folderId);
  if (folderId && folders.has(folderId)) return folders.get(folderId) || "";
  return "";
}
function folderMap(listing) {
  const map = /* @__PURE__ */ new Map();
  const folders = listing?.mediaFolders;
  if (!Array.isArray(folders)) return map;
  for (const item of folders) {
    if (!item || typeof item !== "object") continue;
    const row = item;
    const id = text(row.id);
    const name = text(row.name);
    if (id && name) map.set(id, name);
  }
  return map;
}
function isRawPath(path2, name) {
  return RAW_EXT.test(name) || RAW_EXT.test(path2) || path2.includes("/raw/");
}
function pushDraft(drafts, row, index, folders, fallbackRoom = "") {
  const path2 = text(row.path) || text(row.storagePath);
  const name = text(row.name) || text(row.fileName) || text(row.title) || path2.split("/").pop() || "";
  const type = text(row.type).toLowerCase();
  if (type && SKIP_TYPES.has(type)) return;
  if (isRawPath(path2, name)) return;
  const contentType = text(row.contentType).toLowerCase();
  const looksLikeImage = !contentType || contentType.startsWith("image/") || IMAGE_EXT$1.test(name) || IMAGE_EXT$1.test(path2);
  if (!looksLikeImage) return;
  if (contentType && !contentType.startsWith("image/") && !IMAGE_EXT$1.test(name)) return;
  const sourceUrl = rasterShareSource(row);
  if (!sourceUrl) return;
  const room = roomFromFields(row, folders) || fallbackRoom;
  const order = typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index;
  const final = row.studioApproved === true || text(row.studioRole) === "final" || path2.includes("/finals/");
  drafts.push({
    id: text(row.id) || path2 || sourceUrl,
    url: sourceUrl,
    alt: room ? `${room} photograph` : "Listing photograph",
    room,
    order,
    index,
    path: path2,
    sourcePath: text(row.sourcePath),
    sourceUrl,
    final
  });
}
function listingDrafts(listing, hidden) {
  if (!listing || !Array.isArray(listing.images)) return [];
  const folders = folderMap(listing);
  const drafts = [];
  listing.images.forEach((item, index) => {
    const frame = frameFromListingImage(item, index);
    if (!frame || frame.raw || !frame.previewable) return;
    const row = item && typeof item === "object" ? { ...item } : {};
    row.url = row.url || frame.url;
    row.path = row.path || frame.path;
    row.name = row.name || frame.name;
    row.contentType = row.contentType || frame.contentType;
    row.id = row.id || frame.id;
    if (rowHiddenFromPresentation(row, hidden)) return;
    pushDraft(drafts, row, index, folders);
  });
  return drafts;
}
function galleryDrafts(galleries, start, hidden) {
  const drafts = [];
  let index = start;
  for (const gallery of galleries || []) {
    const buckets = [gallery.mediaItems, gallery.images];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const item of bucket) {
        if (!item || typeof item !== "object") continue;
        const row = item;
        if (rowHiddenFromPresentation(row, hidden)) continue;
        pushDraft(drafts, row, index, /* @__PURE__ */ new Map());
        index += 1;
      }
    }
  }
  return drafts;
}
function preferFinals(drafts) {
  const finals = drafts.filter((item) => item.final);
  if (finals.length === 0) return drafts;
  const replaced = new Set(finals.map((item) => item.sourcePath).filter(Boolean));
  const finalPaths = new Set(finals.map((item) => item.path).filter(Boolean));
  return drafts.filter((item) => {
    if (item.final) return true;
    if (item.path && replaced.has(item.path)) return false;
    if (item.path && finalPaths.has(item.path)) return false;
    return true;
  });
}
function presentationDrafts(source) {
  const hidden = hiddenPresentationKeys(source.listing);
  const fromListing = listingDrafts(source.listing, hidden);
  const fromGalleries = galleryDrafts(source.galleries, fromListing.length, hidden);
  const seen = /* @__PURE__ */ new Set();
  const photos = [];
  const sorted = [...preferFinals([...fromListing, ...fromGalleries])].sort((a, b) => a.order - b.order || a.index - b.index);
  for (const item of sorted) {
    const key = item.path || item.sourceUrl;
    if (!item.sourceUrl || seen.has(key) || seen.has(item.sourceUrl)) continue;
    seen.add(key);
    seen.add(item.sourceUrl);
    photos.push(item);
  }
  return photos.slice(0, 200);
}
function presentationPhotoSources(source) {
  if (!TOKEN_PATTERN.test(source.token)) return [];
  return presentationDrafts(source).map((item) => item.sourceUrl);
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
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=60";
const MAX_EDGE = 1600;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8e3;
const RATE_WINDOW_MS = 6e4;
const RATE_MAX_DEFAULT = 180;
const ALLOWED_HOSTS = /* @__PURE__ */ new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);
const PROJECT_HOSTS = /* @__PURE__ */ new Set(["iconicimagestx.vercel.app"]);
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
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
function isVideoSource(sourceUrl) {
  const pathOnly = sourceUrl.split("?")[0].split("#")[0];
  return VIDEO_EXT.test(pathOnly);
}
function localCandidate(sourceUrl, allowVideo = false) {
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
async function readLocal(sourceUrl, allowVideo = false) {
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
function deploymentHosts() {
  const hosts = new Set(PROJECT_HOSTS);
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (vercel) hosts.add(vercel);
  return hosts;
}
function chooseOwnHost(req) {
  const vercel = hostnameOf(process.env.VERCEL_URL);
  if (vercel) return vercel;
  const header = req.headers?.host;
  const raw = Array.isArray(header) ? header[0] : header;
  const requestHost = hostnameOf(typeof raw === "string" ? raw.split(",")[0] : "");
  if (requestHost && deploymentHosts().has(requestHost)) return requestHost;
  return "";
}
function mediaPathname(sourceUrl, allowVideo = false) {
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
function ownMediaUrl(sourceUrl, req, allowVideo = false) {
  const pathname = mediaPathname(sourceUrl, allowVideo);
  const host = chooseOwnHost(req);
  if (!pathname || !host || !deploymentHosts().has(host)) return null;
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
async function loadSource(sourceUrl, req, allowVideo = false) {
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
async function ffmpegPoster(source) {
  const dir = await mkdtemp(path.join(tmpdir(), "display-poster-"));
  const file = path.join(dir, "source.bin");
  try {
    await writeFile(file, source);
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const child = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "0.2",
        "-i",
        file,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1"
      ], { stdio: ["ignore", "pipe", "ignore"] });
      const chunks = [];
      let total = 0;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(null);
      }, FETCH_TIMEOUT_MS);
      child.stdout.on("data", (chunk) => {
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
function parseIndex(value) {
  if (!/^\d{1,4}$/.test(value) || String(Number(value)) !== value) return null;
  return Number(value);
}
function decodePart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function requestPath(req) {
  if (!req.url) return "";
  try {
    return new URL(req.url, "https://display.local").pathname;
  } catch {
    return req.url.split("?")[0] || "";
  }
}
function displayTarget(req) {
  const path2 = requestPath(req);
  const presentation = path2.match(/\/api\/media\/display\/p\/([^/]+)\/([^/]+)\/?$/);
  if (presentation) {
    const index2 = parseIndex(decodePart(presentation[2]));
    if (index2 === null) return null;
    return { kind: "presentation", token: decodePart(presentation[1]), index: index2 };
  }
  const owner = path2.match(/\/api\/media\/display\/o\/([^/]+)\/([^/]+)\/?$/);
  if (owner) {
    const index2 = parseIndex(decodePart(owner[2]));
    if (index2 === null) return null;
    return { kind: "owner", token: decodePart(owner[1]), index: index2 };
  }
  const share = path2.match(/\/api\/media\/display\/([^/]+)\/([^/]+)\/?$/);
  if (share) {
    const listingId = decodePart(share[1]);
    const index2 = parseIndex(decodePart(share[2]));
    if (!listingId || listingId === "p" || listingId === "o" || index2 === null) return null;
    return { kind: "share", listingId, index: index2 };
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
async function loadListing(listingId) {
  const snap = await admin.firestore().collection("listings").doc(listingId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() || {} };
}
async function listingByPresentationToken(token) {
  const snap = await admin.firestore().collection("listings").where("presentationToken", "==", token).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() || {} };
}
async function galleryMedia(galleryId) {
  const snap = await admin.firestore().collection("galleries").doc(galleryId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return [
    ...Array.isArray(data.mediaItems) ? data.mediaItems : [],
    ...Array.isArray(data.videoLinks) ? data.videoLinks : [],
    ...Array.isArray(data.tourLinks) ? data.tourLinks : []
  ];
}
async function resolveItem(target) {
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
  const target = displayTarget(req);
  if (!target) return notFound(res);
  if (!admin.apps.length) return notFound(res);
  let item = null;
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

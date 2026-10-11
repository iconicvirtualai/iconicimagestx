import "dotenv/config";
import admin from "firebase-admin";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { stat, realpath, readFile } from "node:fs/promises";
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
const VIDEO_PLACEHOLDER_PREFIX = "video-placeholder:";
function videoFileUrl(row) {
  const url = shareableUrl(row.url) || shareableUrl(row.shareUrl);
  if (!url || !VIDEO_FILE.test(url.split("#")[0])) return "";
  return url;
}
function videoPlaceholderSource(row) {
  if (rasterPoster(row)) return "";
  const file = videoFileUrl(row);
  const type = text$2(row.type).toLowerCase();
  const content = text$2(row.contentType).toLowerCase();
  const named = type === "video" || type === "reel" || content.startsWith("video/");
  if (!file && !named) return "";
  const id = text$2(row.id) || file || text$2(row.path) || text$2(row.storagePath) || text$2(row.name) || text$2(row.fileName);
  if (!id) return "";
  return `${VIDEO_PLACEHOLDER_PREFIX}${encodeURIComponent(id)}`;
}
function isVideoPlaceholderSource(sourceUrl) {
  return sourceUrl.startsWith(VIDEO_PLACEHOLDER_PREFIX);
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
      const poster = rasterPoster(row, legacy) || videoPlaceholderSource(row);
      pushDisplay(items, seen, mediaName(row, "Video"), poster, "poster");
    });
  }
  return items;
}
function listingOwnerDisplayItems(listing) {
  const items = [...shareDisplayItems(listing)];
  const seen = new Set(items.map((item) => item.sourceUrl));
  if (!Array.isArray(listing.videos)) return items;
  listing.videos.forEach((item) => {
    const row = rowOf(item);
    if (!row || rasterPoster(row)) return;
    pushDisplay(items, seen, mediaName(row, "Video"), videoPlaceholderSource(row), "poster");
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
    const poster = rasterPoster(row) || videoPlaceholderSource(row);
    pushDisplay(items, seen, mediaName(row, "Video"), poster, "poster");
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
const BUSINESS_CONTACT_LINE = "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";
function parseContactLine(line) {
  const parts = line.split(" | ");
  if (parts.length !== 3) {
    throw new Error("BUSINESS_CONTACT_LINE must be address | phone | email");
  }
  const [address, phoneDisplay, email] = parts;
  const addressParts = address.split(", ");
  if (addressParts.length !== 3) {
    throw new Error("Public address must be street, city, ST ZIP");
  }
  const [streetAddress, city, stateZip] = addressParts;
  const [state, postalCode] = stateZip.split(" ");
  if (!streetAddress || !city || !state || !postalCode || !phoneDisplay || !email) {
    throw new Error("BUSINESS_CONTACT_LINE is missing a public contact field");
  }
  const phoneDigits = phoneDisplay.replace(/\D/g, "");
  return {
    line,
    address,
    streetAddress,
    addressLine2: `${city}, ${state} ${postalCode}`,
    city,
    state,
    postalCode,
    phoneDisplay,
    phoneHref: `tel:+1${phoneDigits}`,
    email,
    emailHref: `mailto:${email}`
  };
}
parseContactLine(BUSINESS_CONTACT_LINE);
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
const LOCKED_LABEL = '<g transform="translate(332.625 590.000)"><path transform="translate(0.000 0) scale(0.03125000 -0.03125000)" d="M571 0 49 1490H388L626 771Q662 659 698.0 528.0Q734 397 772 246Q810 398 844.5 528.0Q879 658 913 771L1143 1490H1480L970 0Z" fill="#f7f1e4"/><path transform="translate(47.781 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H428V0ZM278 1264Q210 1264 162.0 1309.0Q114 1354 114 1418Q114 1482 162.0 1527.0Q210 1572 278 1572Q346 1572 394.5 1527.0Q443 1482 443 1418Q443 1354 394.5 1309.0Q346 1264 278 1264Z" fill="#f7f1e4"/><path transform="translate(65.125 0) scale(0.03125000 -0.03125000)" d="M537 -19Q408 -19 305.0 47.5Q202 114 141.5 242.5Q81 371 81 557Q81 748 143.0 876.0Q205 1004 308.0 1068.0Q411 1132 535 1132Q630 1132 693.0 1100.0Q756 1068 794.5 1021.0Q833 974 853 930H863V1490H1163V0H868V179H853Q832 134 793.0 88.5Q754 43 691.0 12.0Q628 -19 537 -19ZM629 222Q743 222 806.0 314.0Q869 406 869 558Q869 710 806.5 801.0Q744 892 629 892Q511 892 450.0 798.5Q389 705 389 558Q389 410 450.5 316.0Q512 222 629 222Z" fill="#f7f1e4"/><path transform="translate(105.469 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(143.594 0) scale(0.03125000 -0.03125000)" d="M628 -22Q460 -22 337.0 50.5Q214 123 147.5 252.5Q81 382 81 554Q81 727 147.5 857.0Q214 987 337.0 1059.5Q460 1132 628 1132Q796 1132 919.0 1059.5Q1042 987 1108.5 857.0Q1175 727 1175 554Q1175 382 1108.5 252.5Q1042 123 919.0 50.5Q796 -22 628 -22ZM628 214Q748 214 809.0 311.0Q870 408 870 555Q870 703 809.0 799.5Q748 896 628 896Q508 896 447.5 799.5Q387 703 387 555Q387 408 447.5 311.0Q508 214 628 214Z" fill="#f7f1e4"/><path transform="translate(198.000 0) scale(0.03125000 -0.03125000)" d="M440 -22Q280 -22 174.0 62.5Q68 147 68 313Q68 438 128.0 509.0Q188 580 284.0 613.0Q380 646 490 656Q634 670 697.5 685.5Q761 701 761 756V761Q761 832 715.5 871.0Q670 910 586 910Q499 910 446.0 872.5Q393 835 375 781L100 827Q143 972 271.5 1052.0Q400 1132 587 1132Q707 1132 815.5 1094.0Q924 1056 992.5 972.5Q1061 889 1061 753V0H777V155H767Q726 77 645.0 27.5Q564 -22 440 -22ZM525 189Q630 189 696.5 250.0Q763 311 763 400V521Q745 508 704.5 498.5Q664 489 619.0 481.5Q574 474 541 470Q458 458 407.0 423.0Q356 388 356 321Q356 256 403.5 222.5Q451 189 525 189Z" fill="#f7f1e4"/><path transform="translate(235.156 0) scale(0.03125000 -0.03125000)" d="M443 0 31 1118H350L538 538Q561 463 580.5 387.0Q600 311 618 233Q635 311 653.5 386.5Q672 462 696 538L882 1118H1197L784 0Z" fill="#f7f1e4"/><path transform="translate(273.531 0) scale(0.03125000 -0.03125000)" d="M440 -22Q280 -22 174.0 62.5Q68 147 68 313Q68 438 128.0 509.0Q188 580 284.0 613.0Q380 646 490 656Q634 670 697.5 685.5Q761 701 761 756V761Q761 832 715.5 871.0Q670 910 586 910Q499 910 446.0 872.5Q393 835 375 781L100 827Q143 972 271.5 1052.0Q400 1132 587 1132Q707 1132 815.5 1094.0Q924 1056 992.5 972.5Q1061 889 1061 753V0H777V155H767Q726 77 645.0 27.5Q564 -22 440 -22ZM525 189Q630 189 696.5 250.0Q763 311 763 400V521Q745 508 704.5 498.5Q664 489 619.0 481.5Q574 474 541 470Q458 458 407.0 423.0Q356 388 356 321Q356 256 403.5 222.5Q451 189 525 189Z" fill="#f7f1e4"/><path transform="translate(310.688 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H428V0ZM278 1264Q210 1264 162.0 1309.0Q114 1354 114 1418Q114 1482 162.0 1527.0Q210 1572 278 1572Q346 1572 394.5 1527.0Q443 1482 443 1418Q443 1354 394.5 1309.0Q346 1264 278 1264Z" fill="#f7f1e4"/><path transform="translate(328.031 0) scale(0.03125000 -0.03125000)" d="M428 1490V0H128V1490Z" fill="#f7f1e4"/><path transform="translate(345.375 0) scale(0.03125000 -0.03125000)" d="M440 -22Q280 -22 174.0 62.5Q68 147 68 313Q68 438 128.0 509.0Q188 580 284.0 613.0Q380 646 490 656Q634 670 697.5 685.5Q761 701 761 756V761Q761 832 715.5 871.0Q670 910 586 910Q499 910 446.0 872.5Q393 835 375 781L100 827Q143 972 271.5 1052.0Q400 1132 587 1132Q707 1132 815.5 1094.0Q924 1056 992.5 972.5Q1061 889 1061 753V0H777V155H767Q726 77 645.0 27.5Q564 -22 440 -22ZM525 189Q630 189 696.5 250.0Q763 311 763 400V521Q745 508 704.5 498.5Q664 489 619.0 481.5Q574 474 541 470Q458 458 407.0 423.0Q356 388 356 321Q356 256 403.5 222.5Q451 189 525 189Z" fill="#f7f1e4"/><path transform="translate(382.531 0) scale(0.03125000 -0.03125000)" d="M754 -19Q663 -19 600.0 12.0Q537 43 497.5 88.5Q458 134 437 179H423V0H128V1490H428V930H437Q457 974 495.5 1021.0Q534 1068 597.5 1100.0Q661 1132 756 1132Q880 1132 983.0 1068.0Q1086 1004 1147.5 876.0Q1209 748 1209 557Q1209 371 1149.0 242.5Q1089 114 986.0 47.5Q883 -19 754 -19ZM662 222Q779 222 840.5 316.0Q902 410 902 558Q902 705 841.0 798.5Q780 892 662 892Q546 892 483.5 801.0Q421 710 421 558Q421 406 484.0 314.0Q547 222 662 222Z" fill="#f7f1e4"/><path transform="translate(422.875 0) scale(0.03125000 -0.03125000)" d="M428 1490V0H128V1490Z" fill="#f7f1e4"/><path transform="translate(440.219 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(493.500 0) scale(0.03125000 -0.03125000)" d="M440 -22Q280 -22 174.0 62.5Q68 147 68 313Q68 438 128.0 509.0Q188 580 284.0 613.0Q380 646 490 656Q634 670 697.5 685.5Q761 701 761 756V761Q761 832 715.5 871.0Q670 910 586 910Q499 910 446.0 872.5Q393 835 375 781L100 827Q143 972 271.5 1052.0Q400 1132 587 1132Q707 1132 815.5 1094.0Q924 1056 992.5 972.5Q1061 889 1061 753V0H777V155H767Q726 77 645.0 27.5Q564 -22 440 -22ZM525 189Q630 189 696.5 250.0Q763 311 763 400V521Q745 508 704.5 498.5Q664 489 619.0 481.5Q574 474 541 470Q458 458 407.0 423.0Q356 388 356 321Q356 256 403.5 222.5Q451 189 525 189Z" fill="#f7f1e4"/><path transform="translate(530.656 0) scale(0.03125000 -0.03125000)" d="M750 1118V889H516V0H217V889H20V1118H217V1204Q217 1382 321.0 1471.0Q425 1560 580 1560Q651 1560 709.0 1549.0Q767 1538 795 1529L741 1303Q723 1308 696.5 1313.0Q670 1318 641 1318Q572 1318 544.0 1285.5Q516 1253 516 1194V1118Z" fill="#f7f1e4"/><path transform="translate(556.125 0) scale(0.03125000 -0.03125000)" d="M683 1118V889H474V327Q474 223 576 223Q593 223 623.5 227.5Q654 232 671 236L714 11Q664 -4 614.5 -10.0Q565 -16 520 -16Q352 -16 263.0 65.5Q174 147 174 301V889H20V1118H174V1384H474V1118Z" fill="#f7f1e4"/><path transform="translate(579.562 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(617.688 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H418V923H430Q461 1026 533.5 1079.5Q606 1133 700 1133Q751 1133 797 1123V855Q777 861 738.5 865.5Q700 870 667 870Q563 870 495.5 805.0Q428 740 428 636V0Z" fill="#f7f1e4"/><path transform="translate(658.906 0) scale(0.03125000 -0.03125000)" d="M128 -418V1118H423V930H437Q457 974 495.5 1021.0Q534 1068 597.5 1100.0Q661 1132 756 1132Q880 1132 983.0 1068.0Q1086 1004 1147.5 876.0Q1209 748 1209 557Q1209 371 1149.0 242.5Q1089 114 986.0 47.5Q883 -19 754 -19Q663 -19 600.0 12.0Q537 43 497.5 88.5Q458 134 437 179H428V-418ZM662 222Q779 222 840.5 316.0Q902 410 902 558Q902 705 841.0 798.5Q780 892 662 892Q546 892 483.5 801.0Q421 710 421 558Q421 406 484.0 314.0Q547 222 662 222Z" fill="#f7f1e4"/><path transform="translate(699.250 0) scale(0.03125000 -0.03125000)" d="M440 -22Q280 -22 174.0 62.5Q68 147 68 313Q68 438 128.0 509.0Q188 580 284.0 613.0Q380 646 490 656Q634 670 697.5 685.5Q761 701 761 756V761Q761 832 715.5 871.0Q670 910 586 910Q499 910 446.0 872.5Q393 835 375 781L100 827Q143 972 271.5 1052.0Q400 1132 587 1132Q707 1132 815.5 1094.0Q924 1056 992.5 972.5Q1061 889 1061 753V0H777V155H767Q726 77 645.0 27.5Q564 -22 440 -22ZM525 189Q630 189 696.5 250.0Q763 311 763 400V521Q745 508 704.5 498.5Q664 489 619.0 481.5Q574 474 541 470Q458 458 407.0 423.0Q356 388 356 321Q356 256 403.5 222.5Q451 189 525 189Z" fill="#f7f1e4"/><path transform="translate(736.406 0) scale(0.03125000 -0.03125000)" d="M120 -396 189 -170 226 -179Q317 -204 375.0 -175.5Q433 -147 443 -63L451 -3L31 1118H350L538 538Q561 465 577.0 392.5Q593 320 609 246Q627 321 646.5 393.5Q666 466 690 538L886 1118H1201L726 -132Q675 -267 579.5 -346.5Q484 -426 316 -426Q256 -426 204.0 -417.5Q152 -409 120 -396Z" fill="#f7f1e4"/><path transform="translate(774.938 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H406L418 901Q463 1023 550.0 1079.0Q637 1135 737 1135Q949 1135 1025 884Q1072 1013 1170.5 1074.0Q1269 1135 1384 1135Q1538 1135 1639.5 1035.5Q1741 936 1741 754V0H1441V697Q1441 791 1389.5 837.5Q1338 884 1263 884Q1178 884 1128.5 830.0Q1079 776 1079 688V0H789V705Q789 787 740.5 835.5Q692 884 615 884Q536 884 482.0 830.5Q428 777 428 676V0Z" fill="#f7f1e4"/><path transform="translate(833.344 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(871.469 0) scale(0.03125000 -0.03125000)" d="M428 647V0H128V1118H411L415 887Q462 1004 548.0 1068.0Q634 1132 763 1132Q937 1132 1042.0 1020.0Q1147 908 1147 711V0H847V659Q847 763 793.5 822.0Q740 881 645 881Q549 881 488.5 819.5Q428 758 428 647Z" fill="#f7f1e4"/><path transform="translate(911.312 0) scale(0.03125000 -0.03125000)" d="M683 1118V889H474V327Q474 223 576 223Q593 223 623.5 227.5Q654 232 671 236L714 11Q664 -4 614.5 -10.0Q565 -16 520 -16Q352 -16 263.0 65.5Q174 147 174 301V889H20V1118H174V1384H474V1118Z" fill="#f7f1e4"/></g>';
const PREVIEW_LABEL = '<g transform="translate(574.609 590.000)"><path transform="translate(0.000 0) scale(0.03125000 -0.03125000)" d="M571 0 49 1490H388L626 771Q662 659 698.0 528.0Q734 397 772 246Q810 398 844.5 528.0Q879 658 913 771L1143 1490H1480L970 0Z" fill="#f7f1e4"/><path transform="translate(47.781 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H428V0ZM278 1264Q210 1264 162.0 1309.0Q114 1354 114 1418Q114 1482 162.0 1527.0Q210 1572 278 1572Q346 1572 394.5 1527.0Q443 1482 443 1418Q443 1354 394.5 1309.0Q346 1264 278 1264Z" fill="#f7f1e4"/><path transform="translate(65.125 0) scale(0.03125000 -0.03125000)" d="M537 -19Q408 -19 305.0 47.5Q202 114 141.5 242.5Q81 371 81 557Q81 748 143.0 876.0Q205 1004 308.0 1068.0Q411 1132 535 1132Q630 1132 693.0 1100.0Q756 1068 794.5 1021.0Q833 974 853 930H863V1490H1163V0H868V179H853Q832 134 793.0 88.5Q754 43 691.0 12.0Q628 -19 537 -19ZM629 222Q743 222 806.0 314.0Q869 406 869 558Q869 710 806.5 801.0Q744 892 629 892Q511 892 450.0 798.5Q389 705 389 558Q389 410 450.5 316.0Q512 222 629 222Z" fill="#f7f1e4"/><path transform="translate(105.469 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(143.594 0) scale(0.03125000 -0.03125000)" d="M628 -22Q460 -22 337.0 50.5Q214 123 147.5 252.5Q81 382 81 554Q81 727 147.5 857.0Q214 987 337.0 1059.5Q460 1132 628 1132Q796 1132 919.0 1059.5Q1042 987 1108.5 857.0Q1175 727 1175 554Q1175 382 1108.5 252.5Q1042 123 919.0 50.5Q796 -22 628 -22ZM628 214Q748 214 809.0 311.0Q870 408 870 555Q870 703 809.0 799.5Q748 896 628 896Q508 896 447.5 799.5Q387 703 387 555Q387 408 447.5 311.0Q508 214 628 214Z" fill="#f7f1e4"/><path transform="translate(198.000 0) scale(0.03125000 -0.03125000)" d="M128 -418V1118H423V930H437Q457 974 495.5 1021.0Q534 1068 597.5 1100.0Q661 1132 756 1132Q880 1132 983.0 1068.0Q1086 1004 1147.5 876.0Q1209 748 1209 557Q1209 371 1149.0 242.5Q1089 114 986.0 47.5Q883 -19 754 -19Q663 -19 600.0 12.0Q537 43 497.5 88.5Q458 134 437 179H428V-418ZM662 222Q779 222 840.5 316.0Q902 410 902 558Q902 705 841.0 798.5Q780 892 662 892Q546 892 483.5 801.0Q421 710 421 558Q421 406 484.0 314.0Q547 222 662 222Z" fill="#f7f1e4"/><path transform="translate(238.344 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H418V923H430Q461 1026 533.5 1079.5Q606 1133 700 1133Q751 1133 797 1123V855Q777 861 738.5 865.5Q700 870 667 870Q563 870 495.5 805.0Q428 740 428 636V0Z" fill="#f7f1e4"/><path transform="translate(264.406 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(302.531 0) scale(0.03125000 -0.03125000)" d="M443 0 31 1118H350L538 538Q561 463 580.5 387.0Q600 311 618 233Q635 311 653.5 386.5Q672 462 696 538L882 1118H1197L784 0Z" fill="#f7f1e4"/><path transform="translate(340.906 0) scale(0.03125000 -0.03125000)" d="M128 0V1118H428V0ZM278 1264Q210 1264 162.0 1309.0Q114 1354 114 1418Q114 1482 162.0 1527.0Q210 1572 278 1572Q346 1572 394.5 1527.0Q443 1482 443 1418Q443 1354 394.5 1309.0Q346 1264 278 1264Z" fill="#f7f1e4"/><path transform="translate(358.250 0) scale(0.03125000 -0.03125000)" d="M633 -22Q462 -22 338.0 48.0Q214 118 147.5 247.0Q81 376 81 553Q81 726 147.5 856.0Q214 986 334.5 1059.0Q455 1132 618 1132Q764 1132 883.0 1070.0Q1002 1008 1072.5 882.0Q1143 756 1143 565V481H378Q383 344 454.0 274.0Q525 204 638 204Q717 204 773.5 237.5Q830 271 854 336L1126 285Q1085 146 956.5 62.0Q828 -22 633 -22ZM380 669H854Q843 778 784.0 842.0Q725 906 621 906Q513 906 451.0 839.5Q389 773 380 669Z" fill="#f7f1e4"/><path transform="translate(396.375 0) scale(0.03125000 -0.03125000)" d="M361 0 31 1118H346L443 705Q463 612 487.0 505.0Q511 398 534 273Q557 395 582.5 502.5Q608 610 631 705L733 1118H1009L1109 705Q1130 610 1155.5 503.0Q1181 396 1205 272Q1226 396 1249.0 503.0Q1272 610 1294 705L1391 1118H1710L1378 0H1073L949 431Q928 503 908.5 593.0Q889 683 869 771Q850 683 830.0 592.5Q810 502 790 431L666 0Z" fill="#f7f1e4"/></g>';
const WORDMARK = '<g transform="translate(740.893 662.000)"><path transform="translate(0.000 0) scale(0.01074219 -0.01074219)" d="M417 1490V0H150V1490Z" fill="#e8c872"/><path transform="translate(14.091 0) scale(0.01074219 -0.01074219)" d="M785 -20Q589 -20 435.0 71.0Q281 162 192.0 333.0Q103 504 103 744Q103 985 192.5 1156.5Q282 1328 436.0 1419.0Q590 1510 785 1510Q948 1510 1081.5 1449.0Q1215 1388 1302.0 1272.5Q1389 1157 1413 994H1144Q1119 1126 1021.0 1198.5Q923 1271 789 1271Q606 1271 488.5 1134.5Q371 998 371 744Q371 487 489.0 353.0Q607 219 788 219Q922 219 1020.5 291.5Q1119 364 1144 496H1414Q1393 353 1311.0 236.0Q1229 119 1095.0 49.5Q961 -20 785 -20Z" fill="#e8c872"/><path transform="translate(38.301 0) scale(0.01074219 -0.01074219)" d="M788 -20Q592 -20 437.5 71.0Q283 162 193.0 333.0Q103 504 103 744Q103 985 193.0 1156.5Q283 1328 437.5 1419.0Q592 1510 788 1510Q983 1510 1137.5 1419.0Q1292 1328 1381.5 1156.5Q1471 985 1471 744Q1471 503 1381.5 332.5Q1292 162 1137.5 71.0Q983 -20 788 -20ZM788 219Q970 219 1086.0 354.0Q1202 489 1202 744Q1202 1000 1086.0 1135.5Q970 1271 788 1271Q605 1271 488.0 1135.5Q371 1000 371 744Q371 490 488.0 354.5Q605 219 788 219Z" fill="#e8c872"/><path transform="translate(63.209 0) scale(0.01074219 -0.01074219)" d="M150 0V1490H452L967 669Q1007 605 1054.0 519.5Q1101 434 1150 322Q1142 430 1138.0 535.0Q1134 640 1134 708V1490H1405V0H1102L637 739Q598 801 563.5 862.0Q529 923 491.0 995.0Q453 1067 403 1164Q410 1026 416.0 914.0Q422 802 422 740V0Z" fill="#e8c872"/><path transform="translate(87.913 0) scale(0.01074219 -0.01074219)" d="M417 1490V0H150V1490Z" fill="#e8c872"/><path transform="translate(102.004 0) scale(0.01074219 -0.01074219)" d="M785 -20Q589 -20 435.0 71.0Q281 162 192.0 333.0Q103 504 103 744Q103 985 192.5 1156.5Q282 1328 436.0 1419.0Q590 1510 785 1510Q948 1510 1081.5 1449.0Q1215 1388 1302.0 1272.5Q1389 1157 1413 994H1144Q1119 1126 1021.0 1198.5Q923 1271 789 1271Q606 1271 488.5 1134.5Q371 998 371 744Q371 487 489.0 353.0Q607 219 788 219Q922 219 1020.5 291.5Q1119 364 1144 496H1414Q1393 353 1311.0 236.0Q1229 119 1095.0 49.5Q961 -20 785 -20Z" fill="#e8c872"/></g>';
const PLAY = `<circle cx="800" cy="318" r="92" fill="none" stroke="#e8c872" stroke-width="3"/>
  <circle cx="800" cy="318" r="78" fill="#0d9488"/>
  <polygon points="782,286 782,350 842,318" fill="#f7f1e4"/>`;
const cache = /* @__PURE__ */ new Map();
function videoPlaceholderSvg(tone) {
  const label = tone === "locked" ? LOCKED_LABEL : PREVIEW_LABEL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#071422"/>
  <rect x="48" y="48" width="1504" height="804" rx="28" fill="none" stroke="#e8c872" stroke-width="3"/>
  ${PLAY}
  ${label}
  ${WORDMARK}
</svg>`;
}
async function renderVideoPlaceholder(tone) {
  const cached = cache.get(tone);
  if (cached) return cached;
  const jpeg = await sharp(Buffer.from(videoPlaceholderSvg(tone))).jpeg({ quality: 82 }).toBuffer();
  cache.set(tone, jpeg);
  return jpeg;
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
const PRODUCTION_HOST = "iconicimagestx.vercel.app";
const WIX_HOSTS = /* @__PURE__ */ new Set(["iconicimagestx.com", "www.iconicimagestx.com"]);
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
function isWixHost(host) {
  return WIX_HOSTS.has(host);
}
function configuredProductionHost() {
  const configured = hostnameOf(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (configured && !isWixHost(configured)) return configured;
  return PRODUCTION_HOST;
}
function deploymentHosts() {
  const hosts = /* @__PURE__ */ new Set([PRODUCTION_HOST]);
  const production = hostnameOf(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production && !isWixHost(production)) hosts.add(production);
  if (process.env.VERCEL_ENV === "preview") {
    const preview = hostnameOf(process.env.VERCEL_URL);
    if (preview && !isWixHost(preview)) hosts.add(preview);
  }
  return hosts;
}
function chooseOwnHost(req) {
  if (process.env.VERCEL_ENV === "production") return configuredProductionHost();
  if (process.env.VERCEL_ENV === "preview") {
    const preview = hostnameOf(process.env.VERCEL_URL);
    if (preview && !isWixHost(preview)) return preview;
    return "";
  }
  const header = req.headers?.host;
  const raw = Array.isArray(header) ? header[0] : header;
  const requestHost = hostnameOf(typeof raw === "string" ? raw.split(",")[0] : "");
  if (requestHost && !isWixHost(requestHost) && deploymentHosts().has(requestHost)) return requestHost;
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
function placeholderTone(target) {
  return target.kind === "owner" ? "locked" : "preview";
}
function needsVideoPlaceholder(item) {
  return item.kind === "poster" && (isVideoPlaceholderSource(item.sourceUrl) || isVideoSource(item.sourceUrl));
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
  let jpeg = null;
  if (needsVideoPlaceholder(item)) {
    try {
      jpeg = await renderVideoPlaceholder(placeholderTone(target));
    } catch {
      jpeg = null;
    }
  } else {
    const source = await loadSource(item.sourceUrl, req);
    jpeg = source ? await renderJpeg(source) : null;
  }
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

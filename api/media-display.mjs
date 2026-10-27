import "dotenv/config";
import admin from "firebase-admin";
import express, { Router } from "express";
import { createHmac, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { stat, realpath, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import fs from "fs/promises";
import os from "os";
import path$1 from "path";
import { lookup } from "node:dns/promises";
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
function isTempAdminEnabled(env = liveServerEnv()) {
  if (env.ENABLE_TEMP_ADMIN !== "true") return false;
  return !isHostedDeployment(env);
}
function liveServerEnv(env = process.env) {
  return {
    ENABLE_TEMP_ADMIN: env.ENABLE_TEMP_ADMIN,
    VERCEL: env.VERCEL,
    VERCEL_ENV: env.VERCEL_ENV,
    // Bracket access so production server bundles keep the runtime value.
    NODE_ENV: env["NODE_ENV"]
  };
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
const PACKAGE_SKINS = [
  skin({
    look: "apprenticeship",
    ids: ["apprentice-25", "apprentice-50"],
    category: "listing",
    skinLabel: "Apprenticeship",
    title: "Apprenticeship",
    accent: "",
    badge: "Apprenticeship",
    features: "25 photos · 20 min · the cheap one",
    chips: [],
    price: "$75",
    priceNote: "",
    priceDisplay: "$75",
    tier: "entry",
    rank: 1,
    matchPriority: 20,
    match: /apprentice/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "just-photos",
    ids: ["photos-20", "photos-35", "photos-50"],
    category: "listing",
    skinLabel: "Just Photos",
    title: "Just Photos",
    accent: "",
    badge: "Just Photos",
    features: "Photo package · next-day basics",
    chips: [],
    price: "Basics",
    priceNote: "",
    priceDisplay: "Basics",
    tier: "entry",
    rank: 2,
    matchPriority: 10,
    match: /\bjust\s+photos\b|\bphotos?\s+only\b|^photos\s+\d+\b|\b\d+\s+photos?\b/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "essentials",
    ids: ["listing-essentials"],
    category: "listing",
    skinLabel: "Essentials",
    title: "The Essentials",
    accent: "",
    badge: "Essentials",
    features: "30 images · Snap Reel · twilight render",
    chips: [{ label: "Same-day" }, { label: "Reel" }],
    price: "$249",
    priceNote: "per listing",
    priceDisplay: "$249",
    tier: "mid",
    rank: 3,
    matchPriority: 30,
    match: /essentials\b/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "showcase",
    ids: ["listing-showcase"],
    category: "listing",
    skinLabel: "Showcase",
    title: "The Showcase",
    accent: "",
    badge: "The Showcase",
    features: "50 images · 5 aerials · 3D reel · floorplan",
    chips: [{ label: "Aerials" }, { label: "3D Reel" }],
    price: "$549",
    priceNote: "per listing",
    priceDisplay: "$549",
    tier: "mid",
    rank: 4,
    matchPriority: 40,
    match: /showcase/,
    foot: "shoot",
    amenities: true
  }),
  skin({
    look: "legacy",
    ids: ["listing-legacy"],
    category: "listing",
    skinLabel: "Legacy",
    title: "The Legacy",
    accent: "Legacy",
    badge: "Signature",
    features: "Full aerials · 90s 4K cinema · agent on camera",
    chips: [{ label: "4K Cinema" }, { label: "On Camera" }],
    price: "$899",
    priceNote: "per listing",
    priceDisplay: "$899",
    tier: "top",
    rank: 5,
    matchPriority: 50,
    match: /\blegacy\b/,
    foot: "shoot",
    amenities: true
  }),
  skin({
    look: "market-leader",
    ids: ["listing-market-leader"],
    category: "listing",
    skinLabel: "Market Leader",
    title: "Market Leader",
    accent: "Leader",
    badge: "VIP Priority",
    features: "Full-cycle takeover · VR · post-sale pack",
    chips: [
      { label: "VR / Matterport" },
      { label: "Post-Sale", tone: "gold" },
      { label: "Iconic Polish", tone: "gold" }
    ],
    price: "$1,599",
    priceNote: "per listing",
    priceDisplay: "$1,599",
    tier: "top",
    rank: 6,
    matchPriority: 160,
    match: /market\s+leader/,
    foot: "shoot",
    amenities: true
  }),
  skin({
    look: "refresh",
    ids: ["branding-refresh"],
    category: "human-brand",
    skinLabel: "Refresh",
    title: "The Refresh",
    accent: "",
    badge: "Portrait",
    features: "60-min session · 10 lifestyle portraits · AI Twin Lite",
    chips: [{ label: "Lifestyle" }, { label: "Locations" }],
    price: "$349",
    priceNote: "per session",
    priceDisplay: "$349",
    tier: "entry",
    rank: 7,
    matchPriority: 70,
    match: /\brefresh\b/,
    foot: "shoot",
    amenities: false
  }),
  skin({
    look: "content-partner",
    ids: ["branding-content-partner"],
    category: "human-brand",
    skinLabel: "Content Partner",
    title: "Content Partner",
    accent: "",
    badge: "Monthly",
    features: "2-hr film day · 20 custom reels · strategy & scripts",
    chips: [{ label: "20 Reels" }, { label: "Trending Audio" }, { label: "Direction" }],
    price: "$999",
    priceNote: "per month",
    priceDisplay: "$999/mo",
    tier: "mid",
    rank: 8,
    matchPriority: 80,
    match: /content\s+partner/,
    foot: "ongoing",
    amenities: false
  }),
  skin({
    look: "local-legend",
    ids: ["branding-local-legend"],
    category: "human-brand",
    skinLabel: "Local Legend",
    title: "The Local Legend",
    accent: "Legend",
    badge: "Market Takeover",
    features: "6–8 hr production · 90s 4K bio film · 5 neighborhood spotlights",
    chips: [{ label: "Day-in-the-Life" }, { label: "Authority Spots" }, { label: "Scripted" }],
    price: "$2,499",
    priceNote: "per campaign",
    priceDisplay: "$2,499",
    tier: "top",
    rank: 9,
    matchPriority: 150,
    match: /local\s+legend/,
    foot: "campaign",
    amenities: false
  }),
  skin({
    look: "baseline",
    ids: ["business-baseline"],
    category: "social",
    skinLabel: "Baseline",
    title: "The Baseline",
    accent: "",
    badge: "Baseline",
    features: "8 professionally edited reels · 2× / week",
    chips: [{ label: "Consistency" }],
    price: "$500",
    priceNote: "per month",
    priceDisplay: "$500/mo",
    tier: "entry",
    rank: 10,
    matchPriority: 60,
    match: /\bbaseline\b/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "growth-engine",
    ids: ["business-growth-engine"],
    category: "social",
    skinLabel: "Growth Engine",
    title: "Growth Engine",
    accent: "",
    badge: "Growth",
    features: "12 reels · hook suite · conversion captions",
    chips: [{ label: "12 Reels" }, { label: "Hooks" }],
    price: "$850",
    priceNote: "per month",
    priceDisplay: "$850/mo",
    tier: "mid",
    rank: 11,
    matchPriority: 90,
    match: /growth\s+engine/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "professional-suite",
    ids: ["business-professional-suite"],
    category: "social",
    skinLabel: "Professional Suite",
    title: "Professional Suite",
    accent: "",
    badge: "Pro Suite",
    features: "12 reels · full scheduling · multi-platform",
    chips: [{ label: "IG / FB / TikTok" }, { label: "Hands-off" }],
    price: "$1,500",
    priceNote: "per month",
    priceDisplay: "$1,500/mo",
    tier: "mid",
    rank: 12,
    matchPriority: 100,
    match: /professional\s+suite|\bpro\s+suite\b/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "connected-core",
    ids: ["business-connected-core"],
    category: "social",
    skinLabel: "Connected Core",
    title: "Connected Core",
    accent: "",
    badge: "Connected",
    features: "12 reels + management · SOI email · newsletter",
    chips: [{ label: "Social" }, { label: "Database" }],
    price: "$2,000",
    priceNote: "per month",
    priceDisplay: "$2,000/mo",
    tier: "mid",
    rank: 13,
    matchPriority: 110,
    match: /connected\s+core/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "signature-tier",
    ids: ["business-signature-tier"],
    category: "social",
    skinLabel: "Signature Tier",
    title: "Signature Tier",
    accent: "",
    badge: "Signature",
    features: "20 reels · monthly field shoot · lead flagging",
    chips: [{ label: "Daily M–F" }, { label: "Field Shoot" }],
    price: "$2,800",
    priceNote: "per month",
    priceDisplay: "$2,800/mo",
    tier: "mid",
    rank: 14,
    matchPriority: 120,
    match: /signature\s+tier/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "authority-stack",
    ids: ["business-authority-stack"],
    category: "social",
    skinLabel: "Authority Stack",
    title: "Authority Stack",
    accent: "Stack",
    badge: "Omni",
    features: "20+ reels · pro film · SMS + email automation",
    chips: [
      { label: "20+ Reels", tone: "teal" },
      { label: "SMS / Email" },
      { label: "Omni" }
    ],
    price: "$3,200",
    priceNote: "per month",
    priceDisplay: "$3,200/mo",
    tier: "top",
    rank: 15,
    matchPriority: 130,
    match: /authority\s+stack/,
    foot: "none",
    amenities: false
  }),
  skin({
    look: "iconic-partnership",
    ids: ["business-iconic-partnership"],
    category: "social",
    skinLabel: "Iconic Partnership",
    title: "Iconic Partnership",
    accent: "Partnership",
    badge: "Agency",
    features: "Unlimited reels · 2 field shoots · CRM + polish",
    chips: [{ label: "Unlimited" }, { label: "CRM" }, { label: "Polish" }],
    price: "$4,500",
    priceNote: "per month",
    priceDisplay: "$4,500/mo",
    tier: "top",
    rank: 16,
    matchPriority: 140,
    match: /iconic\s+partnership/,
    foot: "none",
    amenities: false
  })
];
new Map(PACKAGE_SKINS.map((item) => [item.look, item]));
[...PACKAGE_SKINS].sort((a, b) => b.matchPriority - a.matchPriority);
const ID_INDEX = /* @__PURE__ */ new Map();
for (const item of PACKAGE_SKINS) {
  for (const id of item.ids) ID_INDEX.set(normalizePackageText(id), item.look);
}
function skin(item) {
  return item;
}
function normalizePackageText(raw) {
  return raw.trim().toLowerCase().replace(/[—–]/g, " ").replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
const PHOTO_EDIT_REPLACEMENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
new Set(PHOTO_EDIT_REPLACEMENT_TYPES);
const PORTAL_WEBSITE_DESIGNS = [
  "issue",
  "premiere",
  "product-drop",
  "gallery-wall",
  "field-guide",
  "two-up",
  "golden-hour",
  "index",
  "dossier",
  "stories"
];
new Set(PORTAL_WEBSITE_DESIGNS);
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
function clipText(value, max) {
  let raw = "";
  if (typeof value === "string") raw = value;
  else if (typeof value === "number" && Number.isFinite(value)) raw = String(value);
  else if (typeof value === "boolean") raw = value ? "Yes" : "No";
  else return "";
  return raw.replace(/\u0000/g, "").trim().slice(0, max);
}
function readMediaStore(value) {
  const row = value && typeof value === "object" ? value : {};
  return {
    photos: readPrefs(row.photos),
    videos: readPrefs(row.videos),
    floorplans: readPrefs(row.floorplans),
    tours: readPrefs(row.tours),
    photoGroups: readPhotoGroups(row.photoGroups)
  };
}
function groupIdText(value) {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return /^g[a-z0-9]{4,16}$/.test(id) ? id : "";
}
function readPhotoGroups(value) {
  if (!Array.isArray(value)) return [];
  const groups = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const id = groupIdText(row.id);
    const name = clipText(row.name, 60);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    groups.push({
      id,
      name,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : groups.length
    });
  }
  return groups.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).slice(0, 24);
}
function readPrefs(value) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [id, prefs] of Object.entries(value)) {
    if (!id || !prefs || typeof prefs !== "object") continue;
    const row = prefs;
    out[id] = {
      hidden: row.hidden === true,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0,
      groupId: groupIdText(row.groupId)
    };
  }
  return out;
}
function text$1(value) {
  return typeof value === "string" ? value.trim() : "";
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
const BUSINESS_CONTACT_LINE = "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";
const LEGAL_BUSINESS_NAME = "Iconic Images Photography, LLC";
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
const PUBLIC_PAGES = [
  {
    path: "/",
    file: "index.html",
    title: "Iconic Images | Real Estate Media in Spring, The Woodlands, and Houston",
    description: "Photography, video, and listing media for real estate agents in Spring, The Woodlands, and Houston."
  },
  {
    path: "/about",
    file: "seo/about.html",
    title: "About | Iconic Images",
    description: "Iconic Images is a Spring, Texas studio for real estate media, serving The Woodlands, Houston, and nearby communities since 2016."
  },
  {
    path: "/pricing",
    file: "seo/pricing.html",
    title: "Pricing | Iconic Images",
    description: "Listing, branding, and media packages from Iconic Images for agents in Spring, The Woodlands, and Houston."
  },
  {
    path: "/studio-105",
    file: "seo/studio-105.html",
    title: "Studio 105 | Iconic Images",
    description: "Studio 105 in Spring has two portrait rooms, Studio Noir and Studio Blanc, for headshots, brand films, and product photos."
  },
  {
    path: "/portfolio",
    file: "seo/portfolio.html",
    title: "Portfolio | Iconic Images",
    description: "Listing photos, aerials, portraits, and virtual staging by Iconic Images in Spring, The Woodlands, and Houston."
  },
  {
    path: "/stock-footage",
    file: "seo/stock-footage.html",
    title: "Stock Footage | Iconic Images",
    description: "Neighborhood photo stills from Iconic Images for agents listing homes in Spring, The Woodlands, and Houston."
  },
  {
    path: "/contact",
    file: "seo/contact.html",
    title: "Contact | Iconic Images",
    description: "Contact Iconic Images in Spring, Texas about real estate photography and video in The Woodlands and Houston."
  },
  {
    path: "/socials",
    file: "seo/socials.html",
    title: "Socials | Iconic Images",
    description: "Instagram, Facebook, and TikTok from Iconic Images, a real estate media studio in Spring, The Woodlands, and Houston."
  },
  {
    path: "/insights",
    file: "seo/insights.html",
    title: "Iconic Insights | Iconic Images",
    description: "Field notes from Iconic Images on listing photography, video, and marketing in Spring, The Woodlands, and Houston."
  },
  {
    path: "/book",
    file: "seo/book.html",
    title: "Book a Shoot | Iconic Images",
    description: "Schedule listing photography or video with Iconic Images in Spring, The Woodlands, or Houston."
  },
  {
    path: "/apprenticeship",
    file: "seo/apprenticeship.html",
    title: "The Apprenticeship Program | Iconic Images",
    description: "Apprentice listing photos in Spring, The Woodlands, and Houston. A short appointment, photos only, and the program rules."
  },
  {
    path: "/senior-living",
    file: "seo/senior-living.html",
    title: "Senior Living Virtual Tours & Photography | Iconic Images",
    description: "Virtual tours and photography for senior living communities in Spring, The Woodlands, and Houston."
  },
  {
    path: "/privacy",
    file: "seo/privacy.html",
    title: "Privacy Policy | Iconic Images",
    description: `Privacy Policy for ${LEGAL_BUSINESS_NAME}, a real estate media studio based in Spring, Texas.`
  },
  {
    path: "/terms",
    file: "seo/terms.html",
    title: "Terms and Conditions | Iconic Images",
    description: "Terms and Conditions for photography, video, and listing media from Iconic Images in Texas."
  },
  {
    path: "/login",
    file: "seo/login.html",
    title: "Client Login | Iconic Images",
    description: "Client sign-in for Iconic Images. View your listings and delivered media."
  }
];
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
function ownerAllowlist(raw) {
  if (raw == null) return [];
  const emails = raw.split(/[,;\s]+/).map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"));
  return [...new Set(emails)];
}
function isOwnerEmail(email, allowlist) {
  if (!email) return false;
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
const HISTORY_LIMIT = 10;
function textField(id, label, value) {
  return { id, label, kind: "text", value };
}
function areaField(id, label, value) {
  return { id, label, kind: "textarea", value };
}
function linkField(id, label, value, href) {
  return { id, label, kind: "link", value, href };
}
function imageField(id, label, value) {
  return { id, label, kind: "image", value };
}
function videoField(id, label, value) {
  return { id, label, kind: "video", value };
}
function block(id, label, fields, items) {
  return { id, label, hidden: false, fields, ...items ? { items } : {} };
}
function contentPage(id, path2, label, seoTitle, seoDescription, blocks) {
  return { id, path: path2, label, seoTitle, seoDescription, blocks };
}
function normalizeSiteEditorFlags(input) {
  let view = input?.view === true;
  let edit = input?.edit === true;
  let publish = input?.publish === true;
  if (publish) edit = true;
  if (edit) view = true;
  if (!view) {
    edit = false;
    publish = false;
  }
  return { view, edit, publish };
}
function siteEditorAccess(input) {
  if (input.role === "admin" || isOwnerEmail(input.email, input.ownerEmails)) {
    return { view: true, edit: true, publish: true, locked: true };
  }
  return { ...normalizeSiteEditorFlags(input.flags), locked: false };
}
function allows(access, level) {
  if (level === "view") return access.view;
  if (level === "edit") return access.edit;
  return access.publish;
}
function stripPage(page2) {
  const { id, path: path2, label, seoTitle, seoDescription, blocks } = page2;
  return { id, path: path2, label, seoTitle, seoDescription, blocks: blocks.map(cloneBlock) };
}
function cloneBlock(blockValue) {
  return {
    id: blockValue.id,
    label: blockValue.label,
    hidden: blockValue.hidden === true,
    fields: blockValue.fields.map((field) => ({ ...field })),
    ...blockValue.items ? { items: blockValue.items.map((item) => ({ id: item.id, fields: item.fields.map((field) => ({ ...field })) })) } : {}
  };
}
function pushRevision(existing, next, actor2, now = (/* @__PURE__ */ new Date()).toISOString()) {
  const prior = existing ? stripPage(existing) : null;
  const revisions = [...existing?.revisions ?? []];
  if (prior) {
    revisions.unshift({
      id: `rev_${now}`,
      at: existing?.publishedAt || now,
      byUid: existing?.publishedByUid || actor2.uid,
      byName: existing?.publishedByName || actor2.name,
      snapshot: prior
    });
  }
  return revisions.slice(0, HISTORY_LIMIT);
}
function revertTo(page2, revisionId, actor2, now = (/* @__PURE__ */ new Date()).toISOString()) {
  const revision = page2.revisions?.find((item) => item.id === revisionId);
  if (!revision) return null;
  const current = stripPage(page2);
  const revisions = [
    {
      id: `rev_${now}`,
      at: page2.publishedAt || now,
      byUid: page2.publishedByUid || actor2.uid,
      byName: page2.publishedByName || actor2.name,
      snapshot: current
    },
    ...(page2.revisions ?? []).filter((item) => item.id !== revisionId)
  ].slice(0, HISTORY_LIMIT);
  return {
    ...revision.snapshot,
    revisions,
    publishedAt: now,
    publishedByUid: actor2.uid,
    publishedByName: actor2.name
  };
}
const DROPBOX_HOSTS = /* @__PURE__ */ new Set(["dropbox.com", "www.dropbox.com", "dl.dropboxusercontent.com"]);
function isAllowedDropboxHost(hostname) {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host.includes("..")) return false;
  if (isIpLiteral(host)) return false;
  if (DROPBOX_HOSTS.has(host)) return true;
  return host.endsWith(".dropboxusercontent.com") && host.length > ".dropboxusercontent.com".length;
}
function isIpLiteral(host) {
  if (host.startsWith("[") || host.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
function isPrivateAddress(ip) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::1" || value === "0.0.0.0") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return value.includes(":");
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
function prepareDropboxUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!isAllowedDropboxHost(url.hostname)) return null;
  if (url.pathname.includes("/scl/fo/") || url.pathname.includes("/sh/")) return null;
  url.searchParams.set("dl", "1");
  if (url.pathname.includes("/scl/fi/")) url.searchParams.set("raw", "1");
  return url;
}
const SITE_IMAGE_BYTES = 25 * 1024 * 1024;
const SITE_VIDEO_BYTES = 80 * 1024 * 1024;
function sniffMedia(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image";
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image";
  if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image";
  if (bytes.length >= 12) {
    const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (brand === "ftyp") return "video";
  }
  return null;
}
function seo(path2) {
  const page2 = PUBLIC_PAGES.find((item) => item.path === path2);
  return {
    title: page2?.title ?? "Iconic Images",
    description: page2?.description ?? ""
  };
}
function linkItem(id, label, href) {
  return { id, fields: [linkField("link", label, label, href)] };
}
function pairItem(id, label, before, after, afterKind = "image") {
  return {
    id,
    fields: [
      textField("label", "Label", label),
      imageField("before", "Before", before),
      afterKind === "video" ? videoField("after", "After", after) : imageField("after", "After", after)
    ]
  };
}
const HERO_IMAGE = "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F6529795874414a1e9fe845f3eb948e94?format=webp&width=1600&height=900";
const BUILDER_PAIRS = [
  pairItem("builder-1", "Listing film", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Faecac2467163410db0180e8fdd8a98f7?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4ea5feebdab84ee585ffaa811d803379?alt=media&token=dda6499e-44a2-47a4-a456-1cacb39b6ae4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
  pairItem("builder-2", "Vertical cut", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fe7a04734046e4171bfccc96600f0870f?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fba0e88982aa140c2bd2a033055391c4a?alt=media&token=2faaf53d-9e02-4887-aa85-08c6f971cee4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
  pairItem("builder-3", "Property film", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F1bc44dc912bd4cd4848b7cbe64db7001?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4203b3fa6d2046f6b3aebe85986706ad?alt=media&token=60e7a23a-12d3-45d9-8063-8fa212dc4c4c&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
  pairItem("builder-4", "Detail film", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F54911d726f0a43b684406564dac1e5e8?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4be86e27da6548d59c567aa0bdfc66e9?alt=media&token=927f0df1-6342-47f7-809f-131e4df074d6&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video")
];
const STILL_PAIRS = [
  pairItem("twilight-pool", "Twilight conversion", "/media/before-after/twilight-pool-day.jpg", "/media/before-after/twilight-pool-lifestyle.jpg"),
  pairItem("pavilion-lifestyle", "Lifestyle staging", "/media/before-after/pavilion-empty.jpg", "/media/before-after/pavilion-lifestyle.jpg"),
  pairItem("pasture-lifestyle", "Pasture lifestyle", "/media/before-after/pasture-animals.jpg", "/media/before-after/pasture-lifestyle.jpg"),
  pairItem("living-declutter", "Virtual declutter", "/media/before-after/living-occupied.jpg", "/media/before-after/living-declutter.jpg")
];
function page(id, path2, label, blocks, title, description) {
  const meta = seo(path2);
  return contentPage(id, path2, label, title ?? meta.title, description ?? meta.description, blocks);
}
const PAGES = [
  page("chrome", "", "Header, footer, and promo", [
    block("promo", "Promo bar", [
      textField("visible", "Show promo bar", "true"),
      textField("text", "Promo text", "FREE AI STAGING ON YOUR FIRST ORDER - CODE: ICONICAI")
    ]),
    block("brand", "Logo and color", [
      textField("logoText", "Logo wordmark", "ICONIC"),
      textField("primaryColor", "Accent color", "#0d9488"),
      imageField("logo", "Logo image", "/media/logos/camera-logo-white-on-black.png")
    ]),
    block("nav", "Navigation", [], [
      linkItem("about", "About", "/about"),
      linkItem("pricing", "Pricing", "/pricing"),
      linkItem("studio", "Studio 105", "/studio-105"),
      linkItem("portfolio", "Portfolio", "/portfolio"),
      linkItem("insights", "Insights", "/insights"),
      linkItem("stock", "Stock Footage", "/stock-footage"),
      linkItem("contact", "Contact Us", "/contact")
    ]),
    block("headerCtas", "Header buttons", [
      linkField("login", "Log in", "Log in", "/login"),
      linkField("book", "Book Now", "Book Now", "/book")
    ]),
    block("footer", "Footer links", [
      textField("copyright", "Copyright name", LEGAL_BUSINESS_NAME)
    ], [
      linkItem("home", "Home", "/"),
      linkItem("pricing", "Pricing", "/pricing"),
      linkItem("socials", "Socials", "/socials"),
      linkItem("portfolio", "Portfolio", "/portfolio"),
      linkItem("insights", "Insights", "/insights"),
      linkItem("studio", "Studio 105", "/studio-105"),
      linkItem("contact", "Contact Us", "/contact"),
      linkItem("login", "Client Login", "/login")
    ]),
    block("socials", "Social profiles", [], [
      linkItem("facebook", "Facebook", "https://facebook.com/iconicimagestx"),
      linkItem("instagram", "Instagram", "https://instagram.com/iconicimagestx"),
      linkItem("tiktok", "TikTok", "https://tiktok.com/@iconicimagestx")
    ])
  ], "Iconic Images", "Shared header, footer, and promo."),
  page("home", "/", "Home", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "Your Brand, Made"),
      textField("title", "Headline", "ICONIC"),
      areaField("line1", "Supporting line", "Media Production. Virtual Staging. Content Management."),
      areaField("line2", "Body", 'ICONIC is the dedicated creative crew for businesses and agents who demand more than "good enough".'),
      textField("weAre", "Rotator label", "WE ARE YOUR:"),
      imageField("image", "Background", HERO_IMAGE),
      linkField("ctaRealEstate", "Real estate button", "I'm in Real Estate", "/pricing#listings"),
      linkField("ctaBusiness", "Business button", "I own a Business", "/pricing#branding-personal")
    ], [
      { id: "cap-1", fields: [textField("label", "Capability", "Cinematic Filmmakers")] },
      { id: "cap-2", fields: [textField("label", "Capability", "Social Architects")] },
      { id: "cap-3", fields: [textField("label", "Capability", "REEL Producers")] },
      { id: "cap-4", fields: [textField("label", "Capability", "Private Editing Studio")] },
      { id: "cap-5", fields: [textField("label", "Capability", "Content Managers")] },
      { id: "cap-6", fields: [textField("label", "Capability", "Personal Production Team")] }
    ]),
    block("beforeAfter", "Before and after", [
      textField("beforeLabel", "Before label", "Before"),
      textField("afterLabel", "After label", "After")
    ], [...STILL_PAIRS, ...BUILDER_PAIRS]),
    block("raising", "We are the bar", [
      textField("titleLead", "Title lead", "We"),
      textField("titleAccent", "Title accent", "ARE"),
      textField("titleTail", "Title tail", "the Bar."),
      areaField("body", "Body", "We don’t follow trends. We break patterns. We don’t undercut. We outperform.")
    ]),
    block("market", "Our market", [
      textField("titleLead", "Title lead", "This Is"),
      textField("titleAccent", "Title accent", "OUR"),
      textField("titleTail", "Title tail", "Market."),
      areaField("body", "Body", "Iconic was built here. We’ve invested here. We’ve shaped here. Winning brands don’t chase. They choose Iconic.")
    ]),
    block("solution", "High-impact video", [
      textField("badge", "Badge", "Built for Creative Excellence"),
      textField("title", "Headline", "Your All-in-One Solution for High-Impact Media Content"),
      areaField("body", "Body", "Transform your raw ideas into engaging cinematic media in minutes. Whether you're a high-growth startup serving multiple clients or an established enterprise, Iconic helps you create professional-grade visual content seamlessly.")
    ], [
      { id: "product", fields: [videoField("video", "Video", "/media/video/product-photography.mp4"), textField("title", "Title", "Product Photography")] },
      { id: "vertical", fields: [videoField("video", "Video", "/media/reels/superpower-reel-12s.mp4"), textField("title", "Title", "Vertical Reel")] },
      { id: "content", fields: [videoField("video", "Video", "/media/video/content-web-clip.mp4"), textField("title", "Title", "Content Package")] },
      { id: "snap-luxury", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-01.mp4"), textField("title", "Title", "Snap Reel · Luxury Tour")] },
      { id: "snap-modern", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-02.mp4"), textField("title", "Title", "Snap Reel · Modern Living")] },
      { id: "snap-kitchen", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-03.mp4"), textField("title", "Title", "Snap Reel · Kitchen Glow")] },
      { id: "snap-arrival", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-04.mp4"), textField("title", "Title", "Snap Reel · Grand Arrival")] }
    ]),
    block("stats", "Stats", [], [
      { id: "assets", fields: [textField("value", "Value", "100,000+"), textField("label", "Label", "Media assets produced")] },
      { id: "turnaround", fields: [textField("value", "Value", "24 hrs"), textField("label", "Label", "Avg. turnaround time")] },
      { id: "engagement", fields: [textField("value", "Value", "+403%"), textField("label", "Label", "More brand engagement")] }
    ]),
    block("steps", "Steps", [
      textField("badge", "Badge", "4 STEPS TO RESULTS"),
      textField("title", "Headline", "From vision to viral in minutes, not days"),
      areaField("body", "Body", "Placing an order with Iconic is as simple as it gets. We handle the heavy lifting so you can focus on growth.")
    ], [
      { id: "step-1", fields: [textField("step", "Step", "STEP 1"), textField("title", "Title", "Book your session"), areaField("body", "Body", "Select your creative service and schedule a time through our seamless partnership portal in just a few clicks.")] },
      { id: "step-2", fields: [textField("step", "Step", "STEP 2"), textField("title", "Title", "We capture the vision"), areaField("body", "Body", "Our professional creative team arrives on-site with state-of-the-art equipment to capture high-impact raw media.")] },
      { id: "step-3", fields: [textField("step", "Step", "STEP 3"), textField("title", "Title", "Rapid post-production"), areaField("body", "Body", "Our expert editors transform raw clips into polished, cinematic masterpieces that perfectly align with your brand.")] },
      { id: "step-4", fields: [textField("step", "Step", "STEP 4"), textField("title", "Title", "Delivery & launch"), areaField("body", "Body", "Receive your ready-to-post assets within 24 hours. Download, publish, and dominate your social feed instantly.")] }
    ]),
    block("network", "The network", [
      textField("titleLead", "Title lead", "Built Bigger Than"),
      textField("titleAccent", "Title accent", "One Brand"),
      areaField("body", "Body", "Iconic isn’t here to squeeze the market; we’re here to expand it.")
    ]),
    block("audience", "Who it’s for", [
      textField("badge", "Badge", "WHO IT'S FOR"),
      textField("title", "Headline", "Tailored for real estate and visual storytelling professionals"),
      areaField("body", "Body", "Iconic simplifies media creation for real estate professionals, builders, and business owners — helping you showcase your vision and grow your presence.")
    ]),
    block("audienceDetails", "Audiences", [], [
      { id: "realtors", fields: [textField("title", "Title", "Realtors & Brokers"), areaField("body", "Body", "Attract leads, close faster, and win more listings with engaging property videos."), imageField("image", "Image", "/media/photos/lifestyle-mtz04327.jpg")] },
      { id: "photographers", fields: [textField("title", "Title", "Photographers"), areaField("body", "Body", "Upsell AI videos with every order. More profit, no effort."), imageField("image", "Image", "/media/photos/studio-mtz01691.jpg")] },
      { id: "media", fields: [textField("title", "Title", "Real Estate Media Companies"), areaField("body", "Body", "Scale your business and stay competitive with AI property videos — no extra overhead."), imageField("image", "Image", "/media/photos/drone-hero.jpg")] },
      { id: "developers", fields: [textField("title", "Title", "Developers & Builders"), areaField("body", "Body", "Showcase new construction and development projects with cinematic fly-throughs."), imageField("image", "Image", "/media/photos/luxury-exterior.jpg")] },
      { id: "business", fields: [textField("title", "Title", "Small Business Owners"), areaField("body", "Body", "Professional media content to tell your brand story and engage your local community."), imageField("image", "Image", "/media/photos/lifestyle-daughtery-mtz00636.jpg")] },
      { id: "online", fields: [textField("title", "Title", "Online Appearance"), areaField("body", "Body", "High-impact visual identity for anyone looking to dominate their digital space."), imageField("image", "Image", "/media/photos/headshot-gracepoint-1.jpg")] }
    ]),
    block("snapReels", "Snap Reels", [
      textField("kicker", "Kicker", "Essentials"),
      textField("title", "Headline", "Snap Reels"),
      areaField("body", "Body", "Listing stills, turned into a 9:16 Snap Reel. Same-day vertical video from the photos we already shoot.")
    ], [
      { id: "marias", fields: [videoField("video", "Video", "/media/videos/snap-reels/MariasWay_MarketingSnap_v1.mp4"), textField("title", "Title", "Marias Way"), textField("vibe", "Caption", "Evening light through the house, paced for a vertical scroll")] },
      { id: "heron", fields: [videoField("video", "Video", "/media/videos/snap-reels/HeronWing_MarketingSnap_v1.mp4"), textField("title", "Title", "Heron Wing"), textField("vibe", "Caption", "Clean lines and still water, cut for the feed")] },
      { id: "blue", fields: [videoField("video", "Video", "/media/videos/snap-reels/BlueLake_MarketingSnap_v1.mp4"), textField("title", "Title", "Blue Lake"), textField("vibe", "Caption", "Golden hour from the terrace to the lake")] }
    ]),
    block("features", "Add-on tools", [
      textField("badge", "Badge", "ADDITIONAL FEATURES"),
      textField("title", "Headline", "Go beyond basic editing with powerful add-on tools"),
      areaField("body", "Body", "Iconic isn't just about reels — enhance your content with smart AI tools designed to polish, extend, and personalize every video.")
    ], [
      { id: "snap", fields: [textField("title", "Title", "Snap Reels"), areaField("body", "Body", "Turn the listing stills into a 9:16 Snap Reel. A vertical cut buyers can watch before they ever book a showing.")] },
      { id: "import", fields: [textField("title", "Title", "One Click Import"), areaField("body", "Body", "Pull listing photos directly from Realtor.com or Zillow to start your video in seconds.")] },
      { id: "staging", fields: [textField("title", "Title", "AI Virtual Staging"), areaField("body", "Body", "Instantly furnish empty rooms with realistic AI staging to showcase your property's full potential.")] },
      { id: "edits", fields: [textField("title", "Title", "AI Photo Edits"), areaField("body", "Body", "Make your listing photos stand out with AI-powered enhancements — like twilights, lawn repairs, and other edits that instantly elevate any property.")] },
      { id: "studio", fields: [textField("title", "Title", "Studio"), areaField("body", "Body", "Iconic's built-in editor that allows you to customize your videos with templates, music, captions, branding, and even your own photos or clips.")] },
      { id: "voice", fields: [textField("title", "Title", "AI Voiceovers"), areaField("body", "Body", "Instantly generate natural-sounding narrations from a wide range of voices.")] },
      { id: "captions", fields: [textField("title", "Title", "Social Media Captions"), areaField("body", "Body", "Automatically create captions optimized for Instagram, Facebook, LinkedIn, YouTube, and X.")] },
      { id: "avatars", fields: [textField("title", "Title", "AI Avatars"), areaField("body", "Body", "Create professional video presentations with AI-generated avatars for a personal touch.")] }
    ]),
    block("reviews", "Reviews", [
      textField("badge", "Badge", "TESTIMONIALS"),
      textField("title", "Headline", "What our clients are saying"),
      areaField("body", "Body", "Agents and businesses trust Iconic Images for listing photography, video, and a fast, professional turnaround."),
      linkField("cta", "Button", "Book a shoot", "/book")
    ]),
    block("faq", "FAQ", [
      textField("badge", "Badge", "FAQ"),
      textField("title", "Headline", "Got questions? We've got answers."),
      areaField("body", "Body", "Everything you need to know about Iconic in a nutshell.")
    ], [
      { id: "time", fields: [textField("question", "Question", "How long does video processing take?"), areaField("answer", "Answer", "Typically, our high-end media assets are delivered within 24 hours of capture. Our rapid post-production workflow is optimized for social media timelines.")] },
      { id: "portrait", fields: [textField("question", "Question", "Does Iconic support portrait mode?"), areaField("answer", "Answer", "Yes, we specialize in both cinematic landscape and scroll-stopping vertical content optimized for Reels, TikTok, and Shorts.")] },
      { id: "images", fields: [textField("question", "Question", "How many images can I use per video?"), areaField("answer", "Answer", "Our standard cinematic reel utilizes between 15-25 of the best property shots, but this can be customized based on your specific project needs.")] },
      { id: "length", fields: [textField("question", "Question", "How long is each video?"), areaField("answer", "Answer", "Most property reels are between 30-60 seconds, which is the 'sweet spot' for high engagement across modern social platforms.")] }
    ]),
    block("partnership", "Closing call to action", [
      textField("title", "Headline", "Let's Create Something ICONIC Together."),
      areaField("body", "Body", "Whether you're looking for creative services, strategic partnership, or media licensing solutions, our team is ready to discuss your vision and bring it to life."),
      linkField("cta", "Button", "Get your free Iconic Video", "/book")
    ])
  ]),
  page("pricing", "/pricing", "Pricing", [
    block("hero", "Hero", [
      textField("badge", "Badge", "Pricing & Packages"),
      textField("titleLead", "Title lead", "The Perfect"),
      textField("titleAccent", "Title accent", "Price"),
      textField("titleTail", "Title tail", "for Your Presence"),
      textField("subtitle", "Subtitle", "Media that moves as fast as you do."),
      videoField("background", "Background video", "/media/video/content-web-clip.mp4")
    ]),
    block("chips", "Section jumps", [], [
      { id: "listings", fields: [textField("label", "Label", "FOR LISTINGS"), textField("anchor", "Anchor", "listings")] },
      { id: "branding", fields: [textField("label", "Label", "FOR BRANDING"), textField("anchor", "Anchor", "branding")] },
      { id: "business", fields: [textField("label", "Label", "FOR BUSINESS"), textField("anchor", "Anchor", "social")] },
      { id: "growth", fields: [textField("label", "Label", "FOR GROWTH"), textField("anchor", "Anchor", "brand-identity")] }
    ]),
    block("assistant", "AI assistant card", [
      textField("title", "Title", "Not sure where to start?"),
      textField("subtitle", "Subtitle", "Let our AI guide you"),
      linkField("cta", "Link", "Let our AI guide you", "/pricing/ai-assistant")
    ]),
    block("doors", "Choose a path", [
      textField("title", "Headline", "Do you have..."),
      textField("timeTitle", "Time door title", "MORE TIME THAN MONEY"),
      areaField("timeBody", "Time door body", "I’m ready to hustle, I just need the tools and the professional polish to win."),
      textField("timeCta", "Time door button", "I'M READY TO HUSTLE →"),
      textField("moneyTitle", "Money door title", "MORE MONEY THAN TIME"),
      areaField("moneyBody", "Money door body", "I’m ready to scale, I need my time back and my brand on autopilot."),
      textField("moneyCta", "Money door button", "I'M READY TO SCALE →")
    ]),
    block("listings", "Listings section", [
      textField("title", "Headline", "Listings & Spaces (The Property)"),
      areaField("body", "Body", "Targeting the listing lifecycle: Pre-launch buzz, active sale, and post-close legacy. Every package now includes a Listing Reel as the core deliverable. We don't just shoot; we trend.")
    ]),
    block("brandStages", "Personal brand", [
      textField("titleLead", "Title lead", "Elevate Your"),
      textField("titleAccent", "Title accent", "Personal Brand"),
      areaField("body", "Body", "Three beats. A stiff standard headshot, a polished Iconic corporate portrait, then a lifestyle frame with some life in it.")
    ], [
      { id: "standard", fields: [textField("label", "Label", "Standard"), imageField("image", "Photo", "/media/photos/standard-headshot.jpg"), textField("note", "Note", "Flat light. A stiff crop. Easy to scroll past.")] },
      { id: "corporate", fields: [textField("label", "Label", "Iconic Corporate"), imageField("image", "Photo", "/media/photos/lifestyle-mtz04327.jpg"), textField("note", "Note", "Polished, confident, and ready for the brand.")] },
      { id: "lifestyle", fields: [textField("label", "Label", "Iconic Lifestyle"), imageField("image", "Photo", "/media/photos/lifestyle-kennedy-mtz01127.jpg"), textField("note", "Note", "Alive. Warm. The frame people actually stop for.")] }
    ])
  ]),
  page("book", "/book", "Book", [
    block("seoNote", "Booking page", [
      areaField("note", "Editor note", "The booking form, package prices, and promo math stay on the booking catalog so a copy edit cannot change what a client is charged.")
    ])
  ]),
  page("seniorLiving", "/senior-living", "Senior Living", [
    block("hero", "Hero", [
      textField("titleLead", "Title lead", "Virtual tours for"),
      textField("titleAccent", "Title accent", "senior living"),
      areaField("location", "Location", "For communities in Spring, The Woodlands, and Houston."),
      areaField("sampleNote", "Sample note", "The sample tour is from a Woodlands-area senior living community."),
      linkField("cta", "Primary button", "Schedule when you're ready for us to come!", "#schedule"),
      imageField("hero", "Hero photo", "/senior-living/senior-living-01-hero.jpg")
    ]),
    block("gallery", "Photo gallery", [
      textField("title", "Headline", "A Woodlands-area senior living community")
    ]),
    block("tour", "Sample tour", [
      textField("title", "Headline", "Sample tour"),
      textField("embedTitle", "Tour title", "Sample tour of a Woodlands-area senior living community")
    ])
  ]),
  page("contact", "/contact", "Contact", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "CONTACT US"),
      textField("titleLead", "Title lead", "We'd love to"),
      textField("titleAccent", "Title accent", "hear from you"),
      areaField("body", "Body", "Have a question or feedback? We'd love to hear from you. Send us a message and we'll respond as soon as possible."),
      textField("chatKicker", "Chat kicker", "LIVE CHAT"),
      textField("chatLabel", "Chat label", "Start Chat")
    ])
  ]),
  page("about", "/about", "About", [
    block("hero", "Hero", [
      textField("badge", "Badge", "Decade of Excellence"),
      textField("titleLead", "Title lead", "A Decade of"),
      textField("titleAccent", "Title accent", "Setting the Standard."),
      areaField("body", "Body", "Est. 2016. 10 Years. Thousands of Listings. Millions in Commission Generated for our Partners.")
    ], [
      { id: "est", fields: [imageField("image", "Photo", "/media/about/tiles/01_est_2016.jpg"), textField("label", "Label", "Est. 2016")] },
      { id: "engine", fields: [imageField("image", "Photo", "/media/about/tiles/02_the_engine.jpg"), textField("label", "Label", "The Engine")] },
      { id: "scale", fields: [imageField("image", "Photo", "/media/about/tiles/03_scale.jpg"), textField("label", "Label", "Scale")] },
      { id: "growth", fields: [imageField("image", "Photo", "/media/about/tiles/04_growth.jpg"), textField("label", "Label", "Growth")] },
      { id: "legacy", fields: [imageField("image", "Photo", "/media/about/tiles/05_legacy.jpg"), textField("label", "Label", "Legacy")] },
      { id: "cinematic", fields: [imageField("image", "Photo", "/media/about/tiles/06_cinematic.jpg"), textField("label", "Label", "Cinematic")] },
      { id: "market", fields: [imageField("image", "Photo", "/media/about/tiles/08_market_lead.jpg"), textField("label", "Label", "Market Lead")] }
    ]),
    block("hub", "Intelligence hub", [
      textField("kicker", "Kicker", "THE INTELLIGENCE HUB: BEYOND THE LENS"),
      textField("title", "Headline", "Where Vision Meets Velocity."),
      areaField("body", "Body", "At Iconic Images, we don’t just capture real estate; we engineer market ownership. In a world of infinite scrolling, 'pretty pictures' are the bare minimum."),
      textField("philosophyTitle", "Philosophy title", "THE ICONIC PHILOSOPHY"),
      areaField("philosophy", "Philosophy", "We believe the agent is the architect of the deal, but the media is the fuel.")
    ])
  ]),
  page("portfolio", "/portfolio", "Portfolio", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "Selected Work"),
      textField("title", "Headline", "Portfolio"),
      areaField("body", "Body", "People, families, studio, holiday, headshots, listings, aerials, and virtual staging from Iconic Images.")
    ])
  ]),
  page("studio105", "/studio-105", "Studio 105", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "The physical studio"),
      textField("title", "Headline", "Studio 105")
    ]),
    block("rooms", "Rooms", [], [
      { id: "studio-noir", fields: [textField("name", "Name", "Studio Noir"), textField("vibe", "Vibe", "Dark / dramatic"), areaField("summary", "Summary", "A controlled black room for portraits with edge, branding films, and product that needs mood.")] },
      { id: "studio-blanc", fields: [textField("name", "Name", "Studio Blanc"), textField("vibe", "Vibe", "Bright / white"), areaField("summary", "Summary", "A clean white room for crisp headshots, bright product, and holiday minis.")] }
    ])
  ]),
  page("socials", "/socials", "Socials", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "Iconic channels"),
      textField("titleLead", "Title lead", "ICONIC"),
      textField("titleAccent", "Title accent", "EVERYWHERE."),
      areaField("body", "Body", "Follow Iconic Images. The frames below are from our own library."),
      textField("stillsTitle", "Stills heading", "Selected stills")
    ], [
      { id: "drone", fields: [imageField("image", "Photo", "/media/photos/drone-hero.jpg"), textField("caption", "Caption", "Aerial still from an Iconic listing shoot.")] },
      { id: "pool", fields: [imageField("image", "Photo", "/media/before-after/twilight-pool-lifestyle.jpg"), textField("caption", "Caption", "Twilight conversion of a rear pool.")] },
      { id: "interior", fields: [imageField("image", "Photo", "/media/photos/luxury-interior.jpg"), textField("caption", "Caption", "Listing interior from the Iconic library.")] }
    ])
  ]),
  page("stock", "/stock-footage", "Stock footage", [
    block("hero", "Hero", [
      textField("title", "Headline", "Stock Footage Library"),
      areaField("body", "Body", "Premium, professionally photographed real estate images by neighborhood. License instantly and use for your listings, marketing, or staging inspiration.")
    ])
  ]),
  page("virtualStaging", "/services/virtual-staging", "Virtual staging", [
    block("hero", "Hero", [
      textField("titleLead", "Title lead", "AI"),
      textField("titleAccent", "Title accent", "Virtual Staging"),
      areaField("body", "Body", "Transform empty spaces into beautifully furnished rooms instantly. Our AI-powered staging helps buyers visualize their future home."),
      textField("free", "Free line", "Try for free"),
      linkField("cta", "Button", "Try for free", "/services/virtual-staging/select")
    ]),
    block("pricing", "Pricing intro", [
      textField("titleLead", "Title lead", "Flexible"),
      textField("titleAccent", "Title accent", "Pricing"),
      areaField("body", "Body", "Choose between our lightning-fast AI tool or professional human edits for the ultimate quality.")
    ])
  ]),
  page("go", "/go", "Go", [
    block("hero", "Hero", [
      textField("eyebrow", "Eyebrow", "Iconic Images"),
      textField("title", "Headline", "Real estate media that sells"),
      areaField("body", "Body", "Listing photos, film, and brand media from Iconic Images. Book a shoot when you are ready."),
      linkField("cta", "Button", "Book a shoot", "/book"),
      textField("documentTitle", "Browser title", "Iconic Images | Book your shoot")
    ])
  ], "Iconic Images | Book your shoot", "Listing photos, film, and brand media from Iconic Images. Book a shoot when you are ready."),
  page("agents", "/agents", "Agents", [
    block("hero", "Hero", [
      textField("badge", "Badge", "Exclusive Offer for Real Estate Agents"),
      textField("titleLead", "Title lead", "Get"),
      textField("titleAccent", "Title accent", "10X More Eyes"),
      textField("titleTail", "Title tail", "On Your Listings"),
      areaField("body", "Body", "Top-producing agents don't just list homes—they create experiences. Iconic Images provides the cinematic content you need to dominate your market and win every listing presentation.")
    ])
  ]),
  page("privacy", "/privacy", "Privacy", [
    block("hero", "Title", [
      textField("title", "Headline", "Privacy Policy")
    ])
  ]),
  page("terms", "/terms", "Terms", [
    block("hero", "Title", [
      textField("title", "Headline", "Terms and Conditions")
    ])
  ]),
  page("login", "/login", "Login", [
    block("hero", "Sign in", [
      textField("title", "Wordmark", "ICONIC")
    ])
  ]),
  page("aiAssistant", "/pricing/ai-assistant", "AI assistant", [
    block("hero", "Hero", [
      textField("badge", "Badge", "AI Media Strategist"),
      textField("titleLead", "Title lead", "Find your"),
      textField("titleAccent", "Title accent", "perfect match"),
      areaField("body", "Body", "Answer a few questions and our AI will determine which service or package best suits your specific business goals.")
    ])
  ]),
  page("unsubscribe", "/unsubscribe", "Unsubscribe", [
    block("hero", "Title", [
      textField("title", "Headline", "Unsubscribe")
    ])
  ])
];
function defaultPages() {
  return JSON.parse(JSON.stringify(PAGES));
}
function defaultPage(id) {
  return defaultPages().find((item) => item.id === id) ?? null;
}
function knownPageIds() {
  return PAGES.map((item) => item.id);
}
const MAX_TEXT = 2e4;
const MAX_ITEMS = 80;
function cleanField(field, fallback) {
  const kind = field?.kind || fallback?.kind;
  if (!kind || !field?.id) return null;
  const value = String(field.value ?? fallback?.value ?? "").slice(0, MAX_TEXT);
  const next = { id: String(field.id), label: String(field.label || fallback?.label || field.id), kind, value };
  if (kind === "link" || field.href != null || fallback?.href != null) {
    next.href = String(field.href ?? fallback?.href ?? "").slice(0, 2e3);
  }
  return next;
}
function cleanItem(item, allowed) {
  if (!item?.id || !Array.isArray(item.fields)) return null;
  const fields = item.fields.map((field) => cleanField(field)).filter((field) => Boolean(field)).filter((field) => !allowed || allowed.has(field.id));
  if (!fields.length) return null;
  return { id: String(item.id).slice(0, 80), fields };
}
function cleanBlock(block2, fallback) {
  if (!block2?.id) return null;
  const baseFields = fallback?.fields ?? [];
  const fields = baseFields.map((field) => {
    const incoming = block2.fields?.find((item) => item.id === field.id);
    return cleanField(incoming || field, field);
  });
  const allowedItemFields = new Set((fallback?.items ?? []).flatMap((item) => item.fields.map((field) => field.id)));
  const items = fallback?.items ? Array.isArray(block2.items) ? block2.items.map((item) => cleanItem(item, allowedItemFields)).filter((item) => Boolean(item)).slice(0, MAX_ITEMS) : fallback.items : void 0;
  return {
    id: String(block2.id),
    label: String(block2.label || fallback?.label || block2.id),
    hidden: block2.hidden === true,
    fields,
    ...items ? { items } : {}
  };
}
function mergeContent(overlay) {
  if (!overlay?.id) return null;
  const base = defaultPage(overlay.id);
  if (!base) return null;
  const order = Array.isArray(overlay.blocks) ? overlay.blocks.map((block2) => block2.id) : [];
  const blocks = base.blocks.map((block2) => {
    const incoming = overlay.blocks?.find((item) => item.id === block2.id);
    return incoming ? cleanBlock(incoming, block2) : cleanBlock(block2, block2);
  });
  blocks.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return stripPage({
    ...base,
    seoTitle: String(overlay.seoTitle ?? base.seoTitle).slice(0, 300),
    seoDescription: String(overlay.seoDescription ?? base.seoDescription).slice(0, 500),
    blocks
  });
}
const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"];
function isStaffRole(role) {
  return typeof role === "string" && STAFF_ROLES.includes(role);
}
function isActiveStaffRecord(data) {
  if (!data) return false;
  if (data.isActive === false) return false;
  return isStaffRole(data.role);
}
function tempAdminAllowed() {
  return isTempAdminEnabled(liveServerEnv());
}
function roleAtLeast(role, minimum) {
  if (!role) return false;
  if (role === "admin") return true;
  if (role === "coordinator") return minimum !== "admin";
  return role === "photographer";
}
async function resolveRole(uid, decoded) {
  if (tempAdminAllowed() && uid === "temp-admin-uid") {
    return "admin";
  }
  try {
    const staffDoc = await admin.firestore().collection("staff").doc(uid).get();
    if (!staffDoc.exists) return null;
    const data = staffDoc.data();
    if (!isActiveStaffRecord(data)) return null;
    return data.role;
  } catch (err) {
    console.error("[Auth] Firestore staff lookup failed:", err);
    const claimRole = decoded.role;
    if (decoded.isStaff === true && isActiveStaffRecord({ role: claimRole, isActive: true })) {
      return claimRole;
    }
    return null;
  }
}
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (tempAdminAllowed() && authHeader === "Bearer temp-admin-token") {
    req.user = {
      uid: "temp-admin-uid",
      email: "temp-admin@iconicimagestx.com"
    };
    return next();
  }
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No authentication token provided." });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
async function requireStaff(req, res, next) {
  await requireAuth(req, res, async () => {
    const role = await resolveRole(req.user.uid, req.user);
    if (!role) return res.status(403).json({ error: "Staff access required." });
    req.staffRole = role;
    req.isAdmin = role === "admin";
    req.isCoordinator = role === "admin" || role === "coordinator";
    req.isPhotographer = roleAtLeast(role, "photographer");
    next();
  });
}
const memory = { published: {}, drafts: {} };
const filePath = path$1.join(os.tmpdir(), "iconic-site-content.json");
function siteContentUsesMemory() {
  return process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory" || !admin.apps.length;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
async function readFileStore() {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { published: parsed.published || {}, drafts: parsed.drafts || {} };
  } catch {
    return { published: {}, drafts: {} };
  }
}
async function writeFileStore(next) {
  await fs.writeFile(filePath, JSON.stringify(next));
}
async function listPublished() {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      return Object.values(memory.published).map((page2) => stripPage(page2));
    }
    const stored = await readFileStore();
    return Object.values(stored.published).map((page2) => stripPage(page2));
  }
  const snap = await admin.firestore().collection("siteContent").get();
  return snap.docs.map((doc) => stripPage(doc.data()));
}
async function readPublished(id) {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      return memory.published[id] ? clone(memory.published[id]) : null;
    }
    const stored = await readFileStore();
    return stored.published[id] ? clone(stored.published[id]) : null;
  }
  const doc = await admin.firestore().collection("siteContent").doc(id).get();
  return doc.exists ? doc.data() : null;
}
async function writePublished(page2) {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      memory.published[page2.id] = clone(page2);
      return;
    }
    const stored = await readFileStore();
    stored.published[page2.id] = page2;
    await writeFileStore(stored);
    return;
  }
  await admin.firestore().collection("siteContent").doc(page2.id).set(page2);
}
async function readDraft(id) {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      return memory.drafts[id] ? clone(memory.drafts[id]) : null;
    }
    const stored = await readFileStore();
    return stored.drafts[id] ? clone(stored.drafts[id]) : null;
  }
  const doc = await admin.firestore().collection("siteContentDrafts").doc(id).get();
  return doc.exists ? stripPage(doc.data()) : null;
}
async function writeDraft(page2, meta) {
  const stored = { ...stripPage(page2), savedAt: meta.at, savedByUid: meta.byUid, savedByName: meta.byName };
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      memory.drafts[page2.id] = clone(stripPage(page2));
      return;
    }
    const file = await readFileStore();
    file.drafts[page2.id] = stripPage(page2);
    await writeFileStore(file);
    return;
  }
  await admin.firestore().collection("siteContentDrafts").doc(page2.id).set(stored);
}
async function deleteDraft(id) {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      delete memory.drafts[id];
      return;
    }
    const stored = await readFileStore();
    delete stored.drafts[id];
    await writeFileStore(stored);
    return;
  }
  await admin.firestore().collection("siteContentDrafts").doc(id).delete();
}
async function listDraftIds() {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") return Object.keys(memory.drafts);
    const stored = await readFileStore();
    return Object.keys(stored.drafts);
  }
  const snap = await admin.firestore().collection("siteContentDrafts").get();
  return snap.docs.map((doc) => doc.id);
}
function historyOf(page2) {
  return (page2?.revisions ?? []).slice(0, 10).map((revision) => ({
    id: revision.id,
    at: revision.at,
    byUid: revision.byUid,
    byName: revision.byName,
    snapshot: stripPage(revision.snapshot)
  }));
}
const blobs = /* @__PURE__ */ new Map();
function siteMediaBlob(id) {
  return blobs.get(id) ?? null;
}
function bucketName() {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "";
}
async function optimizeImage(bytes) {
  const sharp2 = (await import("sharp")).default;
  const body = await sharp2(bytes, { failOn: "none" }).rotate().resize({ width: 2e3, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return { body, type: "image/webp", ext: "webp" };
}
async function saveObject(pageId, ext, body, type) {
  const safePage = pageId.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "page";
  const objectPath = `site-content/${safePage}/${Date.now()}-${randomUUID()}.${ext}`;
  const bucket = bucketName();
  if (admin.apps.length && bucket && process.env.NODE_ENV !== "test" && process.env.SITE_CONTENT_STORE !== "memory") {
    const token = randomUUID();
    await admin.storage().bucket(bucket).file(objectPath).save(body, {
      resumable: false,
      metadata: { contentType: type, metadata: { firebaseStorageDownloadTokens: token } }
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  }
  const id = randomUUID();
  blobs.set(id, { body, type });
  return `/api/site-content/blob/${id}`;
}
async function storeSiteUpload(pageId, bytes) {
  const kind = sniffMedia(bytes);
  if (!kind) {
    const error = new Error("Upload a JPG, PNG, WebP, MP4, or MOV file.");
    error.status = 415;
    throw error;
  }
  if (kind === "image" && bytes.length > SITE_IMAGE_BYTES) {
    const error = new Error("That image is over 25 MB.");
    error.status = 413;
    throw error;
  }
  if (kind === "video" && bytes.length > SITE_VIDEO_BYTES) {
    const error = new Error("That video is over 80 MB.");
    error.status = 413;
    throw error;
  }
  if (kind === "video") {
    const brand = bytes.length >= 12 ? String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) : "";
    const ext = brand.toLowerCase().includes("qt") ? "mov" : "mp4";
    const url2 = await saveObject(pageId, ext, bytes, ext === "mov" ? "video/quicktime" : "video/mp4");
    return { url: url2, kind };
  }
  const optimized = await optimizeImage(bytes);
  const url = await saveObject(pageId, optimized.ext, optimized.body, optimized.type);
  return { url, kind: "image" };
}
async function assertPublicHost(hostname) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error("That Dropbox link could not be resolved.");
  for (const record of records) {
    if (isPrivateAddress(record.address)) throw new Error("That Dropbox link is not allowed.");
  }
}
async function importDropboxFile(rawUrl) {
  const start = prepareDropboxUrl(rawUrl);
  if (!start) {
    const error = new Error("Paste a Dropbox file link. Folder links need Dropbox connect, which is not set up yet.");
    error.status = 400;
    throw error;
  }
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHost(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15e3);
    let response;
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
    const chunks = [];
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
const router = Router();
function actor(req) {
  const email = req.user?.email || "";
  const name = email === "temp-admin@iconicimagestx.com" ? "Temporary Admin" : email || req.user?.uid || "Staff";
  return { uid: req.user?.uid || "staff", name };
}
async function accessFor(req) {
  const ownerEmails = ownerAllowlist(process.env.OWNER_EMAILS);
  if (process.env.NODE_ENV === "test" && req.testFlags !== void 0) {
    return siteEditorAccess({
      role: req.staffRole,
      email: req.user?.email,
      flags: req.testFlags,
      ownerEmails
    });
  }
  let flags = null;
  let email = req.user?.email || null;
  let role = req.staffRole || null;
  if (req.user?.uid && req.user.uid !== "temp-admin-uid") {
    try {
      const admin2 = await import("firebase-admin");
      if (admin2.default.apps.length) {
        const doc = await admin2.default.firestore().collection("staff").doc(req.user.uid).get();
        const data = doc.data();
        if (data) {
          flags = data.siteEditor ?? null;
          email = data.email || email;
          role = data.role || role;
        }
      }
    } catch (err) {
      console.error("[Site editor] staff lookup failed:", err);
    }
  }
  return siteEditorAccess({ role, email, flags, ownerEmails });
}
function gate(level) {
  return async (req, res, next) => {
    const editorReq = req;
    const run = async () => {
      const access = await accessFor(editorReq);
      editorReq.siteAccess = access;
      if (!allows(access, level)) {
        return res.status(403).json({ error: level === "publish" ? "Only owner/admin can publish." : "Site editor permission required." });
      }
      return next();
    };
    if (process.env.NODE_ENV === "test" && req.header("x-test-staff")) {
      const parsed = JSON.parse(req.header("x-test-staff") || "{}");
      editorReq.user = { uid: parsed.uid || "test", email: parsed.email || "" };
      editorReq.staffRole = parsed.role;
      editorReq.testFlags = parsed.flags ?? null;
      return run();
    }
    return requireStaff(editorReq, res, () => {
      void run();
    });
  };
}
async function workspacePage(id) {
  const base = defaultPage(id);
  if (!base) return null;
  const published = await readPublished(id);
  const draft = await readDraft(id);
  return mergeContent(draft || (published ? stripPage(published) : base));
}
router.get("/", async (_req, res) => {
  const pages = await listPublished();
  return res.json({ pages });
});
router.get("/blob/:id", (req, res) => {
  const blob = siteMediaBlob(req.params.id);
  if (!blob) return res.status(404).json({ error: "File not found." });
  res.setHeader("Content-Type", blob.type);
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(blob.body);
});
router.get("/workspace", gate("view"), async (req, res) => {
  const editorReq = req;
  const ids = knownPageIds();
  const pages = [];
  const published = {};
  const history = {};
  for (const id of ids) {
    const page2 = await workspacePage(id);
    if (page2) pages.push(page2);
    const stored = await readPublished(id);
    published[id] = stored ? stripPage(stored) : null;
    history[id] = historyOf(stored);
  }
  const draftIds = await listDraftIds();
  return res.json({
    access: editorReq.siteAccess,
    pages,
    published,
    history,
    draftIds
  });
});
router.put("/:id", gate("edit"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  const merged = mergeContent({ ...req.body, id });
  if (!merged) return res.status(400).json({ error: "Page could not be saved." });
  const who = actor(req);
  await writeDraft(merged, { at: (/* @__PURE__ */ new Date()).toISOString(), byUid: who.uid, byName: who.name });
  return res.json({ page: merged });
});
router.post("/:id/discard", gate("edit"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  await deleteDraft(id);
  const page2 = await workspacePage(id);
  return res.json({ page: page2 });
});
router.post("/:id/release", gate("publish"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  const draft = await readDraft(id);
  const current = await readPublished(id);
  const raw = draft || (req.body?.page ? { ...req.body.page, id } : null) || (current ? stripPage(current) : defaultPage(id));
  const source = mergeContent(raw);
  if (!source) return res.status(400).json({ error: "Nothing to publish." });
  const who = actor(req);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const revisions = pushRevision(current, source, who, now);
  await writePublished({
    ...source,
    revisions,
    publishedAt: now,
    publishedByUid: who.uid,
    publishedByName: who.name
  });
  await deleteDraft(id);
  return res.json({ page: stripPage(source), publishedAt: now, publishedByName: who.name });
});
router.post("/release-all", gate("publish"), async (req, res) => {
  const who = actor(req);
  const publishedIds = [];
  for (const id of await listDraftIds()) {
    const draft = await readDraft(id);
    const source = draft ? mergeContent(draft) : null;
    if (!source || !defaultPage(id)) continue;
    const current = await readPublished(id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await writePublished({
      ...source,
      revisions: pushRevision(current, source, who, now),
      publishedAt: now,
      publishedByUid: who.uid,
      publishedByName: who.name
    });
    await deleteDraft(id);
    publishedIds.push(id);
  }
  return res.json({ publishedIds });
});
router.post("/:id/revert", gate("publish"), async (req, res) => {
  const id = req.params.id;
  if (!defaultPage(id)) return res.status(404).json({ error: "Unknown page." });
  const current = await readPublished(id);
  if (!current) return res.status(404).json({ error: "That page has no published history." });
  const who = actor(req);
  const restored = revertTo(current, String(req.body?.revisionId || ""), who);
  const source = restored ? mergeContent(restored) : null;
  if (!restored || !source) return res.status(404).json({ error: "That version was not found." });
  await writePublished({
    ...source,
    revisions: restored.revisions,
    publishedAt: restored.publishedAt,
    publishedByUid: restored.publishedByUid,
    publishedByName: restored.publishedByName
  });
  return res.json({ page: stripPage(source) });
});
function mediaFolder(pageIdRaw) {
  const pageId = String(pageIdRaw || "page");
  if (pageId === "insights") return "insights";
  if (pageId === "page") return "page";
  if (defaultPage(pageId)) return pageId;
  return null;
}
router.post("/media", gate("edit"), async (req, res) => {
  try {
    const folder = mediaFolder(req.body?.pageId);
    if (!folder) return res.status(404).json({ error: "Unknown page." });
    const raw = String(req.body?.dataBase64 || "");
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length) return res.status(400).json({ error: "No file was received." });
    const stored = await storeSiteUpload(folder, bytes);
    return res.json(stored);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err instanceof Error ? err.message : "Upload failed." });
  }
});
router.post("/dropbox", gate("edit"), async (req, res) => {
  try {
    const folder = mediaFolder(req.body?.pageId);
    if (!folder) return res.status(404).json({ error: "Unknown page." });
    const imported = await importDropboxFile(String(req.body?.url || ""));
    const stored = await storeSiteUpload(folder, imported.bytes);
    return res.json(stored);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err instanceof Error ? err.message : "Dropbox import failed." });
  }
});
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
let siteApp = null;
function siteContentApp() {
  if (!siteApp) {
    siteApp = express();
    siteApp.use("/api/site-content/media", express.json({ limit: "120mb" }));
    siteApp.use("/api/site-content/dropbox", express.json({ limit: "1mb" }));
    siteApp.use("/api/site-content", router);
  }
  return siteApp;
}
function mediaDisplayHandler(req, res) {
  const url = req.url || "";
  if (url.startsWith("/api/site-content/media") || url.startsWith("/api/site-content/dropbox")) {
    return siteContentApp()(req, res);
  }
  return handleMediaDisplay(req, adapt(res));
}
export {
  mediaDisplayHandler as default
};

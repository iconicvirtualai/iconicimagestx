/**
 * Staff gallery upload helpers.
 * Tabs, video labels, aspect sorting, listing-kit slots, and the upload
 * metadata the photo endpoint is allowed to store.
 * Neighborhood numbers are not invented here. Slots stay empty until a
 * paid-order address source is connected.
 */

import { createSection, readMediaArrangement, type MediaArrangement } from "./mediaArrangement.ts";

export const GALLERY_TABS = [
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos / Reels" },
  { id: "social", label: "Social Media" },
  { id: "tours", label: "3D Tours" },
  { id: "floorplans", label: "Floorplans" },
  { id: "kit", label: "Listing Kit" },
] as const;

export type GalleryTabId = (typeof GALLERY_TABS)[number]["id"];

export const VIDEO_BRANDS = ["branded", "unbranded", "both", "none"] as const;
export type VideoBrand = (typeof VIDEO_BRANDS)[number];

export const VIDEO_SECTION_NAME = {
  listing: "Listing Video",
  reels: "Reels",
  other: "Other sizes",
} as const;

export type VideoAspectBucket = keyof typeof VIDEO_SECTION_NAME;

const BRAND_SET = new Set<string>(VIDEO_BRANDS);

export function videoBrand(value: unknown): VideoBrand | "" {
  const brand = typeof value === "string" ? value.trim().toLowerCase() : "";
  return BRAND_SET.has(brand) ? brand as VideoBrand : "";
}

export function videoUploadReady(name: unknown, brand: unknown): boolean {
  return typeof name === "string" && name.trim().length > 0 && videoBrand(brand) !== "";
}

export function videoAspectBucket(width: number, height: number): { bucket: VideoAspectBucket; label: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { bucket: "other", label: "Size unknown" };
  }
  const ratio = width / height;
  const near = (target: number) => Math.abs(ratio - target) / target <= 0.08;
  if (near(9 / 16)) return { bucket: "reels", label: "9:16" };
  if (near(16 / 9)) return { bucket: "listing", label: "16:9" };
  return { bucket: "other", label: `${Math.round(width)}×${Math.round(height)}` };
}

export function ensureNamedSection(arrangement: MediaArrangement, name: string): { arrangement: MediaArrangement; sectionId: string } {
  const current = readMediaArrangement(arrangement);
  const found = current.sections.find((section) => section.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return { arrangement: current, sectionId: found.id };
  const created = createSection(current, name);
  if (created.ok === false) return { arrangement: current, sectionId: "" };
  const section = created.arrangement.sections.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
  return { arrangement: created.arrangement, sectionId: section?.id || "" };
}

export interface GalleryUploadMeta {
  displayName?: string;
  brandLabel?: string;
  assetType?: string;
  type?: string;
  width?: number;
  height?: number;
  aspectLabel?: string;
  platform?: string;
  caption?: string;
}

/** Fields the listing photo writer may copy onto the stored file. */
export function galleryUploadExtra(extra: unknown): Record<string, unknown> {
  if (!extra || typeof extra !== "object") return {};
  const src = extra as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const displayName = clip(src.displayName, 180);
  if (displayName) out.displayName = displayName;
  const brand = videoBrand(src.brandLabel);
  if (brand) out.brandLabel = brand;
  const asset = oneOf(src.assetType, ["photo", "video", "social", "floorplan", "file"]);
  if (asset) out.assetType = asset;
  const type = oneOf(src.type, ["photo", "video", "social", "floorplan", "file", "tour", "document"]);
  if (type) out.type = type;
  const width = finite(src.width);
  const height = finite(src.height);
  if (width != null && width > 0 && width < 20000) out.width = Math.round(width);
  if (height != null && height > 0 && height < 20000) out.height = Math.round(height);
  const aspect = clip(src.aspectLabel, 24);
  if (aspect) out.aspectLabel = aspect;
  const platform = clip(src.platform, 40);
  if (platform) out.platform = platform;
  const caption = clip(src.caption, 500);
  if (caption) out.caption = caption;
  return out;
}

export const LISTING_KIT_SLOTS = [
  { id: "marketing", title: "Marketing materials", group: "neighborhood" },
  { id: "social-templates", title: "Social media templates", group: "neighborhood" },
  { id: "neighborhood", title: "Neighborhood info", group: "neighborhood" },
  { id: "popular", title: "Most popular", group: "neighborhood" },
  { id: "facts", title: "Fun facts and stats", group: "neighborhood" },
  { id: "things", title: "What is there to do", group: "neighborhood" },
  { id: "jobs", title: "Jobs nearby", group: "neighborhood" },
  { id: "lifestyle", title: "Free time and lifestyle", group: "neighborhood" },
  { id: "crime", title: "Crime rate", group: "safety" },
] as const;

export type ListingKitSlotId = (typeof LISTING_KIT_SLOTS)[number]["id"];

export interface ListingKitSlot {
  id: ListingKitSlotId;
  title: string;
  group: "neighborhood" | "safety";
  body: string;
  showOnGallery: boolean;
}

export interface ListingKitState {
  slots: ListingKitSlot[];
  fields: Record<string, boolean>;
  generatedAt: string;
  source: "" | "paid-order";
}

const SLOT_IDS = new Set<string>(LISTING_KIT_SLOTS.map((slot) => slot.id));

export function emptyListingKit(): ListingKitState {
  return {
    slots: LISTING_KIT_SLOTS.map((slot) => ({
      id: slot.id,
      title: slot.title,
      group: slot.group,
      body: "",
      showOnGallery: true,
    })),
    fields: {},
    generatedAt: "",
    source: "",
  };
}

export function readListingKit(value: unknown): ListingKitState {
  const base = emptyListingKit();
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const stored = new Map<string, { body: string; showOnGallery: boolean }>();
  if (Array.isArray(row.slots)) {
    for (const item of row.slots) {
      if (!item || typeof item !== "object") continue;
      const slot = item as Record<string, unknown>;
      const id = typeof slot.id === "string" ? slot.id : "";
      if (!SLOT_IDS.has(id)) continue;
      stored.set(id, {
        body: clip(slot.body, 2000),
        showOnGallery: slot.showOnGallery !== false,
      });
    }
  }
  const fields: Record<string, boolean> = {};
  const rawFields = row.fields && typeof row.fields === "object" ? row.fields as Record<string, unknown> : {};
  for (const [key, shown] of Object.entries(rawFields)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key)) continue;
    if (typeof shown === "boolean") fields[key] = shown;
  }
  return {
    slots: base.slots.map((slot) => {
      const saved = stored.get(slot.id);
      return saved ? { ...slot, body: saved.body, showOnGallery: saved.showOnGallery } : slot;
    }),
    fields,
    generatedAt: clip(row.generatedAt, 40),
    source: row.source === "paid-order" ? "paid-order" : "",
  };
}

export function listingKitFieldShown(kit: unknown, fieldId: string): boolean {
  const state = readListingKit(kit);
  if (!Object.prototype.hasOwnProperty.call(state.fields, fieldId)) return true;
  return state.fields[fieldId] !== false;
}

/**
 * TODO: when the order is paid, fill ListingKitState.slots from the property
 * address using the existing places lookup. Do not call a paid enrichment API
 * and do not invent neighborhood, crime, or school numbers.
 */
export function listingKitRefreshTodo(address: string): { ok: false; reason: string; address: string } {
  return {
    ok: false,
    reason: "No listing-kit source is connected. Neighborhood, crime, and lifestyle slots stay empty.",
    address: address.trim(),
  };
}

function clip(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, limit);
}

function oneOf(value: unknown, allowed: string[]): string {
  const text = clip(value, 40).toLowerCase();
  return allowed.includes(text) ? text : "";
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

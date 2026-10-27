/**
 * Public listing sites at /l/:slug.
 * Photos are display-route indexes. Original, zip, and PDF urls stay off the payload.
 */

import {
  PORTAL_WEBSITE_DESIGNS,
  readMediaStore,
  sanitizeWebsiteSettings,
  type PortalWebsiteDesign,
  type PortalWebsiteSettings,
} from "./portalListingDetail.ts";
import { rasterShareSource, shareDisplayItems, shareDisplayPath, type ShareListing } from "./publicShare.ts";

export const LISTING_SITE_DESIGNS = PORTAL_WEBSITE_DESIGNS;
export type ListingSiteDesign = PortalWebsiteDesign;

/** Design-pack names. Saved index, two-up, and premiere values stay on those ids. */
export const LISTING_SITE_TEMPLATES: Array<{
  id: ListingSiteDesign;
  name: string;
  vibe: string;
  font: PortalWebsiteSettings["font"];
  color: PortalWebsiteSettings["color"];
  style: PortalWebsiteSettings["style"];
  marker: string;
}> = [
  { id: "issue", name: "The Issue", vibe: "Luxury editorial magazine", font: "serif", color: "warm", style: "editorial", marker: "The spread" },
  { id: "premiere", name: "Premiere", vibe: "Cinematic film release", font: "serif", color: "ink", style: "editorial", marker: "Feature presentation" },
  { id: "product-drop", name: "Product Drop", vibe: "Sleek launch page", font: "modern", color: "teal", style: "minimal", marker: "Tech specs" },
  { id: "gallery-wall", name: "Gallery Wall", vibe: "Quiet museum walls", font: "serif", color: "ink", style: "editorial", marker: "The exhibition" },
  { id: "field-guide", name: "Field Guide", vibe: "Warm woodlands guide", font: "serif", color: "warm", style: "minimal", marker: "Specimen" },
  { id: "two-up", name: "Two-Up", vibe: "Split-screen story", font: "modern", color: "teal", style: "minimal", marker: "Opening" },
  { id: "golden-hour", name: "Golden Hour", vibe: "Sunrise to twilight", font: "serif", color: "warm", style: "editorial", marker: "6:42" },
  { id: "index", name: "Index", vibe: "Swiss numbered type", font: "sans", color: "ink", style: "classic", marker: "Rooms" },
  { id: "dossier", name: "The Dossier", vibe: "Exclusive coming soon", font: "serif", color: "warm", style: "editorial", marker: "Request the full dossier" },
  { id: "stories", name: "Stories Deck", vibe: "Swipeable social cards", font: "modern", color: "teal", style: "minimal", marker: "Stories deck" },
];

const DESIGN_SET = new Set<string>(LISTING_SITE_DESIGNS);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ListingSitePhoto {
  name: string;
  url: string;
}

export interface PublicListingSite {
  slug: string;
  design: ListingSiteDesign;
  font: PortalWebsiteSettings["font"];
  color: PortalWebsiteSettings["color"];
  style: PortalWebsiteSettings["style"];
  address: string;
  street: string;
  city: string;
  price: string;
  facts: Array<{ label: string; value: string }>;
  photos: ListingSitePhoto[];
  filmPosterUrl: string;
  tourEmbedUrl: string;
  floorplan: ListingSitePhoto | null;
  agent: {
    name: string;
    brokerage: string;
    license: string;
    phone: string;
    email: string;
  };
}

export function isListingSiteDesign(value: unknown): value is ListingSiteDesign {
  return typeof value === "string" && DESIGN_SET.has(value);
}

export function listingSiteDesign(value: unknown, fallback: ListingSiteDesign = "index"): ListingSiteDesign {
  return isListingSiteDesign(value) ? value : fallback;
}

/** Street plus city, for example 123-main-st-spring. A street is required. */
export function listingSiteSlug(input: { line1?: string; city?: string }): string {
  const street = (input.line1 || "").trim();
  if (!street) return "";
  const raw = `${street} ${input.city || ""}`.normalize("NFKD").toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
  return SLUG.test(slug) ? slug : "";
}

export function isListingSiteSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && SLUG.test(value);
}

export function listingSitePath(slug: string): string {
  return `/l/${slug}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function addressParts(listing: Record<string, unknown>): { line1: string; city: string; formatted: string } {
  const portal = record(listing.portalData);
  const saved = record(portal?.address);
  const structured = record(listing.address) || record(listing.shootLocation) || record(listing.propertyAddress);
  const line1 = text(saved?.line1) || text(structured?.street) || text(structured?.line1) || text(listing.addressLine1);
  const city = text(saved?.city) || text(structured?.city) || text(listing.city);
  const state = text(saved?.state) || text(structured?.state) || text(listing.state);
  const zip = text(saved?.zip) || text(structured?.zip) || text(listing.zip);
  if (!line1 && typeof listing.address === "string") {
    const raw = text(listing.address);
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    return { line1: parts[0] || raw, city: parts.length >= 3 ? parts[parts.length - 2] : "", formatted: raw };
  }
  const locality = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { line1, city, formatted: [line1, locality].filter(Boolean).join(", ") };
}

function money(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  }
  const raw = text(value);
  if (!raw || raw === "0") return "";
  if (raw.startsWith("$")) return raw;
  const numeric = Number(raw.replace(/[$,]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric);
  }
  return "";
}

function count(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function factValue(listing: Record<string, unknown>, keys: string[]): string {
  const portal = record(listing.portalData);
  const facts = record(portal?.facts);
  for (const key of keys) {
    const stored = count(facts?.[key]);
    if (stored) return stored;
    const direct = count(listing[key]);
    if (direct) return direct;
  }
  return "";
}

function agentOf(listing: Record<string, unknown>): PublicListingSite["agent"] {
  const agent = record(listing.agent);
  const name = text(listing.agentName) || text(listing.listingAgent) || text(agent?.name);
  return {
    name,
    brokerage: text(listing.brokerage) || text(listing.brokerageName) || text(agent?.brokerage),
    license: text(listing.licenseNumber) || text(listing.agentLicense) || text(agent?.license),
    phone: text(listing.agentPhone) || text(agent?.phone),
    email: text(listing.agentEmail) || text(agent?.email),
  };
}

function matterportEmbed(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "my.matterport.com") return "";
    if (url.pathname !== "/show" && url.pathname !== "/show/") return "";
    const model = url.searchParams.get("m") || "";
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(model)) return "";
    return `https://my.matterport.com/show/?m=${encodeURIComponent(model)}`;
  } catch {
    return "";
  }
}

function tourUrl(listing: Record<string, unknown>): string {
  const direct = [
    text(listing.matterportUrl),
    text(listing.virtualTourUrl),
    text(listing.tourUrl),
  ];
  const tours = Array.isArray(listing.tours) ? listing.tours : [];
  for (const tour of tours) {
    const row = record(tour);
    if (!row) continue;
    direct.push(text(row.embedUrl), text(row.url));
  }
  const hidden = readMediaStore(listing.portalMedia).tours;
  for (const candidate of direct) {
    const embed = matterportEmbed(candidate);
    if (!embed) continue;
    const model = new URL(embed).searchParams.get("m") || "";
    const blocked = Object.entries(hidden).some(([id, prefs]) => prefs.hidden && (id === model || id === candidate));
    if (!blocked) return embed;
  }
  return "";
}

function hiddenSources(listing: ShareListing): Set<string> {
  const store = readMediaStore(listing.portalMedia);
  const hidden = new Set<string>();
  const groups: Array<[unknown, Record<string, { hidden: boolean }>]> = [
    [listing.images, store.photos],
    [listing.floorplans, store.floorplans],
    [listing.floorPlans, store.floorplans],
    [listing.videos, store.videos],
  ];
  for (const [items, prefs] of groups) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const row = record(item);
      if (!row) continue;
      const id = text(row.id);
      if (!id || !prefs[id]?.hidden) continue;
      const source = rasterShareSource(row);
      if (source) hidden.add(source);
    }
  }
  return hidden;
}

/**
 * Published listing page. Unpublished and address-less listings return null.
 * Every photo url is /api/media/display/:id/:index.
 */
export function buildPublicListingSite(listing: Record<string, unknown> | null | undefined): PublicListingSite | null {
  if (!listing) return null;
  const website = sanitizeWebsiteSettings(listing.portalWebsite);
  if (!website.published) return null;
  const id = text(listing.id);
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) return null;
  const address = addressParts(listing);
  const slug = listingSiteSlug({ line1: address.line1, city: address.city });
  if (!slug) return null;

  const share = listing as ShareListing;
  const hidden = hiddenSources(share);
  const items = shareDisplayItems(share);
  const photos: ListingSitePhoto[] = [];
  let filmPosterUrl = "";
  let floorplan: ListingSitePhoto | null = null;
  items.forEach((item, index) => {
    if (hidden.has(item.sourceUrl)) return;
    const url = shareDisplayPath(id, index);
    if (item.kind === "image" && website.showPhotos) photos.push({ name: item.name, url });
    if (item.kind === "floorPlan" && website.showFloorplans && !floorplan) floorplan = { name: item.name, url };
    if (item.kind === "poster" && website.showVideo && !filmPosterUrl && !item.sourceUrl.startsWith("video-placeholder:")) {
      filmPosterUrl = url;
    }
  });

  const facts = [
    { label: "Beds", value: factValue(listing, ["beds", "bedrooms"]) },
    { label: "Baths", value: factValue(listing, ["baths", "bathrooms"]) },
    { label: "Sq ft", value: factValue(listing, ["sqft", "squareFeet"]) },
    { label: "Lot", value: factValue(listing, ["lotSize"]) },
    { label: "Built", value: factValue(listing, ["yearBuilt"]) },
  ].filter((fact) => fact.value);

  return {
    slug,
    design: website.design,
    font: website.font,
    color: website.color,
    style: website.style,
    address: address.formatted || address.line1,
    street: address.line1,
    city: address.city,
    price: money(listing.listPrice ?? listing.price),
    facts,
    photos,
    filmPosterUrl,
    tourEmbedUrl: website.showTours ? tourUrl(listing) : "",
    floorplan,
    agent: agentOf(listing),
  };
}

const BLOCKED_PUBLIC = /\/(original|originals|full|mls|raw|downloads?|print|zips?)\//i;

export function listingSitePayloadLeak(site: PublicListingSite): string | null {
  const urls = [
    ...site.photos.map((photo) => photo.url),
    site.filmPosterUrl,
    site.floorplan?.url || "",
  ].filter(Boolean);
  for (const url of urls) {
    if (!url.startsWith("/api/media/display/")) return url;
    if (BLOCKED_PUBLIC.test(url) || /\.(zip|pdf)(\?|#|$)/i.test(url)) return url;
  }
  if (site.tourEmbedUrl && !site.tourEmbedUrl.startsWith("https://my.matterport.com/show/?m=")) return site.tourEmbedUrl;
  return null;
}

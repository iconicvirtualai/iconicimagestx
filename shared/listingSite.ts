/**
 * Listing-site templates for the client portal Website tab.
 * Phase 1 ships three skins. The other seven (The Issue, Premiere, Product Drop,
 * Gallery Wall, Field Guide, Index, The Dossier) stay off this registry until
 * they get a renderer. Add one by extending LISTING_SITE_TEMPLATES and the
 * client renderer map — the section order and media rules stay here.
 *
 * Saved font / color / style values still round-trip. Rendering uses templateId.
 * When an older site has no template, those fields pick the nearest skin.
 */

export const LISTING_SITE_SECTIONS = [
  "hero",
  "collage",
  "video",
  "matterport",
  "floorplan",
  "lead",
  "agent",
] as const;

export type ListingSiteSectionId = (typeof LISTING_SITE_SECTIONS)[number];

/** Middle sections an agent may reorder. Hero stays first. Lead and agent stay last. */
export const LISTING_SITE_MIDDLE_SECTIONS = ["collage", "video", "matterport", "floorplan"] as const;

export const PHOTO_VERSIONS = ["original", "polished"] as const;
export type PhotoVersion = (typeof PHOTO_VERSIONS)[number];

export const LISTING_SITE_TEMPLATE_IDS = ["two-up", "golden-hour", "stories-deck"] as const;
export type ListingSiteTemplateId = (typeof LISTING_SITE_TEMPLATE_IDS)[number];

export interface ListingSiteTemplate {
  id: ListingSiteTemplateId;
  number: string;
  name: string;
  vibe: string;
  summary: string;
  thumbnail: string;
  /** Client component key. The renderer map must include every built template. */
  renderer: "TwoUp" | "GoldenHour" | "StoriesDeck";
  /** Two-Up can reorder the middle media sections. The others follow the day or the deck. */
  allowsSectionReorder: boolean;
}

export const DEFAULT_LISTING_SITE_TEMPLATE: ListingSiteTemplateId = "two-up";

export const LISTING_SITE_TEMPLATES: ListingSiteTemplate[] = [
  {
    id: "two-up",
    number: "06",
    name: "Two-Up",
    vibe: "modern · versatile",
    summary: "Sticky 50/50 split. The media stage follows the story as you scroll.",
    thumbnail: "/listing-templates/two-up.svg",
    renderer: "TwoUp",
    allowsSectionReorder: true,
  },
  {
    id: "golden-hour",
    number: "07",
    name: "Golden Hour",
    vibe: "luxury · modern",
    summary: "The page moves from sunrise to twilight and ends on the dusk shots.",
    thumbnail: "/listing-templates/golden-hour.svg",
    renderer: "GoldenHour",
    allowsSectionReorder: false,
  },
  {
    id: "stories-deck",
    number: "10",
    name: "Stories Deck",
    vibe: "basic · modern",
    summary: "Swipeable Stories cards for social traffic, with an agent card that flips.",
    thumbnail: "/listing-templates/stories-deck.svg",
    renderer: "StoriesDeck",
    allowsSectionReorder: false,
  },
];

export const TREC_IABS_URL = "https://www.trec.texas.gov/forms/information-about-brokerage-services";
export const TREC_CPN_URL = "https://www.trec.texas.gov/forms/consumer-protection-notice";
export const ICONIC_MEDIA_CREDIT = "Photography & film: Iconic Images";

export const LATER_LISTING_SITE_TEMPLATE_NAMES = [
  "The Issue",
  "Premiere",
  "Product Drop",
  "Gallery Wall",
  "Field Guide",
  "Index",
  "The Dossier",
] as const;

const WEBSITE_FONTS = new Set(["sans", "serif", "modern"]);
const WEBSITE_COLORS = new Set(["ink", "teal", "warm"]);
const WEBSITE_STYLES = new Set(["classic", "editorial", "minimal"]);
const SECTION_SET = new Set<string>(LISTING_SITE_SECTIONS);
const MIDDLE_SET = new Set<string>(LISTING_SITE_MIDDLE_SECTIONS);
const TEMPLATE_SET = new Set<string>(LISTING_SITE_TEMPLATE_IDS);

const LIMIT = {
  headline: 160,
  tagline: 500,
  price: 48,
  agent: 160,
  id: 180,
  ids: 60,
  versions: 200,
} as const;

export interface PortalAgentBranding {
  name: string;
  brokerage: string;
  license: string;
  phone: string;
  email: string;
  office: string;
  headshotUrl: string;
}

export interface PortalWebsiteSettings {
  font: "sans" | "serif" | "modern";
  color: "ink" | "teal" | "warm";
  style: "classic" | "editorial" | "minimal";
  showPhotos: boolean;
  showVideo: boolean;
  showTours: boolean;
  showFloorplans: boolean;
  templateId: ListingSiteTemplateId;
  headline: string;
  tagline: string;
  price: string;
  showHero: boolean;
  showLead: boolean;
  showAgent: boolean;
  sectionOrder: ListingSiteSectionId[];
  photoVersions: Record<string, PhotoVersion>;
  heroPhotoIds: string[];
  collagePhotoIds: string[];
  agent: PortalAgentBranding;
}

export function listingSiteTemplate(id: unknown): ListingSiteTemplate | null {
  const key = text(id);
  return LISTING_SITE_TEMPLATES.find((template) => template.id === key) ?? null;
}

export function emptyAgentBranding(): PortalAgentBranding {
  return {
    name: "",
    brokerage: "",
    license: "",
    phone: "",
    email: "",
    office: "",
    headshotUrl: "",
  };
}

export function defaultListingWebsite(): PortalWebsiteSettings {
  return {
    font: "sans",
    color: "ink",
    style: "classic",
    showPhotos: true,
    showVideo: true,
    showTours: true,
    showFloorplans: true,
    templateId: DEFAULT_LISTING_SITE_TEMPLATE,
    headline: "",
    tagline: "",
    price: "",
    showHero: true,
    showLead: true,
    showAgent: true,
    sectionOrder: [],
    photoVersions: {},
    heroPhotoIds: [],
    collagePhotoIds: [],
    agent: emptyAgentBranding(),
  };
}

/**
 * Nearest Phase 1 skin for a site saved before templates existed.
 * Editorial / serif / warm → Golden Hour. Minimal → Stories Deck. Anything else → Two-Up.
 */
export function templateFromLegacy(settings: { font: string; color: string; style: string }): ListingSiteTemplateId {
  if (settings.style === "editorial" || settings.font === "serif" || settings.color === "warm") return "golden-hour";
  if (settings.style === "minimal") return "stories-deck";
  return "two-up";
}

export function sanitizeListingWebsite(value: unknown, base = defaultListingWebsite()): PortalWebsiteSettings {
  const row = asRecord(value) ?? {};
  const font = text(row.font);
  const color = text(row.color);
  const style = text(row.style);
  const legacy = {
    font: (WEBSITE_FONTS.has(font) ? font : base.font) as PortalWebsiteSettings["font"],
    color: (WEBSITE_COLORS.has(color) ? color : base.color) as PortalWebsiteSettings["color"],
    style: (WEBSITE_STYLES.has(style) ? style : base.style) as PortalWebsiteSettings["style"],
  };
  const requested = text(row.templateId);
  const legacySignal = "font" in row || "color" in row || "style" in row;
  const templateId: ListingSiteTemplateId = TEMPLATE_SET.has(requested)
    ? requested as ListingSiteTemplateId
    : legacySignal
      ? templateFromLegacy(legacy)
      : base.templateId;

  return {
    ...legacy,
    showPhotos: boolOr(row.showPhotos, base.showPhotos),
    showVideo: boolOr(row.showVideo, base.showVideo),
    showTours: boolOr(row.showTours, base.showTours),
    showFloorplans: boolOr(row.showFloorplans, base.showFloorplans),
    templateId,
    headline: clip(row.headline, LIMIT.headline),
    tagline: clip(row.tagline, LIMIT.tagline),
    price: clip(row.price, LIMIT.price),
    showHero: boolOr(row.showHero, base.showHero),
    showLead: boolOr(row.showLead, base.showLead),
    showAgent: boolOr(row.showAgent, base.showAgent),
    sectionOrder: sectionOrder(row.sectionOrder, base.sectionOrder),
    photoVersions: photoVersions(row.photoVersions, base.photoVersions),
    heroPhotoIds: idList(row.heroPhotoIds, base.heroPhotoIds),
    collagePhotoIds: idList(row.collagePhotoIds, base.collagePhotoIds),
    agent: agentBranding(row.agent, base.agent),
  };
}

export function licenseLabel(license: string): string {
  const value = license.trim();
  if (!value) return "TX license number not on file";
  if (/lic/i.test(value)) return value;
  return `TX Lic. #${value}`;
}

export interface ListingSitePhotoSource {
  id: string;
  name: string;
  url: string;
  hidden?: boolean;
  polishedUrl?: string;
}

export interface ListingSiteVideoSource {
  id: string;
  name: string;
  url: string;
  hidden?: boolean;
}

export interface ListingSiteTourSource {
  id: string;
  name: string;
  url: string;
  embedUrl?: string | null;
  provider?: string;
  hidden?: boolean;
}

export interface ListingSiteFloorplanSource {
  id: string;
  name: string;
  url: string;
  hidden?: boolean;
}

export interface ResolvedPhoto {
  id: string;
  name: string;
  originalUrl: string;
  polishedUrl: string;
  version: PhotoVersion;
  url: string;
}

export interface ListingSiteRoom {
  id: string;
  name: string;
  caption: string;
  size: string;
  photos: ResolvedPhoto[];
}

export interface ListingSiteDayPart {
  id: string;
  time: string;
  label: string;
  caption: string;
  photos: ResolvedPhoto[];
}

export interface ListingSiteChapter {
  time: string;
  label: string;
}

export interface ListingSiteFact {
  id: string;
  label: string;
  value: string;
}

export interface ListingSiteModel {
  template: ListingSiteTemplate;
  sample: boolean;
  address: string;
  cityLine: string;
  price: string;
  headline: string;
  tagline: string;
  facts: ListingSiteFact[];
  sections: ListingSiteSectionId[];
  heroPhoto: ResolvedPhoto | null;
  heroVideoUrl: string;
  collage: ResolvedPhoto[];
  rooms: ListingSiteRoom[];
  dayParts: ListingSiteDayPart[];
  chapters: ListingSiteChapter[];
  runtime: string;
  videoUrl: string;
  videoPoster: string;
  tour: { name: string; embedUrl: string; poster: string } | null;
  floorplans: Array<{ id: string; name: string; url: string }>;
  closingPhoto: ResolvedPhoto | null;
  agent: PortalAgentBranding;
}

export interface ListingSiteRoomNote {
  name: string;
  caption: string;
  size: string;
  photoIds: string[];
}

export interface ListingSiteDayNote {
  time: string;
  label: string;
  caption: string;
  photoIds: string[];
}

export interface ListingSiteInput {
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  facts: Array<{ id: string; label?: string; value: string; empty?: boolean }>;
  website: PortalWebsiteSettings;
  photos: ListingSitePhotoSource[];
  videos: ListingSiteVideoSource[];
  tours: ListingSiteTourSource[];
  floorplans: ListingSiteFloorplanSource[];
  replacements?: Record<string, string>;
  rooms?: ListingSiteRoomNote[];
  dayParts?: ListingSiteDayNote[];
  chapters?: ListingSiteChapter[];
  runtime?: string;
  sample?: boolean;
}

export function resolvePhoto(
  photo: ListingSitePhotoSource,
  choice: PhotoVersion | undefined,
  replacementUrl = "",
): ResolvedPhoto {
  const originalUrl = usableMediaUrl(photo.url);
  const polishedUrl = usableMediaUrl(photo.polishedUrl) || usableMediaUrl(replacementUrl);
  const wantsPolished = choice === "polished" || (choice !== "original" && Boolean(polishedUrl));
  const version: PhotoVersion = wantsPolished && polishedUrl ? "polished" : "original";
  return {
    id: photo.id,
    name: displayName(photo.name),
    originalUrl,
    polishedUrl,
    version,
    url: version === "polished" ? polishedUrl : originalUrl,
  };
}

export function visiblePhotos(photos: ListingSitePhotoSource[]): ListingSitePhotoSource[] {
  return photos.filter((photo) => photo.hidden !== true && usableMediaUrl(photo.url));
}

/** Empty id list means "all visible, in file order". A list keeps that order and drops unknown or hidden ids. */
export function orderPhotos(photos: ListingSitePhotoSource[], ids: string[]): ListingSitePhotoSource[] {
  const visible = visiblePhotos(photos);
  if (!ids.length) return visible;
  const byId = new Map(visible.map((photo) => [photo.id, photo]));
  const picked: ListingSitePhotoSource[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const photo = byId.get(id);
    if (!photo || seen.has(id)) continue;
    seen.add(id);
    picked.push(photo);
  }
  return picked;
}

export function middleSectionOrder(website: PortalWebsiteSettings): ListingSiteSectionId[] {
  const template = listingSiteTemplate(website.templateId) ?? LISTING_SITE_TEMPLATES[0];
  if (!template.allowsSectionReorder) return [...LISTING_SITE_MIDDLE_SECTIONS];
  const picked: ListingSiteSectionId[] = [];
  const seen = new Set<string>();
  for (const id of website.sectionOrder) {
    if (!MIDDLE_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    picked.push(id);
  }
  for (const id of LISTING_SITE_MIDDLE_SECTIONS) {
    if (!seen.has(id)) picked.push(id);
  }
  return picked;
}

export function moveMiddleSection(
  order: ListingSiteSectionId[],
  id: ListingSiteSectionId,
  direction: -1 | 1,
): ListingSiteSectionId[] {
  const middle = middleSectionOrder({ ...defaultListingWebsite(), templateId: "two-up", sectionOrder: order });
  const index = middle.indexOf(id);
  const next = index + direction;
  if (!MIDDLE_SET.has(id) || index < 0 || next < 0 || next >= middle.length) return middle;
  const copy = middle.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function resolveListingSections(
  website: PortalWebsiteSettings,
  available: Record<ListingSiteSectionId, boolean>,
): ListingSiteSectionId[] {
  const sequence: ListingSiteSectionId[] = ["hero", ...middleSectionOrder(website), "lead", "agent"];
  return sequence.filter((id) => available[id]);
}

export function buildListingSiteModel(input: ListingSiteInput): ListingSiteModel {
  const website = input.website;
  const replacements = input.replacements ?? {};
  const resolve = (photo: ListingSitePhotoSource) => resolvePhoto(photo, website.photoVersions[photo.id], replacements[photo.id]);
  const heroRequested = website.heroPhotoIds.length > 0;
  const heroSources = orderPhotos(input.photos, heroRequested ? website.heroPhotoIds : []);
  const heroPhoto = heroSources[0] ? resolve(heroSources[0]) : null;
  const collage = orderPhotos(input.photos, website.collagePhotoIds).map(resolve).filter((photo) => photo.url);
  const allResolved = visiblePhotos(input.photos).map(resolve);
  const byId = new Map(allResolved.map((photo) => [photo.id, photo]));

  const video = input.videos.find((item) => item.hidden !== true && usableMediaUrl(item.url));
  const videoUrl = video ? usableMediaUrl(video.url) : "";
  const tourSource = input.tours.find((item) => item.hidden !== true && matterportEmbed(item));
  const tourEmbed = tourSource ? matterportEmbed(tourSource) : "";
  const floorplans = input.floorplans
    .filter((item) => item.hidden !== true && usableMediaUrl(item.url))
    .map((item) => ({ id: item.id, name: displayName(item.name) || "Floorplan", url: usableMediaUrl(item.url) }));

  const heroVideoUrl = website.showHero && (Boolean(heroPhoto?.url) || !heroRequested) ? videoUrl : "";
  const available: Record<ListingSiteSectionId, boolean> = {
    hero: website.showHero && Boolean(heroPhoto?.url || (!heroRequested && heroVideoUrl)),
    collage: website.showPhotos && collage.length > 0,
    video: website.showVideo && Boolean(videoUrl),
    matterport: website.showTours && Boolean(tourEmbed),
    floorplan: website.showFloorplans && floorplans.length > 0,
    lead: website.showLead,
    agent: website.showAgent,
  };

  const poster = byId.get("film-still") || heroPhoto || collage[0] || null;
  const closingPhoto = allResolved.find((photo) => /twilight|dusk/i.test(photo.name))
    || collage[collage.length - 1]
    || heroPhoto;

  const rooms = buildRooms(input.rooms, byId, collage);
  const dayParts = buildDayParts(input.dayParts, byId, collage);
  const facts = listingFacts(input.facts);
  const cityLine = [input.city, [input.state, input.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address = input.addressLine.trim() || "Listing";

  return {
    template: listingSiteTemplate(website.templateId) ?? LISTING_SITE_TEMPLATES[0],
    sample: input.sample === true,
    address,
    cityLine,
    price: website.price.trim(),
    headline: website.headline.trim() || address,
    tagline: website.tagline.trim(),
    facts,
    sections: resolveListingSections(website, available),
    heroPhoto: heroPhoto?.url ? heroPhoto : null,
    heroVideoUrl,
    collage,
    rooms,
    dayParts,
    chapters: input.chapters ?? [],
    runtime: (input.runtime ?? "").trim(),
    videoUrl,
    videoPoster: poster?.url || "",
    tour: tourEmbed
      ? { name: tourSource?.name || "Matterport", embedUrl: tourEmbed, poster: poster?.url || heroPhoto?.url || "" }
      : null,
    floorplans,
    closingPhoto: closingPhoto?.url ? closingPhoto : null,
    agent: website.agent,
  };
}

export function listingSiteInputFromDetail(
  detail: {
    address: { line1: string; city: string; state: string; zip: string };
    facts: Array<{ id: string; label: string; value: string; empty: boolean }>;
    photos: Array<{ id: string; name: string; url: string; hidden: boolean; polishedUrl?: string }>;
    videos: Array<{ id: string; name: string; url: string; hidden: boolean }>;
    tours: Array<{ id: string; name: string; url: string; embedUrl: string | null; provider: string; hidden: boolean }>;
    floorplans: Array<{ id: string; name: string; url: string; hidden: boolean }>;
    photoEditRequests?: Array<{ photoId: string; replacement: { url: string } | null }>;
  },
  website: PortalWebsiteSettings,
  extras: Partial<ListingSiteInput> = {},
): ListingSiteInput {
  const replacements: Record<string, string> = {};
  for (const request of detail.photoEditRequests ?? []) {
    const url = request.replacement?.url;
    if (url && !replacements[request.photoId]) replacements[request.photoId] = url;
  }
  return {
    addressLine: detail.address.line1,
    city: detail.address.city,
    state: detail.address.state,
    zip: detail.address.zip,
    facts: detail.facts,
    website,
    photos: detail.photos,
    videos: detail.videos,
    tours: detail.tours,
    floorplans: detail.floorplans,
    replacements,
    ...extras,
  };
}

export function listingSitePublicPath(listingId: string): string {
  return `/portal/listings/${encodeURIComponent(listingId)}/site`;
}

export function listingSiteDemoPath(templateId: ListingSiteTemplateId = DEFAULT_LISTING_SITE_TEMPLATE): string {
  return `/site/demo?template=${encodeURIComponent(templateId)}`;
}

const FACT_LABELS: Record<string, string> = {
  beds: "Bedrooms",
  baths: "Baths",
  sqft: "Sq ft",
  lotSize: "Lot",
};

function listingFacts(facts: ListingSiteInput["facts"]): ListingSiteFact[] {
  const out: ListingSiteFact[] = [];
  for (const id of ["beds", "baths", "sqft", "lotSize"]) {
    const fact = facts.find((item) => item.id === id);
    if (!fact || fact.empty || !fact.value.trim() || fact.value === "Not on file yet") continue;
    const value = id === "sqft" ? formatSqft(fact.value) : fact.value.trim();
    out.push({ id, label: FACT_LABELS[id], value });
  }
  return out;
}

function formatSqft(value: string): string {
  const numeric = Number(value.replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return value.trim();
  return Math.round(numeric).toLocaleString("en-US");
}

function buildRooms(
  notes: ListingSiteRoomNote[] | undefined,
  byId: Map<string, ResolvedPhoto>,
  collage: ResolvedPhoto[],
): ListingSiteRoom[] {
  if (notes?.length) {
    return notes.map((note, index) => ({
      id: `room-${index}`,
      name: note.name,
      caption: note.caption,
      size: note.size,
      photos: note.photoIds.map((id) => byId.get(id)).filter((photo): photo is ResolvedPhoto => Boolean(photo?.url)),
    })).filter((room) => room.photos.length > 0);
  }
  return collage.map((photo, index) => ({
    id: photo.id || `room-${index}`,
    name: photo.name,
    caption: "",
    size: "",
    photos: [photo],
  }));
}

function buildDayParts(
  notes: ListingSiteDayNote[] | undefined,
  byId: Map<string, ResolvedPhoto>,
  collage: ResolvedPhoto[],
): ListingSiteDayPart[] {
  if (notes?.length) {
    return notes.map((note, index) => ({
      id: `day-${index}`,
      time: note.time,
      label: note.label,
      caption: note.caption,
      photos: note.photoIds.map((id) => byId.get(id)).filter((photo): photo is ResolvedPhoto => Boolean(photo?.url)),
    })).filter((part) => part.photos.length > 0);
  }
  if (!collage.length) return [];
  return [{ id: "day-0", time: "", label: "The delivery", caption: "", photos: collage }];
}

function matterportEmbed(tour: ListingSiteTourSource): string {
  const embed = usableMediaUrl(tour.embedUrl);
  const url = usableMediaUrl(tour.url);
  const candidate = embed || url;
  if (!candidate) return "";
  if (/matterport\.com/i.test(candidate) || /matterport/i.test(tour.provider || "")) return candidate;
  return "";
}

function sectionOrder(value: unknown, fallback: ListingSiteSectionId[]): ListingSiteSectionId[] {
  if (!Array.isArray(value)) return fallback.slice();
  const out: ListingSiteSectionId[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = text(item);
    if (!SECTION_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as ListingSiteSectionId);
    if (out.length >= LISTING_SITE_SECTIONS.length) break;
  }
  return out;
}

function photoVersions(value: unknown, fallback: Record<string, PhotoVersion>): Record<string, PhotoVersion> {
  const row = asRecord(value);
  if (!row) return { ...fallback };
  const out: Record<string, PhotoVersion> = {};
  for (const [id, choice] of Object.entries(row)) {
    if (Object.keys(out).length >= LIMIT.versions) break;
    const key = id.trim().slice(0, LIMIT.id);
    if (!key || key.includes("..")) continue;
    if (choice !== "original" && choice !== "polished") continue;
    out[key] = choice;
  }
  return out;
}

function idList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback.slice();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (out.length >= LIMIT.ids) break;
    const id = text(item).slice(0, LIMIT.id);
    if (!id || seen.has(id) || id.includes("..")) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function agentBranding(value: unknown, base: PortalAgentBranding): PortalAgentBranding {
  const row = asRecord(value);
  if (!row) return { ...base };
  return {
    name: clip(row.name, LIMIT.agent) || (row.name == null ? base.name : ""),
    brokerage: clip(row.brokerage, LIMIT.agent) || (row.brokerage == null ? base.brokerage : ""),
    license: clip(row.license, LIMIT.agent) || (row.license == null ? base.license : ""),
    phone: clip(row.phone, LIMIT.agent) || (row.phone == null ? base.phone : ""),
    email: clip(row.email, LIMIT.agent) || (row.email == null ? base.email : ""),
    office: clip(row.office, LIMIT.agent) || (row.office == null ? base.office : ""),
    headshotUrl: usableMediaUrl(row.headshotUrl) || (row.headshotUrl == null ? base.headshotUrl : ""),
  };
}

function displayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\.(jpe?g|png|webp|gif|mp4|mov|svg)$/i, "").replace(/[-_]+/g, " ").trim();
}

export function usableMediaUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\\") || /[\u0000-\u001f]/.test(trimmed)) return "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("..")) return trimmed.slice(0, 300);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

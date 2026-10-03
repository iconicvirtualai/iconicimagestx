/**
 * Client portal listing file.
 * Reads fields already stored on the listing, order, and gallery.
 * Hide/unhide keeps the file and only changes presentation visibility.
 * No public-record lookup, no payment publish.
 */

export const PORTAL_LISTING_TABS = [
  { id: "data", label: "Data" },
  { id: "photos", label: "Photos" },
  { id: "video", label: "Video" },
  { id: "tours", label: "Virtual Tours" },
  { id: "floorplans", label: "Floorplans" },
  { id: "marketing", label: "Marketing Kit" },
  { id: "website", label: "Website" },
  { id: "orders", label: "Orders" },
  { id: "activity", label: "Activity" },
] as const;

export type PortalListingTabId = (typeof PORTAL_LISTING_TABS)[number]["id"];

export type PortalMediaKind = "photo" | "video" | "floorplan" | "tour";

export interface PortalAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  formatted: string;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
}

export interface PortalFact {
  id: string;
  label: string;
  value: string;
  empty: boolean;
}

export interface PortalMediaItem {
  id: string;
  kind: PortalMediaKind;
  name: string;
  url: string;
  contentType: string;
  hidden: boolean;
  order: number;
  uploadedAt: string;
}

export interface PortalTourItem extends PortalMediaItem {
  kind: "tour";
  provider: string;
  embedUrl: string | null;
}

export interface PortalMediaPrefs {
  hidden: boolean;
  order: number;
}

export interface PortalMediaStore {
  photos: Record<string, PortalMediaPrefs>;
  videos: Record<string, PortalMediaPrefs>;
  floorplans: Record<string, PortalMediaPrefs>;
  tours: Record<string, PortalMediaPrefs>;
}

export interface PortalWebsiteSettings {
  font: "sans" | "serif" | "modern";
  color: "ink" | "teal" | "warm";
  style: "classic" | "editorial" | "minimal";
  showPhotos: boolean;
  showVideo: boolean;
  showTours: boolean;
  showFloorplans: boolean;
}

export interface PortalInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountDue: number;
}

export interface PortalActivityEvent {
  id: string;
  at: string;
  kind: string;
  summary: string;
}

export interface PortalMarketingCard {
  id: "flyer" | "social" | "reel";
  title: string;
  status: "not_connected";
  note: string;
}

export interface PortalListingDetail {
  id: string;
  title: string;
  status: string;
  address: PortalAddress;
  facts: PortalFact[];
  photos: PortalMediaItem[];
  videos: PortalMediaItem[];
  tours: PortalTourItem[];
  floorplans: PortalMediaItem[];
  marketing: PortalMarketingCard[];
  website: PortalWebsiteSettings;
  invoices: PortalInvoiceSummary[];
  activity: PortalActivityEvent[];
}

export interface PortalListingSources {
  listing: Record<string, unknown>;
  orderRequest?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  invoices?: Array<Record<string, unknown>>;
  galleries?: Array<Record<string, unknown>>;
  appointments?: Array<Record<string, unknown>>;
}

export type PortalMediaChange =
  | { kind: PortalMediaKind; id: string; hidden: boolean }
  | { kind: PortalMediaKind; id: string; move: "earlier" | "later" };

const EMPTY = "Not on file yet";

const FACT_DEFS: Array<{ id: string; label: string; keys: string[] }> = [
  { id: "beds", label: "Beds", keys: ["bedrooms", "beds"] },
  { id: "baths", label: "Baths", keys: ["bathrooms", "baths"] },
  { id: "sqft", label: "Sqft", keys: ["squareFeet", "squareFootage", "sqft"] },
  { id: "yearBuilt", label: "Year built", keys: ["yearBuilt"] },
  { id: "pool", label: "Pool", keys: ["pool", "hasPool"] },
  { id: "lotSize", label: "Lot size", keys: ["lotSize"] },
  { id: "stories", label: "Stories", keys: ["stories", "levels"] },
  { id: "neighborhood", label: "Neighborhood", keys: ["neighborhood", "subdivision"] },
  { id: "schools", label: "Schools", keys: ["schools", "schoolDistrict"] },
  { id: "amenities", label: "Amenities", keys: ["amenities"] },
  { id: "flexSpaces", label: "Flex spaces", keys: ["flexSpaces", "flexSpace"] },
  { id: "office", label: "Office", keys: ["office", "hasOffice"] },
];

export const PORTAL_MARKETING_KIT: PortalMarketingCard[] = [
  {
    id: "flyer",
    title: "Flyer",
    status: "not_connected",
    note: "Design tools are not connected yet. A flyer for this listing will be chosen here.",
  },
  {
    id: "social",
    title: "Social post",
    status: "not_connected",
    note: "Design tools are not connected yet. Social posts for this listing will be chosen here.",
  },
  {
    id: "reel",
    title: "Reel / short",
    status: "not_connected",
    note: "Design tools are not connected yet. Reels and shorts for this listing will be chosen here.",
  },
];

const WEBSITE_FONTS = new Set(["sans", "serif", "modern"]);
const WEBSITE_COLORS = new Set(["ink", "teal", "warm"]);
const WEBSITE_STYLES = new Set(["classic", "editorial", "minimal"]);

const PORTAL_LISTING_ID = /^[A-Za-z0-9_-]{4,128}$/;

export function portalListingPath(listingId: string): string {
  return `/portal/listings/${encodeURIComponent(listingId)}`;
}

/** Shared by the page and the public read. Empty or malformed ids are not listings. */
export function portalListingId(value: unknown): string {
  const id = text(value);
  return PORTAL_LISTING_ID.test(id) ? id : "";
}

export type PortalListingPageMode = "pending" | "owner-check" | "public";

/**
 * A listing link can be read without a session.
 * Only a resolved client session may check ownership. Portal home stays behind its own gate.
 */
export function portalListingPageMode(input: { loading: boolean; isClient: boolean }): PortalListingPageMode {
  if (input.loading) return "pending";
  if (input.isClient) return "owner-check";
  return "public";
}

export function portalListingPublicApiPath(listingId: string): string {
  return `/api/portal/listings/${encodeURIComponent(listingId)}`;
}

export function portalListingOwnerApiPath(listingId: string): string {
  return `/api/clients/me/listings/${encodeURIComponent(listingId)}`;
}

/** Invoice and payment lines are for the owning client. The link does not include them. */
export function isInvoiceOrPaymentActivity(event: PortalActivityEvent): boolean {
  if (/^(invoice|payment)$/i.test(event.kind)) return true;
  return /\binvoice\b|\bpayment\b|\bamount due\b/i.test(event.summary);
}

/**
 * Visitor payload for the link.
 * Address, facts, and visible media stay. Invoices are empty.
 * Invoice and payment activity is left out. Hidden files stay off this read.
 */
export function visitorPortalListingDetail(detail: PortalListingDetail): PortalListingDetail {
  return {
    ...detail,
    photos: detail.photos.filter((item) => !item.hidden),
    videos: detail.videos.filter((item) => !item.hidden),
    tours: detail.tours.filter((item) => !item.hidden),
    floorplans: detail.floorplans.filter((item) => !item.hidden),
    invoices: [],
    activity: detail.activity.filter((event) => !isInvoiceOrPaymentActivity(event)),
  };
}

export function portalListingTab(value: unknown): PortalListingTabId {
  const id = text(value);
  return PORTAL_LISTING_TABS.some((tab) => tab.id === id) ? id as PortalListingTabId : "data";
}

export function emptyPortalMediaStore(): PortalMediaStore {
  return { photos: {}, videos: {}, floorplans: {}, tours: {} };
}

export function defaultPortalWebsite(): PortalWebsiteSettings {
  return {
    font: "sans",
    color: "ink",
    style: "classic",
    showPhotos: true,
    showVideo: true,
    showTours: true,
    showFloorplans: true,
  };
}

export function hiddenPresentationKeys(listing: Record<string, unknown> | null | undefined): Set<string> {
  const keys = new Set<string>();
  const photos = readMediaStore(listing?.portalMedia).photos;
  for (const [id, prefs] of Object.entries(photos)) {
    if (prefs.hidden && id) keys.add(id);
  }
  return keys;
}

export function rowHiddenFromPresentation(row: Record<string, unknown>, hiddenKeys: Set<string>): boolean {
  if (row.hiddenFromPresentation === true || row.portalHidden === true) return true;
  const id = text(row.id);
  const path = text(row.path) || text(row.storagePath);
  const url = text(row.url) || text(row.shareUrl);
  return [id, path, url].some((key) => Boolean(key) && hiddenKeys.has(key));
}

export function buildPortalListingDetail(sources: PortalListingSources): PortalListingDetail {
  const listing = sources.listing || {};
  const id = text(listing.id);
  const records = [listing, sources.order, sources.orderRequest].filter(Boolean) as Array<Record<string, unknown>>;
  const address = readAddress(records);
  const store = readMediaStore(listing.portalMedia);
  const galleries = sources.galleries || [];
  const photos = collectPhotos(listing, galleries, store);
  const videos = collectVideos(listing, galleries, store);
  const tours = collectTours(listing, galleries, store);
  const floorplans = collectFloorplans(listing, galleries, store);
  const website = readWebsite(listing.portalWebsite);
  const invoices = readInvoices(sources.invoices || []);
  const activity = buildActivity(sources, photos, videos, floorplans, tours, invoices);
  const status = text(listing.status) || text(sources.order?.status) || text(sources.orderRequest?.status) || "open";

  return {
    id,
    title: address.formatted || "Listing",
    status,
    address,
    facts: FACT_DEFS.map((fact) => {
      const value = factText(readFact(records, fact.keys));
      return { id: fact.id, label: fact.label, value: value || EMPTY, empty: !value };
    }),
    photos,
    videos,
    tours,
    floorplans,
    marketing: PORTAL_MARKETING_KIT,
    website,
    invoices,
    activity,
  };
}

export function applyPortalMediaChange(
  store: PortalMediaStore,
  items: PortalMediaItem[],
  change: PortalMediaChange,
  nowIso: string,
): { ok: true; store: PortalMediaStore; activity: PortalActivityEvent | null } | { ok: false; error: string } {
  const bucket = items
    .filter((item) => item.kind === change.kind)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const index = bucket.findIndex((item) => item.id === change.id);
  if (index < 0) return { ok: false, error: "That file is not on this listing." };

  const next = bucket.map((item) => ({ ...item }));
  const current = next[index];
  let summary = "";

  if ("hidden" in change && current.hidden !== change.hidden) {
    current.hidden = change.hidden;
    summary = change.hidden
      ? `Hid ${mediaLabel(current)} from the presentation`
      : `Restored ${mediaLabel(current)} to the presentation`;
  }

  if ("move" in change) {
    const swapWith = change.move === "earlier" ? index - 1 : index + 1;
    if (swapWith >= 0 && swapWith < next.length) {
      const other = next[swapWith];
      next[swapWith] = current;
      next[index] = other;
      summary = summary || `Moved ${mediaLabel(current)} ${change.move === "earlier" ? "earlier" : "later"}`;
    }
  }

  if (!summary) return { ok: true, store, activity: null };

  const prefs: Record<string, PortalMediaPrefs> = {};
  next.forEach((item, order) => {
    prefs[item.id] = { hidden: item.hidden, order };
  });

  const activity: PortalActivityEvent = {
    id: `portal-${change.kind}-${change.id}-${nowIso}`,
    at: nowIso,
    kind: change.kind,
    summary,
  };

  return {
    ok: true,
    store: { ...store, [storeKey(change.kind)]: prefs },
    activity,
  };
}

export function sanitizeWebsiteSettings(value: unknown, base = defaultPortalWebsite()): PortalWebsiteSettings {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const font = text(row.font);
  const color = text(row.color);
  const style = text(row.style);
  return {
    font: WEBSITE_FONTS.has(font) ? font as PortalWebsiteSettings["font"] : base.font,
    color: WEBSITE_COLORS.has(color) ? color as PortalWebsiteSettings["color"] : base.color,
    style: WEBSITE_STYLES.has(style) ? style as PortalWebsiteSettings["style"] : base.style,
    showPhotos: boolOr(row.showPhotos, base.showPhotos),
    showVideo: boolOr(row.showVideo, base.showVideo),
    showTours: boolOr(row.showTours, base.showTours),
    showFloorplans: boolOr(row.showFloorplans, base.showFloorplans),
  };
}

export function readMediaStore(value: unknown): PortalMediaStore {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    photos: readPrefs(row.photos),
    videos: readPrefs(row.videos),
    floorplans: readPrefs(row.floorplans),
    tours: readPrefs(row.tours),
  };
}

function storeKey(kind: PortalMediaKind): keyof PortalMediaStore {
  if (kind === "photo") return "photos";
  if (kind === "video") return "videos";
  if (kind === "floorplan") return "floorplans";
  return "tours";
}

function readPrefs(value: unknown): Record<string, PortalMediaPrefs> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, PortalMediaPrefs> = {};
  for (const [id, prefs] of Object.entries(value as Record<string, unknown>)) {
    if (!id || !prefs || typeof prefs !== "object") continue;
    const row = prefs as Record<string, unknown>;
    out[id] = {
      hidden: row.hidden === true,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0,
    };
  }
  return out;
}

function readWebsite(value: unknown): PortalWebsiteSettings {
  return sanitizeWebsiteSettings(value, defaultPortalWebsite());
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

function readFact(records: Array<Record<string, unknown>>, keys: string[]): unknown {
  for (const record of records) {
    const bags = [record, asRecord(record.property), asRecord(record.propertyDetails), asRecord(record.listingInfo), asRecord(record.details)];
    for (const bag of bags) {
      if (!bag) continue;
      for (const key of keys) {
        const value = bag[key];
        if (value == null || value === "") continue;
        return value;
      }
    }
  }
  return undefined;
}

function factText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map((item) => factText(item)).filter(Boolean);
    return parts.join(", ");
  }
  return "";
}

function readAddress(records: Array<Record<string, unknown>>): PortalAddress {
  const address: PortalAddress = {
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    formatted: "",
    lat: null,
    lng: null,
    mapUrl: null,
  };

  for (const record of records) {
    fillAddress(address, addressFromRecord(record));
  }

  address.formatted = [address.line1, address.line2, [address.city, [address.state, address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
  const geo = address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null;
  address.mapUrl = geo ? mapEmbedUrl(geo.lat, geo.lng) : null;
  return address;
}

function fillAddress(target: PortalAddress, source: PortalAddress) {
  if (!target.line1 && source.line1) target.line1 = source.line1;
  if (!target.line2 && source.line2) target.line2 = source.line2;
  if (!target.city && source.city) target.city = source.city;
  if (!target.state && source.state) target.state = source.state;
  if (!target.zip && source.zip) target.zip = source.zip;
  if (target.lat == null && source.lat != null) target.lat = source.lat;
  if (target.lng == null && source.lng != null) target.lng = source.lng;
}

function addressFromRecord(record: Record<string, unknown>): PortalAddress {
  const structured = asRecord(record.address) || asRecord(record.shootLocation) || asRecord(record.propertyAddress);
  const parsed = parseAddressText(
    text(record.addressLine1)
      ? ""
      : addressString(record.address)
        || addressString(record.propertyAddress)
        || addressString(record.shootLocation)
        || text(structured?.formatted),
  );
  const line1 = firstText(record, ["addressLine1", "line1", "street", "streetAddress"])
    || text(structured?.street)
    || text(structured?.line1)
    || text(structured?.addressLine1)
    || parsed.line1;
  const line2 = firstText(record, ["addressLine2", "line2", "unit", "street2"])
    || text(structured?.line2)
    || text(structured?.unit)
    || parsed.line2;
  const split = splitUnit(line1);
  return {
    line1: split.line1,
    line2: line2 || split.line2,
    city: firstText(record, ["city"]) || text(structured?.city) || parsed.city,
    state: firstText(record, ["state"]) || text(structured?.state) || parsed.state,
    zip: firstText(record, ["zip", "postalCode"]) || text(structured?.zip) || text(structured?.postalCode) || parsed.zip,
    formatted: "",
    lat: readCoord(record.lat ?? record.latitude ?? structured?.lat ?? structured?.latitude ?? nestedCoord(record, "lat"), "lat"),
    lng: readCoord(record.lng ?? record.longitude ?? structured?.lng ?? structured?.longitude ?? nestedCoord(record, "lng"), "lng"),
    mapUrl: null,
  };
}

function addressString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function parseAddressText(raw: string): { line1: string; line2: string; city: string; state: string; zip: string } {
  const empty = { line1: "", line2: "", city: "", state: "", zip: "" };
  if (!raw) return empty;
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean)
    .filter((part) => !/^(usa|u\.s\.a\.|united states)$/i.test(part));
  if (parts.length === 0) return empty;
  const last = parts[parts.length - 1];
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!stateZip || parts.length < 2) return { ...empty, line1: raw.replace(/,\s*(usa|united states)$/i, "").trim() };
  const city = parts[parts.length - 2];
  const street = parts.slice(0, -2);
  let line1 = street[0] || "";
  let line2 = "";
  if (street.length >= 2 && isUnit(street[1])) {
    line2 = street[1];
  } else if (street.length > 1) {
    line1 = street.join(", ");
  }
  return { line1, line2, city, state: stateZip[1].toUpperCase(), zip: stateZip[2] };
}

function isUnit(value: string): boolean {
  return /^(apt|apartment|unit|suite|ste|bldg|building|floor|#)\b/i.test(value);
}

function splitUnit(line1: string): { line1: string; line2: string } {
  const match = line1.match(/^(.*?)(?:,\s*|\s+)((?:apt|apartment|unit|suite|ste|bldg|building|floor|#)\s*\S.*)$/i);
  if (!match) return { line1, line2: "" };
  return { line1: match[1].trim(), line2: match[2].trim() };
}

function nestedCoord(record: Record<string, unknown>, axis: "lat" | "lng"): unknown {
  const geo = asRecord(record.geo) || asRecord(record.location) || asRecord(record.geometry);
  if (!geo) return undefined;
  const location = asRecord(geo.location) || geo;
  if (axis === "lat") return location.lat ?? location.latitude;
  return location.lng ?? location.longitude;
}

function readCoord(value: unknown, axis: "lat" | "lng"): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (axis === "lat" && (number < -90 || number > 90)) return null;
  if (axis === "lng" && (number < -180 || number > 180)) return null;
  return number;
}

export function mapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.008;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].map((n) => n.toFixed(6)).join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

function collectPhotos(listing: Record<string, unknown>, galleries: Array<Record<string, unknown>>, store: PortalMediaStore): PortalMediaItem[] {
  return finishMedia("photo", [...rowsFrom(listing.images), ...galleryRows(galleries)], store.photos, (row) => isPhoto(row));
}

function collectVideos(listing: Record<string, unknown>, galleries: Array<Record<string, unknown>>, store: PortalMediaStore): PortalMediaItem[] {
  return finishMedia("video", [...rowsFrom(listing.videos), ...rowsFrom(listing.images), ...galleryRows(galleries)], store.videos, (row) => isVideo(row));
}

function collectFloorplans(listing: Record<string, unknown>, galleries: Array<Record<string, unknown>>, store: PortalMediaStore): PortalMediaItem[] {
  const rows = [
    ...rowsFrom(listing.floorplans).filter(isRasterFloorplan),
    ...rowsFrom(listing.designAssets).filter(isFloorplan),
    ...rowsFrom(listing.cubiCasaImports).filter(isFloorplan),
    ...galleryRows(galleries).filter(isFloorplan),
  ];
  return finishMedia("floorplan", rows, store.floorplans, () => true);
}

function collectTours(listing: Record<string, unknown>, galleries: Array<Record<string, unknown>>, store: PortalMediaStore): PortalTourItem[] {
  const rows: Record<string, unknown>[] = [];
  for (const key of ["tourUrl", "matterportUrl", "virtualTourUrl", "virtualTour", "threeDTourUrl", "tourLink"]) {
    const url = safeHttpUrl(listing[key]);
    if (url) rows.push({ id: key, url, name: key });
  }
  for (const item of rowsFrom(listing.tours)) rows.push(item);
  for (const item of galleryRows(galleries)) rows.push(item);

  const seen = new Set<string>();
  const drafts: PortalTourItem[] = [];
  rows.forEach((row, index) => {
    const url = safeHttpUrl(row.url) || safeHttpUrl(row.shareUrl) || safeHttpUrl(row.href);
    if (!url || seen.has(url)) return;
    const provider = providerFor(url, row);
    const typed = /^(tour|matterport)$/i.test(text(row.type)) || provider != null || isTourField(text(row.id));
    if (!typed) return;
    seen.add(url);
    const id = mediaId("tour", row, index);
    const prefs = store.tours[id];
    drafts.push({
      id,
      kind: "tour",
      name: text(row.name) || text(row.title) || provider || "Virtual tour",
      url,
      contentType: text(row.contentType),
      hidden: prefs?.hidden === true || row.hiddenFromPresentation === true,
      order: prefs?.order ?? index,
      uploadedAt: portalTimestamp(row.uploadedAt || row.createdAt),
      provider: provider || "Virtual tour",
      embedUrl: provider === "Matterport" ? url : null,
    });
  });
  return drafts.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function isTourField(id: string): boolean {
  return /tour|matterport/i.test(id);
}

function finishMedia(
  kind: PortalMediaKind,
  rows: Array<Record<string, unknown>>,
  prefs: Record<string, PortalMediaPrefs>,
  include: (row: Record<string, unknown>) => boolean,
): PortalMediaItem[] {
  const seen = new Set<string>();
  const items: PortalMediaItem[] = [];
  rows.forEach((row, index) => {
    if (!include(row)) return;
    const url = safeHttpUrl(row.url) || safeHttpUrl(row.shareUrl);
    if (!url) return;
    const id = mediaId(kind, row, index);
    const key = text(row.path) || text(row.storagePath) || url;
    if (seen.has(id) || seen.has(key) || seen.has(url)) return;
    seen.add(id);
    seen.add(key);
    seen.add(url);
    const pref = prefs[id];
    items.push({
      id,
      kind,
      name: text(row.name) || text(row.fileName) || text(row.title) || `${kind} ${items.length + 1}`,
      url,
      contentType: text(row.contentType).toLowerCase(),
      hidden: pref?.hidden === true || row.hiddenFromPresentation === true || row.portalHidden === true,
      order: pref?.order ?? index,
      uploadedAt: portalTimestamp(row.uploadedAt || row.createdAt),
    });
  });
  return items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function rowsFrom(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function galleryRows(galleries: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const gallery of galleries) {
    rows.push(...rowsFrom(gallery.mediaItems), ...rowsFrom(gallery.images));
  }
  return rows;
}

function mediaId(kind: PortalMediaKind, row: Record<string, unknown>, index: number): string {
  const raw = text(row.id) || text(row.path) || text(row.storagePath) || text(row.url) || text(row.shareUrl) || `${kind}-${index}`;
  return raw.slice(0, 180);
}

const RAW_EXT = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|raw|rw2|orf|raf|pef|3fr|fff|iiq|heic)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const FLOOR_IMAGE = /\.(jpe?g|png)$/i;
const VIDEO_EXT = /\.(mp4|mov)$/i;

function fileName(row: Record<string, unknown>): string {
  return text(row.name) || text(row.fileName) || text(row.title) || text(row.path) || text(row.url);
}

function isRaw(row: Record<string, unknown>): boolean {
  const path = text(row.path) || text(row.storagePath);
  const name = fileName(row);
  return RAW_EXT.test(name) || RAW_EXT.test(path) || path.includes("/raw/");
}

function isFloorplan(row: Record<string, unknown>): boolean {
  if (!isRasterFloorplan(row)) return false;
  const type = text(row.type).toLowerCase();
  const asset = text(row.assetType).toLowerCase();
  const name = fileName(row);
  return type === "floorplan" || asset === "floorplan" || /floor\s*plan|floorplan/i.test(name) || type === "image" && asset === "floorplan";
}

function isRasterFloorplan(row: Record<string, unknown>): boolean {
  const content = text(row.contentType).toLowerCase();
  const declared = text(row.type).toLowerCase();
  const name = fileName(row);
  const url = text(row.url) || text(row.shareUrl);
  if (content === "image/jpeg" || content === "image/png" || declared === "image/jpeg" || declared === "image/png") return true;
  return FLOOR_IMAGE.test(name) || FLOOR_IMAGE.test(url.split("?")[0]);
}

function isVideo(row: Record<string, unknown>): boolean {
  const type = text(row.type).toLowerCase();
  if (type === "tour" || type === "matterport" || type === "floorplan") return false;
  const content = text(row.contentType).toLowerCase();
  const name = fileName(row);
  const url = (text(row.url) || text(row.shareUrl)).split("?")[0];
  if (content === "video/mp4" || content === "video/quicktime") return true;
  return VIDEO_EXT.test(name) || VIDEO_EXT.test(url);
}

function isPhoto(row: Record<string, unknown>): boolean {
  const declared = text(row.type).toLowerCase();
  const asset = text(row.assetType).toLowerCase();
  if (isVideo(row) || declared === "floorplan" || asset === "floorplan" || isRaw(row)) return false;
  const type = text(row.type).toLowerCase();
  if (type === "tour" || type === "matterport" || type === "video" || type === "reel" || type === "file" || type === "document") return false;
  const content = text(row.contentType).toLowerCase();
  const name = fileName(row);
  const path = text(row.path) || text(row.storagePath);
  if (content.startsWith("video/")) return false;
  if (content && !content.startsWith("image/") && !IMAGE_EXT.test(name)) return false;
  return !content || content.startsWith("image/") || IMAGE_EXT.test(name) || IMAGE_EXT.test(path);
}

function providerFor(url: string, row: Record<string, unknown>): string | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("matterport.com") || /matterport/i.test(text(row.type)) || /matterport/i.test(text(row.name))) return "Matterport";
  if (host.includes("cloudpano.com")) return "CloudPano";
  if (host.includes("iguide")) return "iGUIDE";
  if (host.includes("kuula.co")) return "Kuula";
  if (host.includes("eyespy360.com")) return "EyeSpy360";
  if (host.includes("asteroom.com")) return "Asteroom";
  if (host.includes("zillow.com") && /3d|tour/i.test(url)) return "Zillow 3D";
  if (/^(tour|matterport)$/i.test(text(row.type))) return "Virtual tour";
  return null;
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/")) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function readInvoices(invoices: Array<Record<string, unknown>>): PortalInvoiceSummary[] {
  const seen = new Set<string>();
  const summaries: PortalInvoiceSummary[] = [];
  for (const invoice of invoices) {
    const id = text(invoice.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const total = money(invoice.total);
    summaries.push({
      id,
      invoiceNumber: text(invoice.invoiceNumber) || id,
      status: text(invoice.status) || "draft",
      total,
      amountDue: invoice.amountDue == null ? total : money(invoice.amountDue),
    });
  }
  return summaries;
}

function money(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildActivity(
  sources: PortalListingSources,
  photos: PortalMediaItem[],
  videos: PortalMediaItem[],
  floorplans: PortalMediaItem[],
  tours: PortalTourItem[],
  invoices: PortalInvoiceSummary[],
): PortalActivityEvent[] {
  const events: PortalActivityEvent[] = [];
  const push = (event: PortalActivityEvent | null) => {
    if (!event || !event.summary) return;
    if (events.some((item) => item.id === event.id)) return;
    events.push(event);
  };

  const request = sources.orderRequest;
  if (request) {
    push(eventOf(
      `booking-${text(request.id) || "request"}`,
      request.submittedAt || request.createdAt,
      "booking",
      "Booking request received",
    ));
  }

  for (const appointment of sources.appointments || []) {
    const when = appointment.createdAt || appointment.scheduledDate;
    const status = text(appointment.status);
    push(eventOf(
      `appointment-${text(appointment.id) || events.length}`,
      when,
      "appointment",
      status === "confirmed" ? "Appointment confirmed" : "Appointment requested",
    ));
  }

  const order = sources.order;
  if (order) {
    push(eventOf(
      `order-${text(order.id) || "order"}`,
      order.confirmedAt || order.createdAt,
      "booking",
      "Booking confirmed",
    ));
  }

  push(eventOf(
    `listing-${text(sources.listing.id) || "listing"}`,
    sources.listing.createdAt,
    "listing",
    "Listing file created",
  ));

  for (const photo of photos) {
    push(eventOf(`upload-photo-${photo.id}`, photo.uploadedAt, "photo", `Photo uploaded: ${photo.name}`));
  }
  for (const video of videos) {
    push(eventOf(`upload-video-${video.id}`, video.uploadedAt, "video", `Video uploaded: ${video.name}`));
  }
  for (const plan of floorplans) {
    push(eventOf(`upload-floorplan-${plan.id}`, plan.uploadedAt, "floorplan", `Floorplan uploaded: ${plan.name}`));
  }
  for (const tour of tours) {
    push(eventOf(`tour-${tour.id}`, tour.uploadedAt, "tour", `${tour.provider} tour added`));
  }

  for (const gallery of sources.galleries || []) {
    const status = text(gallery.status).replace(/_/g, " ") || "opened";
    push(eventOf(
      `gallery-${text(gallery.id) || events.length}`,
      gallery.updatedAt || gallery.createdAt,
      "gallery",
      `Gallery ${status}`,
    ));
  }

  for (const invoice of sources.invoices || []) {
    const id = text(invoice.id);
    const number = text(invoice.invoiceNumber) || invoices.find((item) => item.id === id)?.invoiceNumber || "Invoice";
    const status = text(invoice.status) || "draft";
    const summary = status === "paid"
      ? `Payment recorded on ${number}`
      : `Invoice ${number} is ${status.replace(/_/g, " ")}`;
    push(eventOf(`invoice-${id || number}`, invoice.paidAt || invoice.updatedAt || invoice.createdAt, "invoice", summary));
  }

  for (const entry of rowsFrom(sources.listing.auditLog)) {
    const action = text(entry.action);
    if (!action || /lockbox|internal|password|secret/i.test(action)) continue;
    push(eventOf(
      `audit-${text(entry.id) || action}-${text(entry.at)}`,
      entry.at || entry.createdAt,
      "audit",
      action,
    ));
  }

  for (const entry of rowsFrom(sources.listing.portalActivity)) {
    push({
      id: text(entry.id) || `portal-activity-${events.length}`,
      at: portalTimestamp(entry.at),
      kind: text(entry.kind) || "listing",
      summary: text(entry.summary),
    });
  }

  return events
    .filter((event) => event.summary)
    .sort((a, b) => {
      if (a.at && b.at) return a.at.localeCompare(b.at);
      if (a.at) return -1;
      if (b.at) return 1;
      return 0;
    });
}

function eventOf(id: string, when: unknown, kind: string, summary: string): PortalActivityEvent | null {
  const at = portalTimestamp(when);
  if (!summary) return null;
  return { id, at, kind, summary };
}

export function portalTimestamp(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof record.toDate === "function") {
      try {
        const date = record.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
      } catch {
        return "";
      }
    }
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : null;
    if (seconds != null) {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }
  return "";
}

function mediaLabel(item: PortalMediaItem): string {
  return item.name || item.kind;
}

/**
 * Shared package identity for client project tiles and admin order tiles.
 *
 * This is the only catalog of the 16 Cadi-approved skins. Client tiles
 * (`ListingPackageCard`) and admin order tiles must import from here.
 * Do not copy names, skin labels, or price display into a second list.
 *
 * Admin order tiles should use:
 * - `resolvePackageSkin` / `resolvePackageSkinFromOrder` for the stored package
 * - `clientSkinLabel` for the "Client skin: …" line
 * - `packagePriceDisplay` for the price slot ("$549", "$999/mo")
 * - `packageIdentity` for the rest of the shared fields
 *
 * Foundation, Evolution, and Bundle are not skins.
 */

export const LISTING_CARD_LOOKS = [
  "apprenticeship",
  "just-photos",
  "essentials",
  "showcase",
  "legacy",
  "market-leader",
  "refresh",
  "content-partner",
  "local-legend",
  "baseline",
  "growth-engine",
  "professional-suite",
  "connected-core",
  "signature-tier",
  "authority-stack",
  "iconic-partnership",
] as const;

export type ListingCardLook = (typeof LISTING_CARD_LOOKS)[number];

export type PackageSkinCategory = "listing" | "human-brand" | "social";
export type PackageTier = "entry" | "mid" | "top";

export interface PackageChip {
  label: string;
  tone?: "gold" | "teal";
}

export interface PackageSkin {
  look: ListingCardLook;
  /** Catalog ids that select this skin. */
  ids: readonly string[];
  category: PackageSkinCategory;
  /** Short admin/client skin name, without a "The" prefix. */
  skinLabel: string;
  /** Package name on the client tile, before uppercase styling. */
  title: string;
  /** Word inside `title` drawn in the tier accent. Empty when the name is one color. */
  accent: string;
  badge: string;
  features: string;
  chips: readonly PackageChip[];
  /** Client tile price, e.g. "$549" or "Basics". */
  price: string;
  /** Client tile cadence under the price. Empty when the price stands alone. */
  priceNote: string;
  /** Admin price slot, cadence included when the package is monthly. */
  priceDisplay: string;
  tier: PackageTier;
  /** Higher rank wins when an order lists more than one package. */
  rank: number;
  /** Higher priority wins when one string could match more than one skin. */
  matchPriority: number;
  match: RegExp;
  foot: "shoot" | "ongoing" | "campaign" | "none";
  amenities: boolean;
}

export interface PackageIdentity {
  look: ListingCardLook;
  ids: readonly string[];
  category: PackageSkinCategory;
  title: string;
  skinLabel: string;
  clientSkinLabel: string;
  badge: string;
  features: string;
  price: string;
  priceNote: string;
  priceDisplay: string;
  tier: PackageTier;
}

const DIRECT_PACKAGE_KEYS = ["package", "packageName", "packageId", "selectedPackage", "selectedService", "serviceId"] as const;

export const PACKAGE_SKINS: readonly PackageSkin[] = [
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
    amenities: true,
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
    amenities: true,
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
      { label: "Iconic Polish", tone: "gold" },
    ],
    price: "$1,599",
    priceNote: "per listing",
    priceDisplay: "$1,599",
    tier: "top",
    rank: 6,
    matchPriority: 160,
    match: /market\s+leader/,
    foot: "shoot",
    amenities: true,
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
    amenities: false,
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
      { label: "Omni" },
    ],
    price: "$3,200",
    priceNote: "per month",
    priceDisplay: "$3,200/mo",
    tier: "top",
    rank: 15,
    matchPriority: 130,
    match: /authority\s+stack/,
    foot: "none",
    amenities: false,
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
    amenities: false,
  }),
];

const BY_LOOK = new Map(PACKAGE_SKINS.map((item) => [item.look, item]));
const MATCH_ORDER = [...PACKAGE_SKINS].sort((a, b) => b.matchPriority - a.matchPriority);
const ID_INDEX = new Map<string, ListingCardLook>();
for (const item of PACKAGE_SKINS) {
  for (const id of item.ids) ID_INDEX.set(normalizePackageText(id), item.look);
}

export function packageSkin(look: ListingCardLook): PackageSkin {
  const found = BY_LOOK.get(look);
  if (!found) throw new Error(`Missing package skin: ${look}`);
  return found;
}

export function packageSkinsCoverEveryLook(): boolean {
  return LISTING_CARD_LOOKS.every((look) => BY_LOOK.has(look)) && PACKAGE_SKINS.length === LISTING_CARD_LOOKS.length;
}

export function isTopTierPackage(look: ListingCardLook): boolean {
  return packageSkin(look).tier === "top";
}

export function clientSkinLabel(lookOrSkin: ListingCardLook | PackageSkin): string {
  const item = typeof lookOrSkin === "string" ? packageSkin(lookOrSkin) : lookOrSkin;
  return `Client skin: ${item.skinLabel}`;
}

export function packagePriceDisplay(lookOrSkin: ListingCardLook | PackageSkin): string {
  const item = typeof lookOrSkin === "string" ? packageSkin(lookOrSkin) : lookOrSkin;
  return item.priceDisplay;
}

export function packageIdentity(lookOrSkin: ListingCardLook | PackageSkin): PackageIdentity {
  const item = typeof lookOrSkin === "string" ? packageSkin(lookOrSkin) : lookOrSkin;
  return {
    look: item.look,
    ids: item.ids,
    category: item.category,
    title: item.title,
    skinLabel: item.skinLabel,
    clientSkinLabel: clientSkinLabel(item),
    badge: item.badge,
    features: item.features,
    price: item.price,
    priceNote: item.priceNote,
    priceDisplay: item.priceDisplay,
    tier: item.tier,
  };
}

/** One stored package id, name, service list, or `{ id, name }` record. */
export function resolvePackageSkin(value: unknown): PackageSkin | null {
  const look = lookFromUnknown(value);
  return look ? packageSkin(look) : null;
}

/**
 * Order or listing record. A package field wins, even when it is not one of
 * the 16. Otherwise the highest-rank skin in the service list wins.
 */
export function resolvePackageSkinFromOrder(data: Record<string, unknown>): PackageSkin | null {
  for (const key of DIRECT_PACKAGE_KEYS) {
    if (!hasValue(data[key])) continue;
    const skin = resolvePackageSkin(data[key]);
    if (skin) return skin;
  }
  const look = bestLook(data.serviceIds, data.services, data.lineItems, data.selectedBasics);
  return look ? packageSkin(look) : null;
}

export function matchPackageLook(raw: string): ListingCardLook | null {
  const value = normalizePackageText(raw);
  if (!value) return null;
  const byId = ID_INDEX.get(value);
  if (byId) return byId;
  for (const item of MATCH_ORDER) {
    if (item.match.test(value)) return item.look;
  }
  return null;
}

export function packageSkinRank(look: ListingCardLook): number {
  return packageSkin(look).rank;
}

/** Grid order from the approved v2 boards. Matching rank is separate. */
const DISPLAY_ORDER: readonly ListingCardLook[] = [
  "apprenticeship",
  "just-photos",
  "essentials",
  "showcase",
  "legacy",
  "market-leader",
  "refresh",
  "content-partner",
  "local-legend",
  "baseline",
  "growth-engine",
  "professional-suite",
  "signature-tier",
  "iconic-partnership",
  "connected-core",
  "authority-stack",
];

export function packageSkinsInDisplayOrder(category?: PackageSkinCategory): PackageSkin[] {
  const ordered = DISPLAY_ORDER.map((look) => packageSkin(look));
  return category ? ordered.filter((item) => item.category === category) : ordered;
}

function skin(item: PackageSkin): PackageSkin {
  return item;
}

function lookFromUnknown(value: unknown): ListingCardLook | null {
  if (typeof value === "string" || typeof value === "number") return matchPackageLook(String(value));
  if (Array.isArray(value)) return bestLook(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return bestLook(record.id, record.packageId, record.name, record.title, record.label);
  }
  return null;
}

function bestLook(...values: unknown[]): ListingCardLook | null {
  let best: ListingCardLook | null = null;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const look = value && typeof value === "object"
      ? lookFromUnknown(value)
      : matchPackageLook(value == null ? "" : String(value));
    if (look && (!best || packageSkinRank(look) > packageSkinRank(best))) best = look;
  };
  values.forEach(visit);
  return best;
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function normalizePackageText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

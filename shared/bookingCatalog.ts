/**
 * Booking package catalog.
 *
 * The seed list is what `pnpm seed:booking-catalog` writes into Firestore
 * `packages`. Staff edits on those docs are the prices the booking form and
 * the booking submit charge. A missing doc falls back to this seed.
 * Do not seed or charge from AdminCurrentPricing — those numbers disagree.
 * Life of the Listing Care is intentionally absent: it stays an unpriced boolean.
 * External site embeds are a later pass. See shared/bookingEmbeds.ts.
 */

import { services, type Service } from "../client/lib/services.ts";

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  description: string;
  features?: string[];
  /** Hard appointment cap. Present only on apprenticeship packages. */
  appointmentLimit?: string;
  /** Short card line. Witty pressure, not a second price. */
  aside?: string;
  /** Shown on the card above the name. */
  kicker?: string;
  /** Short label for the booking card. Falls back to name. */
  cardTitle?: string;
  rules?: string[];
}

export const APPRENTICESHIP_PROGRAM_NAME = "The Apprenticeship Program";

export const APPRENTICESHIP_BRIDGE_COPY =
  "Need to go even lower? That's okay — we don't judge… but you have to follow the rules.";

export const APPRENTICESHIP_OVERAGE_LABEL = "$25 per 15-minute increment";

export const APPRENTICESHIP_RULES = [
  "Apprentices are learning.",
  "We do not make additional trips.",
  "We do not edit out anything additional — you get what you pay for.",
  "You're helping us help you.",
  "Once apprentices graduate we will have new apprentices. Graduates become vetted Iconic shooters, just like the OGs. It's a lifetime cycle — clients help all along the way.",
  "But we don't play: be prepped and ready to go when we arrive.",
];

export function isApprenticeshipPackage(id: string): boolean {
  return id.startsWith("apprentice-");
}

/**
 * Older photo counts. They stay in the seed so old orders and admin can
 * still price them. Public forms do not offer them.
 */
export const RETIRED_PUBLIC_PHOTO_IDS = ["photos-20", "photos-35", "photos-50"] as const;

export function isRetiredPublicPhotoPackage(id: string): boolean {
  return (RETIRED_PUBLIC_PHOTO_IDS as readonly string[]).includes(id);
}

/** Photo-count packages are one choice: standard photos-only, aerial only, or apprenticeship. */
export function isExclusivePhotoPackage(id: string): boolean {
  return id.startsWith("photos-") || id === "aerial-only" || isApprenticeshipPackage(id);
}

export function basicLineName(item: CatalogItem): string {
  return item.appointmentLimit ? `${item.name} (${item.appointmentLimit})` : item.name;
}

export const basicsList: CatalogItem[] = [
  {
    id: "photos-18",
    name: "Photos Only — 18 photos",
    cardTitle: "18 Photos",
    price: 139,
    description: "Just the basics. Next-day delivery.",
    features: ["18 photos", "Next-day delivery"],
  },
  {
    id: "photos-25-only",
    name: "Photos Only — 25 photos",
    cardTitle: "25 Photos",
    price: 169,
    description: "Just the basics. Next-day delivery.",
    features: ["25 photos", "Next-day delivery"],
  },
  {
    id: "photos-40",
    name: "Photos Only — 40 photos",
    cardTitle: "40 Photos",
    price: 199,
    description: "Just the basics. Next-day delivery.",
    features: ["40 photos", "Next-day delivery"],
  },
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
      "Reflection/Mirror Removal",
    ],
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
      "Reflection/Mirror Removal",
    ],
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
      "Reflection/Mirror Removal",
    ],
  },
  {
    id: "aerial-only",
    name: "Aerial Only",
    price: 200,
    description: "Aerial photos without a photo package.",
    features: ["5 aerial photos"],
  },
  {
    id: "apprentice-25",
    name: "The Apprenticeship Program — 25 Photos",
    cardTitle: "25 photos",
    price: 85,
    kicker: "The cheap one",
    appointmentLimit: "20 Minute Appointment ONLY",
    aside: "Twenty-five photos. Twenty minutes. You'll feel the savings — and the stopwatch.",
    description:
      "25 photos, shot by an apprentice. 20 Minute Appointment ONLY. Overages billed at $25 per 15-minute increment.",
    features: [
      "25 Photos",
      "20 Minute Appointment ONLY",
      "Photos only",
      "Overages: $25 per 15-minute increment",
    ],
    rules: APPRENTICESHIP_RULES,
  },
  {
    id: "apprentice-50",
    name: "The Apprenticeship Program — 50 Photos",
    cardTitle: "50 photos",
    price: 125,
    kicker: "Slightly less cheap",
    appointmentLimit: "1 Hour Appointment ONLY",
    aside: "Fifty photos and a full hour. You still walked past the real packages.",
    description:
      "50 photos, shot by an apprentice. 1 Hour Appointment ONLY. Overages billed at $25 per 15-minute increment.",
    features: [
      "50 Photos",
      "1 Hour Appointment ONLY",
      "Photos only",
      "Overages: $25 per 15-minute increment",
    ],
    rules: APPRENTICESHIP_RULES,
  },
];

export const apprenticeshipPackages = basicsList.filter((item) => isApprenticeshipPackage(item.id));
export const photoOnlyPackages = basicsList.filter(
  (item) => !isApprenticeshipPackage(item.id) && !isRetiredPublicPhotoPackage(item.id),
);

export const addOns: Array<{ category: string; items: CatalogItem[] }> = [
  {
    category: "Speed & Social",
    items: [
      {
        id: "same-day",
        name: "Same-Day Delivery",
        price: 50,
        description: "Photos, Twilight Render and Snap Reel by 7PM (Basic Edits).",
        features: ["Photos by 7PM", "Snap Reel by 7PM", "Twilight Renders by 7PM"],
      },
      {
        id: "basic-reel",
        name: "Basic Reel",
        price: 125,
        description: "A high-impact 15s vertical video optimized for social media.",
        features: ["15-Second Vertical Video", "Trending Audio Integration", "Fast-Paced Editing Style"],
      },
    ],
  },
  {
    category: "The Space",
    items: [
      {
        id: "aerial-drone",
        name: "Aerial Drone Stills",
        price: 200,
        description: "Capture the property and its surroundings from a unique perspective.",
        features: ["5 High-Res Aerial Photos", "Neighborhood Context Shots", "Professional Color Grading"],
      },
      {
        id: "matterport-3d",
        name: "Matterport 3D Tour",
        price: 200,
        description: "A fully immersive 3D walkthrough experience for remote buyers.",
        features: ["Full 3D Interior Model", "Dollhouse View", "Interactive Floor Navigation"],
      },
      {
        id: "basic-video",
        name: "Basic Video",
        price: 300,
        description: "A professional cinematic walkthrough of the property interior.",
        features: ["60-Second 4K Video", "Interior & Exterior Highlights", "Licensed Background Music"],
      },
      {
        id: "aerial-premium",
        name: "Aerial Premium Video",
        price: 550,
        description: "The ultimate drone experience with cinematic sweeps and tracking shots.",
        features: ["90-Second 4K Aerial Film", "Dynamic Tracking Shots", "Advanced Neighborhood Highlights"],
      },
      {
        id: "floorplan-2d",
        name: "2D Floor Plan",
        price: 75,
        description: "Accurate dimensions and layout visualization for buyers.",
        features: ["Precise Room Measurements", "Clean Schematic Layout", "PDF & JPG Deliverables"],
      },
      {
        id: "amenity-addon",
        name: "Amenity",
        price: 50,
        description: "Capture the shared spaces and community features that add value.",
        features: ["Pool & Clubhouse Shots", "Parks & Shared Spaces", "Community Context"],
      },
      {
        id: "essentials-aerial",
        name: "Essentials Aerial Upgrade",
        price: 89,
        description: "Aerial upgrade for The Essentials.",
        features: ["Aerial photos"],
      },
      {
        id: "grass-replacement",
        name: "Grass replacement",
        price: 25,
        description: "Grass replacement for the appointment.",
        features: ["Grass replacement"],
      },
    ],
  },
  {
    category: "The Brand",
    items: [
      {
        id: "agent-intro-video",
        name: "Agent intro/outro",
        price: 59,
        description: "On-camera agent intro or outro, priced per video.",
        features: ["Agent intro/outro"],
      },
    ],
  },
];

/** Last match wins, matching the booking form's add-on scan. */
export function findAddOn(id: string): CatalogItem | undefined {
  let found: CatalogItem | undefined;
  for (const category of addOns) {
    const item = category.items.find((entry) => entry.id === id);
    if (item) found = item;
  }
  return found;
}

export const ICONIC_FINISH_PRICE = 75;
export const VIRTUAL_STAGING_UNIT_PRICE = 35;
export const SPECIALIZED_SOCIAL_PRICE = 85;
export const SPECIALIZED_BOTH_PRICE = 125;

export const ICONIC_FINISH_NAME = "Iconic Finish (Premium Upgrade)";
export const SPECIALIZED_SOCIAL_NAME = "Social Media Optimized Photography";
export const SPECIALIZED_BOTH_NAME = "MLS + Social Media Optimized Photography";

export const PROMO_DISCOUNTS = {
  ICONICAI: 35,
  NEWYEAR: 50,
} as const;

export type PromoCode = keyof typeof PROMO_DISCOUNTS;

export function promoDiscountFor(
  raw: string,
  promos?: ReadonlyArray<{ code: string; discount: number; mode?: "flat" | "percent"; active?: boolean }>,
  subtotal = 0,
): { code: string; discount: number } | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  if (promos) {
    const match = promos.find((item) => item.active !== false && item.code.trim().toUpperCase() === code);
    if (!match || match.discount <= 0) return null;
    const discount = match.mode === "percent"
      ? Math.round(Math.max(0, subtotal) * match.discount) / 100
      : match.discount;
    const rounded = Math.round(discount * 100) / 100;
    if (rounded <= 0) return null;
    return { code: match.code.trim().toUpperCase(), discount: rounded };
  }
  if (code === "ICONICAI") return { code, discount: PROMO_DISCOUNTS.ICONICAI };
  if (code === "NEWYEAR") return { code, discount: PROMO_DISCOUNTS.NEWYEAR };
  return null;
}

const UPGRADES: CatalogItem[] = [
  {
    id: "iconic-finish",
    name: ICONIC_FINISH_NAME,
    price: ICONIC_FINISH_PRICE,
    description: "Premium digital finish charged at $75 when selected.",
  },
  {
    id: "virtual-staging",
    name: "Virtual Staging",
    price: VIRTUAL_STAGING_UNIT_PRICE,
    description: "Per credit. The booking line extends this unit price by the credit count.",
  },
  {
    id: "specialized-social",
    name: SPECIALIZED_SOCIAL_NAME,
    price: SPECIALIZED_SOCIAL_PRICE,
    description: "Social-optimized photo set.",
  },
  {
    id: "specialized-both",
    name: SPECIALIZED_BOTH_NAME,
    price: SPECIALIZED_BOTH_PRICE,
    description: "MLS and social-optimized photo set.",
  },
];

/**
 * Priced lines the order form can charge that are not their own card.
 * Iconic Polish is the same $75 finish as the premium toggle (iconic-finish).
 * The toggle is the control on /book, so this id stays chargeable without a second button.
 */
export const publicBookingPackages: CatalogItem[] = [
  {
    id: "iconic-polish",
    name: "Iconic Polish",
    price: 75,
    description: "Premium digital finish.",
    features: ["Premium digital finish"],
  },
];

export function hardcodedChargePrice(id: string): number | undefined {
  const service = services.find((entry) => entry.id === id);
  if (service) return service.price;
  const basic = basicsList.find((entry) => entry.id === id);
  if (basic) return basic.price;
  const addon = findAddOn(id);
  if (addon) return addon.price;
  const upgrade = UPGRADES.find((entry) => entry.id === id);
  if (upgrade) return upgrade.price;
  const publicPackage = publicBookingPackages.find((entry) => entry.id === id);
  if (publicPackage) return publicPackage.price;
  return undefined;
}

/** Id match, then an exact package name. Listings often store the name only. */
export function hardcodedChargePriceForText(raw: string): number | undefined {
  const direct = hardcodedChargePrice(raw);
  if (direct != null) return direct;
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;
  const pools: Array<{ id: string; name: string; price: number }> = [
    ...services,
    ...basicsList,
    ...UPGRADES,
    ...publicBookingPackages,
    ...addOns.flatMap((category) => category.items),
  ];
  const hit = pools.find((entry) => entry.name.trim().toLowerCase() === key);
  return hit && hit.price > 0 ? hit.price : undefined;
}

export interface CatalogPriceMismatch {
  id: string;
  hardcodedPrice: number;
  catalogPrice: number;
}

/** Compare Firestore docs to hardcoded charge prices. Missing docs are not mismatches. */
export function findCatalogPriceMismatches(
  docs: Array<Record<string, unknown>>,
): CatalogPriceMismatch[] {
  const mismatches: CatalogPriceMismatch[] = [];
  for (const doc of docs) {
    const id = String(doc.bookingId || doc.id || "");
    if (!id) continue;
    const hardcodedPrice = hardcodedChargePrice(id);
    if (hardcodedPrice == null) continue;
    const catalogPrice = Number(doc.price);
    if (!Number.isFinite(catalogPrice) || catalogPrice !== hardcodedPrice) {
      mismatches.push({
        id,
        hardcodedPrice,
        catalogPrice: Number.isFinite(catalogPrice) ? catalogPrice : Number.NaN,
      });
    }
  }
  return mismatches;
}

export type BookingPackageTier = "basic" | "standard" | "premium" | "campaign" | "addon";
export type BookingPackageCategory =
  | "photography"
  | "video"
  | "virtual_staging"
  | "marketing"
  | "addon";
export type BookingCatalogKind = "service" | "basic" | "addon" | "upgrade";

export interface BookingPackageSeed {
  id: string;
  name: string;
  tier: BookingPackageTier;
  price: number;
  description: string;
  includedServices: string[];
  isActive: true;
  sortOrder: number;
  category: BookingPackageCategory;
  bookingId: string;
  bookingKind: BookingCatalogKind;
  source: "booking-form-hardcoded";
  appointmentLimit?: string;
  overage?: string;
  rules?: string[];
  /** Campaign group on the booking form. Present on service packages. */
  serviceCategory?: Service["category"];
  /** Add-on column on the booking form. Present on add-on packages. */
  addonGroup?: string;
  cardTitle?: string;
  kicker?: string;
  aside?: string;
}

function serviceCategory(service: Service): BookingPackageCategory {
  if (service.category === "listings") return "photography";
  return "marketing";
}

function addonCategory(id: string): BookingPackageCategory {
  if (id === "basic-reel" || id === "basic-video" || id === "aerial-premium") return "video";
  if (id === "matterport-3d") return "virtual_staging";
  return "addon";
}

function upgradeCategory(id: string): BookingPackageCategory {
  if (id === "virtual-staging") return "virtual_staging";
  return "addon";
}

/** Idempotent package docs for the public `packages` collection. */
export function bookingPackageSeedDocs(): BookingPackageSeed[] {
  const docs: BookingPackageSeed[] = [];
  let sortOrder = 0;

  for (const service of services) {
    docs.push({
      id: service.id,
      name: service.name,
      tier: "campaign",
      price: service.price,
      description: service.description,
      includedServices: service.features || [],
      isActive: true,
      sortOrder: sortOrder++,
      category: serviceCategory(service),
      bookingId: service.id,
      bookingKind: "service",
      source: "booking-form-hardcoded",
      serviceCategory: service.category,
    });
  }

  for (const basic of basicsList) {
    docs.push({
      id: basic.id,
      name: basic.name,
      tier: "basic",
      price: basic.price,
      description: basic.description,
      includedServices: basic.features || [],
      isActive: true,
      sortOrder: sortOrder++,
      category: "photography",
      bookingId: basic.id,
      bookingKind: "basic",
      source: "booking-form-hardcoded",
      ...(basic.cardTitle ? { cardTitle: basic.cardTitle } : {}),
      ...(basic.kicker ? { kicker: basic.kicker } : {}),
      ...(basic.aside ? { aside: basic.aside } : {}),
      ...(basic.appointmentLimit
        ? {
            appointmentLimit: basic.appointmentLimit,
            overage: APPRENTICESHIP_OVERAGE_LABEL,
            rules: basic.rules || [],
          }
        : {}),
    });
  }

  for (const category of addOns) {
    for (const item of category.items) {
      docs.push({
        id: item.id,
        name: item.name,
        tier: "addon",
        price: item.price,
        description: item.description,
        includedServices: item.features || [],
        isActive: true,
        sortOrder: sortOrder++,
        category: addonCategory(item.id),
        bookingId: item.id,
        bookingKind: "addon",
        source: "booking-form-hardcoded",
        addonGroup: category.category,
      });
    }
  }

  for (const upgrade of UPGRADES) {
    docs.push({
      id: upgrade.id,
      name: upgrade.name,
      tier: "addon",
      price: upgrade.price,
      description: upgrade.description,
      includedServices: [],
      isActive: true,
      sortOrder: sortOrder++,
      category: upgradeCategory(upgrade.id),
      bookingId: upgrade.id,
      bookingKind: "upgrade",
      source: "booking-form-hardcoded",
    });
  }

  for (const item of publicBookingPackages) {
    docs.push({
      id: item.id,
      name: item.name,
      tier: "standard",
      price: item.price,
      description: item.description,
      includedServices: item.features || [],
      isActive: true,
      sortOrder: sortOrder++,
      category: "photography",
      bookingId: item.id,
      bookingKind: "service",
      source: "booking-form-hardcoded",
    });
  }

  return docs;
}

export const BOOKING_PACKAGE_CATEGORY_ORDER: BookingPackageCategory[] = [
  "photography",
  "video",
  "virtual_staging",
  "marketing",
  "addon",
];

export const BOOKING_PACKAGE_CATEGORY_LABELS: Record<BookingPackageCategory, string> = {
  photography: "Photography",
  video: "Video",
  virtual_staging: "Virtual staging",
  marketing: "Marketing",
  addon: "Add-ons",
};

export const BOOKING_CATALOG_KIND_LABELS: Record<BookingCatalogKind, string> = {
  service: "Package",
  basic: "Photo set",
  addon: "Add-on",
  upgrade: "Upgrade",
};

/** A priced version of one package. The parent stays the catalog id. */
export interface CatalogVariant {
  id: string;
  name: string;
  price: number;
  durationMinutes?: number;
  description?: string;
}

/** Package row the staff invoice picker can select. Same fields as the seed. */
export interface StaffCatalogPackage {
  id: string;
  name: string;
  price: number;
  description: string;
  category: BookingPackageCategory;
  bookingKind: BookingCatalogKind;
  tier: BookingPackageTier;
  includedServices: string[];
  sortOrder: number;
  isActive: boolean;
  bookingId: string;
  appointmentLimit?: string;
  overage?: string;
  rules?: string[];
  serviceCategory?: Service["category"];
  addonGroup?: string;
  cardTitle?: string;
  kicker?: string;
  aside?: string;
  /** Minutes on the package doc, when staff have set a length. */
  durationMinutes?: number;
  /** Optional priced versions. Absent on the seed list. */
  variants?: CatalogVariant[];
}

const PACKAGE_CATEGORIES = new Set<string>(BOOKING_PACKAGE_CATEGORY_ORDER);
const PACKAGE_KINDS = new Set<string>(["service", "basic", "addon", "upgrade"]);
const PACKAGE_TIERS = new Set<string>(["basic", "standard", "premium", "campaign", "addon"]);

function finiteCatalogNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

function catalogText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const SERVICE_CATEGORIES = new Set<string>(["listings", "branding", "business", "growth", "studio"]);

function catalogStringList(value: unknown, fallback: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((entry) => catalogText(entry)).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function catalogServiceCategory(value: unknown, fallback?: Service["category"]): Service["category"] | undefined {
  const raw = catalogText(value);
  if (SERVICE_CATEGORIES.has(raw)) return raw as Service["category"];
  return fallback;
}

function catalogVariants(value: unknown): CatalogVariant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const variants: CatalogVariant[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = catalogText(row.id);
    const name = catalogText(row.name);
    const price = finiteCatalogNumber(row.price);
    if (!id || !name || price == null || price < 0) continue;
    const duration = finiteCatalogNumber(row.durationMinutes);
    const description = catalogText(row.description);
    variants.push({
      id,
      name,
      price,
      ...(duration != null && duration > 0 ? { durationMinutes: Math.round(duration) } : {}),
      ...(description ? { description } : {}),
    });
  }
  return variants.length > 0 ? variants : undefined;
}

function withCatalogNotes(item: StaffCatalogPackage, doc: Record<string, unknown>, current?: StaffCatalogPackage): StaffCatalogPackage {
  const appointmentLimit = catalogText(doc.appointmentLimit) || current?.appointmentLimit;
  const overage = catalogText(doc.overage) || current?.overage;
  const cardTitle = catalogText(doc.cardTitle) || current?.cardTitle;
  const kicker = catalogText(doc.kicker) || current?.kicker;
  const aside = catalogText(doc.aside) || current?.aside;
  const addonGroup = catalogText(doc.addonGroup) || current?.addonGroup;
  const serviceCategory = catalogServiceCategory(doc.serviceCategory, current?.serviceCategory);
  const rules = catalogStringList(doc.rules, current?.rules);
  const durationMinutes = Object.prototype.hasOwnProperty.call(doc, "durationMinutes")
    ? finiteCatalogNumber(doc.durationMinutes)
    : current?.durationMinutes;
  const variants = Object.prototype.hasOwnProperty.call(doc, "variants")
    ? catalogVariants(doc.variants)
    : current?.variants;
  return {
    ...item,
    ...(appointmentLimit ? { appointmentLimit } : {}),
    ...(overage ? { overage } : {}),
    ...(cardTitle ? { cardTitle } : {}),
    ...(kicker ? { kicker } : {}),
    ...(aside ? { aside } : {}),
    ...(addonGroup ? { addonGroup } : {}),
    ...(serviceCategory ? { serviceCategory } : {}),
    ...(rules?.length ? { rules } : {}),
    ...(durationMinutes != null && durationMinutes > 0 ? { durationMinutes: Math.round(durationMinutes) } : {}),
    ...(variants?.length ? { variants } : {}),
  };
}

/**
 * Active packages for the invoice picker and the booking form.
 * The seed is the same list `pnpm seed:booking-catalog` writes into `packages`.
 * Live package docs overlay name, price, description, and the other catalog fields.
 * Booking charges this list. A missing live doc keeps the seed price.
 */
export function packagesForStaffEditor(
  liveDocs: Array<Record<string, unknown>> = [],
  options?: { includeInactive?: boolean },
): StaffCatalogPackage[] {
  const byId = new Map<string, StaffCatalogPackage>();
  for (const seed of bookingPackageSeedDocs()) {
    byId.set(seed.id, withCatalogNotes(
      { ...seed, includedServices: [...seed.includedServices] },
      seed as unknown as Record<string, unknown>,
    ));
  }

  for (const doc of liveDocs) {
    const id = catalogText(doc.id || doc.bookingId);
    if (!id) continue;
    if (doc.removed === true) {
      byId.delete(id);
      continue;
    }
    const current = byId.get(id);
    const name = catalogText(doc.name) || current?.name || "";
    if (!name) continue;
    const categoryRaw = catalogText(doc.category);
    const kindRaw = catalogText(doc.bookingKind);
    const tierRaw = catalogText(doc.tier);
    const included = Array.isArray(doc.includedServices)
      ? doc.includedServices.map((entry) => catalogText(entry)).filter(Boolean)
      : current?.includedServices ?? [];
    byId.set(id, withCatalogNotes({
      id,
      name,
      price: finiteCatalogNumber(doc.price) ?? current?.price ?? 0,
      description: catalogText(doc.description) || current?.description || "",
      category: PACKAGE_CATEGORIES.has(categoryRaw)
        ? categoryRaw as BookingPackageCategory
        : current?.category ?? "addon",
      bookingKind: PACKAGE_KINDS.has(kindRaw)
        ? kindRaw as BookingCatalogKind
        : current?.bookingKind ?? "addon",
      tier: PACKAGE_TIERS.has(tierRaw)
        ? tierRaw as BookingPackageTier
        : current?.tier ?? "addon",
      includedServices: included,
      sortOrder: finiteCatalogNumber(doc.sortOrder) ?? current?.sortOrder ?? 1000,
      isActive: doc.isActive === false ? false : doc.isActive === true ? true : current?.isActive ?? true,
      bookingId: catalogText(doc.bookingId) || current?.bookingId || id,
    }, doc, current));
  }

  const items = [...byId.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return options?.includeInactive ? items : items.filter((item) => item.isActive);
}

export interface BookingOfferService {
  id: string;
  name: string;
  category: Service["category"];
  price: number;
  description: string;
  features?: string[];
  isPopular?: boolean;
  highlights?: string;
  phase?: 1 | 2;
  image?: string;
  imageAlt?: string;
}

export interface BookingOffer {
  services: BookingOfferService[];
  basics: CatalogItem[];
  photoOnlyPackages: CatalogItem[];
  apprenticeshipPackages: CatalogItem[];
  addOns: Array<{ category: string; items: CatalogItem[] }>;
  iconicFinish?: CatalogItem;
  virtualStaging?: CatalogItem;
  specializedSocial?: CatalogItem;
  specializedBoth?: CatalogItem;
}

function offerItem(pkg: StaffCatalogPackage, presentation?: CatalogItem): CatalogItem {
  return {
    id: pkg.id,
    name: pkg.name,
    price: pkg.price,
    description: pkg.description || presentation?.description || "",
    features: pkg.includedServices.length ? pkg.includedServices : presentation?.features,
    appointmentLimit: pkg.appointmentLimit || presentation?.appointmentLimit,
    aside: pkg.aside || presentation?.aside,
    kicker: pkg.kicker || presentation?.kicker,
    cardTitle: pkg.cardTitle || presentation?.cardTitle,
    rules: pkg.rules?.length ? pkg.rules : presentation?.rules,
  };
}

/** Public booking copy when a catalog price is $0 or missing. */
export const CALL_FOR_PRICING_LABEL = "Call for pricing";

/**
 * The only public-booking price rule.
 * A package or add-on is on /book only when its price is a finite number above zero.
 * Missing, null, blank, NaN, and anything <= 0 stay off the public flow.
 */
export function isPubliclyBookable(item: { price?: unknown } | null | undefined): boolean {
  if (!item || typeof item !== "object") return false;
  const price = item.price;
  const amount = typeof price === "number"
    ? price
    : typeof price === "string" && price.trim()
      ? Number(price)
      : Number.NaN;
  return Number.isFinite(amount) && amount > 0;
}

/** True when a catalog price can be charged on the public booking form. */
export function catalogPriceIsBookable(price: unknown): boolean {
  return isPubliclyBookable({ price });
}

function collectBookingOffer(
  catalog: StaffCatalogPackage[],
  include: (pkg: StaffCatalogPackage) => boolean,
): BookingOffer {
  const servicesOut: BookingOfferService[] = [];
  const basics: CatalogItem[] = [];
  const addOnBuckets = new Map<string, CatalogItem[]>();

  for (const pkg of catalog) {
    if (!include(pkg)) continue;
    if (pkg.bookingKind === "service") {
      const known = services.find((entry) => entry.id === pkg.id || entry.id === pkg.bookingId);
      const category = pkg.serviceCategory || known?.category;
      if (!category || !SERVICE_CATEGORIES.has(category)) continue;
      servicesOut.push({
        id: pkg.id,
        name: pkg.name,
        category,
        price: pkg.price,
        description: pkg.description || known?.description || "",
        features: pkg.includedServices.length ? pkg.includedServices : known?.features,
        isPopular: known?.isPopular,
        highlights: known?.highlights,
        phase: known?.phase,
        ...(known?.image ? { image: known.image, imageAlt: known.imageAlt || pkg.name } : {}),
      });
      continue;
    }

    if (pkg.bookingKind === "basic") {
      if (isRetiredPublicPhotoPackage(pkg.id) || isRetiredPublicPhotoPackage(pkg.bookingId)) continue;
      const known = basicsList.find((entry) => entry.id === pkg.id || entry.id === pkg.bookingId);
      basics.push(offerItem(pkg, known));
      continue;
    }

    if (pkg.bookingKind === "addon") {
      const known = findAddOn(pkg.id) || findAddOn(pkg.bookingId);
      const group = pkg.addonGroup || addOns.find((entry) => entry.items.some((item) => item.id === pkg.id || item.id === pkg.bookingId))?.category || "More";
      const list = addOnBuckets.get(group) || [];
      list.push(offerItem(pkg, known));
      addOnBuckets.set(group, list);
    }
  }

  const orderedGroups = [
    ...addOns.map((entry) => entry.category),
    ...[...addOnBuckets.keys()].filter((group) => !addOns.some((entry) => entry.category === group)),
  ];
  const upgrade = (id: string) => {
    const pkg = catalog.find((entry) => (entry.id === id || entry.bookingId === id) && include(entry));
    return pkg ? offerItem(pkg, UPGRADES.find((entry) => entry.id === id)) : undefined;
  };

  return {
    services: servicesOut,
    basics,
    photoOnlyPackages: basics.filter((item) => !isApprenticeshipPackage(item.id)),
    apprenticeshipPackages: basics.filter((item) => isApprenticeshipPackage(item.id)),
    addOns: orderedGroups
      .filter((group) => addOnBuckets.has(group))
      .map((category) => ({ category, items: addOnBuckets.get(category) || [] })),
    iconicFinish: upgrade("iconic-finish"),
    virtualStaging: upgrade("virtual-staging"),
    specializedSocial: upgrade("specialized-social"),
    specializedBoth: upgrade("specialized-both"),
  };
}

/** Selectable booking lists. A missing, blank, NaN, or non-positive price is left out. */
export function bookingOffer(catalog: StaffCatalogPackage[] = packagesForStaffEditor([])): BookingOffer {
  return collectBookingOffer(catalog, (pkg) => isPubliclyBookable(pkg));
}

/** Active catalog rows waiting on a real price. They stay off /book until the price is above zero. */
export function bookingPriceHolds(catalog: StaffCatalogPackage[] = packagesForStaffEditor([])): BookingOffer {
  return collectBookingOffer(catalog, (pkg) => !isPubliclyBookable(pkg));
}

export interface PublicBookingCatalogResponse {
  packages: StaffCatalogPackage[];
}

/** Catalog payload for the public booking page. Unpriced rows are already removed. */
export function publicBookingCatalogResponse(
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): PublicBookingCatalogResponse {
  return {
    packages: catalog.filter((item) =>
      isPubliclyBookable(item)
      && !isRetiredPublicPhotoPackage(item.id)
      && !isRetiredPublicPhotoPackage(item.bookingId),
    ),
  };
}

/**
 * `?package=` / `?service=` selection for /book.
 * A catalog row that is not publicly bookable clears the selection so the normal picker shows.
 * An id that is not in the catalog is left as typed.
 */
export function resolvePublicPackageDeepLink(
  requestedId: string,
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): { selectedId: string; hidden: boolean } {
  const key = requestedId.trim();
  if (!key) return { selectedId: "", hidden: false };
  if (isRetiredPublicPhotoPackage(key)) return { selectedId: "", hidden: true };
  const item = catalog.find((entry) => entry.id === key || entry.bookingId === key);
  if (!item) return { selectedId: key, hidden: false };
  if (!isPubliclyBookable(item)) return { selectedId: "", hidden: true };
  return { selectedId: item.id, hidden: false };
}

/**
 * Where a `/book?package=` id belongs on the form.
 * Photo-only and apprenticeship packages open The Basics and land in selectedBasics.
 * Campaign tiers stay on selectedService.
 */
export function publicPackageDeepLinkSelection(
  requestedId: string,
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): { selectedService: string; selectedBasics: string[]; showBasics: boolean; hidden: boolean } {
  const link = resolvePublicPackageDeepLink(requestedId, catalog);
  if (!link.selectedId || link.hidden) {
    return { selectedService: "", selectedBasics: [], showBasics: false, hidden: link.hidden };
  }
  const basic = bookingOffer(catalog).basics.find((item) => item.id === link.selectedId);
  if (basic) {
    return { selectedService: "", selectedBasics: [basic.id], showBasics: true, hidden: false };
  }
  return { selectedService: link.selectedId, selectedBasics: [], showBasics: false, hidden: false };
}

export interface CatalogPackageEdits {
  name: string;
  price: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface CatalogPackageDraft {
  id: string;
  name: string;
  price: number;
  description: string;
  bookingKind: BookingCatalogKind;
  category: BookingPackageCategory;
  serviceCategory?: string;
  addonGroup?: string;
}

export type CatalogWriteResult =
  | { ok: true; id: string; data: Record<string, unknown> }
  | { ok: false; error: string };

function moneyAmount(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100) / 100;
}

/** Fields written back onto an existing `packages` doc. Seed notes stay unless the editor replaces them. */
export function catalogPackageSaveData(item: StaffCatalogPackage, edits: CatalogPackageEdits): CatalogWriteResult {
  const name = edits.name.trim();
  if (!name) return { ok: false, error: "Package name is required." };
  const price = moneyAmount(Number(edits.price));
  if (price == null) return { ok: false, error: "Price must be zero or more." };
  const sortOrder = Number(edits.sortOrder);
  const data: Record<string, unknown> = {
    name,
    price,
    description: edits.description.trim(),
    isActive: edits.isActive,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : item.sortOrder,
    tier: item.tier,
    category: item.category,
    bookingId: item.bookingId || item.id,
    bookingKind: item.bookingKind,
    includedServices: item.includedServices,
    source: "booking-catalog",
  };
  if (item.appointmentLimit) data.appointmentLimit = item.appointmentLimit;
  if (item.overage) data.overage = item.overage;
  if (item.rules?.length) data.rules = item.rules;
  if (item.serviceCategory) data.serviceCategory = item.serviceCategory;
  if (item.addonGroup) data.addonGroup = item.addonGroup;
  if (item.cardTitle) data.cardTitle = item.cardTitle;
  if (item.kicker) data.kicker = item.kicker;
  if (item.aside) data.aside = item.aside;
  return { ok: true, id: item.id, data };
}

const PACKAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A new product in the same `packages` collection the booking form reads. */
export function newCatalogPackageData(draft: CatalogPackageDraft): CatalogWriteResult {
  const id = draft.id.trim().toLowerCase();
  if (!PACKAGE_ID.test(id)) {
    return { ok: false, error: "Use a short id with lowercase letters, numbers, and dashes." };
  }
  const name = draft.name.trim();
  if (!name) return { ok: false, error: "Package name is required." };
  const price = moneyAmount(Number(draft.price));
  if (price == null) return { ok: false, error: "Price must be zero or more." };
  if (!PACKAGE_KINDS.has(draft.bookingKind)) return { ok: false, error: "Choose a package kind." };
  if (!PACKAGE_CATEGORIES.has(draft.category)) return { ok: false, error: "Choose a category." };
  const serviceCategory = catalogServiceCategory(draft.serviceCategory);
  if (draft.bookingKind === "service" && !serviceCategory) {
    return { ok: false, error: "Choose which booking group this package belongs in." };
  }
  const tier: BookingPackageTier = draft.bookingKind === "service"
    ? "campaign"
    : draft.bookingKind === "basic"
      ? "basic"
      : "addon";
  const data: Record<string, unknown> = {
    name,
    price,
    description: draft.description.trim(),
    isActive: true,
    sortOrder: 1000,
    tier,
    category: draft.category,
    bookingId: id,
    bookingKind: draft.bookingKind,
    includedServices: [],
    source: "booking-catalog",
  };
  if (serviceCategory) data.serviceCategory = serviceCategory;
  const addonGroup = catalogText(draft.addonGroup);
  if (draft.bookingKind === "addon") data.addonGroup = addonGroup || "More";
  return { ok: true, id, data };
}

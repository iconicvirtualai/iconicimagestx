/**
 * Hardcoded booking catalog.
 * Prices come from the public booking form lists and client/lib/services.ts.
 * Do not seed or charge from AdminCurrentPricing — those numbers disagree.
 * Life of the Listing Care is intentionally absent: it stays an unpriced boolean.
 */

import { services, type Service } from "../client/lib/services.ts";

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  description: string;
  features?: string[];
}

export const basicsList: CatalogItem[] = [
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
];

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
        price: 99,
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
    ],
  },
  {
    category: "The Brand",
    items: [
      {
        id: "agent-intro",
        name: "Agent Intro/Outro",
        price: 75,
        description: "Put a face to the brand with a professional on-camera introduction.",
        features: ["On-Camera Greeting", "Professional Audio Setup", "Call-to-Action Closing"],
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

export function promoDiscountFor(raw: string): { code: PromoCode; discount: number } | null {
  const code = raw.trim().toUpperCase();
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

export function hardcodedChargePrice(id: string): number | undefined {
  const service = services.find((entry) => entry.id === id);
  if (service) return service.price;
  const basic = basicsList.find((entry) => entry.id === id);
  if (basic) return basic.price;
  const addon = findAddOn(id);
  if (addon) return addon.price;
  const upgrade = UPGRADES.find((entry) => entry.id === id);
  if (upgrade) return upgrade.price;
  return undefined;
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

  return docs;
}

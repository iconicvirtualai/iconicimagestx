/**
 * Sales-page slots for /pay-at-close.
 * Dollar amounts are not stored here. They are read from the packages catalog
 * (the same list the Prices tab writes).
 */

import type { StaffCatalogPackage } from "./bookingCatalog.ts";

export const TITUS_ESTIMATE_URL = "https://www.gotitus.com/estimate/iconic-images-media-marketing";

export interface PayAtCloseCardSlot {
  id: string;
  calcId: string;
  badge?: string;
  badgeGold?: boolean;
  featured?: boolean;
  priceNote: string;
  confirmWithPartner?: boolean;
  image: string;
  imageAlt: string;
  blurb: string;
  features: string[];
  button: "teal" | "primary";
  calcMeta: string;
  inCalculator: boolean;
  onGrid: boolean;
}

export const PAY_AT_CLOSE_CARD_SLOTS: readonly PayAtCloseCardSlot[] = [
  {
    id: "listing-showcase",
    calcId: "showcase",
    badge: "Most ordered upgrade",
    featured: true,
    priceNote: "per listing",
    image: "/media/pay-at-close/luxury/marias/07-grand-interior.jpg",
    imageAlt: "Grand interior of a 10,000+ sq ft estate",
    blurb: "Complete visual deep-dive — details, angles, atmosphere.",
    features: ["50 images · 5 aerials", "Snap Reel + 60s Iconic 3D reel", "2D floorplan · 2 twilight renders", "Same-day delivery*"],
    button: "teal",
    calcMeta: "50 imgs · aerials · reels",
    inCalculator: true,
    onGrid: true,
  },
  {
    id: "listing-legacy",
    calcId: "legacy",
    badge: "Cinematic",
    badgeGold: true,
    priceNote: "per listing",
    image: "/media/pay-at-close/luxury/marias/05-pool-day.jpg",
    imageAlt: "Daytime pool at a luxury estate",
    blurb: "Our highest level of care — a full cinematic property experience.",
    features: ["Full images + full aerials", "90s 4K cinematic video with aerial", "Snap Reel + 60s Iconic 3D reel", "5 twilight renders · agent on camera"],
    button: "primary",
    calcMeta: "4K cinema · full aerials",
    inCalculator: true,
    onGrid: true,
  },
  {
    id: "listing-market-leader",
    calcId: "market-leader",
    badge: "VIP · Top ticket",
    badgeGold: true,
    priceNote: "per listing",
    image: "/media/pay-at-close/luxury/shore/01-aerial-lake.jpg",
    imageAlt: "Waterfront estate from the air",
    blurb: "Full-cycle media takeover. The package that owns the market.",
    features: ["Full images + aerials + Snap Reel", "90s 4K cinema · VR / Matterport", "5 twilight renders · Iconic Finish", "Post-sale marketing package"],
    button: "primary",
    calcMeta: "VR · post-sale · VIP",
    inCalculator: true,
    onGrid: true,
  },
  {
    id: "luxe-video",
    calcId: "luxe-video",
    priceNote: "per listing",
    image: "/media/pay-at-close/luxury/pool-rd/02-backyard-pool.jpg",
    imageAlt: "Resort backyard at a luxury estate",
    blurb: "Standout-home coverage with a listing video and premium edits.",
    features: ["50 listing photos · 5 aerials", "Listing video", "Premium editing package"],
    button: "primary",
    calcMeta: "50 photos · listing video",
    inCalculator: true,
    onGrid: true,
  },
  {
    id: "branding-content-partner",
    calcId: "content-partner",
    priceNote: "per month",
    confirmWithPartner: true,
    image: "/media/pay-at-close/luxury/marias/08-kitchen.jpg",
    imageAlt: "Kitchen in a 10,000+ sq ft estate",
    blurb: "30 days of content in 2 hours. Never wonder what to post.",
    features: ["2-hour monthly film day", "20 custom reels", "Strategy, scripting & direction"],
    button: "primary",
    calcMeta: "20 reels / month",
    inCalculator: true,
    onGrid: true,
  },
  {
    id: "branding-local-legend",
    calcId: "local-legend",
    badge: "Campaign",
    badgeGold: true,
    priceNote: "per campaign",
    confirmWithPartner: true,
    image: "/media/pay-at-close/luxury/pool-rd/07-front-day.jpg",
    imageAlt: "Daytime front of a luxury estate",
    blurb: "Market takeover. Your story, told cinematically.",
    features: ["6–8 hour signature production day", "90s 4K bio film", "5 neighborhood authority spots"],
    button: "primary",
    calcMeta: "Bio film campaign",
    inCalculator: true,
    onGrid: true,
  },
  {
    id: "listing-essentials",
    calcId: "essentials",
    priceNote: "per listing",
    image: "/media/pay-at-close/luxury/marias/06-aerial-day.jpg",
    imageAlt: "Aerial of a 10,000+ sq ft estate",
    blurb: "Clean, bright, and ready to post.",
    features: ["30 images", "Snap Reel", "Twilight render"],
    button: "primary",
    calcMeta: "30 imgs · Snap Reel",
    inCalculator: true,
    onGrid: false,
  },
] as const;

export interface PayAtCloseAddonSlot {
  id: string;
  meta: string;
  credits?: boolean;
}

export const PAY_AT_CLOSE_ADDON_SLOTS: readonly PayAtCloseAddonSlot[] = [
  { id: "aerial-premium", meta: "90s 4K aerial film" },
  { id: "aerial-drone", meta: "5 high-res aerials" },
  { id: "iconic-polish", meta: "Premium digital finish" },
  { id: "virtual-staging", meta: "per credit", credits: true },
];

export interface PricedPayAtCloseSlot {
  id: string;
  name: string;
  description: string;
  price: number | null;
  features: string[];
}

export function catalogPackage(catalog: StaffCatalogPackage[], id: string): StaffCatalogPackage | undefined {
  return catalog.find((item) => item.id === id || item.bookingId === id);
}

export function pricedSlot(catalog: StaffCatalogPackage[], id: string, fallback: { blurb: string; features: string[] }): PricedPayAtCloseSlot {
  const item = catalogPackage(catalog, id);
  const features = item?.includedServices?.length ? item.includedServices.slice(0, 4) : fallback.features;
  return {
    id,
    name: item?.name || id,
    description: item?.description || fallback.blurb,
    price: item && Number.isFinite(item.price) ? item.price : null,
    features,
  };
}

export function bookPayAtCloseHref(packageId?: string): string {
  if (!packageId) return "/book?payment=pay-at-close";
  return `/book?payment=pay-at-close&package=${encodeURIComponent(packageId)}`;
}

export function formatCatalogDollars(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded.toLocaleString("en-US")}`;
  return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ESTATE_MEDIA = "/media/pay-at-close/luxury";

export interface PayAtCloseEstateStill {
  src: string;
  alt: string;
  caption: string;
}

export interface PayAtCloseEstateReel {
  src: string;
  poster: string;
  alt: string;
  /** Seconds. A reel that opens on twilight must start on a bright frame, never at 0. */
  startAt: number;
  caption: string;
}

export interface PayAtCloseEstate {
  id: string;
  /** Wide daylight still in the feature row. Omit for a gallery-only estate. */
  feature?: PayAtCloseEstateStill;
  /** Vertical reel in the feature row. Omit when this estate has no reel. */
  reel?: PayAtCloseEstateReel;
  /** Gallery stills. An empty list is not rendered. */
  gallery: readonly PayAtCloseEstateStill[];
}

/**
 * Homes on /pay-at-close. Add the next estate by dropping its images into
 * public/media/pay-at-close/luxury/<id>/ and appending one object here.
 * Leave feature and reel off when that estate is only stills.
 */
export const PAY_AT_CLOSE_ESTATES: readonly PayAtCloseEstate[] = [
  {
    id: "marias",
    reel: {
      src: `${ESTATE_MEDIA}/marias/MariasWay_MarketingSnap_v1.mp4`,
      poster: `${ESTATE_MEDIA}/marias/poster-snap.jpg`,
      alt: "Vertical reel of a bright estate interior",
      startAt: 1.2,
      caption: "10,000+ sq ft estate",
    },
    gallery: [
      {
        src: `${ESTATE_MEDIA}/marias/01-front-day.jpg`,
        alt: "Daytime front of a 10,000+ sq ft estate",
        caption: "10,000+ sq ft estate",
      },
      {
        src: `${ESTATE_MEDIA}/marias/06-aerial-day.jpg`,
        alt: "Aerial of a luxury estate",
        caption: "Estate from the air",
      },
    ],
  },
  {
    id: "shore",
    gallery: [
      {
        src: `${ESTATE_MEDIA}/shore/01-aerial-lake.jpg`,
        alt: "Waterfront estate from the air",
        caption: "Waterfront estate",
      },
    ],
  },
  {
    id: "pool-rd",
    feature: {
      src: `${ESTATE_MEDIA}/pool-rd/02-backyard-pool.jpg`,
      alt: "Resort backyard at a luxury estate",
      caption: "Resort backyard",
    },
    gallery: [
      {
        src: `${ESTATE_MEDIA}/pool-rd/07-front-day.jpg`,
        alt: "Daytime front of a luxury estate",
        caption: "Estate arrival",
      },
    ],
  },
];

export type PayAtCloseFeature =
  | { kind: "still"; key: string; still: PayAtCloseEstateStill }
  | { kind: "reel"; key: string; reel: PayAtCloseEstateReel };

/** Wide stills first, then vertical reels. Entries without a src are dropped. */
export function payAtCloseFeatureRow(estates: readonly PayAtCloseEstate[]): PayAtCloseFeature[] {
  const stills: PayAtCloseFeature[] = [];
  const reels: PayAtCloseFeature[] = [];
  for (const estate of estates) {
    if (estate.feature?.src) stills.push({ kind: "still", key: `${estate.id}-feature`, still: estate.feature });
    if (estate.reel?.src && estate.reel.startAt > 0) {
      reels.push({ kind: "reel", key: `${estate.id}-reel`, reel: estate.reel });
    }
  }
  return [...stills, ...reels];
}

export function payAtCloseEstateGallery(estates: readonly PayAtCloseEstate[]): Array<PayAtCloseEstateStill & { key: string }> {
  return estates.flatMap((estate) =>
    estate.gallery.filter((shot) => shot.src).map((shot, index) => ({ ...shot, key: `${estate.id}-gallery-${index}` })),
  );
}

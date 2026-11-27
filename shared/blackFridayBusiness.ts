/**
 * Black Friday business social packages.
 * Flat price, paid in full. No processing fee is added.
 * New checkouts close Friday, Nov 27, 2026 at 11:59:59 PM Central.
 */

export const BLACK_FRIDAY_BUSINESS_SOURCE = "black-friday-business";
export const BLACK_FRIDAY_BUSINESS_TIME_ZONE = "America/Chicago";

/**
 * Fri Nov 27, 2026, 11:59:59 PM Central (UTC-6).
 * The whole second stays open. 12:00:00 AM CT is closed.
 */
export const BLACK_FRIDAY_BUSINESS_ENDS_AT = "2026-11-27T23:59:59-06:00";
export const BLACK_FRIDAY_BUSINESS_ENDS_MS = Date.parse(BLACK_FRIDAY_BUSINESS_ENDS_AT);

export const BLACK_FRIDAY_BUSINESS_HEADLINE = "Socials Done For You. Now Go Back to Work.";
export const BLACK_FRIDAY_BUSINESS_REFERRAL =
  "Share this with a colleague and get $200 in your account when they purchase!";

export const BLACK_FRIDAY_BUSINESS_SEO_TITLE = "Socials Done For You | Iconic Images";
export const BLACK_FRIDAY_BUSINESS_SEO_DESCRIPTION =
  "Prepaid Black Friday social packages from Iconic Images. The Content Blitz is $2,000, The Growth Engine is $2,500, and The 90-Day Domination is $6,000. Paid in full. Ends Friday, Nov 27, 2026 at 11:59pm CT.";

/** Shown on the page and repeated on every package card. */
export const BLACK_FRIDAY_BUSINESS_SHARED = [
  "100% remote — available everywhere",
  "Use whenever you're ready, or transfer to another business",
  "We use your brand, logos, and marketing — and enhance/build your strategy",
  "1 designated HUMAN account manager",
  "Client Portal access to review/approve content & use your Idea Bank",
] as const;

export const BLACK_FRIDAY_BUSINESS_PACKAGE_IDS = ["blitz", "growth", "domination"] as const;
export type BlackFridayBusinessPackageId = (typeof BLACK_FRIDAY_BUSINESS_PACKAGE_IDS)[number];

export interface BlackFridayBusinessPackage {
  id: BlackFridayBusinessPackageId;
  name: string;
  priceCents: number;
  normalCents: number;
  badge: string | null;
  summary: string;
  features: readonly string[];
}

export const BLACK_FRIDAY_BUSINESS_PACKAGES: readonly BlackFridayBusinessPackage[] = [
  {
    id: "blitz",
    name: "The Content Blitz",
    priceCents: 200_000,
    normalCents: 350_000,
    badge: null,
    summary: "30 total content pieces a month, including 15 Reels.",
    features: [
      "30 total content pieces/mo (including 15 Reels)",
      "Posting on IG, Facebook, and TikTok",
      "Community engagement",
      "Brand kit alignment",
    ],
  },
  {
    id: "growth",
    name: "The Growth Engine",
    priceCents: 250_000,
    normalCents: 500_000,
    badge: "BEST DEAL",
    summary: "60 total content pieces a month, including 30 Reels.",
    features: [
      "60 total content pieces/mo (including 30 Reels)",
      "Posting on IG, Facebook, TikTok, LinkedIn, and YouTube Shorts",
      "Daily engagement",
      "Call routing and lead capture",
      "Brand-uniformed templates",
    ],
  },
  {
    id: "domination",
    name: "The 90-Day Domination",
    priceCents: 600_000,
    normalCents: 1_650_000,
    badge: null,
    summary: "Three months locked in, with a local Content Day.",
    features: [
      "3 full months locked in (180 total content pieces including 90 Reels)",
      "Iconic finds and books a vetted local video crew in their city for a dedicated Content Day",
      "Call routing",
      "Daily engagement",
      "Priority turnaround",
    ],
  },
];

export interface BlackFridayBusinessQuote {
  id: BlackFridayBusinessPackageId;
  name: string;
  subtotalCents: number;
  processingCents: 0;
  processingPercent: 0;
  totalCents: number;
}

export function blackFridayBusinessOpen(now = Date.now()): boolean {
  return now < BLACK_FRIDAY_BUSINESS_ENDS_MS + 1000;
}

export function blackFridayBusinessPackage(id: string): BlackFridayBusinessPackage | null {
  const key = id.trim().toLowerCase();
  return BLACK_FRIDAY_BUSINESS_PACKAGES.find((item) => item.id === key) ?? null;
}

/** Package price only. The processing percent is 0, so the total matches the card. */
export function quoteBlackFridayBusiness(id: string): BlackFridayBusinessQuote | null {
  const item = blackFridayBusinessPackage(id);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    subtotalCents: item.priceCents,
    processingCents: 0,
    processingPercent: 0,
    totalCents: item.priceCents,
  };
}

export function formatBusinessCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function blackFridayBusinessCheckoutPath(id: BlackFridayBusinessPackageId): string {
  return `/black-friday-business?package=${id}`;
}

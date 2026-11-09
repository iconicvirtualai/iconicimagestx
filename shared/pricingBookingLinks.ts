/**
 * /pricing Book and Order buttons.
 * A button books only when the packages doc is active and priced.
 * Studio Noir and Studio Blanc stay on the Studio 105 request form.
 * Anything else without a live price goes to /contact.
 */

import {
  isPubliclyBookable,
  isRetiredPublicPhotoPackage,
  packagesForStaffEditor,
  publicPackageDeepLinkSelection,
  type StaffCatalogPackage,
} from "./bookingCatalog.ts";
import { isStudioRoomId, studioRoomRequestHref } from "./studio105.ts";

export type PricingCtaKind = "book" | "consult" | "studio-request";

export type PricingCta = {
  label: string;
  /** packages collection id, including ids that are not bookable yet. */
  packageId: string;
  /** Short name for the contact subject. */
  name: string;
  href: string;
  kind: PricingCtaKind;
};

/** Premium toggle on /book. Same charge as iconic-finish. */
export const PRICING_ICONIC_FINISH_ID = "iconic-finish";

const SPECIALIZED_IDS = new Set(["specialized-social", "specialized-both"]);

function catalogItem(id: string, catalog: StaffCatalogPackage[]): StaffCatalogPackage | undefined {
  return catalog.find((entry) => entry.id === id || entry.bookingId === id);
}

export function pricingConsultHref(packageId: string): string {
  const params = new URLSearchParams();
  params.set("package", packageId);
  return `/contact?${params.toString()}`;
}

function canBook(id: string, catalog: StaffCatalogPackage[]): StaffCatalogPackage | null {
  if (isRetiredPublicPhotoPackage(id)) return null;
  const item = catalogItem(id, catalog);
  if (!item || item.isActive === false || !isPubliclyBookable(item)) return null;
  if (isRetiredPublicPhotoPackage(item.id) || isRetiredPublicPhotoPackage(item.bookingId)) return null;
  return item;
}

/** Campaign, photo, or add-on deep link. Studio rooms and unpriced ids do not use /book. */
export function pricingServiceHref(packageId: string, catalog: StaffCatalogPackage[] = packagesForStaffEditor([])): string {
  if (isStudioRoomId(packageId)) return studioRoomRequestHref(packageId);
  const item = canBook(packageId, catalog);
  if (!item) return pricingConsultHref(packageId);
  const selection = publicPackageDeepLinkSelection(item.id, catalog);
  if (selection.hidden || (!selection.selectedService && selection.selectedBasics.length === 0)) {
    return pricingConsultHref(packageId);
  }
  if (selection.showBasics) {
    return pricingBasicsHref(selection.selectedBasics, false, catalog) ?? pricingConsultHref(packageId);
  }
  return `/book?service=${encodeURIComponent(selection.selectedService)}`;
}

/**
 * Basics and add-ons chosen on /pricing.
 * Returns null when nothing bookable is selected, so the button does not open a bare /book.
 */
export function pricingBasicsHref(
  ids: Array<string | null | undefined>,
  premium = false,
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): string | null {
  const clean = ids.map((id) => (id || "").trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const apprentice = clean.some((id) => id.startsWith("apprentice-"));
  if (apprentice && clean.length !== 1) return null;
  const picked: StaffCatalogPackage[] = [];
  for (const id of clean) {
    const item = canBook(id, catalog);
    if (!item) return null;
    const selectable = item.bookingKind === "basic"
      || item.bookingKind === "addon"
      || SPECIALIZED_IDS.has(item.id);
    if (!selectable) return null;
    picked.push(item);
  }
  if (!picked.some((item) => item.bookingKind === "basic")) return null;
  const query = [`items=${clean.join(",")}`];
  if (premium && !apprentice) query.push("premium=true");
  return `/book?${query.join("&")}`;
}

/** Package ids a /pricing href will preselect. Premium adds Iconic Finish. */
export function pricingBookPackageIds(href: string): string[] {
  const url = new URL(href, "https://iconic.local");
  if (url.pathname === "/studio-105/book") {
    const room = url.searchParams.get("room") || "";
    return isStudioRoomId(room) ? [room] : [];
  }
  if (url.pathname !== "/book") return [];
  const service = (url.searchParams.get("service") || url.searchParams.get("package") || "").trim();
  const items = (url.searchParams.get("items") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const ids = [...(service ? [service] : []), ...items];
  if (url.searchParams.get("premium") === "true") ids.push(PRICING_ICONIC_FINISH_ID);
  return ids;
}

const CTA_ROWS: Array<[label: string, packageId: string, name: string]> = [
  ["START MY MOMENTUM", "listing-essentials", "The Essentials"],
  ["TELL THE FULL STORY", "listing-showcase", "The Showcase"],
  ["BUILD MY LEGACY", "listing-legacy", "The Legacy"],
  ["ORDER VIP ACCESS", "listing-market-leader", "The Market Leader"],
  ["UPGRADE MY IMAGE", "branding-refresh", "The Refresh"],
  ["CREATE MY CONTENT", "branding-content-partner", "The Content Partner"],
  ["BUILD MY EMPIRE", "branding-local-legend", "The Local Legend"],
  ["SIMPLIFY MY SOCIAL", "business-baseline", "The Baseline"],
  ["UNLOCK MY GROWTH", "business-growth-engine", "The Growth Engine"],
  ["SECURE MY SUITE", "business-professional-suite", "The Professional Suite"],
  ["ELEVATE MY BRAND", "business-signature-tier", "The Signature Tier"],
  ["PARTNER WITH ICONIC", "business-iconic-partnership", "The Iconic Partnership"],
  ["REACH MY DATABASE", "business-connected-core", "The Connected Core"],
  ["BECOME OMNIPRESENT", "business-authority-stack", "The Authority Stack"],
  ["START MY FOUNDATION →", "growth-foundation", "The Foundation"],
  ["START MY EVOLUTION →", "growth-evolution", "The Evolution"],
  ["LET'S CHAT", "growth-bundle", "The Bundle"],
  ["Book Studio Noir", "studio-noir", "Studio Noir"],
  ["Book Studio Blanc", "studio-blanc", "Studio Blanc"],
];

export const PRICING_SERVICE_CTAS: PricingCta[] = CTA_ROWS.map(([label, packageId, name]) => {
  const href = pricingServiceHref(packageId);
  const kind: PricingCtaKind = href.startsWith("/studio-105")
    ? "studio-request"
    : href.startsWith("/book")
      ? "book"
      : "consult";
  return { label, packageId, name, href, kind };
});

export function pricingCta(packageId: string): PricingCta {
  const found = PRICING_SERVICE_CTAS.find((item) => item.packageId === packageId);
  if (!found) throw new Error(`Missing pricing CTA for ${packageId}`);
  return found;
}

/** Subject prefill for a /contact?package= visit. Blank when the id is not a pricing consult. */
export function pricingConsultSubject(packageId: string | null | undefined): string {
  const id = (packageId || "").trim();
  const cta = PRICING_SERVICE_CTAS.find((item) => item.packageId === id && item.kind === "consult");
  return cta ? `Pricing: ${cta.name}` : "";
}

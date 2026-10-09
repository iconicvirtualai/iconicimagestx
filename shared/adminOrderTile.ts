/**
 * Admin order tile view model.
 * Package name, client skin, and price come from shared/packageSkins.ts.
 * Paid, delivery, client, location, studio, and appointment stay admin-only.
 */

import { addressText, calendarDateKey } from "./clientHome.ts";
import { formatShootDateLabel } from "./listingCard.ts";
import { cleanPackageName, orderChargeSummary, orderServiceLines } from "./orderPackageLines.ts";
import {
  clientSkinLabel,
  packagePriceDisplay,
  resolvePackageSkinFromOrder,
  type PackageSkin,
} from "./packageSkins.ts";

export type PackageKind = "listing" | "business";

export const ADMIN_STUDIOS = [
  { id: "studio-noir", label: "Studio Noir" },
  { id: "studio-blanc", label: "Studio Blanc" },
  { id: "podcast-studio", label: "Podcast Studio" },
  { id: "offsite", label: "Offsite" },
] as const;

export type AdminStudioId = (typeof ADMIN_STUDIOS)[number]["id"];

export type AdminPaidState = "paid" | "unpaid" | "partial";
export type AdminDeliveryState = "delivered" | "in_progress" | "not_delivered";

export interface AdminOrderTileModel {
  id: string;
  orderCode: string;
  kind: PackageKind;
  typeLabel: "Listing" | "Business";
  heroUrl: string;
  heroAlt: string;
  packageName: string;
  skinLabel: string;
  priceLabel: string;
  priceNote: string;
  paid: AdminPaidState;
  paidLabel: "Paid" | "Unpaid" | "Partial";
  delivery: AdminDeliveryState;
  deliveryLabel: "Delivered" | "In progress" | "Not delivered";
  clientName: string;
  appointmentDate: string;
  location: string;
  /** Business orders always select one studio. Listing orders omit the row. */
  studio: AdminStudioId | null;
  channel: string;
}

export const LISTING_HERO = "/media/launch/hero_day_exterior_front.jpg";
export const BUSINESS_HERO = "/media/photos/lifestyle-mtz04327.jpg";
export const BRAND_SESSION_LOCATION = "N/A — brand session";

const PAID_LABEL: Record<AdminPaidState, AdminOrderTileModel["paidLabel"]> = {
  paid: "Paid",
  unpaid: "Unpaid",
  partial: "Partial",
};

const DELIVERY_LABEL: Record<AdminDeliveryState, AdminOrderTileModel["deliveryLabel"]> = {
  delivered: "Delivered",
  in_progress: "In progress",
  not_delivered: "Not delivered",
};

export function buildAdminOrderTile(record: Record<string, unknown>): AdminOrderTileModel {
  const lines = orderServiceLines(record);
  const priced = lines.length > 0 ? { ...record, lineItems: lines, services: lines } : record;
  const skin = resolvePackageSkinFromOrder(priced);
  const kind = orderKind(priced, skin);
  const studio = kind === "business" ? studioFromRecord(priced) : null;
  const heroUrl = heroFromRecord(record) || (kind === "business" ? BUSINESS_HERO : LISTING_HERO);
  const paid = paidState(record);
  const delivery = deliveryState(record);
  const named = lines[0] ? cleanPackageName(lines[0].name) : "";
  const packageName = skin?.title || named || "Custom order";
  const charges = orderChargeSummary(record, lines);
  return {
    id: text(record.id) || packageName,
    orderCode: orderCode(kind, record),
    kind,
    typeLabel: kind === "business" ? "Business" : "Listing",
    heroUrl,
    heroAlt: `${packageName} order`,
    packageName,
    skinLabel: skin ? clientSkinLabel(skin) : "Client skin: Custom",
    priceLabel: skin ? packagePriceDisplay(skin) : (lines.length > 0 || charges.total > 0 ? tilePrice(charges.total) : "—"),
    priceNote: skin?.priceNote || "",
    paid,
    paidLabel: PAID_LABEL[paid],
    delivery,
    deliveryLabel: DELIVERY_LABEL[delivery],
    clientName: clientName(record),
    appointmentDate: appointmentLabel(record),
    location: locationLabel(kind, record),
    studio,
    channel: channelFor(skin, kind),
  };
}

export function sampleAdminOrderTiles(): AdminOrderTileModel[] {
  return [
    buildAdminOrderTile({
      id: "10482",
      orderCode: "ORD - L - 10482",
      projectType: "real_estate",
      serviceIds: ["listing-showcase"],
      status: "in_progress",
      invoice: { status: "paid", amountPaid: 549, total: 549 },
      clientName: "Alex Rivera",
      appointmentDate: "2026-01-01",
      address: "123 Main Street, Conroe, TX 77304",
      heroUrl: LISTING_HERO,
    }),
    buildAdminOrderTile({
      id: "22017",
      orderCode: "ORD - B - 22017",
      projectType: "business",
      serviceIds: ["branding-content-partner"],
      status: "delivered",
      invoice: { status: "paid", amountPaid: 999, total: 999 },
      clientName: "Alex Rivera",
      appointmentDate: "2026-01-15",
      address: "",
      studio: "studio-blanc",
      heroUrl: BUSINESS_HERO,
    }),
  ];
}

function orderKind(record: Record<string, unknown>, skin: PackageSkin | null): PackageKind {
  const raw = text(record.projectType || record.orderType || record.type).toLowerCase();
  if (raw === "business" || raw === "brand" || raw === "social") return "business";
  if (raw === "real_estate" || raw === "listing" || raw === "property") return "listing";
  if (skin?.category === "listing") return "listing";
  if (skin) return "business";
  return "listing";
}

function channelFor(skin: PackageSkin | null, kind: PackageKind): string {
  if (skin?.category === "social") return "Social";
  if (skin?.category === "human-brand") return "Human Brand";
  if (skin?.category === "listing") return "Listings & Spaces";
  return kind === "business" ? "Human Brand" : "Listings & Spaces";
}

function orderCode(kind: PackageKind, record: Record<string, unknown>): string {
  const explicit = text(record.orderCode || record.orderNumber || record.displayId);
  if (explicit) return explicit.toUpperCase();
  const id = text(record.id);
  const prefix = kind === "listing" ? "L" : "B";
  const digits = id.replace(/\D/g, "");
  const tail = (digits || id.replace(/[^a-zA-Z0-9]/g, "")).slice(-5).toUpperCase().padStart(5, "0");
  return `ORD - ${prefix} - ${tail}`;
}

function heroFromRecord(record: Record<string, unknown>): string {
  const explicit = text(record.heroUrl) || text(record.coverUrl) || text(record.coverImage);
  if (explicit) return explicit;
  const images = record.images;
  if (!Array.isArray(images)) return "";
  for (const image of images) {
    if (typeof image === "string" && image.trim()) return image.trim();
    if (image && typeof image === "object") {
      const url = text((image as { url?: unknown; thumbnailUrl?: unknown }).url)
        || text((image as { thumbnailUrl?: unknown }).thumbnailUrl);
      if (url) return url;
    }
  }
  return "";
}

function clientName(record: Record<string, unknown>): string {
  const named = text(record.clientName)
    || text(record.customerName)
    || text(record.agentName)
    || [text(record.firstName), text(record.lastName)].filter(Boolean).join(" ");
  return named || "—";
}

function appointmentLabel(record: Record<string, unknown>): string {
  const raw = record.appointmentDate ?? record.apptDate ?? record.scheduledDate ?? record.requestedDate;
  const key = calendarDateKey(raw);
  const date = formatShootDateLabel(key, typeof raw === "string" ? raw : undefined);
  const time = text(record.scheduledTime || record.appointmentTime || record.requestedTime);
  const photographer = text(record.assignedPhotographerName || record.photographerName || record.photographerPreference);
  return [date, time, photographer].filter(Boolean).join(" · ") || "—";
}

function tilePrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded.toLocaleString("en-US")}`;
  return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function locationLabel(kind: PackageKind, record: Record<string, unknown>): string {
  const raw = addressText(record.address || record.propertyAddress || record.shootLocation || record.location);
  if (kind === "business" && isBrandSession(raw)) return BRAND_SESSION_LOCATION;
  return raw || "—";
}

function isBrandSession(value: string): boolean {
  const key = value.trim().toLowerCase();
  if (!key || key === "—" || key === "-" || key === "n/a" || key === "na") return true;
  return /brand session/.test(key);
}

function studioFromRecord(record: Record<string, unknown>): AdminStudioId {
  const explicit = record.studio ?? record.studioId ?? record.room ?? record.shootStudio;
  if (explicit != null && String(explicit).trim()) return resolveAdminStudio(explicit);
  const blob = `${JSON.stringify(record.serviceIds || "")} ${JSON.stringify(record.services || "")}`.toLowerCase();
  if (/studio-blanc|studio blanc/.test(blob)) return "studio-blanc";
  if (/studio-noir|studio noir/.test(blob)) return "studio-noir";
  if (/podcast/.test(blob)) return "podcast-studio";
  return "offsite";
}

export function resolveAdminStudio(value: unknown): AdminStudioId {
  const textValue = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (/noir/.test(textValue)) return "studio-noir";
  if (/blanc/.test(textValue)) return "studio-blanc";
  if (/podcast/.test(textValue)) return "podcast-studio";
  if (/off\s*site|on location/.test(textValue)) return "offsite";
  return "offsite";
}

function paidState(record: Record<string, unknown>): AdminPaidState {
  const invoice = nested(record.invoice);
  const explicit = [record.paymentStatus, record.invoiceStatus, invoice.status]
    .map((value) => normalize(value))
    .join(" ");
  if (/\bpartial\b/.test(explicit) || normalize(record.status) === "partial") return "partial";
  const total = money(invoice.total ?? record.total ?? record.amount);
  const paid = money(invoice.amountPaid ?? record.amountPaid);
  if (paid > 0 && total > 0 && paid + 0.009 < total) return "partial";
  if (/\bpaid\b/.test(explicit) || record.paidAt || (paid > 0 && (total === 0 || paid >= total))) return "paid";
  const status = normalize(record.status);
  if (status === "paid" || status === "delivered_paid") return "paid";
  return "unpaid";
}

function deliveryState(record: Record<string, unknown>): AdminDeliveryState {
  const status = normalize(record.status);
  const delivery = normalize(record.deliveryStatus || record.galleryStatus);
  if (record.deliveredAt || status.includes("delivered") || delivery === "delivered") return "delivered";
  if (
    status === "in_progress"
    || status === "pending"
    || status === "pending_edit"
    || status === "in_review"
    || status === "editing"
    || status === "scheduled"
    || status === "confirmed"
    || status === "appt_scheduled"
    || status === "consult_scheduled"
    || delivery === "pending"
    || delivery === "undelivered"
    || delivery === "in_progress"
    || delivery === "ready_for_review"
  ) return "in_progress";
  return "not_delivered";
}

function nested(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

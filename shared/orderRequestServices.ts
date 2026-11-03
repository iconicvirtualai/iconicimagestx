/**
 * Service rows on the admin order request.
 * Prices and lengths come from the booking catalog (seed, overlaid with
 * Firestore `packages`). A custom line is staff-typed and is not a catalog id.
 * Processing is 2.8% on top of the service subtotal, same as /book.
 * This module does not write Firestore and does not email anyone.
 */

import { apprenticeshipDurationMinutes } from "./apprenticeship.ts";
import { explicitDurationMinutes } from "./bookingAvailability.ts";
import {
  packagesForStaffEditor,
  type BookingCatalogKind,
  type BookingPackageCategory,
  type BookingPackageTier,
  type StaffCatalogPackage,
} from "./bookingCatalog.ts";
import {
  normalizeBookingLineItems,
  separatePromoDiscount,
  type BookingLineItem,
} from "./bookingPricing.ts";
import { ADJUSTMENT_LINE_IDS, adjustmentKind, isPromoInvoiceLine } from "./invoiceFace.ts";
import { computeInvoiceTotals, processingFee } from "./invoiceProcessing.ts";
import { orderServiceLines, type OrderServiceLine } from "./orderPackageLines.ts";
import { isTravelFeeLine } from "./travelZones.ts";

export type CatalogChoiceGroup = "service" | "basic" | "addon" | "upgrade" | "variant";

export const CATALOG_CHOICE_GROUP_ORDER: CatalogChoiceGroup[] = [
  "service",
  "basic",
  "addon",
  "upgrade",
  "variant",
];

export const CATALOG_CHOICE_GROUP_LABELS: Record<CatalogChoiceGroup, string> = {
  service: "Packages",
  basic: "Photo sets",
  addon: "Add-ons",
  upgrade: "Upgrades",
  variant: "Variants",
};

export interface CatalogServiceChoice {
  key: string;
  packageId: string;
  variantId?: string;
  bookingId: string;
  name: string;
  description: string;
  group: CatalogChoiceGroup;
  price: number;
  durationMinutes: number | null;
  bookingKind: BookingCatalogKind;
  category: BookingPackageCategory;
  tier: BookingPackageTier;
}

export interface OrderEditorLine {
  id?: string;
  catalogId?: string;
  variantId?: string;
  name: string;
  description?: string;
  category?: string;
  bookingKind?: string;
  tier?: string;
  unitPrice: number;
  qty: number;
  price: number;
  durationMinutes: number | null;
  custom: boolean;
  /** No catalog match on the last lookup. Tried again when packages load. */
  unlisted?: boolean;
  /** Catalog price before a pencil override on this order. */
  defaultUnitPrice?: number;
  priceOverridden?: boolean;
}

export interface OrderServiceQuoteContext {
  rawLineItems?: unknown;
  promoDiscount?: unknown;
  promoCode?: unknown;
  tax?: unknown;
  fees?: unknown;
  travel?: unknown;
  /** Dollar override. Omit to calculate the processing rate. */
  processing?: unknown;
  processingPercent?: number;
  processingRemoved?: boolean;
  taxRemoved?: boolean;
  travelRemoved?: boolean;
  feesRemoved?: boolean;
  promoRemoved?: boolean;
  /** Staff are editing adjustments, so raw side lines do not win. */
  useAdjustmentFields?: boolean;
}

export interface OrderServiceQuote {
  subtotal: number;
  promotions: number;
  processing: number;
  fees: number;
  travel: number;
  tax: number;
  total: number;
}

export interface OrderServiceSavePatch extends OrderServiceQuote {
  lineItems: BookingLineItem[];
  pricing: { subtotal: number; tax: number; processing: number; total: number };
  catalogPackageIds: string[];
  catalogVariantIds: string[];
  selectedService: string | null;
  selectedBasics: string[];
  selectedAddOns: string[];
  appointmentDuration?: number;
  promoDiscount?: number;
  promoCode?: string | null;
}

export interface PresentedOrderCharges {
  services: OrderServiceLine[];
  processing: number;
  travel: number;
  fees: number;
  tax: number;
  promotions: number;
  total: number;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveQty(value: unknown): number {
  const qty = Math.round(Number(value));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

export function formatOrderMoney(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatAppointmentLength(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const whole = Math.round(minutes);
  if (whole % 60 === 0) {
    const hours = whole / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (whole > 60) {
    const hours = Math.floor(whole / 60);
    const rest = whole % 60;
    return `${hours} hr ${rest} min`;
  }
  return `${whole} min`;
}

/** Minutes the catalog actually states. The 90-minute booking fallback is not a length. */
export function statedCatalogDuration(pkg: StaffCatalogPackage): number | null {
  if (pkg.durationMinutes != null && pkg.durationMinutes > 0) return Math.round(pkg.durationMinutes);
  if (pkg.appointmentLimit) return apprenticeshipDurationMinutes(pkg.appointmentLimit, pkg.id);
  const found = explicitDurationMinutes([pkg.name, pkg.description, ...pkg.includedServices].join("\n"));
  if (found.length) return Math.max(...found);
  return null;
}

function groupForKind(kind: BookingCatalogKind): CatalogChoiceGroup {
  if (kind === "basic") return "basic";
  if (kind === "addon") return "addon";
  if (kind === "upgrade") return "upgrade";
  return "service";
}

export function catalogServiceChoices(
  catalog: StaffCatalogPackage[] = packagesForStaffEditor([]),
): CatalogServiceChoice[] {
  const choices: CatalogServiceChoice[] = [];
  for (const pkg of catalog) {
    if (pkg.isActive === false) continue;
    const duration = statedCatalogDuration(pkg);
    choices.push({
      key: pkg.id,
      packageId: pkg.id,
      bookingId: pkg.bookingId || pkg.id,
      name: pkg.name,
      description: pkg.description,
      group: groupForKind(pkg.bookingKind),
      price: roundMoney(pkg.price),
      durationMinutes: duration,
      bookingKind: pkg.bookingKind,
      category: pkg.category,
      tier: pkg.tier,
    });
    for (const variant of pkg.variants || []) {
      choices.push({
        key: `${pkg.id}:${variant.id}`,
        packageId: pkg.id,
        variantId: variant.id,
        bookingId: pkg.bookingId || pkg.id,
        name: `${pkg.name} — ${variant.name}`,
        description: variant.description || pkg.description,
        group: "variant",
        price: roundMoney(variant.price),
        durationMinutes: variant.durationMinutes && variant.durationMinutes > 0
          ? Math.round(variant.durationMinutes)
          : duration,
        bookingKind: pkg.bookingKind,
        category: pkg.category,
        tier: pkg.tier,
      });
    }
  }
  const rank = new Map(CATALOG_CHOICE_GROUP_ORDER.map((group, index) => [group, index]));
  return choices.sort((a, b) => (rank.get(a.group) ?? 9) - (rank.get(b.group) ?? 9) || a.name.localeCompare(b.name));
}

export function lineFromChoice(choice: CatalogServiceChoice, qty = 1): OrderEditorLine {
  const count = positiveQty(qty);
  const unitPrice = roundMoney(choice.price);
  return {
    id: choice.variantId || choice.bookingId,
    catalogId: choice.packageId,
    ...(choice.variantId ? { variantId: choice.variantId } : {}),
    name: choice.name,
    description: choice.description,
    category: choice.category,
    bookingKind: choice.bookingKind,
    tier: choice.tier,
    unitPrice,
    qty: count,
    price: roundMoney(unitPrice * count),
    durationMinutes: choice.durationMinutes,
    custom: false,
    defaultUnitPrice: unitPrice,
    priceOverridden: false,
  };
}

export function emptyCatalogLine(): OrderEditorLine {
  return {
    name: "",
    unitPrice: 0,
    qty: 1,
    price: 0,
    durationMinutes: null,
    custom: false,
  };
}

export function customOrderLine(): OrderEditorLine {
  return {
    name: "",
    unitPrice: 0,
    qty: 1,
    price: 0,
    durationMinutes: null,
    custom: true,
  };
}

export function withLineQty(line: OrderEditorLine, qty: number): OrderEditorLine {
  const count = positiveQty(qty);
  return { ...line, qty: count, price: roundMoney(line.unitPrice * count) };
}

export function withCustomPrice(line: OrderEditorLine, unitPrice: number): OrderEditorLine {
  const unit = roundMoney(Math.max(0, Number(unitPrice) || 0));
  return { ...line, custom: true, unitPrice: unit, price: roundMoney(unit * line.qty) };
}

/** Pencil override. The catalog id stays. The default price stays visible. */
export function withPriceOverride(line: OrderEditorLine, unitPrice: number): OrderEditorLine {
  const unit = roundMoney(Math.max(0, Number(unitPrice) || 0));
  const fallback = line.defaultUnitPrice ?? line.unitPrice;
  return {
    ...line,
    defaultUnitPrice: line.defaultUnitPrice ?? fallback,
    priceOverridden: true,
    unitPrice: unit,
    price: roundMoney(unit * (line.qty || 1)),
  };
}

export function choiceForLine(
  line: Pick<OrderEditorLine, "custom" | "catalogId" | "variantId" | "id">,
  choices: CatalogServiceChoice[],
): CatalogServiceChoice | undefined {
  if (line.custom) return undefined;
  if (line.variantId && line.catalogId) {
    return choices.find((choice) => choice.packageId === line.catalogId && choice.variantId === line.variantId);
  }
  const id = line.catalogId || line.id || "";
  if (!id) return undefined;
  return choices.find((choice) => !choice.variantId && (
    choice.packageId === id || choice.bookingId === id || choice.key === id
  ));
}

function storedUnit(item: Record<string, unknown>, qty: number): number {
  if (item.unitPrice == null || item.unitPrice === "") return roundMoney((Number(item.price) || 0) / qty);
  return roundMoney(Number(item.unitPrice) || 0);
}

export function editorRowsFromStored(raw: unknown, catalog: StaffCatalogPackage[]): OrderEditorLine[] {
  if (!Array.isArray(raw)) return [];
  const choices = catalogServiceChoices(catalog);
  const lines: OrderEditorLine[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (isPromoInvoiceLine({ id: text(item.id), name: text(item.name) })) continue;
    if (adjustmentKind({ id: text(item.id), category: text(item.category) })) continue;
    if (isTravelFeeLine({ id: text(item.id), name: text(item.name) })) continue;
    const name = text(item.name);
    const qty = positiveQty(item.qty);
    const unit = Math.max(0, storedUnit(item, qty));
    const forcedCustom = item.custom === true;
    const duration = Number(item.durationMinutes);
    const storedDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
    if (!forcedCustom) {
      const probe: OrderEditorLine = {
        id: text(item.id) || undefined,
        catalogId: text(item.catalogId) || undefined,
        variantId: text(item.variantId) || undefined,
        name,
        unitPrice: unit,
        qty,
        price: roundMoney(unit * qty),
        durationMinutes: storedDuration,
        custom: false,
      };
      const match = choiceForLine(probe, choices);
      if (match) {
        const useCatalogPrice = unit <= 0 && match.price > 0;
        const unitPrice = useCatalogPrice ? match.price : unit;
        lines.push({
          ...lineFromChoice(match, qty),
          unitPrice,
          price: roundMoney(unitPrice * qty),
          defaultUnitPrice: match.price,
          priceOverridden: !useCatalogPrice && roundMoney(unit) !== roundMoney(match.price),
          durationMinutes: storedDuration ?? match.durationMinutes,
          description: text(item.description) || match.description,
        });
        continue;
      }
    }
    if (!name && unit <= 0) continue;
    lines.push({
      name,
      description: text(item.description) || undefined,
      unitPrice: unit,
      qty,
      price: roundMoney(unit * qty),
      durationMinutes: storedDuration,
      custom: true,
      unlisted: !forcedCustom,
    });
  }
  return lines;
}

function keptSideLines(raw: unknown, kind: "promo" | "travel" | "fees"): BookingLineItem[] {
  return normalizeBookingLineItems(raw).filter((item) => {
    if (kind === "promo") return isPromoInvoiceLine(item);
    if (kind === "travel") return isTravelFeeLine(item);
    return adjustmentKind(item) === "fees";
  });
}

function lineIsPersistable(line: OrderEditorLine): boolean {
  if (line.custom) return Boolean(line.name.trim()) || line.price > 0;
  return Boolean(line.catalogId || line.id);
}

function toSavedLine(line: OrderEditorLine): BookingLineItem {
  const name = line.name.trim() || (line.custom ? "Custom line" : "Service");
  const saved: BookingLineItem = {
    name,
    unitPrice: roundMoney(line.unitPrice),
    qty: positiveQty(line.qty),
    price: roundMoney(line.price),
  };
  if (!line.custom && line.id) saved.id = line.id;
  if (line.catalogId) saved.catalogId = line.catalogId;
  if (line.variantId) saved.variantId = line.variantId;
  if (line.description) saved.description = line.description;
  if (line.category) saved.category = line.category;
  if (line.bookingKind) saved.bookingKind = line.bookingKind;
  if (line.tier) saved.tier = line.tier;
  if (line.durationMinutes && line.durationMinutes > 0) saved.durationMinutes = Math.round(line.durationMinutes);
  if (line.custom) saved.custom = true;
  return saved;
}

export function orderServiceQuote(lines: OrderEditorLine[], context: OrderServiceQuoteContext = {}): OrderServiceQuote {
  const services = lines.filter(lineIsPersistable);
  const subtotal = roundMoney(services.reduce((sum, line) => sum + line.price, 0));
  const managed = context.useAdjustmentFields === true;
  const promoLines = managed ? [] : keptSideLines(context.rawLineItems, "promo");
  const promoOnLines = roundMoney(promoLines.reduce((sum, line) => sum + Math.abs(line.price), 0));
  const promotions = context.promoRemoved
    ? 0
    : promoOnLines > 0
      ? promoOnLines
      : roundMoney(Math.max(0, money(context.promoDiscount)));
  const feeLines = managed || context.feesRemoved ? [] : keptSideLines(context.rawLineItems, "fees");
  const feesOnLines = roundMoney(feeLines.reduce((sum, line) => sum + line.price, 0));
  const fees = context.feesRemoved
    ? 0
    : managed
      ? roundMoney(Math.max(0, money(context.fees)))
      : feesOnLines > 0 ? feesOnLines : roundMoney(Math.max(0, money(context.fees)));
  const travelLines = managed || context.travelRemoved ? [] : keptSideLines(context.rawLineItems, "travel");
  const travelOnLines = roundMoney(travelLines.reduce((sum, line) => sum + line.price, 0));
  const travel = context.travelRemoved
    ? 0
    : managed
      ? roundMoney(Math.max(0, money(context.travel)))
      : travelOnLines > 0 ? travelOnLines : roundMoney(Math.max(0, money(context.travel)));
  const tax = context.taxRemoved ? 0 : roundMoney(Math.max(0, money(context.tax)));
  const storedProcessing = context.processingRemoved
    ? 0
    : typeof context.processing === "number" && Number.isFinite(context.processing)
      ? roundMoney(Math.max(0, context.processing))
      : null;
  const totals = computeInvoiceTotals({
    subtotal,
    promotions,
    fees,
    travel,
    tax,
    processing: storedProcessing,
    processingPercent: context.processingPercent,
    applyProcessing: !context.processingRemoved,
  });
  return {
    subtotal,
    promotions,
    processing: totals.processing,
    fees,
    travel,
    tax,
    total: totals.total,
  };
}

export function orderServiceSavePatch(
  lines: OrderEditorLine[],
  context: OrderServiceQuoteContext = {},
): OrderServiceSavePatch {
  const services = lines.filter(lineIsPersistable).map(toSavedLine);
  const quote = orderServiceQuote(lines, context);
  const managed = context.useAdjustmentFields === true;
  const promoCode = text(context.promoCode);
  const promoLines = managed
    ? (context.promoRemoved || quote.promotions <= 0
      ? []
      : [{
        id: `promo-${promoCode || "discount"}`,
        name: `Promo Code: ${promoCode || "Discount"}`,
        unitPrice: -quote.promotions,
        qty: 1,
        price: -quote.promotions,
      }])
    : keptSideLines(context.rawLineItems, "promo");
  // Travel and fees stay on the order fields. The invoice patch writes those lines.
  const travelLines = managed ? [] : keptSideLines(context.rawLineItems, "travel");
  const feeLines = managed ? [] : keptSideLines(context.rawLineItems, "fees");
  const catalogPackageIds: string[] = [];
  const catalogVariantIds: string[] = [];
  const selectedBasics: string[] = [];
  const selectedAddOns: string[] = [];
  let selectedService: string | null = null;
  let appointmentDuration: number | undefined;
  for (const line of lines.filter(lineIsPersistable)) {
    if (line.custom || !line.catalogId) continue;
    if (!catalogPackageIds.includes(line.catalogId)) catalogPackageIds.push(line.catalogId);
    if (line.variantId && !catalogVariantIds.includes(line.variantId)) catalogVariantIds.push(line.variantId);
    const selectionId = line.variantId ? line.catalogId : (line.id || line.catalogId);
    if (line.bookingKind === "basic") selectedBasics.push(selectionId);
    else if (line.bookingKind === "addon" || line.bookingKind === "upgrade") selectedAddOns.push(selectionId);
    else if (!selectedService) selectedService = selectionId;
    if (line.durationMinutes && line.durationMinutes > 0) {
      appointmentDuration = Math.max(appointmentDuration || 0, Math.round(line.durationMinutes));
    }
  }
  const promoOnLines = roundMoney(promoLines.reduce((sum, line) => sum + Math.abs(line.price), 0));
  const patch: OrderServiceSavePatch = {
    ...quote,
    lineItems: [...services, ...promoLines, ...feeLines, ...travelLines],
    pricing: {
      subtotal: quote.subtotal,
      tax: quote.tax,
      processing: quote.processing,
      total: quote.total,
    },
    catalogPackageIds,
    catalogVariantIds,
    selectedService,
    selectedBasics,
    selectedAddOns,
  };
  if (appointmentDuration) patch.appointmentDuration = appointmentDuration;
  if (promoOnLines > 0 && money(context.promoDiscount) <= 0) patch.promoDiscount = promoOnLines;
  if (managed) {
    patch.promoDiscount = quote.promotions;
    patch.promoCode = context.promoRemoved ? null : (promoCode || null);
    patch.fees = quote.fees;
    patch.travel = quote.travel;
  }
  return patch;
}

export function presentOrderCharges(
  record: Record<string, unknown> | null | undefined,
): PresentedOrderCharges {
  const source = record || {};
  const lines = orderServiceLines(source);
  const services = lines.filter((line) => (
    line.id !== ADJUSTMENT_LINE_IDS.processing
    && line.id !== ADJUSTMENT_LINE_IDS.fees
    && line.name !== "Processing"
  ));
  const processingLine = lines.find((line) => line.id === ADJUSTMENT_LINE_IDS.processing || line.name === "Processing");
  const fieldProcessing = typeof source.processing === "number" && Number.isFinite(source.processing)
    ? source.processing
    : null;
  const processing = fieldProcessing != null && fieldProcessing > 0
    ? roundMoney(fieldProcessing)
    : roundMoney(processingLine?.price || 0);
  const travelLines = lines.filter((line) => isTravelFeeLine(line));
  const travel = travelLines.reduce((sum, line) => sum + line.price, 0) || money(source.travel);
  const feeLine = lines.find((line) => line.id === ADJUSTMENT_LINE_IDS.fees);
  const fees = roundMoney(feeLine?.price || money(source.fees));
  const pricing = source.pricing && typeof source.pricing === "object"
    ? source.pricing as { tax?: unknown; total?: unknown }
    : {};
  const tax = money(source.tax ?? pricing.tax);
  const promotions = separatePromoDiscount(lines, source.promoDiscount);
  const storedTotal = money(source.total ?? pricing.total);
  const total = storedTotal || roundMoney(services.reduce((sum, line) => sum + line.price, 0) - promotions + processing + fees + travel + tax);
  return {
    services,
    processing,
    travel: roundMoney(Math.max(0, travel)),
    fees,
    tax,
    promotions,
    total: roundMoney(Math.max(0, total)),
  };
}

/** Exposed for tests that want the same cents rule as the booking form. */
export function orderProcessingFee(subtotal: number, promotions = 0, fees = 0): number {
  return processingFee(Math.max(0, subtotal - promotions + fees));
}

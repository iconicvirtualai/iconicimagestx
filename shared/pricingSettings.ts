/**
 * Office prices that are not a package on the booking catalog.
 *
 * The seed is what `pnpm seed:booking-catalog` writes into `pricingAdjustments`
 * when a doc is missing. A doc that already exists is left alone, so a price
 * Cadi has saved is not put back. A missing doc, or a failed read, uses this seed.
 * `removed: true` drops a seed row so it does not come back on the next read.
 */

import { TRAVEL_ZONES, type TravelZone } from "./travelZones.ts";
import { PROCESSING_FEE_RATE } from "./invoiceProcessing.ts";

/** Kept in step with the booking modules. pricingSettings.spec checks they still match. */
const SEED_PROMO_ICONICAI = 35;
const SEED_PROMO_NEWYEAR = 50;
const SEED_APPRENTICESHIP_BOOKING_FEE = 25;
const SEED_HEADSHOTS_UNIT = 10;
const SEED_HEADSHOTS_BOOKING_FEE = 10;
const SEED_SENIOR_TOUR = 250;
const SEED_SENIOR_FACILITY_RATE = 0.1;
const SEED_SENIOR_DEPOSIT_PERCENT = 50;
const SEED_SENIOR_ROOMS = [
  { minCount: 1, maxCount: 10, each: 199 },
  { minCount: 11, maxCount: 20, each: 175 },
] as const;

export const PRICING_ADJUSTMENTS_COLLECTION = "pricingAdjustments";

export type PricingAdjustmentKind = "processing" | "tax" | "travel" | "promo" | "fee";
export type PricingAdjustmentMode = "percent" | "flat" | "per_sqft";

export interface PricingAdjustment {
  id: string;
  kind: PricingAdjustmentKind;
  name: string;
  active: boolean;
  removed: boolean;
  mode: PricingAdjustmentMode;
  /** Percent points (2.8), dollars, or dollars per square foot. */
  amount: number;
  code?: string;
  zone?: number;
  outerMiles?: number;
  minCount?: number;
  maxCount?: number;
  sortOrder: number;
  note?: string;
}

export interface PromoRate {
  code: string;
  discount: number;
  mode: "flat" | "percent";
  active: boolean;
}

export interface PricingRates {
  processingPercent: number;
  processingActive: boolean;
  taxPercent: number;
  taxActive: boolean;
  travelZones: TravelZone[];
  promos: PromoRate[];
  apprenticeshipBookingFee: number;
  headshotsUnitPrice: number;
  headshotsBookingFee: number;
  seniorTourPrice: number;
  seniorFacilityRatePerSqft: number;
  seniorRoomRates: Array<{ minCount: number; maxCount: number; each: number }>;
  seniorDepositPercent: number;
}

const KINDS = new Set<string>(["processing", "tax", "travel", "promo", "fee"]);
const MODES = new Set<string>(["percent", "flat", "per_sqft"]);

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amountOf(value: unknown, fallback = 0): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function seed(partial: PricingAdjustment): PricingAdjustment {
  return partial;
}

/** Current live numbers. Editing the admin screen replaces these. The seed does not. */
export function defaultPricingAdjustments(): PricingAdjustment[] {
  const zones = TRAVEL_ZONES.map((zone) => seed({
    id: `travel-zone-${zone.zone}`,
    kind: "travel",
    name: zone.feeCents === 0 ? `Travel zone ${zone.zone}` : `Travel zone ${zone.zone}`,
    active: true,
    removed: false,
    mode: "flat",
    amount: zone.feeCents / 100,
    zone: zone.zone,
    outerMiles: zone.outerMiles,
    sortOrder: 100 + zone.zone,
    note: zone.feeCents === 0
      ? `Up to ${zone.outerMiles} straight-line miles. No travel fee.`
      : `Up to ${zone.outerMiles} straight-line miles.`,
  }));

  return [
    seed({
      id: "processing-fee",
      kind: "processing",
      name: "Processing fee",
      active: true,
      removed: false,
      mode: "percent",
      amount: roundMoney(PROCESSING_FEE_RATE * 100),
      sortOrder: 10,
      note: "Added on top of the service total. Travel and tax stay outside it.",
    }),
    seed({
      id: "sales-tax",
      kind: "tax",
      name: "Sales tax",
      active: false,
      removed: false,
      mode: "percent",
      amount: 0,
      sortOrder: 20,
      note: "None set. Turn it on and enter a percent when a rate should be charged.",
    }),
    ...zones,
    seed({
      id: "promo-ICONICAI",
      kind: "promo",
      name: "ICONICAI",
      active: true,
      removed: false,
      mode: "flat",
      amount: SEED_PROMO_ICONICAI,
      code: "ICONICAI",
      sortOrder: 200,
      note: "Dollars off one order.",
    }),
    seed({
      id: "promo-NEWYEAR",
      kind: "promo",
      name: "NEWYEAR",
      active: true,
      removed: false,
      mode: "flat",
      amount: SEED_PROMO_NEWYEAR,
      code: "NEWYEAR",
      sortOrder: 210,
    }),
    seed({
      id: "apprenticeship-booking-fee",
      kind: "fee",
      name: "Apprenticeship booking fee",
      active: true,
      removed: false,
      mode: "flat",
      amount: SEED_APPRENTICESHIP_BOOKING_FEE,
      sortOrder: 300,
      note: "Due when the apprentice time is booked. Credited toward the package.",
    }),
    seed({
      id: "headshots-unit",
      kind: "fee",
      name: "Tuesday headshot",
      active: true,
      removed: false,
      mode: "flat",
      amount: SEED_HEADSHOTS_UNIT,
      sortOrder: 310,
      note: "Price for one headshot.",
    }),
    seed({
      id: "headshots-booking-fee",
      kind: "fee",
      name: "Headshot booking fee",
      active: true,
      removed: false,
      mode: "flat",
      amount: SEED_HEADSHOTS_BOOKING_FEE,
      sortOrder: 320,
      note: "Due today. Counts toward the headshots.",
    }),
    seed({
      id: "senior-tour",
      kind: "fee",
      name: "Senior living 3D tour",
      active: true,
      removed: false,
      mode: "flat",
      amount: SEED_SENIOR_TOUR,
      sortOrder: 400,
    }),
    seed({
      id: "senior-facility-rate",
      kind: "fee",
      name: "Senior living facility",
      active: true,
      removed: false,
      mode: "per_sqft",
      amount: SEED_SENIOR_FACILITY_RATE,
      sortOrder: 410,
      note: "Dollars per square foot.",
    }),
    ...SEED_SENIOR_ROOMS.map((band, index) => seed({
      id: `senior-room-${band.minCount}-${band.maxCount}`,
      kind: "fee" as const,
      name: `Senior living rooms ${band.minCount}–${band.maxCount}`,
      active: true,
      removed: false,
      mode: "flat" as const,
      amount: band.each,
      minCount: band.minCount,
      maxCount: band.maxCount,
      sortOrder: 420 + index,
      note: "Price for each room in this count.",
    })),
    seed({
      id: "senior-deposit",
      kind: "fee",
      name: "Senior living deposit",
      active: true,
      removed: false,
      mode: "percent",
      amount: SEED_SENIOR_DEPOSIT_PERCENT,
      sortOrder: 430,
      note: "Percent of the senior living total due to reserve the date.",
    }),
    seed({
      id: "pay-at-close",
      kind: "fee",
      name: "Pay at Close",
      active: true,
      removed: false,
      mode: "percent",
      amount: 6,
      sortOrder: 500,
      note: "Kept so the office can edit this row. The public Pay at Close page, booking total, and Titus invoice do not add this amount. Titus shows its own fee. Turning this row off hides checkout. Checkout also stays hidden until PAY_AT_CLOSE_LIVE is true.",
    }),
    seed({
      id: "pay-at-close-card-processing",
      kind: "fee",
      name: "Card processing on Pay at Close",
      active: false,
      removed: false,
      mode: "percent",
      amount: 0,
      sortOrder: 510,
      note: "Turn this on to keep the card processing fee on Pay at Close invoices. Off leaves that fee off, because it applies to card payments. The percent still comes from the processing fee row.",
    }),
  ];
}

export function pricingAdjustmentSeedDocs(): PricingAdjustment[] {
  return defaultPricingAdjustments();
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

function fromDoc(doc: Record<string, unknown>, current?: PricingAdjustment): PricingAdjustment | null {
  const id = text(doc.id) || current?.id || "";
  if (!id) return null;
  const kindRaw = text(doc.kind);
  const modeRaw = text(doc.mode);
  const kind = (KINDS.has(kindRaw) ? kindRaw : current?.kind) as PricingAdjustmentKind | undefined;
  const mode = (MODES.has(modeRaw) ? modeRaw : current?.mode) as PricingAdjustmentMode | undefined;
  if (!kind || !mode) return null;
  const code = text(doc.code) || current?.code;
  const note = text(doc.note) || current?.note;
  const zone = optionalNumber(doc.zone) ?? current?.zone;
  const outerMiles = optionalNumber(doc.outerMiles) ?? current?.outerMiles;
  const minCount = optionalNumber(doc.minCount) ?? current?.minCount;
  const maxCount = optionalNumber(doc.maxCount) ?? current?.maxCount;
  return {
    id,
    kind,
    name: text(doc.name) || current?.name || id,
    active: doc.active === false ? false : doc.active === true ? true : current?.active ?? true,
    removed: false,
    mode,
    amount: roundMoney(amountOf(doc.amount, current?.amount ?? 0)),
    sortOrder: optionalNumber(doc.sortOrder) ?? current?.sortOrder ?? 1000,
    ...(code ? { code } : {}),
    ...(note ? { note } : {}),
    ...(zone != null ? { zone } : {}),
    ...(outerMiles != null ? { outerMiles } : {}),
    ...(minCount != null ? { minCount } : {}),
    ...(maxCount != null ? { maxCount } : {}),
  };
}

/**
 * Seed rows, overlaid by live docs. A live `removed: true` drops that id.
 * An empty read keeps the seed, which is the same numbers the site charges today.
 */
export function mergePricingAdjustments(
  liveDocs: Array<Record<string, unknown>> = [],
  options?: { includeRemoved?: boolean },
): PricingAdjustment[] {
  const byId = new Map<string, PricingAdjustment>();
  for (const item of defaultPricingAdjustments()) byId.set(item.id, { ...item });

  for (const doc of liveDocs) {
    const id = text(doc.id);
    if (!id) continue;
    if (doc.removed === true) {
      if (options?.includeRemoved) {
        const current = byId.get(id);
        const parsed = fromDoc(doc, current);
        if (parsed) byId.set(id, { ...parsed, removed: true, active: false });
      } else {
        byId.delete(id);
      }
      continue;
    }
    const parsed = fromDoc(doc, byId.get(id));
    if (parsed) byId.set(id, parsed);
  }

  return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Amount on a merged list. A missing seed id was removed, so the charge is 0
 * instead of the original seed. Inactive is 0 as well. Callers pass a merged list.
 */
function activeAmount(items: PricingAdjustment[], id: string, fallback: number): number {
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    const seeded = defaultPricingAdjustments().some((entry) => entry.id === id);
    return seeded ? 0 : fallback;
  }
  if (item.removed || !item.active) return 0;
  return item.amount;
}

export function pricingRates(items: PricingAdjustment[] = mergePricingAdjustments([])): PricingRates {
  const processing = items.find((item) => item.kind === "processing" && item.active && !item.removed);
  const tax = items.find((item) => item.kind === "tax" && item.active && !item.removed);
  const seedTravelIds = defaultPricingAdjustments().filter((item) => item.kind === "travel").map((item) => item.id);
  const travelItems = items.filter((item) => item.kind === "travel" && !item.removed);
  const travelZones = travelItems
    .filter((item) => item.active && item.zone != null && item.outerMiles != null)
    .map((item) => ({
      zone: Math.round(item.zone || 0),
      outerMiles: Number(item.outerMiles),
      feeCents: Math.round(Math.max(0, item.amount) * 100),
    }))
    .filter((zone) => zone.zone > 0 && zone.outerMiles > 0)
    .sort((a, b) => a.outerMiles - b.outerMiles);
  const travelSeedMissing = seedTravelIds.some((id) => !travelItems.some((item) => item.id === id));

  const promos = items
    .filter((item) => item.kind === "promo" && item.active && !item.removed && text(item.code))
    .map((item) => ({
      code: text(item.code).toUpperCase(),
      discount: Math.max(0, item.amount),
      mode: item.mode === "percent" ? "percent" as const : "flat" as const,
      active: true,
    }));

  const roomRates = items
    .filter((item) => item.id.startsWith("senior-room-") && item.active && !item.removed)
    .map((item) => ({
      minCount: Math.round(item.minCount || 0),
      maxCount: Math.round(item.maxCount || 0),
      each: item.amount,
    }))
    .filter((band) => band.minCount > 0 && band.maxCount >= band.minCount);

  const defaults = defaultPricingAdjustments();
  const fallbackRooms = defaults
    .filter((item) => item.id.startsWith("senior-room-"))
    .map((item) => ({
      minCount: item.minCount || 0,
      maxCount: item.maxCount || 0,
      each: item.amount,
    }));

  return {
    processingPercent: processing ? Math.max(0, processing.amount) : 0,
    processingActive: Boolean(processing && processing.amount > 0),
    taxPercent: tax ? Math.max(0, tax.amount) : 0,
    taxActive: Boolean(tax && tax.amount > 0),
    travelZones: travelZones.length > 0
      ? travelZones
      : (travelSeedMissing || travelItems.length > 0 ? [] : [...TRAVEL_ZONES]),
    promos,
    apprenticeshipBookingFee: activeAmount(items, "apprenticeship-booking-fee", SEED_APPRENTICESHIP_BOOKING_FEE),
    headshotsUnitPrice: activeAmount(items, "headshots-unit", SEED_HEADSHOTS_UNIT),
    headshotsBookingFee: activeAmount(items, "headshots-booking-fee", SEED_HEADSHOTS_BOOKING_FEE),
    seniorTourPrice: activeAmount(items, "senior-tour", SEED_SENIOR_TOUR),
    seniorFacilityRatePerSqft: activeAmount(items, "senior-facility-rate", SEED_SENIOR_FACILITY_RATE),
    seniorRoomRates: roomRates.length > 0 ? roomRates : fallbackRooms,
    seniorDepositPercent: activeAmount(items, "senior-deposit", SEED_SENIOR_DEPOSIT_PERCENT),
  };
}

/** Half-up cents for a percent of a dollar base. 2.8% of $549 is $15.37. */
export function percentOfDollars(base: number, percent: number): number {
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(percent) || percent <= 0) return 0;
  const cents = Math.round(base * 100);
  const basis = Math.round(percent * 100);
  if (basis <= 0) return 0;
  return Math.floor((cents * basis + 5000) / 10000) / 100;
}

export function taxDollars(base: number, rates: Pick<PricingRates, "taxPercent" | "taxActive">): number {
  if (!rates.taxActive) return 0;
  return percentOfDollars(base, rates.taxPercent);
}

/**
 * Docs that are not in Firestore yet. Existing ids are skipped, including ones
 * marked removed, so a second seed does not put a deleted price back.
 */
export function missingSeedDocs<T extends { id: string }>(existingIds: Iterable<string>, docs: T[]): T[] {
  const have = new Set(existingIds);
  return docs.filter((doc) => doc.id && !have.has(doc.id));
}

const ADJUSTMENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function pricingAdjustmentSaveData(draft: {
  id?: string;
  kind: string;
  name: string;
  mode: string;
  amount: number;
  active?: boolean;
  code?: string;
  zone?: number;
  outerMiles?: number;
  minCount?: number;
  maxCount?: number;
  note?: string;
  sortOrder?: number;
}): { ok: true; id: string; data: PricingAdjustment } | { ok: false; error: string } {
  const kind = draft.kind.trim();
  const mode = draft.mode.trim();
  if (!KINDS.has(kind)) return { ok: false, error: "Choose what this adjustment is." };
  if (!MODES.has(mode)) return { ok: false, error: "Choose how the amount is charged." };
  const name = draft.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Amount must be zero or more." };
  let id = text(draft.id).toLowerCase();
  if (!id) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    id = `${kind}-${slug || "item"}`;
  }
  if (!ADJUSTMENT_ID.test(id)) return { ok: false, error: "Use a short id with lowercase letters, numbers, and dashes." };
  const code = text(draft.code).toUpperCase();
  if (kind === "promo" && !code) return { ok: false, error: "A promo code needs the code clients type." };
  if (kind === "travel") {
    if (!Number.isFinite(Number(draft.zone)) || Number(draft.zone) <= 0) return { ok: false, error: "A travel zone needs a zone number." };
    if (!Number.isFinite(Number(draft.outerMiles)) || Number(draft.outerMiles) <= 0) return { ok: false, error: "A travel zone needs an outer mileage." };
  }
  const data: PricingAdjustment = {
    id,
    kind: kind as PricingAdjustmentKind,
    name,
    active: draft.active !== false,
    removed: false,
    mode: mode as PricingAdjustmentMode,
    amount: mode === "per_sqft" ? amount : roundMoney(amount),
    sortOrder: Number.isFinite(Number(draft.sortOrder)) ? Number(draft.sortOrder) : 1000,
    ...(code ? { code } : {}),
    ...(text(draft.note) ? { note: text(draft.note) } : {}),
    ...(kind === "travel" ? { zone: Math.round(Number(draft.zone)), outerMiles: Number(draft.outerMiles) } : {}),
    ...(draft.minCount != null && Number.isFinite(Number(draft.minCount)) ? { minCount: Math.round(Number(draft.minCount)) } : {}),
    ...(draft.maxCount != null && Number.isFinite(Number(draft.maxCount)) ? { maxCount: Math.round(Number(draft.maxCount)) } : {}),
  };
  return { ok: true, id, data };
}

export function pricingAdjustmentRemoval(): { removed: true; active: false } {
  return { removed: true, active: false };
}

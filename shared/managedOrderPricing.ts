/**
 * Totals for an order after staff add or remove a service.
 * Uses the same invoice math as checkout: 2.8% on the service base,
 * travel and tax outside that base, a promo subtracted once, and the
 * senior living 50% deposit when that order already takes one.
 * This module does not write Firestore, send mail, or charge a card.
 */

import { normalizeBookingLineItems, type BookingLineItem } from "./bookingPricing.ts";
import {
  adjustmentKind,
  invoiceAdjustmentLine,
  isPromoInvoiceLine,
} from "./invoiceFace.ts";
import { computeInvoiceTotals, type ProcessingPolicy } from "./invoiceProcessing.ts";
import {
  SENIOR_LIVING_DEPOSIT_PERCENT,
  SENIOR_LIVING_ORDER_SOURCE,
  seniorLivingDepositFromTotal,
} from "./seniorLiving.ts";
import { isTravelFeeLine } from "./travelZones.ts";

export interface ManagedOrderPrice {
  serviceLines: BookingLineItem[];
  /** Lines stored on the order. Processing stays a field, not a second service. */
  orderLines: BookingLineItem[];
  /** Lines stored on the invoice, including the processing row. */
  invoiceLines: BookingLineItem[];
  subtotal: number;
  promotions: number;
  promoCode: string;
  fees: number;
  travel: number;
  tax: number;
  processing: number;
  processingPolicy: ProcessingPolicy;
  total: number;
  amountPaid: number;
  amountDue: number;
  depositRequired: boolean;
  depositPercent: number;
  depositAmount: number;
  depositPaid: number;
  /** What is still owed on the invoice: total minus what is already paid. */
  balanceDue: number;
  /** Remainder after the deposit. Equal to the total when no deposit applies. */
  balanceAfterDeposit: number;
}

export interface ManagedOrderInput {
  lineItems?: unknown;
  services?: unknown;
  promoCode?: unknown;
  promoDiscount?: unknown;
  pricing?: { tax?: unknown } | null;
  tax?: unknown;
  fees?: unknown;
  travel?: unknown;
  travelFeeCents?: unknown;
  travelQuoted?: unknown;
  processing?: unknown;
  processingPolicy?: unknown;
  processingOverridden?: unknown;
  applyProcessing?: boolean;
  amountPaid?: unknown;
  depositPaid?: unknown;
  depositRequired?: unknown;
  depositPercent?: unknown;
  source?: unknown;
  leadSource?: unknown;
  status?: unknown;
  comped?: unknown;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function nonNegative(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return roundMoney(amount);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function blankLine(item: BookingLineItem): boolean {
  return !item.name.trim() && item.price === 0;
}

function promoCodeFromLine(item: BookingLineItem | undefined, fallback: string): string {
  if (!item) return fallback;
  const fromName = item.name.replace(/^Promo Code:\s*/i, "").trim();
  if (fromName) return fromName;
  const id = String(item.id || "");
  if (id.startsWith("promo-")) return id.slice("promo-".length) || fallback;
  return fallback;
}

export function orderTakesDeposit(input: ManagedOrderInput): boolean {
  if (input.depositRequired === true) return true;
  const source = `${text(input.source)} ${text(input.leadSource)}`.toLowerCase();
  if (source.includes("senior")) return true;
  if (text(input.source) === SENIOR_LIVING_ORDER_SOURCE) return true;
  return Number(input.depositPercent) === SENIOR_LIVING_DEPOSIT_PERCENT && input.depositRequired !== false;
}

function freshProcessing(input: ManagedOrderInput): boolean {
  if (input.comped === true || text(input.status).toLowerCase() === "comped") return false;
  if (input.processingOverridden === true) return false;
  const policy = text(input.processingPolicy);
  if (policy === "waived" || policy === "stored") return false;
  if (input.applyProcessing === false) return false;
  return policy === "included" || input.applyProcessing === true;
}

/**
 * Price the rows staff are editing.
 * A blank row is ignored. A processing row already on the order is not a service
 * and is not added a second time. Travel on its own line wins over a stored travel field.
 */
export function priceManagedOrder(input: ManagedOrderInput): ManagedOrderPrice {
  const raw = Array.isArray(input.lineItems) && input.lineItems.length > 0
    ? input.lineItems
    : input.services;
  const normalized = normalizeBookingLineItems(raw).filter((item) => !blankLine(item));
  const services: BookingLineItem[] = [];
  const promoLines: BookingLineItem[] = [];
  const travelLines: BookingLineItem[] = [];
  const feeLines: BookingLineItem[] = [];

  for (const item of normalized) {
    const kind = adjustmentKind(item);
    if (kind === "processing") continue;
    if (isPromoInvoiceLine(item)) promoLines.push(item);
    else if (isTravelFeeLine(item) || kind === "travel") travelLines.push(item);
    else if (kind === "fees") feeLines.push(item);
    else services.push(item);
  }

  const subtotal = roundMoney(services.reduce((sum, item) => sum + item.price, 0));
  const promoFromLines = roundMoney(promoLines.reduce((sum, item) => sum + Math.abs(item.price), 0));
  const fieldPromo = nonNegative(input.promoDiscount);
  const promotions = promoFromLines > 0 ? promoFromLines : fieldPromo;
  const promoCode = promoCodeFromLine(promoLines[0], text(input.promoCode));
  const fees = feeLines.length > 0
    ? roundMoney(feeLines.reduce((sum, item) => sum + item.price, 0))
    : nonNegative(input.fees);
  const travel = travelLines.length > 0
    ? roundMoney(travelLines.reduce((sum, item) => sum + item.price, 0))
    : input.travelQuoted === true
      ? 0
      : nonNegative(input.travel) || (input.travelFeeCents == null ? 0 : nonNegative(Number(input.travelFeeCents) / 100));
  const tax = nonNegative(input.tax != null && input.tax !== "" ? input.tax : input.pricing?.tax);
  const amountPaid = nonNegative(input.amountPaid);
  const depositPaid = nonNegative(input.depositPaid);
  const policyText = text(input.processingPolicy);
  const comped = input.comped === true || text(input.status).toLowerCase() === "comped";
  const waived = policyText === "waived" || comped;
  const compute = freshProcessing(input);
  const totals = computeInvoiceTotals({
    subtotal,
    promotions,
    fees,
    travel,
    tax,
    amountPaid,
    processing: compute || waived ? null : nonNegative(input.processing),
    applyProcessing: compute,
    comped,
  });

  const depositRequired = orderTakesDeposit(input);
  const depositPercent = depositRequired ? SENIOR_LIVING_DEPOSIT_PERCENT : 0;
  const split = depositRequired
    ? seniorLivingDepositFromTotal(totals.total)
    : { depositAmount: 0, balanceAfterDeposit: totals.total };

  const invoiceLines = [...services];
  if (promotions > 0) {
    if (promoLines.length > 0) invoiceLines.push(...promoLines);
    else {
      const code = promoCode || "Discount";
      invoiceLines.push({
        id: `promo-${code}`,
        name: `Promo Code: ${code}`,
        unitPrice: -promotions,
        qty: 1,
        price: -promotions,
      });
    }
  }
  if (fees > 0) {
    if (feeLines.length > 0) invoiceLines.push(...feeLines);
    else invoiceLines.push(invoiceAdjustmentLine("fees", fees));
  }
  if (travelLines.length > 0) invoiceLines.push(...travelLines);
  else if (travel > 0) invoiceLines.push(invoiceAdjustmentLine("travel", travel));
  if (totals.processing > 0) invoiceLines.push(invoiceAdjustmentLine("processing", totals.processing));

  return {
    serviceLines: services,
    orderLines: [...services, ...promoLines, ...feeLines, ...travelLines],
    invoiceLines,
    subtotal: totals.subtotal,
    promotions,
    promoCode,
    fees,
    travel,
    tax,
    processing: totals.processing,
    processingPolicy: totals.processingPolicy,
    total: totals.total,
    amountPaid,
    amountDue: totals.amountDue,
    depositRequired,
    depositPercent,
    depositAmount: split.depositAmount,
    depositPaid,
    balanceDue: totals.amountDue,
    balanceAfterDeposit: split.balanceAfterDeposit,
  };
}

/** Fields written onto the order request. Does not include an invoice id. */
export function managedOrderWrite(price: ManagedOrderPrice): Record<string, unknown> {
  return {
    lineItems: price.orderLines,
    services: price.orderLines,
    subtotal: price.subtotal,
    processing: price.processing,
    processingPolicy: price.processingPolicy,
    fees: price.fees,
    travel: price.travel,
    tax: price.tax,
    promoCode: price.promoCode || null,
    promoDiscount: price.promotions,
    total: price.total,
    amountDue: price.amountDue,
    balanceDue: price.balanceDue,
    depositRequired: price.depositRequired,
    depositPercent: price.depositPercent,
    depositAmount: price.depositAmount,
    depositPaid: price.depositPaid,
    pricing: {
      subtotal: price.subtotal,
      tax: price.tax,
      processing: price.processing,
      travel: price.travel,
      fees: price.fees,
      promotions: price.promotions,
      total: price.total,
    },
  };
}

function comparableLines(items: unknown): string[] {
  return normalizeBookingLineItems(items)
    .filter((item) => !blankLine(item) && adjustmentKind(item) !== "processing")
    .map((item) => `${item.id || ""}|${item.name}|${item.qty}|${item.price}`);
}

/** True when staff changed a service, travel, fee, or promo row. */
export function serviceLinesChanged(before: unknown, after: unknown): boolean {
  const left = comparableLines(before);
  const right = comparableLines(after);
  if (left.length !== right.length) return true;
  return left.some((line, index) => line !== right[index]);
}

/**
 * Rows for the Manage Order editor.
 * Processing is calculated, so it is not a row staff can edit.
 * A travel fee, promo, or other fee that was stored as a field becomes a row
 * so removing it removes that charge.
 */
export function editorLinesFromOrder(order: ManagedOrderInput): BookingLineItem[] {
  const priced = priceManagedOrder({
    ...order,
    applyProcessing: false,
    processingPolicy: text(order.processingPolicy) === "waived" ? "waived" : "stored",
  });
  const lines = priced.orderLines.filter((item) => adjustmentKind(item) !== "processing");
  if (priced.promotions > 0 && !lines.some((item) => isPromoInvoiceLine(item))) {
    const code = priced.promoCode || "Discount";
    lines.push({
      id: `promo-${code}`,
      name: `Promo Code: ${code}`,
      unitPrice: -priced.promotions,
      qty: 1,
      price: -priced.promotions,
    });
  }
  if (priced.fees > 0 && !lines.some((item) => adjustmentKind(item) === "fees")) {
    lines.push(invoiceAdjustmentLine("fees", priced.fees));
  }
  if (priced.travel > 0 && !lines.some((item) => isTravelFeeLine(item) || adjustmentKind(item) === "travel")) {
    lines.push(invoiceAdjustmentLine("travel", priced.travel));
  }
  return lines;
}

/**
 * Save path for Manage Order.
 * A legacy order with no processing policy keeps its stored total until a service row changes.
 * Once rows change, or the order already includes or waives processing, the shared fee math runs.
 * An explicit waive or processing override does not invent a new 2.8% fee.
 */
export function managedOrderEditorPatch(
  order: ManagedOrderInput,
  lineItems: unknown,
  baselineLineItems?: unknown,
): { reprice: boolean; price: ManagedOrderPrice | null } {
  const policy = text(order.processingPolicy);
  const overridden = order.processingOverridden === true;
  const baseline = baselineLineItems !== undefined
    ? baselineLineItems
    : (Array.isArray(order.lineItems) ? order.lineItems : order.services);
  const linesChanged = serviceLinesChanged(baseline, lineItems);
  const reprice = linesChanged || policy === "included" || policy === "waived";
  if (!reprice) return { reprice: false, price: null };
  const nextPolicy = policy === "waived" || overridden
    ? (policy === "waived" ? "waived" : "stored")
    : "included";
  const price = priceManagedOrder({
    ...order,
    lineItems,
    processingPolicy: nextPolicy,
    processingOverridden: overridden ? true : order.processingOverridden,
    applyProcessing: nextPolicy === "included",
    travelQuoted: true,
    promoDiscount: 0,
    fees: 0,
  });
  return { reprice: true, price };
}

/** Read-only totals. A legacy order with no processing policy stays on its stored total. */
export function storedOrderPrice(order: ManagedOrderInput): ManagedOrderPrice | null {
  const policy = text(order.processingPolicy);
  if (policy !== "included" && policy !== "waived" && policy !== "stored") return null;
  return priceManagedOrder({
    ...order,
    applyProcessing: policy === "included" && order.processingOverridden !== true,
  });
}

/** Live totals while Manage Order is open, otherwise the stored price. */
export function orderFeePreview(
  order: ManagedOrderInput,
  editing: boolean,
  lineItems: unknown,
  baselineLineItems?: unknown,
): ManagedOrderPrice | null {
  if (editing) return managedOrderEditorPatch(order, lineItems, baselineLineItems).price;
  return storedOrderPrice(order);
}

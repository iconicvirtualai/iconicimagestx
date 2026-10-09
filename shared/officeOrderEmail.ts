/**
 * Internal office email for a brand-new booking.
 * Built from the saved order record so it matches the admin order page.
 * This module does not send mail and does not address the client.
 */

import { addressText } from "./addressText.ts";
import { formatChicagoDate } from "./clientHome.ts";
import { packagesForStaffEditor, type StaffCatalogPackage } from "./bookingCatalog.ts";
import { orderChargeSummary, orderServiceLines, cleanPackageName, type OrderServiceLine } from "./orderPackageLines.ts";
import { isTravelFeeLine, travelTextForRecord } from "./travelZones.ts";

export const NOT_PROVIDED = "Not provided";

export interface OfficeOrderEmail {
  subject: string;
  text: string;
  html: string;
}

const FIELD_LABELS = [
  "Order number",
  "Admin link",
  "Client name",
  "Client email",
  "Client phone",
  "Agent",
  "Agent email/phone",
  "Brokerage",
  "Property address",
  "Unit",
  "Gate code",
  "Lockbox",
  "Access notes",
  "MLS #",
  "Package",
  "Photo count",
  "Aerials",
  "Reels",
  "Twilights",
  "Walkthrough",
  "Floor plan",
  "Turnaround",
  "Add-ons",
  "Travel",
  "Subtotal",
  "Tax",
  "Total",
  "Payment",
  "Requested date",
  "Requested time",
  "Square footage",
  "Occupancy",
  "Notes",
  "Booked via",
] as const;

export function officeNewOrderEmail(
  saved: Record<string, unknown>,
  options?: { adminUrl?: string; catalog?: StaffCatalogPackage[] },
): OfficeOrderEmail {
  const catalog = options?.catalog ?? packagesForStaffEditor([]);
  const lines = orderServiceLines(saved).filter((line) => !isTravelFeeLine(line));
  const charges = orderChargeSummary(saved, lines);
  const packageLine = lines.find((line) => !isAddOn(line, catalog)) || lines[0];
  const addOns = packageLine ? lines.filter((line) => line !== packageLine) : lines;
  const features = packageFeatures(packageLine, catalog);
  const deliverables = describeDeliverables(features);
  const packageName = packageLine ? cleanPackageName(packageLine.name) : NOT_PROVIDED;
  const orderNumber = orderNumberOf(saved);
  const address = addressText(saved.addressLabel)
    || addressText(saved.address)
    || addressText(saved.propertyAddress)
    || addressText(saved.shootLocation)
    || NOT_PROVIDED;
  const requestedDate = firstDate(saved, ["scheduledDate", "requestedDate", "appointmentDate", "requestedDates"]);
  const clientName = clientNameOf(saved);
  const notes = notesOf(saved);

  const fields: Array<[string, string]> = [
    ["Order number", orderNumber],
    ["Admin link", text(options?.adminUrl) || NOT_PROVIDED],
    ["Client name", clientName],
    ["Client email", firstText(saved, ["clientEmail", "email"])],
    ["Client phone", firstText(saved, ["clientPhone", "phone"])],
    ["Agent", firstText(saved, ["agentName", "agent"])],
    ["Agent email/phone", agentContactOf(saved)],
    ["Brokerage", firstText(saved, ["brokerage", "brokerageName"])],
    ["Property address", address],
    ["Unit", firstText(saved, ["unit", "unitNumber"]) || addressPart(saved.address, ["unit", "unitNumber"])],
    ["Gate code", firstText(saved, ["gateCode", "gate"])],
    ["Lockbox", lockboxOf(saved)],
    ["Access notes", firstText(saved, ["accessNotes", "accessInstructions", "accessMethod"])],
    ["MLS #", firstText(saved, ["mlsNumber", "mls", "mlsId"])],
    ["Package", packageName],
    ["Photo count", deliverables.photoCount],
    ["Aerials", deliverables.aerials],
    ["Reels", deliverables.reels],
    ["Twilights", deliverables.twilights],
    ["Walkthrough", deliverables.walkthrough],
    ["Floor plan", deliverables.floorplan],
    ["Turnaround", deliverables.turnaround],
    ["Add-ons", addOnText(addOns)],
    ["Travel", travelTextForRecord(saved, { miles: true }) ?? NOT_PROVIDED],
    ["Subtotal", moneyField(saved, "subtotal", lines.length ? charges.subtotal : null)],
    ["Tax", moneyField(saved, "tax", lines.length ? charges.tax : null)],
    ["Total", moneyField(saved, "total", lines.length ? charges.total : null)],
    ["Payment", paymentOf(saved, lines.length ? charges.total : null)],
    ["Requested date", requestedDate],
    ["Requested time", firstText(saved, ["scheduledTime", "requestedTime", "appointmentTime", "timeWindow"])],
    ["Square footage", firstText(saved, ["squareFootage", "sqft", "homeSize"])],
    ["Occupancy", occupancyOf(saved)],
    ["Notes", notes],
    ["Booked via", bookedVia(saved)],
  ];

  const subjectCore = `New order ${orderNumber} — ${packageName} — ${address} — ${requestedDate}`;
  const subject = isTestOrder(clientName, notes) ? `[TEST] ${subjectCore}` : subjectCore;
  const plain = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#111"><h1 style="font-size:18px">${escapeHtml(subject)}</h1><table style="width:100%;border-collapse:collapse">${fields.map(([label, value]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join("")}</table></div>`;
  return { subject, text: plain, html };
}

export function officeOrderEmailFieldLabels(): readonly string[] {
  return FIELD_LABELS;
}

function isTestOrder(clientName: string, notes: string): boolean {
  return `${clientName}\n${notes}`.toUpperCase().includes("TEST ORDER");
}

function orderNumberOf(saved: Record<string, unknown>): string {
  const explicit = firstText(saved, ["orderNumber", "orderCode", "displayId"]);
  if (explicit) return explicit;
  const id = text(saved.id);
  if (!id) return NOT_PROVIDED;
  return `ORD-${id.slice(-5).toUpperCase()}`;
}

function clientNameOf(saved: Record<string, unknown>): string {
  const named = firstText(saved, ["clientName", "customerName"]);
  if (named) return named;
  const joined = [text(saved.firstName), text(saved.lastName)].filter(Boolean).join(" ");
  return joined || NOT_PROVIDED;
}

function agentContactOf(saved: Record<string, unknown>): string {
  const clientEmail = firstText(saved, ["clientEmail", "email"]).toLowerCase();
  const clientPhone = digits(firstText(saved, ["clientPhone", "phone"]));
  const email = agentField(saved, ["agentEmail", "realtorEmail", "listingAgentEmail", "brokerEmail"], "email");
  const phone = agentField(saved, ["agentPhone", "realtorPhone", "listingAgentPhone", "brokerPhone"], "phone");
  const parts: string[] = [];
  if (email && email.toLowerCase() !== clientEmail) parts.push(email);
  if (phone && digits(phone) !== clientPhone) parts.push(phone);
  return parts.length ? parts.join(" / ") : NOT_PROVIDED;
}

function agentField(saved: Record<string, unknown>, keys: string[], nestedKey: "email" | "phone"): string {
  const direct = firstText(saved, keys);
  if (direct !== NOT_PROVIDED) return direct;
  for (const holder of [saved.agent, saved.listingAgent, saved.realtor]) {
    const record = nested(holder);
    const value = text(record[nestedKey]);
    if (value) return value;
  }
  return "";
}

function digits(value: string): string {
  return value === NOT_PROVIDED ? "" : value.replace(/\D/g, "");
}

function notesOf(saved: Record<string, unknown>): string {
  const parts = ["vibeNote", "notes", "specialInstructions", "internalNotes"]
    .map((key) => text(saved[key]))
    .filter(Boolean);
  return parts.length ? parts.join("\n") : NOT_PROVIDED;
}

function lockboxOf(saved: Record<string, unknown>): string {
  const code = firstText(saved, ["lockboxCode", "supraCode"]);
  return code || NOT_PROVIDED;
}

function occupancyOf(saved: Record<string, unknown>): string {
  const parts = ["occupancy", "propertyStatus", "furnishingStatus"]
    .map((key) => text(saved[key]))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : NOT_PROVIDED;
}

function bookedVia(saved: Record<string, unknown>): string {
  const lead = text(saved.leadSource);
  const source = text(saved.source);
  const blob = `${lead} ${source}`.toLowerCase();
  if (!blob.trim()) return NOT_PROVIDED;
  if (/admin/.test(blob)) return "Admin";
  if (/portal/.test(blob)) return "Portal";
  if (/site|booking form|booking_form|temporary booking|ordericonic|web/.test(blob)) return "Site";
  return lead || source;
}

function paymentOf(saved: Record<string, unknown>, total: number | null): string {
  const invoice = nested(saved.invoice);
  const explicit = [saved.paymentStatus, saved.invoiceStatus, invoice.status]
    .map((value) => text(value).toLowerCase())
    .find(Boolean) || "";
  if (/partial/.test(explicit)) return "Partial";
  if (/\bpaid\b/.test(explicit) && !/unpaid/.test(explicit)) return "Paid";
  if (/unpaid/.test(explicit)) return "Unpaid";
  const paid = moneyOrNull(invoice.amountPaid) ?? moneyOrNull(saved.amountPaid) ?? moneyOrNull(saved.depositPaid);
  if (paid != null && total != null && paid > 0 && paid + 0.009 < total) return "Partial";
  if (paid != null && paid > 0) return "Paid";
  if (total != null || saved.total != null || invoice.status != null) return "Unpaid";
  return NOT_PROVIDED;
}

function moneyField(saved: Record<string, unknown>, key: "subtotal" | "tax" | "total", computed: number | null): string {
  const pricing = nested(saved.pricing);
  const direct = moneyOrNull(saved[key]) ?? moneyOrNull(pricing[key]);
  if (direct != null) return formatMoney(direct);
  if (computed != null) return formatMoney(computed);
  return NOT_PROVIDED;
}

function addOnText(lines: OrderServiceLine[]): string {
  if (lines.length === 0) return NOT_PROVIDED;
  return lines
    .map((line) => `${line.name} × ${line.qty || 1} — ${formatMoney(line.price)}`)
    .join("\n");
}

function packageFeatures(line: OrderServiceLine | undefined, catalog: StaffCatalogPackage[]): string[] {
  if (!line) return [];
  const match = catalog.find((item) => item.id === line.id || item.bookingId === line.id || item.name === line.name || item.name === cleanPackageName(line.name));
  return match?.includedServices ?? [];
}

export function describeDeliverables(features: string[]): {
  photoCount: string;
  aerials: string;
  reels: string;
  twilights: string;
  walkthrough: string;
  floorplan: string;
  turnaround: string;
} {
  return {
    photoCount: featureMatch(features, /(\d+\s+(?:daytime\s+)?(?:listing\s+)?(?:photos|images)|full images)/i),
    aerials: featureMatch(features, /(\d+\s+aerials?|aerial photos?|aerials?)/i),
    reels: featureMatch(features, /([^\n]*reel[^\n]*)/i),
    twilights: featureMatch(features, /([^\n]*twilight[^\n]*)/i),
    walkthrough: featureMatch(features, /([^\n]*(?:walkthrough|listing video|3d tour|matterport)[^\n]*)/i),
    floorplan: featureMatch(features, /([^\n]*floor\s*plan[^\n]*)/i),
    turnaround: featureMatch(features, /([^\n]*(?:same[- ]day|next[- ]day|by 7\s*pm)[^\n]*)/i),
  };
}

function featureMatch(features: string[], pattern: RegExp): string {
  const hit = features.find((feature) => pattern.test(feature));
  return hit ? hit.trim() : NOT_PROVIDED;
}

function isAddOn(line: OrderServiceLine, catalog: StaffCatalogPackage[]): boolean {
  const match = catalog.find((item) => item.id === line.id || item.bookingId === line.id);
  return match?.bookingKind === "addon" || match?.bookingKind === "upgrade";
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const joined = value.map((entry) => displayScalar(entry)).filter((entry) => entry && entry !== NOT_PROVIDED).join(", ");
      if (joined) return joined;
      continue;
    }
    const shown = displayScalar(value);
    if (shown !== NOT_PROVIDED) return shown;
  }
  return NOT_PROVIDED;
}

function firstDate(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      const formatted = formatChicagoDate(entry);
      if (formatted) return formatted;
    }
  }
  return NOT_PROVIDED;
}

function addressPart(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return NOT_PROVIDED;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const shown = displayScalar(record[key]);
    if (shown !== NOT_PROVIDED) return shown;
  }
  return NOT_PROVIDED;
}

function displayScalar(value: unknown): string {
  if (typeof value === "string") return value.trim() || NOT_PROVIDED;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    const record = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
    const seconds = typeof record.seconds === "number" ? record.seconds : typeof record._seconds === "number" ? record._seconds : null;
    if (seconds != null) return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
  return NOT_PROVIDED;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function moneyOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nested(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

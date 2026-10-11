/**
 * PDF of the branded Iconic invoice.
 * Layout follows the owner template: black header, pill table, totals box, notes, black footer.
 * Helvetica only. Processing and the total are the stored invoice amounts.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { INVOICE_LOGO_IMAGE } from "./invoiceLogoImage.ts";
import type { InvoiceFace, InvoiceFaceLine } from "./invoiceFace.ts";
import {
  formatInvoiceAmount,
  formatInvoiceDisplayDate,
  formatInvoicePhone,
  invoiceBlankRowCount,
  presentInvoiceMoney,
} from "./invoiceProcessing.ts";
import { TEMPLATE_H, TEMPLATE_W, invoiceTemplate as T } from "./invoiceTemplate.ts";
import { brandedInvoiceNumber } from "./orderProjectInvoice.ts";

export interface BrandedInvoicePdfInput {
  invoiceNumber: string;
  /** Document id. Used only when invoiceNumber is missing. */
  invoiceId?: string;
  /** Issued date. Used for the header date and the missing-number fallback year. */
  issuedAt?: unknown;
  clientName: string;
  billToAddress: string;
  status: string;
  face: InvoiceFace;
  notes?: string;
  /** Ignored. Contact details always come from businessContact.ts. */
  footerLines?: string[];
}

export function brandedInvoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "invoice"}.pdf`;
}

export function brandedInvoicePdf(input: BrandedInvoicePdfInput): Uint8Array {
  const content = layout(input);
  return pdfDocument(content, decode64(INVOICE_LOGO_IMAGE.rgb), decode64(INVOICE_LOGO_IMAGE.alpha));
}

const PAGE_W = 612;
const PAGE_H = 792;

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [1, 1, 1];
const YELLOW: RGB = [1, 0.831, 0];
const TEAL: RGB = [0, 0.706, 0.776];
const PINK: RGB = [1, 0.176, 0.471];
const GREEN: RGB = [0, 0.651, 0.318];
const GRAY: RGB = [0.953, 0.957, 0.965];
const RULE: RGB = [0.42, 0.447, 0.502];
const MUTED: RGB = [0.29, 0.29, 0.29];

type RGB = readonly [number, number, number];

function layout(input: BrandedInvoicePdfInput): string {
  const invoiceNumber = brandedInvoiceNumber({
    invoiceNumber: input.invoiceNumber,
    id: input.invoiceId,
    createdAt: input.issuedAt,
  });
  const presented = presentInvoiceMoney(input.face);
  const date = formatInvoiceDisplayDate(input.issuedAt);
  const ops: string[] = [];
  const X = (x: number) => (x / TEMPLATE_W) * PAGE_W;
  const capSize = (cap: number) => (cap / 0.718 / TEMPLATE_W) * PAGE_W;
  const base = (y: number, cap: number) => PAGE_H - ((y + cap) / TEMPLATE_H) * PAGE_H;
  const track = (cap: number, em: number) => capSize(cap) * em;

  const logoW = X(T.logo.w);
  const logoH = (T.logo.h / TEMPLATE_H) * PAGE_H;
  const logoX = X(T.logo.x);
  const logoY = PAGE_H - ((T.logo.y / TEMPLATE_H) * PAGE_H) - logoH;
  ops.push(fillRect(0, base(0, T.headerH), PAGE_W, (T.headerH / TEMPLATE_H) * PAGE_H, BLACK));
  ops.push(`q\n${num(logoW)} 0 0 ${num(logoH)} ${num(logoX)} ${num(logoY)} cm\n/Im1 Do\nQ`);

  const titleSize = capSize(T.title.cap);
  ops.push(text(X(T.title.x), base(T.title.y, T.title.cap), titleSize, "F2", YELLOW, "INVOICE", track(T.title.cap, T.title.track)));
  const metaSize = capSize(T.invoiceNo.cap);
  ops.push(text(X(T.invoiceNo.x), base(T.invoiceNo.y, T.invoiceNo.cap), metaSize, "F2", WHITE, `INVOICE NO : ${clip(invoiceNumber, 36)}`, track(T.invoiceNo.cap, T.invoiceNo.track)));
  if (date) ops.push(text(X(T.date.x), base(T.date.y, T.date.cap), metaSize, "F2", WHITE, date, track(T.date.cap, T.date.track)));
  const status = input.status.trim();
  if (status) ops.push(text(X(T.date.x), base(T.date.y + 28, 12), capSize(12), "F1", WHITE, clip(status.toUpperCase(), 28), 0.4));

  const toSize = capSize(T.billTo.cap);
  const addrSize = capSize(T.address.cap);
  ops.push(textRight(X(T.billTo.right), base(T.billTo.y, T.billTo.cap), toSize, "F2", WHITE, "INVOICE TO :", track(T.billTo.cap, T.billTo.track)));
  ops.push(textRight(X(T.clientName.right), base(T.clientName.y, T.clientName.cap), toSize, "F2", WHITE, clip((input.clientName || "Client").toUpperCase(), 32), track(T.clientName.cap, T.clientName.track)));
  const addressLines = wrap(input.billToAddress, addrSize, false, X(420)).slice(0, 3);
  addressLines.forEach((line, index) => {
    const y = T.address.y + index * (T.address.cap + 6);
    ops.push(textRight(X(T.address.right), base(y, T.address.cap), addrSize, "F1", WHITE, line));
  });

  const grayTop = (T.gray.y / TEMPLATE_H) * PAGE_H;
  const grayH = ((T.gray.bottom - T.gray.y) / TEMPLATE_H) * PAGE_H;
  const grayY = PAGE_H - grayTop - grayH;
  const grayX = X(T.gray.x);
  const grayW = X(T.gray.right - T.gray.x);
  ops.push(fillBottomRoundedRect(grayX, grayY, grayW, grayH, X(T.gray.radius), GRAY));

  const pillX = X(T.pill.x);
  const pillW = X(T.pill.right - T.pill.x);
  const pillH = (T.pill.h / TEMPLATE_H) * PAGE_H;
  const pillY = PAGE_H - ((T.pill.y / TEMPLATE_H) * PAGE_H) - pillH;
  ops.push(fillRoundedRect(pillX, pillY, pillW, pillH, pillH / 2, BLACK));
  const pillSize = capSize(T.pillLabel.cap);
  const pillTrack = track(T.pillLabel.cap, T.pillLabel.track);
  const labelY = base(T.pillLabel.y, T.pillLabel.cap);
  ops.push(text(X(T.descLabelX), labelY, pillSize, "F1", WHITE, "DESCRIPTION", pillTrack));
  ops.push(textCentered(X(T.qtyCenter), labelY, pillSize, "F1", WHITE, "QTY.", pillTrack));
  ops.push(textRight(X(T.priceLabelRight), labelY, pillSize, "F1", WHITE, "PRICE", pillTrack));
  ops.push(textRight(X(T.totalRight), labelY, pillSize, "F1", WHITE, "TOTAL", pillTrack));

  const rows = tableRows(input.face.services);
  const lineSize = capSize(T.lineCap);
  const lineTrack = track(T.lineCap, T.lineTrack);
  const descX = X(T.descX);
  const nameMax = X(T.qtyCenter - T.descX - 28);
  rows.forEach((row, index) => {
    const ruleTop = T.ruleY + index * T.rowH;
    const ruleY = PAGE_H - (ruleTop / TEMPLATE_H) * PAGE_H;
    ops.push(strokeLine(grayX, ruleY, grayX + grayW, ruleY, RULE, 0.7));
    if (row.blank) return;
    const baseline = base(T.rowTextY + index * T.rowH, T.lineCap);
    ops.push(text(descX, baseline, lineSize, "F2", TEAL, clipToWidth(row.name.toUpperCase(), lineSize, true, lineTrack, nameMax), lineTrack));
    ops.push(textCentered(X(T.qtyCenter), baseline, lineSize, "F2", TEAL, row.qty, lineTrack * 0.4));
    ops.push(textRight(X(T.priceRight), baseline, lineSize, "F2", TEAL, row.price));
    ops.push(textRight(X(T.totalRight), baseline, lineSize, "F2", TEAL, row.total));
  });

  const boxX = X(T.box.x);
  const boxW = X(T.box.right - T.box.x);
  const boxH = (T.box.h / TEMPLATE_H) * PAGE_H;
  const boxY = PAGE_H - ((T.box.y / TEMPLATE_H) * PAGE_H) - boxH;
  ops.push(strokeRoundedRect(boxX, boxY, boxW, boxH, X(T.box.radius), BLACK, X(T.box.border)));

  const cells: Array<{ id: string; label: string; amount: string; x: number }> = [
    { id: "subtotal", label: "SUB TOTAL", amount: formatInvoiceAmount(presented.subtotal), x: T.cells.subtotal },
    { id: "processing", label: "PROCESSING", amount: formatInvoiceAmount(presented.processing), x: T.cells.processing },
    { id: "promotions", label: "PROMOTIONS", amount: promoAmount(presented.promotions), x: T.cells.promotions },
    { id: "fees", label: "FEES", amount: formatInvoiceAmount(presented.fees), x: T.cells.fees },
  ];
  if (presented.travel !== 0) cells.push({ id: "travel", label: "TRAVEL", amount: formatInvoiceAmount(presented.travel), x: 0 });
  if (presented.tax !== 0) cells.push({ id: "tax", label: "TAX", amount: formatInvoiceAmount(presented.tax), x: 0 });
  const extras = cells.some((cell) => cell.x === 0);
  const totalsSize = capSize(T.cellCap);
  const cellTrack = track(T.cellCap, T.cellTrack);
  if (extras) {
    const left = T.cells.subtotal;
    const step = (T.grand.right - 90 - left) / cells.length;
    cells.forEach((cell, index) => {
      cell.x = left + step * index;
    });
  }
  cells.forEach((cell) => {
    ops.push(text(X(cell.x), base(T.cellLabelY, T.cellCap), totalsSize, "F1", BLACK, cell.label, cellTrack));
    ops.push(text(X(cell.x), base(T.cellAmountY, T.cellCap), totalsSize, "F2", BLACK, cell.amount));
  });
  const grandSize = capSize(T.grand.cap);
  const totalAmount = formatInvoiceAmount(presented.total);
  ops.push(textRight(X(T.grand.right), base(T.grand.labelY, T.grand.cap), grandSize, "F1", BLACK, "TOTAL", track(T.grand.cap, T.grand.track)));
  ops.push(textRight(X(T.grand.right), base(T.grand.amountY, T.grand.cap), grandSize, "F2", BLACK, totalAmount));

  const notesSize = capSize(T.notes.cap);
  ops.push(text(X(T.notes.x), base(T.notes.y, T.notes.cap), notesSize, "F2", PINK, "NOTES:", track(T.notes.cap, T.notes.track)));
  const noteBody = (input.notes || "").trim();
  const noteLines = noteBody ? wrap(noteBody, addrSize, false, X(TEMPLATE_W - T.notes.x - 80)).slice(0, 4) : [];
  noteLines.forEach((line, index) => {
    const y = T.notes.y + T.notes.cap + 10 + index * (T.address.cap + 6);
    if (y > T.footerY - 8) return;
    ops.push(text(X(T.notes.x), base(y, T.address.cap), addrSize, "F1", BLACK, line));
  });

  const footerH = ((TEMPLATE_H - T.footerY) / TEMPLATE_H) * PAGE_H;
  if (presented.amountPaid > 0) {
    ops.push(text(X(T.contact.x), footerH + 10, capSize(16), "F1", MUTED, `Amount paid ${formatInvoiceAmount(presented.amountPaid)}    Amount due ${formatInvoiceAmount(presented.amountDue)}`));
  }
  ops.push(fillRect(0, 0, PAGE_W, footerH, BLACK));
  const paySize = capSize(T.payment.cap);
  ops.push(text(X(T.payment.x), base(T.payment.y, T.payment.cap), paySize, "F2", GREEN, "PAYMENT INFORMATION:", track(T.payment.cap, T.payment.track)));
  const contactSize = capSize(T.contact.cap);
  ops.push(text(X(T.contact.x), base(T.contact.y, T.contact.cap), contactSize, "F1", WHITE, LEGAL_BUSINESS_NAME));
  ops.push(text(X(T.contact.x), base(T.contact.y + T.contact.line, T.contact.cap), contactSize, "F1", WHITE, formatInvoicePhone(BUSINESS_CONTACT.phoneDisplay)));
  ops.push(text(X(T.contact.x), base(T.emailY, T.contact.cap), contactSize, "F1", WHITE, BUSINESS_CONTACT.email));
  ops.push(textRight(X(T.contact.right), base(T.contact.y, T.contact.cap), contactSize, "F1", WHITE, BUSINESS_CONTACT.streetAddress));
  ops.push(textRight(X(T.contact.right), base(T.contact.y + T.contact.line, T.contact.cap), contactSize, "F1", WHITE, BUSINESS_CONTACT.addressLine2));
  const thanksSize = capSize(T.thanks.cap);
  ops.push(text(X(T.thanks.x), base(T.thanks.y, T.thanks.cap), thanksSize, "F2", TEAL, "THANK YOU FOR BEING ICONIC", track(T.thanks.cap, T.thanks.track)));
  ops.push(camera(X(T.camera.x), PAGE_H - ((T.camera.y + T.camera.h) / TEMPLATE_H) * PAGE_H, X(T.camera.w), (T.camera.h / TEMPLATE_H) * PAGE_H));
  return ops.filter(Boolean).join("\n");
}

function tableRows(lines: InvoiceFaceLine[]): Array<{ name: string; qty: string; price: string; total: string; blank: boolean }> {
  const filled = lines.map((line) => {
    const qty = line.qty > 0 ? line.qty : 1;
    const unit = Math.round((line.price / qty) * 100) / 100;
    return {
      name: line.name || "Service",
      qty: Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100),
      price: formatInvoiceAmount(unit),
      total: formatInvoiceAmount(line.price),
      blank: false,
    };
  });
  const blanks = invoiceBlankRowCount(filled.length);
  for (let i = 0; i < blanks; i++) filled.push({ name: "", qty: "", price: "", total: "", blank: true });
  return filled.slice(0, 12);
}

function promoAmount(value: number): string {
  if (value > 0) return formatInvoiceAmount(-value);
  return formatInvoiceAmount(0);
}

function camera(x: number, y: number, w = 38, h = 28): string {
  const sx = w / 38;
  const sy = h / 28;
  const rx = (value: number) => x + (value - x) * sx;
  const ry = (value: number) => y + (value - y) * sy;
  return [
    "q",
    "1 1 1 RG",
    `${num(1.2 * Math.min(sx, sy))} w`,
    roundedPath(x, y, w, h, 8 * Math.min(sx, sy)),
    "S",
    roundedPath(rx(x + 9), ry(y + 8), 20 * sx, 11 * sy, 2 * Math.min(sx, sy)),
    "S",
    `${num(rx(x + 14))} ${num(ry(y + 19))} m`,
    `${num(rx(x + 16))} ${num(ry(y + 22))} l`,
    `${num(rx(x + 22))} ${num(ry(y + 22))} l`,
    `${num(rx(x + 24))} ${num(ry(y + 19))} l`,
    "S",
    circlePath(rx(x + 19), ry(y + 13.5), 3.2 * Math.min(sx, sy)),
    "S",
    "Q",
  ].join("\n");
}

function fillRect(x: number, y: number, w: number, h: number, rgb: RGB): string {
  return `${rgbFill(rgb)}\n${num(x)} ${num(y)} ${num(w)} ${num(h)} re\nf`;
}

function fillRoundedRect(x: number, y: number, w: number, h: number, r: number, rgb: RGB): string {
  return `${rgbFill(rgb)}\n${roundedPath(x, y, w, h, r)}\nf`;
}

function fillBottomRoundedRect(x: number, y: number, w: number, h: number, r: number, rgb: RGB): string {
  return `${rgbFill(rgb)}\n${bottomRoundedPath(x, y, w, h, r)}\nf`;
}

function strokeRoundedRect(x: number, y: number, w: number, h: number, r: number, rgb: RGB, width: number): string {
  return `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} RG\n${num(width)} w\n${roundedPath(x, y, w, h, r)}\nS`;
}

function strokeLine(x1: number, y1: number, x2: number, y2: number, rgb: RGB, width: number): string {
  return `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} RG\n${num(width)} w\n${num(x1)} ${num(y1)} m\n${num(x2)} ${num(y2)} l\nS`;
}

function bottomRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = radius * 0.5522847498;
  return [
    `${num(x)} ${num(y + h)} m`,
    `${num(x + w)} ${num(y + h)} l`,
    `${num(x + w)} ${num(y + radius)} l`,
    `${num(x + w)} ${num(y + radius - k)} ${num(x + w - radius + k)} ${num(y)} ${num(x + w - radius)} ${num(y)} c`,
    `${num(x + radius)} ${num(y)} l`,
    `${num(x + radius - k)} ${num(y)} ${num(x)} ${num(y + radius - k)} ${num(x)} ${num(y + radius)} c`,
    "h",
  ].join("\n");
}

function roundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = radius * 0.5522847498;
  return [
    `${num(x + radius)} ${num(y)} m`,
    `${num(x + w - radius)} ${num(y)} l`,
    `${num(x + w - radius + k)} ${num(y)} ${num(x + w)} ${num(y + radius - k)} ${num(x + w)} ${num(y + radius)} c`,
    `${num(x + w)} ${num(y + h - radius)} l`,
    `${num(x + w)} ${num(y + h - radius + k)} ${num(x + w - radius + k)} ${num(y + h)} ${num(x + w - radius)} ${num(y + h)} c`,
    `${num(x + radius)} ${num(y + h)} l`,
    `${num(x + radius - k)} ${num(y + h)} ${num(x)} ${num(y + h - radius + k)} ${num(x)} ${num(y + h - radius)} c`,
    `${num(x)} ${num(y + radius)} l`,
    `${num(x)} ${num(y + radius - k)} ${num(x + radius - k)} ${num(y)} ${num(x + radius)} ${num(y)} c`,
    "h",
  ].join("\n");
}

function circlePath(cx: number, cy: number, r: number): string {
  const k = r * 0.5522847498;
  return [
    `${num(cx + r)} ${num(cy)} m`,
    `${num(cx + r)} ${num(cy + k)} ${num(cx + k)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c`,
    `${num(cx - k)} ${num(cy + r)} ${num(cx - r)} ${num(cy + k)} ${num(cx - r)} ${num(cy)} c`,
    `${num(cx - r)} ${num(cy - k)} ${num(cx - k)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c`,
    `${num(cx + k)} ${num(cy - r)} ${num(cx + r)} ${num(cy - k)} ${num(cx + r)} ${num(cy)} c`,
    "h",
  ].join("\n");
}

function text(x: number, y: number, size: number, font: "F1" | "F2", rgb: RGB, value: string, tracking = 0): string {
  const clean = ascii(value);
  if (!clean) return "";
  return [
    "BT",
    `/${font} ${num(size)} Tf`,
    `${num(tracking)} Tc`,
    rgbFill(rgb),
    `1 0 0 1 ${num(x)} ${num(y)} Tm`,
    `(${escapePdf(clean)}) Tj`,
    "ET",
  ].join("\n");
}

function textRight(right: number, y: number, size: number, font: "F1" | "F2", rgb: RGB, value: string, tracking = 0): string {
  const clean = ascii(value);
  if (!clean) return "";
  const width = textWidth(clean, size, font === "F2", tracking);
  return text(right - width, y, size, font, rgb, clean, tracking);
}

function textCentered(center: number, y: number, size: number, font: "F1" | "F2", rgb: RGB, value: string, tracking = 0): string {
  const clean = ascii(value);
  if (!clean) return "";
  const width = textWidth(clean, size, font === "F2", tracking);
  return text(center - width / 2, y, size, font, rgb, clean, tracking);
}

function rgbFill(rgb: RGB): string {
  return `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} rg`;
}

function clip(value: string, max: number): string {
  const clean = ascii(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function clipToWidth(value: string, size: number, bold: boolean, tracking: number, maxWidth: number): string {
  const clean = ascii(value);
  if (!clean || textWidth(clean, size, bold, tracking) <= maxWidth) return clean;
  let next = clean;
  while (next.length > 1 && textWidth(`${next}...`, size, bold, tracking) > maxWidth) next = next.slice(0, -1);
  return `${next}...`;
}

function wrap(value: string, size: number, bold: boolean, maxWidth: number): string[] {
  const clean = ascii(value);
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, bold, 0) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

const HELV: Record<string, number> = {
  " ": 278, ".": 278, ",": 278, ":": 278, ";": 278, "-": 333, "/": 278, "'": 191,
  $: 556, "&": 667, "@": 1000, "(": 333, ")": 333,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  A: 667, B: 667, C: 722, D: 722, E: 611, F: 556, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};

function textWidth(value: string, size: number, bold: boolean, tracking: number): number {
  let units = 0;
  for (const ch of value) units += HELV[ch] ?? 560;
  const glyphs = (units / 1000) * size * (bold ? 1.06 : 1);
  return glyphs + Math.max(0, value.length - 1) * tracking;
}

function ascii(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function decode64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pdfDocument(content: string, rgb: Uint8Array, alpha: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  const pushText = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    chunks.push(bytes);
    cursor += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    cursor += bytes.length;
  };
  const addObj = (id: number, body: string | Uint8Array) => {
    offsets[id] = cursor;
    pushText(`${id} 0 obj\n`);
    if (typeof body === "string") pushText(body);
    else pushBytes(body);
    pushText("\nendobj\n");
  };

  const contentBytes = new TextEncoder().encode(content);
  const width = INVOICE_LOGO_IMAGE.width;
  const height = INVOICE_LOGO_IMAGE.height;

  pushText("%PDF-1.4\n");
  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObj(2, "<< /Type /Pages /Count 1 /Kids [7 0 R] >>");
  addObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  addObj(
    6,
    byteObject(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alpha.length} >>\nstream\n`,
      alpha,
    ),
  );
  addObj(
    5,
    byteObject(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${rgb.length} /SMask 6 0 R >>\nstream\n`,
      rgb,
    ),
  );
  addObj(
    7,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 8 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> >>`,
  );
  addObj(8, byteObject(`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes));

  const xrefAt = cursor;
  let xref = `xref\n0 9\n0000000000 65535 f \n`;
  for (let id = 1; id <= 8; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  pushText(xref);

  const out = new Uint8Array(cursor);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function byteObject(header: string, bytes: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(header);
  const tail = new TextEncoder().encode("\nendstream");
  const out = new Uint8Array(head.length + bytes.length + tail.length);
  out.set(head, 0);
  out.set(bytes, head.length);
  out.set(tail, head.length + bytes.length);
  return out;
}

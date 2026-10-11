/**
 * PDF of the branded Iconic invoice.
 * Layout follows the owner template: black header, pill table, totals box, notes, black footer.
 * Helvetica only. Processing and the total are the stored invoice amounts.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { INVOICE_LOGO_IMAGE } from "./invoiceLogoImage.ts";
import type { InvoiceFace, InvoiceFaceLine } from "./invoiceFace.ts";
import {
  formatInvoiceDisplayDate,
  invoiceBlankRowCount,
  presentInvoiceMoney,
} from "./invoiceProcessing.ts";
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
const LEFT = 28;
const RIGHT = 584;

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

  const metaSize = PAGE_W * 0.018;
  const toSize = PAGE_W * 0.02;
  const addrSize = PAGE_W * 0.018;
  const pillSize = PAGE_W * 0.024;
  const lineSize = PAGE_W * 0.022;
  const totalsSize = PAGE_W * 0.026;
  const grandSize = PAGE_W * 0.04;
  const notesSize = PAGE_W * 0.028;
  const paySize = PAGE_W * 0.022;
  const pillTrack = pillSize * 0.04;
  const lineTrack = lineSize * 0.08;

  const logoW = 248;
  const logoH = logoW * (INVOICE_LOGO_IMAGE.height / INVOICE_LOGO_IMAGE.width);
  const logoX = RIGHT - logoW;
  const logoY = PAGE_H - 8 - logoH;
  const addressLines = wrap(input.billToAddress, addrSize, false, 230).slice(0, 3);
  let infoY = logoY - 18;
  const nameY = infoY - (toSize + 4);
  let lastBaseline = nameY;
  addressLines.forEach((_, index) => {
    lastBaseline = nameY - (index + 1) * (addrSize + 3);
  });
  const dateY = lastBaseline;
  const status = input.status.trim();
  const headerBottom = (status ? dateY - 16 : dateY) - 18;

  ops.push(fillRect(0, headerBottom, PAGE_W, PAGE_H - headerBottom, BLACK));
  ops.push(`q\n${num(logoW)} 0 0 ${num(logoH)} ${num(logoX)} ${num(logoY)} cm\n/Im1 Do\nQ`);

  ops.push(text(LEFT, PAGE_H - 46, 28, "F2", YELLOW, "INVOICE", 2.2));
  ops.push(text(LEFT, PAGE_H - 78, metaSize, "F2", WHITE, `INVOICE NO : ${clip(invoiceNumber, 36)}`, metaSize * 0.06));
  if (date) ops.push(text(LEFT, dateY, metaSize, "F2", WHITE, date, metaSize * 0.06));
  if (status) ops.push(text(LEFT, dateY - 14, 8, "F1", WHITE, clip(status.toUpperCase(), 28), 0.4));

  ops.push(textRight(RIGHT, infoY, toSize, "F2", WHITE, "INVOICE TO :", toSize * 0.04));
  ops.push(textRight(RIGHT, nameY, toSize, "F2", WHITE, clip((input.clientName || "Client").toUpperCase(), 32), toSize * 0.04));
  addressLines.forEach((line, index) => {
    ops.push(textRight(RIGHT, nameY - (index + 1) * (addrSize + 3), addrSize, "F1", WHITE, line));
  });

  const rows = tableRows(input.face.services);
  const pillW = RIGHT - LEFT;
  const pillH = Math.max(34, pillSize * 2.15);
  const tuck = 8;
  const bodyInset = pillW * 0.026;
  const boxInset = pillW * 0.011;
  const bodyLeft = LEFT + bodyInset;
  const bodyRight = RIGHT - bodyInset;
  const boxLeft = LEFT + boxInset;
  const boxRight = RIGHT - boxInset;
  const descX = LEFT + pillW * 0.06;
  const qtyCenter = LEFT + pillW * 0.55;
  const priceRight = LEFT + pillW * 0.72;
  const totalRight = LEFT + pillW * 0.90;
  const nameMax = qtyCenter - descX - 36;
  const tableTop = headerBottom - 14;
  const pillY = tableTop - pillH;
  const footerH = 168;
  const boxH = Math.max(92, grandSize * 2.35);
  const noteBody = (input.notes || "").trim();
  const noteLines = noteBody ? wrap(noteBody, addrSize, false, RIGHT - LEFT).slice(0, 4) : [];
  const notesBlock = 28 + noteLines.length * (addrSize + 3);
  const room = pillY - (footerH + notesBlock + boxH + 16);
  const rowH = Math.max(22, Math.min(34, room / Math.max(1, rows.length)));
  const visibleH = rows.length * rowH;
  const bodyH = visibleH + tuck;
  const bodyBottom = pillY - visibleH;
  ops.push(fillBottomRoundedRect(bodyLeft, bodyBottom, bodyRight - bodyLeft, bodyH, 14, GRAY));
  ops.push(fillRoundedRect(LEFT, pillY, pillW, pillH, pillH / 2, BLACK));
  const labelY = pillY + pillH / 2 - pillSize * 0.35;
  ops.push(text(descX, labelY, pillSize, "F1", WHITE, "DESCRIPTION", pillTrack));
  ops.push(textCentered(qtyCenter, labelY, pillSize, "F1", WHITE, "QTY.", pillTrack));
  ops.push(textRight(priceRight, labelY, pillSize, "F1", WHITE, "PRICE", pillTrack));
  ops.push(textRight(totalRight, labelY, pillSize, "F1", WHITE, "TOTAL", pillTrack));

  rows.forEach((row, index) => {
    const baseline = pillY - rowH * index - rowH * 0.62;
    const ruleY = pillY - rowH * (index + 1);
    ops.push(strokeLine(bodyLeft, ruleY, bodyRight, ruleY, RULE, 0.6));
    if (row.blank) return;
    ops.push(text(descX, baseline, lineSize, "F2", TEAL, clipToWidth(row.name.toUpperCase(), lineSize, true, lineTrack, nameMax), lineTrack));
    ops.push(textCentered(qtyCenter, baseline, lineSize, "F2", TEAL, row.qty, lineTrack));
    ops.push(textRight(priceRight, baseline, lineSize, "F2", TEAL, row.price, lineTrack * 0.4));
    ops.push(textRight(totalRight, baseline, lineSize, "F2", TEAL, row.total, lineTrack * 0.4));
  });

  const boxTop = bodyBottom - 16;
  const boxY = boxTop - boxH;
  ops.push(strokeRoundedRect(boxLeft, boxY, boxRight - boxLeft, boxH, 14, BLACK, 2));

  const cells: Array<{ label: string; amount: string }> = [
    { label: "SUB TOTAL", amount: money(presented.subtotal) },
    { label: "PROCESSING", amount: money(presented.processing) },
    { label: "PROMOTIONS", amount: promoAmount(presented.promotions) },
    { label: "FEES", amount: money(presented.fees) },
  ];
  if (presented.travel !== 0) cells.splice(3, 0, { label: "TRAVEL", amount: money(presented.travel) });
  if (presented.tax !== 0) cells.push({ label: "TAX", amount: money(presented.tax) });
  const totalAmount = money(presented.total);
  const totalCol = Math.max(textWidth("TOTAL", grandSize, false, grandSize * 0.04), textWidth(totalAmount, grandSize, true, 0));
  const innerLeft = boxLeft + 14;
  const innerRight = boxRight - 14;
  const labelWidths = cells.map((cell) => textWidth(cell.label, totalsSize, false, totalsSize * 0.02));
  const labelsSum = labelWidths.reduce((sum, width) => sum + width, 0);
  const gap = cells.length > 1
    ? Math.max(6, (innerRight - totalCol - 12 - innerLeft - labelsSum) / (cells.length - 1))
    : 0;
  let cellX = innerLeft;
  const labelBaseline = boxY + boxH - Math.max(22, totalsSize + 8);
  const amountBaseline = labelBaseline - (totalsSize + 8);
  cells.forEach((cell, index) => {
    ops.push(text(cellX, labelBaseline, totalsSize, "F1", BLACK, cell.label, totalsSize * 0.02));
    ops.push(text(cellX, amountBaseline, totalsSize, "F2", BLACK, cell.amount));
    cellX += labelWidths[index] + gap;
  });
  const totalX = innerRight;
  ops.push(textRight(totalX, boxY + boxH - Math.max(24, grandSize * 0.85), grandSize, "F1", BLACK, "TOTAL", grandSize * 0.04));
  ops.push(textRight(totalX, boxY + Math.max(16, grandSize * 0.72), grandSize, "F2", BLACK, totalAmount));

  let noteY = boxY - 26;
  ops.push(text(LEFT, noteY, notesSize, "F2", PINK, "NOTES:", notesSize * 0.08));
  noteY -= notesSize + 4;
  for (const line of noteLines) {
    if (noteY < footerH + 8) break;
    ops.push(text(LEFT, noteY, addrSize, "F1", BLACK, line));
    noteY -= addrSize + 3;
  }

  if (presented.amountPaid > 0) {
    ops.push(text(LEFT, footerH + 14, paySize * 0.8, "F1", MUTED, `Amount paid ${money(presented.amountPaid)}    Amount due ${money(presented.amountDue)}`));
  }

  const contactLead = paySize + 4;
  ops.push(fillRect(0, 0, PAGE_W, footerH, BLACK));
  ops.push(text(LEFT, footerH - 28, paySize, "F2", GREEN, "PAYMENT INFORMATION:", paySize * 0.14));
  ops.push(text(LEFT, footerH - 28 - contactLead, paySize, "F1", WHITE, LEGAL_BUSINESS_NAME));
  ops.push(text(LEFT, footerH - 28 - contactLead * 2, paySize, "F1", WHITE, BUSINESS_CONTACT.phoneDisplay));
  ops.push(text(LEFT, footerH - 28 - contactLead * 3, paySize, "F1", WHITE, BUSINESS_CONTACT.email));
  ops.push(textRight(RIGHT, footerH - 28 - contactLead, paySize, "F1", WHITE, BUSINESS_CONTACT.streetAddress));
  ops.push(textRight(RIGHT, footerH - 28 - contactLead * 2, paySize, "F1", WHITE, BUSINESS_CONTACT.addressLine2));
  const thanks = "THANK YOU FOR BEING ICONIC";
  const thanksMax = RIGHT - 56 - LEFT;
  let thanksTrack = paySize * 0.5;
  while (textWidth(thanks, paySize, true, thanksTrack) > thanksMax && thanksTrack > paySize * 0.2) thanksTrack -= 0.2;
  ops.push(text(LEFT, 32, paySize, "F2", TEAL, thanks, thanksTrack));
  ops.push(camera(RIGHT - 48, 18));
  return ops.filter(Boolean).join("\n");
}

function tableRows(lines: InvoiceFaceLine[]): Array<{ name: string; qty: string; price: string; total: string; blank: boolean }> {
  const filled = lines.map((line) => {
    const qty = line.qty > 0 ? line.qty : 1;
    const unit = Math.round((line.price / qty) * 100) / 100;
    return {
      name: line.name || "Service",
      qty: Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100),
      price: money(unit),
      total: money(line.price),
      blank: false,
    };
  });
  const blanks = invoiceBlankRowCount(filled.length);
  for (let i = 0; i < blanks; i++) filled.push({ name: "", qty: "", price: "", total: "", blank: true });
  return filled.slice(0, 12);
}

function promoAmount(value: number): string {
  if (value > 0) return `-${money(value)}`;
  return money(0);
}

function camera(x: number, y: number): string {
  return [
    "q",
    "1 1 1 RG",
    "1.2 w",
    roundedPath(x, y, 38, 28, 8),
    "S",
    roundedPath(x + 9, y + 8, 20, 11, 2),
    "S",
    `${num(x + 14)} ${num(y + 19)} m`,
    `${num(x + 16)} ${num(y + 22)} l`,
    `${num(x + 22)} ${num(y + 22)} l`,
    `${num(x + 24)} ${num(y + 19)} l`,
    "S",
    circlePath(x + 19, y + 13.5, 3.2),
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

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
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

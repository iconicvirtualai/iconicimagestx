/**
 * PDF of the branded Iconic invoice.
 * Layout follows the owner template: black header, pill table, totals box, notes, black footer.
 * Helvetica only. Display mode does not add the processing fee to the total.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { INVOICE_LOGO_IMAGE } from "./invoiceLogoImage.ts";
import type { InvoiceFace, InvoiceFaceLine } from "./invoiceFace.ts";
import {
  formatInvoiceDisplayDate,
  invoiceBlankRowCount,
  invoiceProcessingMode,
  presentInvoiceMoney,
  type InvoiceProcessingMode,
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
  /** Defaults to INVOICE_PROCESSING_MODE, which is display. */
  processingMode?: InvoiceProcessingMode;
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
const FOOTER_H = 128;

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
  const presented = presentInvoiceMoney(input.face, input.processingMode ?? invoiceProcessingMode());
  const date = formatInvoiceDisplayDate(input.issuedAt);
  const ops: string[] = [];

  ops.push(fillRect(0, PAGE_H - 196, PAGE_W, 196, BLACK));

  const logoW = 170;
  const logoH = logoW * (INVOICE_LOGO_IMAGE.height / INVOICE_LOGO_IMAGE.width);
  const logoX = RIGHT - logoW;
  const logoY = PAGE_H - 14 - logoH;
  ops.push(`q\n${num(logoW)} 0 0 ${num(logoH)} ${num(logoX)} ${num(logoY)} cm\n/Im1 Do\nQ`);

  ops.push(text(LEFT, 748, 26, "F2", YELLOW, "INVOICE", 2.4));
  ops.push(text(LEFT, 716, 9, "F1", WHITE, `INVOICE NO : ${clip(invoiceNumber, 36)}`, 0.45));
  if (date) ops.push(text(LEFT, 692, 10, "F1", WHITE, date, 0.7));
  const status = input.status.trim();
  if (status) ops.push(text(LEFT, date ? 676 : 692, 8, "F1", WHITE, clip(status.toUpperCase(), 28), 0.6));

  let infoY = logoY - 26;
  ops.push(textRight(RIGHT, infoY, 8, "F2", WHITE, "INVOICE TO :", 0.45));
  infoY -= 16;
  ops.push(textRight(RIGHT, infoY, 11, "F2", WHITE, clip((input.clientName || "Client").toUpperCase(), 32)));
  const addressLines = wrap(input.billToAddress, 9, false, 190).slice(0, 2);
  for (const line of addressLines) {
    infoY -= 13;
    ops.push(textRight(RIGHT, infoY, 9, "F1", WHITE, line));
  }

  const rows = tableRows(input.face.services);
  const rowH = 24;
  const pillH = 26;
  const tableTop = 578;
  const pillY = tableTop - pillH;
  ops.push(fillRoundedRect(LEFT, pillY, RIGHT - LEFT, pillH, 13, BLACK));
  const labelY = pillY + 9;
  ops.push(text(LEFT + 14, labelY, 8, "F1", WHITE, "DESCRIPTION", 0.7));
  ops.push(textCentered(408, labelY, 8, "F1", WHITE, "QTY.", 0.6));
  ops.push(textRight(500, labelY, 8, "F1", WHITE, "PRICE", 0.6));
  ops.push(textRight(RIGHT - 12, labelY, 8, "F1", WHITE, "TOTAL", 0.6));

  const bodyH = rows.length * rowH;
  const bodyTop = pillY;
  const bodyBottom = bodyTop - bodyH;
  ops.push(fillRect(LEFT, bodyBottom, RIGHT - LEFT, bodyH, GRAY));
  rows.forEach((row, index) => {
    const baseline = bodyTop - rowH * index - 16;
    const ruleY = bodyTop - rowH * (index + 1);
    ops.push(strokeLine(LEFT, ruleY, RIGHT, ruleY, RULE, 0.6));
    if (row.blank) return;
    ops.push(text(LEFT + 14, baseline, 9, "F2", TEAL, clip(row.name.toUpperCase(), 34), 0.55));
    ops.push(textCentered(408, baseline, 9, "F2", TEAL, row.qty));
    ops.push(textRight(500, baseline, 9, "F2", TEAL, row.price));
    ops.push(textRight(RIGHT - 12, baseline, 9, "F2", TEAL, row.total));
  });

  const boxH = presented.presentation === "included" ? 78 : 64;
  const boxTop = Math.min(bodyBottom - 16, 360);
  const boxY = boxTop - boxH;
  ops.push(strokeRoundedRect(LEFT, boxY, RIGHT - LEFT, boxH, 10, BLACK, 1.4));

  const cells: Array<{ label: string; amount: string; note?: string }> = [
    { label: "SUB TOTAL", amount: money(presented.subtotal) },
    {
      label: "PROCESSING",
      amount: money(presented.processing),
      note: presented.presentation === "included" ? "INCLUDED" : undefined,
    },
    { label: "PROMOTIONS", amount: promoAmount(presented.promotions) },
    { label: "FEES", amount: money(presented.fees) },
  ];
  if (presented.travel !== 0) cells.splice(3, 0, { label: "TRAVEL", amount: money(presented.travel) });
  if (presented.tax !== 0) cells.splice(cells.length - 0, 0, { label: "TAX", amount: money(presented.tax) });
  const totalCell = { label: "TOTAL", amount: money(presented.total) };
  const slotW = (RIGHT - LEFT - 28) / (cells.length + 1);
  cells.forEach((cell, index) => {
    const x = LEFT + 16 + slotW * index;
    ops.push(text(x, boxY + boxH - 22, 7, "F1", BLACK, cell.label, 0.3));
    ops.push(text(x, boxY + boxH - 40, 11, "F2", BLACK, cell.amount));
    if (cell.note) ops.push(text(x, boxY + 14, 7, "F2", GREEN, cell.note, 0.3));
  });
  const totalX = RIGHT - 16;
  ops.push(textRight(totalX, boxY + boxH - 22, 11, "F2", BLACK, totalCell.label, 0.4));
  ops.push(textRight(totalX, boxY + boxH - 44, 16, "F2", BLACK, totalCell.amount));

  let noteY = boxY - 28;
  if (presented.presentation === "included") {
    const note = "Processing is 2.8% of the subtotal and is included in the total.";
    for (const line of wrap(note, 8, false, RIGHT - LEFT)) {
      ops.push(text(LEFT, noteY, 8, "F1", MUTED, line));
      noteY -= 11;
    }
    noteY -= 8;
  }
  ops.push(text(LEFT, noteY, 11, "F2", PINK, "NOTES:", 1.3));
  noteY -= 16;
  const noteBody = (input.notes || "").trim();
  if (noteBody) {
    for (const line of wrap(noteBody, 10, false, RIGHT - LEFT).slice(0, 5)) {
      if (noteY < FOOTER_H + 8) break;
      ops.push(text(LEFT, noteY, 10, "F1", BLACK, line));
      noteY -= 13;
    }
  }

  if (presented.amountPaid > 0) {
    ops.push(text(LEFT, FOOTER_H + 16, 8, "F1", MUTED, `Amount paid ${money(presented.amountPaid)}    Amount due ${money(presented.amountDue)}`));
  }

  ops.push(fillRect(0, 0, PAGE_W, FOOTER_H, BLACK));
  ops.push(text(LEFT, 104, 9, "F2", GREEN, "PAYMENT INFORMATION:", 0.45));
  ops.push(text(LEFT, 84, 9, "F1", WHITE, LEGAL_BUSINESS_NAME));
  ops.push(text(LEFT, 70, 9, "F1", WHITE, BUSINESS_CONTACT.phoneDisplay));
  ops.push(text(LEFT, 56, 9, "F1", WHITE, BUSINESS_CONTACT.email));
  ops.push(textRight(RIGHT, 84, 9, "F1", WHITE, BUSINESS_CONTACT.streetAddress));
  ops.push(textRight(RIGHT, 70, 9, "F1", WHITE, BUSINESS_CONTACT.addressLine2));
  ops.push(text(LEFT, 28, 8, "F2", TEAL, "THANK YOU FOR BEING ICONIC", 1.55));
  ops.push(camera(RIGHT - 34, 16));
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
    "1.15 w",
    roundedPath(x, y, 26, 16, 2.2),
    "S",
    roundedPath(x + 8, y + 14, 9, 5, 1.2),
    "S",
    circlePath(x + 13, y + 8, 4.2),
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

function strokeRoundedRect(x: number, y: number, w: number, h: number, r: number, rgb: RGB, width: number): string {
  return `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} RG\n${num(width)} w\n${roundedPath(x, y, w, h, r)}\nS`;
}

function strokeLine(x1: number, y1: number, x2: number, y2: number, rgb: RGB, width: number): string {
  return `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} RG\n${num(width)} w\n${num(x1)} ${num(y1)} m\n${num(x2)} ${num(y2)} l\nS`;
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

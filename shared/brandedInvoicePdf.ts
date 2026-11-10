/**
 * PDF of an Iconic invoice.
 * Cream page, site teal, Inter, and the black site wordmark. Processing and the total are the stored invoice amounts.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { INVOICE_INTER_FONTS } from "./invoiceInterFonts.ts";
import { INVOICE_CAMERA_IMAGE } from "./invoiceCameraImage.ts";
import { INVOICE_WORDMARK } from "./invoiceWordmarkImage.ts";
import type { InvoiceFace, InvoiceFaceLine } from "./invoiceFace.ts";
import {
  formatInvoiceAmount,
  formatInvoiceDisplayDate,
  formatInvoicePhone,
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
  return pdfDocument(
    content,
    decode64(INVOICE_WORDMARK.rgb),
    decode64(INVOICE_WORDMARK.alpha),
    decode64(INVOICE_CAMERA_IMAGE.rgb),
    decode64(INVOICE_CAMERA_IMAGE.alpha),
  );
}

const PAGE_W = 612;
const PAGE_H = 792;

const BLACK: RGB = [0.04, 0.04, 0.04];
const CREAM: RGB = [0.961, 0.949, 0.918];
const TEAL: RGB = [13 / 255, 148 / 255, 136 / 255];
const LINE: RGB = [0.86, 0.88, 0.87];
const MUTED: RGB = [0.42, 0.46, 0.45];

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

  ops.push(fillRect(0, 0, PAGE_W, PAGE_H, CREAM));
  const margin = 48;
  const right = PAGE_W - margin;
  const logoW = 196;
  const logoH = logoW * (INVOICE_WORDMARK.height / INVOICE_WORDMARK.width);
  const logoTop = PAGE_H - 42;
  const logoY = logoTop - logoH;
  ops.push(`q\n${num(logoW)} 0 0 ${num(logoH)} ${num(margin)} ${num(logoY)} cm\n/Im1 Do\nQ`);
  ops.push(textRight(right, logoTop - 18, 20, "F3", TEAL, "Invoice"));
  ops.push(textRight(right, logoTop - 36, 9, "F2", BLACK, `INVOICE NO : ${clip(invoiceNumber, 36)}`));
  if (date) ops.push(textRight(right, logoTop - 50, 9, "F2", MUTED, date));
  const status = input.status.trim();
  if (status) ops.push(textRight(right, logoTop - 64, 8, "F2", MUTED, clip(status.toUpperCase(), 28)));

  let y = logoY - 26;
  ops.push(strokeLine(margin, y, right, y, LINE, 0.6));
  y -= 20;
  ops.push(text(margin, y, 8, "F3", TEAL, "INVOICE TO :"));
  y -= 16;
  ops.push(text(margin, y, 12, "F3", BLACK, clip((input.clientName || "Client").toUpperCase(), 48)));
  const addressLines = wrap(input.billToAddress, 9, "F2", 320).slice(0, 3);
  addressLines.forEach((line) => {
    y -= 13;
    ops.push(text(margin, y, 9, "F2", MUTED, line));
  });

  y -= 22;
  ops.push(strokeLine(margin, y, right, y, LINE, 0.7));
  y -= 16;
  ops.push(text(margin, y, 8, "F3", MUTED, "DESCRIPTION"));
  ops.push(textCentered(330, y, 8, "F3", MUTED, "QTY."));
  ops.push(textRight(470, y, 8, "F3", MUTED, "PRICE"));
  ops.push(textRight(right, y, 8, "F3", MUTED, "TOTAL"));
  y -= 8;
  ops.push(strokeLine(margin, y, right, y, LINE, 0.4));

  const rows = tableRows(input.face.services);
  rows.forEach((row) => {
    y -= 18;
    if (!row.blank) {
      ops.push(text(margin, y, 10, "F3", BLACK, clipToWidth(row.name.toUpperCase(), 10, "F3", 0, 240)));
      ops.push(textCentered(330, y, 10, "F2", BLACK, row.qty));
      ops.push(textRight(470, y, 10, "F2", BLACK, row.price));
      ops.push(textRight(right, y, 10, "F2", BLACK, row.total));
    }
    y -= 8;
    ops.push(strokeLine(margin, y, right, y, LINE, 0.35));
  });

  y -= 20;
  const cells: Array<{ id: string; label: string; amount: string }> = [
    { id: "subtotal", label: "SUB TOTAL", amount: formatInvoiceAmount(presented.subtotal) },
    { id: "processing", label: "PROCESSING", amount: explicitZero(presented.processing) },
    { id: "promotions", label: "PROMOTIONS", amount: promoAmount(presented.promotions) },
    { id: "fees", label: "FEES", amount: explicitZero(presented.fees) },
  ];
  if (presented.travel !== 0) cells.push({ id: "travel", label: "TRAVEL", amount: formatInvoiceAmount(presented.travel) });
  if (presented.tax !== 0) cells.push({ id: "tax", label: "TAX", amount: formatInvoiceAmount(presented.tax) });
  const labelX = right - 170;
  cells.forEach((cell) => {
    ops.push(text(labelX, y, 9, "F2", MUTED, cell.label));
    ops.push(textRight(right, y, 9, "F3", BLACK, cell.amount));
    y -= 14;
  });
  ops.push(strokeLine(labelX, y + 8, right, y + 8, TEAL, 0.8));
  const totalAmount = formatInvoiceAmount(presented.total);
  ops.push(text(labelX, y - 6, 11, "F3", TEAL, "TOTAL"));
  ops.push(textRight(right, y - 6, 11, "F3", BLACK, totalAmount));
  y -= 28;

  ops.push(text(margin, y, 8, "F3", TEAL, "NOTES:"));
  const noteBody = (input.notes || "").trim() || "No notes on this invoice.";
  const noteLines = wrap(noteBody, 9, "F2", right - margin).slice(0, 4);
  noteLines.forEach((line) => {
    y -= 13;
    ops.push(text(margin, y, 9, "F2", BLACK, line));
  });

  y -= 16;
  ops.push(strokeLine(margin, y, right, y, LINE, 0.7));
  y -= 18;
  ops.push(text(margin, y, 8, "F3", TEAL, "PAYMENT INFORMATION:"));
  y -= 14;
  ops.push(text(margin, y, 9, "F2", BLACK, LEGAL_BUSINESS_NAME));
  ops.push(textRight(right, y, 9, "F2", BLACK, BUSINESS_CONTACT.streetAddress));
  y -= 12;
  ops.push(text(margin, y, 9, "F2", BLACK, formatInvoicePhone(BUSINESS_CONTACT.phoneDisplay)));
  ops.push(textRight(right, y, 9, "F2", BLACK, BUSINESS_CONTACT.addressLine2));
  y -= 12;
  ops.push(text(margin, y, 9, "F2", BLACK, BUSINESS_CONTACT.email));
  y -= 18;
  ops.push(text(margin, y, 9, "F3", TEAL, "THANK YOU FOR BEING ICONIC"));
  y -= 16;
  ops.push(text(margin, y, 9, "F2", MUTED, `Amount paid ${formatInvoiceAmount(presented.amountPaid)}    Amount due ${formatInvoiceAmount(presented.amountDue)}`));
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
  return filled.slice(0, 12);
}

function explicitZero(value: number): string {
  if (!value) return "$0.00";
  return formatInvoiceAmount(value);
}

function promoAmount(value: number): string {
  if (value > 0) return formatInvoiceAmount(-value);
  return explicitZero(0);
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

type FontId = "F1" | "F2" | "F3";

function text(x: number, y: number, size: number, font: FontId, rgb: RGB, value: string, tracking = 0): string {
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

function textRight(right: number, y: number, size: number, font: FontId, rgb: RGB, value: string, tracking = 0): string {
  const clean = ascii(value);
  if (!clean) return "";
  const width = textWidth(clean, size, font, tracking);
  return text(right - width, y, size, font, rgb, clean, tracking);
}

function textCentered(center: number, y: number, size: number, font: FontId, rgb: RGB, value: string, tracking = 0): string {
  const clean = ascii(value);
  if (!clean) return "";
  const width = textWidth(clean, size, font, tracking);
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

function clipToWidth(value: string, size: number, font: FontId, tracking: number, maxWidth: number): string {
  const clean = ascii(value);
  if (!clean || textWidth(clean, size, font, tracking) <= maxWidth) return clean;
  let next = clean;
  while (next.length > 1 && textWidth(`${next}...`, size, font, tracking) > maxWidth) next = next.slice(0, -1);
  return `${next}...`;
}

function wrap(value: string, size: number, font: FontId, maxWidth: number): string[] {
  const clean = ascii(value);
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, font, 0) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

const FONT_WIDTHS: Record<FontId, readonly number[]> = {
  F1: INVOICE_INTER_FONTS.light.widths,
  F2: INVOICE_INTER_FONTS.regular.widths,
  F3: INVOICE_INTER_FONTS.bold.widths,
};

function textWidth(value: string, size: number, font: FontId, tracking: number): number {
  const table = FONT_WIDTHS[font];
  let units = 0;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : 500;
  }
  return (units / 1000) * size + Math.max(0, value.length - 1) * tracking;
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

function pdfDocument(content: string, rgb: Uint8Array, alpha: Uint8Array, cameraRgb: Uint8Array, cameraAlpha: Uint8Array): Uint8Array {
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
  const width = INVOICE_WORDMARK.width;
  const height = INVOICE_WORDMARK.height;

  const fonts = [INVOICE_INTER_FONTS.light, INVOICE_INTER_FONTS.regular, INVOICE_INTER_FONTS.bold] as const;
  const fontBytes = fonts.map((font) => decode64(font.data));

  pushText("%PDF-1.4\n");
  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObj(2, "<< /Type /Pages /Count 1 /Kids [14 0 R] >>");
  fonts.forEach((font, index) => {
    const fontId = 3 + index * 3;
    const descriptorId = fontId + 1;
    const fileId = fontId + 2;
    const widths = font.widths.join(" ");
    const [xMin, yMin, xMax, yMax] = font.bbox;
    addObj(
      fontId,
      `<< /Type /Font /Subtype /TrueType /BaseFont /${font.baseFont} /FirstChar 32 /LastChar 126 /Widths [${widths}] /FontDescriptor ${descriptorId} 0 R /Encoding /WinAnsiEncoding >>`,
    );
    addObj(
      descriptorId,
      `<< /Type /FontDescriptor /FontName /${font.baseFont} /Flags 32 /FontBBox [${xMin} ${yMin} ${xMax} ${yMax}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV ${font.stemV} /FontFile2 ${fileId} 0 R >>`,
    );
    addObj(fileId, byteObject(`<< /Length ${fontBytes[index].length} /Length1 ${fontBytes[index].length} >>\nstream\n`, fontBytes[index]));
  });
  addObj(
    12,
    byteObject(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alpha.length} >>\nstream\n`,
      alpha,
    ),
  );
  addObj(
    13,
    byteObject(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${rgb.length} /SMask 12 0 R >>\nstream\n`,
      rgb,
    ),
  );
  addObj(
    16,
    byteObject(
      `<< /Type /XObject /Subtype /Image /Width ${INVOICE_CAMERA_IMAGE.width} /Height ${INVOICE_CAMERA_IMAGE.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${cameraAlpha.length} >>\nstream\n`,
      cameraAlpha,
    ),
  );
  addObj(
    17,
    byteObject(
      `<< /Type /XObject /Subtype /Image /Width ${INVOICE_CAMERA_IMAGE.width} /Height ${INVOICE_CAMERA_IMAGE.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${cameraRgb.length} /SMask 16 0 R >>\nstream\n`,
      cameraRgb,
    ),
  );
  addObj(
    14,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 15 0 R /Resources << /Font << /F1 3 0 R /F2 6 0 R /F3 9 0 R >> /XObject << /Im1 13 0 R /Im2 17 0 R >> >> >>`,
  );
  addObj(15, byteObject(`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes));

  const xrefAt = cursor;
  const size = 18;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
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

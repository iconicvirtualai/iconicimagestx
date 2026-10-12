/**
 * PDF of the branded Iconic invoice.
 * Layout follows the owner template: black header, pill table, totals box, notes, black footer.
 * Inter Light, Regular, and Bold. Processing and the total are the stored invoice amounts.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { INVOICE_INTER_FONTS } from "./invoiceInterFonts.ts";
import { INVOICE_CAMERA_IMAGE } from "./invoiceCameraImage.ts";
import { INVOICE_LOGO_IMAGE } from "./invoiceLogoImage.ts";
import type { InvoiceFace, InvoiceFaceLine } from "./invoiceFace.ts";
import {
  formatInvoiceAmount,
  formatInvoiceDisplayDate,
  formatInvoicePhone,
  invoiceBlankRowCount,
  presentInvoiceMoney,
} from "./invoiceProcessing.ts";
import { INTER_CAP_RATIO, TEMPLATE_H, TEMPLATE_W, invoiceTemplate as T } from "./invoiceTemplate.ts";
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
    decode64(INVOICE_LOGO_IMAGE.rgb),
    decode64(INVOICE_LOGO_IMAGE.alpha),
    decode64(INVOICE_CAMERA_IMAGE.rgb),
    decode64(INVOICE_CAMERA_IMAGE.alpha),
  );
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
  const capSize = (cap: number) => (cap / INTER_CAP_RATIO / TEMPLATE_W) * PAGE_W;
  const base = (y: number, cap: number) => PAGE_H - ((y + cap) / TEMPLATE_H) * PAGE_H;
  const track = (cap: number, em: number) => capSize(cap) * em;

  const logoW = X(T.logo.w);
  const logoH = (T.logo.h / TEMPLATE_H) * PAGE_H;
  const logoX = X(T.logo.x);
  const logoY = PAGE_H - ((T.logo.y / TEMPLATE_H) * PAGE_H) - logoH;
  ops.push(fillRect(0, base(0, T.headerH), PAGE_W, (T.headerH / TEMPLATE_H) * PAGE_H, BLACK));
  ops.push(`q\n${num(logoW)} 0 0 ${num(logoH)} ${num(logoX)} ${num(logoY)} cm\n/Im1 Do\nQ`);

  const titleSize = capSize(T.title.cap);
  ops.push(text(X(T.title.x), base(T.title.y, T.title.cap), titleSize, "F3", YELLOW, "INVOICE", track(T.title.cap, T.title.track)));
  const metaSize = capSize(T.invoiceNo.cap);
  ops.push(text(X(T.invoiceNo.x), base(T.invoiceNo.y, T.invoiceNo.cap), metaSize, "F3", WHITE, `INVOICE NO : ${clip(invoiceNumber, 36)}`, track(T.invoiceNo.cap, T.invoiceNo.track)));
  if (date) ops.push(text(X(T.date.x), base(T.date.y, T.date.cap), metaSize, "F3", WHITE, date, track(T.date.cap, T.date.track)));
  const status = input.status.trim();
  if (status) ops.push(text(X(T.date.x), base(T.date.y + 28, 12), capSize(12), "F2", WHITE, clip(status.toUpperCase(), 28), 0.4));

  const toSize = capSize(T.billTo.cap);
  const addrSize = capSize(T.address.cap);
  ops.push(textRight(X(T.billTo.right), base(T.billTo.y, T.billTo.cap), toSize, "F3", WHITE, "INVOICE TO :", track(T.billTo.cap, T.billTo.track)));
  ops.push(textRight(X(T.clientName.right), base(T.clientName.y, T.clientName.cap), toSize, "F3", WHITE, clip((input.clientName || "Client").toUpperCase(), 32), track(T.clientName.cap, T.clientName.track)));
  const addressLines = wrap(input.billToAddress, addrSize, "F2", X(420)).slice(0, 3);
  addressLines.forEach((line, index) => {
    const y = T.address.y + index * (T.address.cap + 6);
    ops.push(textRight(X(T.address.right), base(y, T.address.cap), addrSize, "F2", WHITE, line));
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
    ops.push(text(descX, baseline, lineSize, "F3", TEAL, clipToWidth(row.name.toUpperCase(), lineSize, "F3", lineTrack, nameMax), lineTrack));
    ops.push(textCentered(X(T.qtyCenter), baseline, lineSize, "F3", TEAL, row.qty, lineTrack * 0.4));
    ops.push(textRight(X(T.priceRight), baseline, lineSize, "F3", TEAL, row.price));
    ops.push(textRight(X(T.totalRight), baseline, lineSize, "F3", TEAL, row.total));
  });

  const boxX = X(T.box.x);
  const boxW = X(T.box.right - T.box.x);
  const boxH = (T.box.h / TEMPLATE_H) * PAGE_H;
  const boxY = PAGE_H - ((T.box.y / TEMPLATE_H) * PAGE_H) - boxH;
  const boxBorder = X(T.box.border);
  const boxInset = boxBorder / 2;
  ops.push(strokeRoundedRect(boxX + boxInset, boxY + boxInset, boxW - boxBorder, boxH - boxBorder, Math.max(0, X(T.box.radius) - boxInset), BLACK, boxBorder));

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
    ops.push(text(X(cell.x), base(T.cellAmountY, T.cellCap), totalsSize, "F3", BLACK, cell.amount));
  });
  const grandSize = capSize(T.grand.cap);
  const totalAmount = formatInvoiceAmount(presented.total);
  ops.push(textRight(X(T.grand.right), base(T.grand.labelY, T.grand.cap), grandSize, "F1", BLACK, "TOTAL", track(T.grand.cap, T.grand.track)));
  ops.push(textRight(X(T.grand.right), base(T.grand.amountY, T.grand.cap), grandSize, "F3", BLACK, totalAmount));

  const notesSize = capSize(T.notes.cap);
  ops.push(text(X(T.notes.x), base(T.notes.y, T.notes.cap), notesSize, "F3", PINK, "NOTES:", track(T.notes.cap, T.notes.track)));
  const noteBody = (input.notes || "").trim();
  const noteLines = noteBody ? wrap(noteBody, addrSize, "F2", X(TEMPLATE_W - T.notes.x - 80)).slice(0, 4) : [];
  noteLines.forEach((line, index) => {
    const y = T.notes.y + T.notes.cap + 10 + index * (T.address.cap + 6);
    if (y > T.footerY - 8) return;
    ops.push(text(X(T.notes.x), base(y, T.address.cap), addrSize, "F2", BLACK, line));
  });

  const footerH = ((TEMPLATE_H - T.footerY) / TEMPLATE_H) * PAGE_H;
  if (presented.amountPaid > 0) {
    ops.push(text(X(T.contact.x), footerH + 10, capSize(16), "F2", MUTED, `Amount paid ${formatInvoiceAmount(presented.amountPaid)}    Amount due ${formatInvoiceAmount(presented.amountDue)}`));
  }
  ops.push(fillRect(0, 0, PAGE_W, footerH, BLACK));
  const paySize = capSize(T.payment.cap);
  ops.push(text(X(T.payment.x), base(T.payment.y, T.payment.cap), paySize, "F3", GREEN, "PAYMENT INFORMATION:", track(T.payment.cap, T.payment.track)));
  const contactSize = capSize(T.contact.cap);
  ops.push(text(X(T.contact.x), base(T.contact.y, T.contact.cap), contactSize, "F2", WHITE, LEGAL_BUSINESS_NAME));
  ops.push(text(X(T.contact.x), base(T.contact.y + T.contact.line, T.contact.cap), contactSize, "F2", WHITE, formatInvoicePhone(BUSINESS_CONTACT.phoneDisplay)));
  ops.push(text(X(T.contact.x), base(T.emailY, T.contact.cap), contactSize, "F2", WHITE, BUSINESS_CONTACT.email));
  ops.push(textRight(X(T.contact.right), base(T.contact.y, T.contact.cap), contactSize, "F2", WHITE, BUSINESS_CONTACT.streetAddress));
  ops.push(textRight(X(T.contact.right), base(T.contact.y + T.contact.line, T.contact.cap), contactSize, "F2", WHITE, BUSINESS_CONTACT.addressLine2));
  const thanksSize = capSize(T.thanks.cap);
  ops.push(text(X(T.thanks.x), base(T.thanks.y, T.thanks.cap), thanksSize, "F3", TEAL, "THANK YOU FOR BEING ICONIC", track(T.thanks.cap, T.thanks.track)));
  const cameraW = X(T.camera.w);
  const cameraH = (T.camera.h / TEMPLATE_H) * PAGE_H;
  const cameraX = X(T.camera.x);
  const cameraY = PAGE_H - ((T.camera.y + T.camera.h) / TEMPLATE_H) * PAGE_H;
  ops.push(`q\n${num(cameraW)} 0 0 ${num(cameraH)} ${num(cameraX)} ${num(cameraY)} cm\n/Im2 Do\nQ`);
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
  const width = INVOICE_LOGO_IMAGE.width;
  const height = INVOICE_LOGO_IMAGE.height;

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

/**
 * PDF of the branded invoice face.
 * Black header, yellow rule, blue total. No payment link and no checkout call.
 */

import { invoiceFaceRows, type InvoiceFace } from "./invoiceFace.ts";

export interface BrandedInvoicePdfInput {
  invoiceNumber: string;
  clientName: string;
  billToAddress: string;
  status: string;
  face: InvoiceFace;
}

export function brandedInvoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "invoice"}.pdf`;
}

export function brandedInvoicePdf(input: BrandedInvoicePdfInput): Uint8Array {
  return pdfDocument([layout(input)]);
}

type Op =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; g: number; b: number }
  | { kind: "text"; x: number; y: number; size: number; font: "F1" | "F2"; r: number; g: number; b: number; text: string };

const PAGE_W = 612;
const BLACK = [0, 0, 0] as const;
const WHITE = [1, 1, 1] as const;
const YELLOW = [1, 0.843, 0] as const;
const BLUE = [0.114, 0.306, 0.847] as const;
const MUTED = [0.35, 0.35, 0.35] as const;

function layout(input: BrandedInvoicePdfInput): Op[] {
  const ops: Op[] = [
    rect(0, 720, PAGE_W, 72, ...BLACK),
    rect(0, 714, PAGE_W, 6, ...YELLOW),
    rect(0, 710, PAGE_W, 4, ...BLUE),
    text(36, 748, 16, "F2", ...WHITE, "ICONIC IMAGES"),
    text(400, 758, 8, "F2", ...YELLOW, "INVOICE"),
    text(400, 740, 12, "F2", ...WHITE, clip(input.invoiceNumber || "Invoice", 24)),
  ];
  const status = input.status.trim();
  if (status) ops.push(text(400, 726, 8, "F1", ...YELLOW, clip(status.toUpperCase(), 28)));

  let y = 688;
  ops.push(text(36, y, 8, "F2", ...YELLOW, "BILL TO"));
  y -= 16;
  ops.push(text(36, y, 12, "F2", ...BLACK, clip(input.clientName || "Client", 60)));
  y -= 14;
  const address = input.billToAddress.trim();
  if (address) {
    for (const line of wrap(address, 78).slice(0, 2)) {
      ops.push(text(36, y, 10, "F1", ...MUTED, line));
      y -= 13;
    }
  }

  y -= 10;
  ops.push(text(36, y, 8, "F2", ...BLUE, "LINE ITEMS"));
  y -= 18;
  const lines = input.face.services;
  const shown = (lines.length > 0 ? lines : [{ name: "No line items yet", qty: 0, price: 0 }]).slice(0, 14);
  for (const line of shown) {
    const qty = line.qty > 1 ? ` x${line.qty}` : "";
    ops.push(text(36, y, 11, "F1", ...BLACK, clip(`${line.name}${qty}`, 62)));
    if (line.price !== 0 || line.name !== "No line items yet") {
      ops.push(text(460, y, 11, "F1", ...BLACK, money(line.price)));
    }
    y -= 16;
  }
  if (lines.length > shown.length) {
    ops.push(text(36, y, 9, "F1", ...MUTED, `+${lines.length - shown.length} more line items`));
    y -= 14;
  }

  y -= 8;
  for (const row of invoiceFaceRows(input.face)) {
    const amount = row.signed === "subtract" ? `-${money(row.amount)}` : money(row.amount);
    ops.push(text(36, y, 11, "F1", ...MUTED, clip(row.label, 40)));
    ops.push(text(460, y, 11, "F1", ...BLACK, amount));
    y -= 16;
  }

  y -= 10;
  const boxY = Math.max(92, y - 48);
  ops.push(rect(36, boxY, 540, 48, ...BLUE));
  ops.push(text(52, boxY + 28, 8, "F2", ...YELLOW, "TOTAL"));
  ops.push(text(400, boxY + 16, 16, "F2", ...WHITE, money(input.face.total)));

  ops.push(rect(0, 0, PAGE_W, 78, ...BLACK));
  ops.push(rect(0, 78, PAGE_W, 4, ...YELLOW));
  ops.push(text(36, 48, 8, "F2", ...YELLOW, "PAYMENT"));
  ops.push(text(36, 28, 11, "F1", ...WHITE, `Amount paid  ${money(input.face.amountPaid)}`));
  ops.push(text(340, 48, 8, "F2", ...YELLOW, "AMOUNT DUE"));
  ops.push(text(340, 26, 14, "F2", ...WHITE, money(input.face.amountDue)));
  return ops;
}

function rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): Op {
  return { kind: "rect", x, y, w, h, r, g, b };
}

function text(
  x: number,
  y: number,
  size: number,
  font: "F1" | "F2",
  r: number,
  g: number,
  b: number,
  value: string,
): Op {
  return { kind: "text", x, y, size, font, r, g, b, text: value };
}

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function clip(value: string, max: number): string {
  const clean = value.replace(/[^\x20-\x7E]/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function wrap(value: string, width: number): string[] {
  const clean = value.replace(/[^\x20-\x7E]/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= width) return [clean];
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < 8) cut = width;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function pdfDocument(pages: Op[][]): Uint8Array {
  const chunks: string[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  const push = (value: string) => {
    chunks.push(value);
    cursor += value.length;
  };
  const addObj = (id: number, body: string) => {
    offsets[id] = cursor;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  let nextId = 5;
  pages.forEach(() => {
    pageIds.push(nextId++);
    contentIds.push(nextId++);
  });

  push("%PDF-1.4\n");
  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObj(2, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  addObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pages.forEach((ops, index) => {
    const stream = contentStream(ops);
    addObj(
      pageIds[index],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    );
    addObj(contentIds[index], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  const xrefAt = cursor;
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  push(xref);
  return new TextEncoder().encode(chunks.join(""));
}

function contentStream(ops: Op[]): string {
  return ops.map((op) => {
    if (op.kind === "rect") {
      return `${num(op.r)} ${num(op.g)} ${num(op.b)} rg\n${num(op.x)} ${num(op.y)} ${num(op.w)} ${num(op.h)} re\nf`;
    }
    return [
      "BT",
      `/${op.font} ${num(op.size)} Tf`,
      `${num(op.r)} ${num(op.g)} ${num(op.b)} rg`,
      `1 0 0 1 ${num(op.x)} ${num(op.y)} Tm`,
      `(${escapePdf(op.text)}) Tj`,
      "ET",
    ].join("\n");
  }).join("\n");
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function escapePdf(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

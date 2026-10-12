import * as React from "react";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import type { InvoiceFace, InvoiceFaceLine } from "@shared/invoiceFace";
import {
  formatInvoiceAmount,
  formatInvoiceDisplayDate,
  formatInvoicePhone,
  invoiceBlankRowCount,
  presentInvoiceMoney,
  type PresentedInvoiceMoney,
} from "@shared/invoiceProcessing";
import { INTER_CAP_RATIO, TEMPLATE_H, TEMPLATE_W, invoiceTemplate as T } from "@shared/invoiceTemplate";

const YELLOW = "#FFD400";
const TEAL = "#00B4C6";
const PINK = "#FF2D78";
const GREEN = "#00A651";
const FONT = '"InvoiceInter", "Inter", Helvetica, Arial, sans-serif';
const INVOICE_FONT_FACE = `
@font-face{font-family:"InvoiceInter";src:url("/media/fonts/inter-300.ttf") format("truetype");font-weight:300;font-style:normal;font-display:block;}
@font-face{font-family:"InvoiceInter";src:url("/media/fonts/inter-400.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;}
@font-face{font-family:"InvoiceInter";src:url("/media/fonts/inter-700.ttf") format("truetype");font-weight:700;font-style:normal;font-display:block;}
`;

const OnDarkContext = React.createContext(false);

export function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function BrandedInvoiceShell({
  invoiceNumber,
  issuedAt,
  status,
  amountPaid,
  amountDue,
  notes,
  children,
  footer,
  templateFrame = false,
}: {
  invoiceNumber: string;
  /** Calendar date for the header. Omitted until a page passes it. */
  issuedAt?: unknown;
  status?: string;
  amountPaid: number;
  amountDue: number;
  /** Pass "" to print the NOTES label with an empty body. Omit to leave notes to the page. */
  notes?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Lock the desktop art to the measured template frame. Phones keep the stacked layout. */
  templateFrame?: boolean;
}) {
  const date = formatInvoiceDisplayDate(issuedAt);
  const { billTo, rest } = splitBillTo(children);
  const placed = templateFrame ? readInvoiceParts(children) : null;
  return (
    <article
      className={templateFrame ? "bg-white text-black" : "flex min-h-[920px] flex-col overflow-hidden bg-white text-black sm:min-h-[1100px]"}
      style={{ fontFamily: FONT, fontKerning: "none", fontVariantLigatures: "none", containerType: "inline-size" }}
      data-testid="branded-invoice"
    >
      <style>{INVOICE_FONT_FACE}</style>
      {placed?.lines && placed.face ? (
        <>
          <style>{FRAME_CSS}</style>
          <TemplateFrame
            invoiceNumber={invoiceNumber}
            date={date}
            status={status}
            billTo={placed.billTo}
            lines={placed.lines}
            face={placed.face}
            notes={notes}
            footer={footer}
            amountPaid={amountPaid}
            amountDue={amountDue}
          />
        </>
      ) : null}
      <div className={templateFrame ? "invoice-template-narrow flex flex-col" : "contents"}>
      <header className="bg-black px-5 py-6 text-white sm:px-8 sm:py-8">
        <div className="flex items-stretch justify-between gap-3 sm:gap-8">
          <div className="flex min-w-0 flex-1 flex-col">
            <div>
              <h1 className="whitespace-nowrap text-[1.35rem] font-extrabold leading-none tracking-[0.14em] sm:text-5xl sm:tracking-[0.18em]" style={{ color: YELLOW }}>
                INVOICE
              </h1>
              <p className="mt-2 font-bold" style={type.meta}>INVOICE NO : {invoiceNumber}</p>
            </div>
            <div className="mt-auto pt-6 sm:pt-8">
              {date ? <p className="font-bold" style={type.meta}>{date}</p> : null}
              {status ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">{status}</p> : null}
            </div>
          </div>
          <div className="flex w-[46%] max-w-[340px] shrink-0 flex-col items-end">
            <picture className="block w-full">
              <source srcSet="/media/logos/iconic-graffiti-logo.webp" type="image/webp" />
              <img
                src="/media/logos/iconic-graffiti-logo.png"
                alt="Iconic Images"
                className="ml-auto h-auto w-full max-h-24 sm:max-h-36"
              />
            </picture>
            {billTo ? (
              <OnDarkContext.Provider value={true}>
                <div className="mt-auto w-full pt-3 text-right sm:pt-6">{billTo}</div>
              </OnDarkContext.Provider>
            ) : null}
          </div>
        </div>
      </header>
      <div className="flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        {rest}
        <InvoiceNotes notes={notes} />
      </div>
      {amountPaid > 0 ? (
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-2 sm:px-8" data-testid="invoice-balance">
          <p>
            <span className="font-semibold uppercase tracking-[0.08em] text-neutral-500" style={type.contact}>Amount paid </span>
            <MoneyAmount className="min-w-0 font-bold" style={type.contact}>{formatInvoiceAmount(amountPaid)}</MoneyAmount>
          </p>
          <p>
            <span className="font-semibold uppercase tracking-[0.08em] text-neutral-500" style={type.contact}>Amount due </span>
            <MoneyAmount className="min-w-0 font-black" style={type.contact}>{formatInvoiceAmount(amountDue)}</MoneyAmount>
          </p>
        </div>
      ) : null}
      {footer ? <div className="bg-white px-5 pb-6 pt-2 sm:px-8">{footer}</div> : null}
      <footer className="mt-auto bg-black px-5 py-6 text-white sm:px-8">
        <p className="font-bold" style={{ ...type.payment, color: GREEN }}>PAYMENT INFORMATION:</p>
        <div className="mt-3 flex items-start justify-between gap-4" data-testid="invoice-business-footer">
          <div className="min-w-0 space-y-0.5 font-normal" style={type.contact}>
            <p>{LEGAL_BUSINESS_NAME}</p>
            <p><a className="text-white" href={BUSINESS_CONTACT.phoneHref}>{formatInvoicePhone(BUSINESS_CONTACT.phoneDisplay)}</a></p>
            <p><a className="text-white" href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a></p>
          </div>
          <div className="shrink-0 text-right font-normal" style={type.contact}>
            <p>{BUSINESS_CONTACT.streetAddress}</p>
            <p>{BUSINESS_CONTACT.addressLine2}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <p
            data-testid="invoice-thank-you"
            className="whitespace-nowrap font-semibold uppercase leading-none"
            style={{ ...type.thanks, color: TEAL }}
          >
            THANK YOU FOR BEING ICONIC
          </p>
          <InvoiceCameraIcon />
        </div>
      </footer>
      </div>
    </article>
  );
}

export function InvoiceBillTo({
  name,
  email,
  address,
}: {
  name: string;
  email?: string;
  address?: string;
}) {
  const onDark = React.useContext(OnDarkContext);
  const label = onDark ? "text-white" : "text-black";
  const muted = onDark ? "text-white/80" : "text-neutral-600";
  return (
    <div className={onDark ? "text-right" : undefined} data-testid="invoice-bill-to">
      <p className={`font-bold ${label}`} style={type.billTo}>INVOICE TO :</p>
      <p className={`mt-1 font-bold uppercase ${label}`} style={type.billTo}>{name || "Client"}</p>
      {address ? <p className={`mt-1 whitespace-pre-wrap font-normal ${label}`} style={type.address}>{address}</p> : null}
      {email ? <p className={`mt-1 font-normal ${muted}`} style={type.address}>{email}</p> : null}
    </div>
  );
}

export function InvoiceLineTable({ lines }: { lines: InvoiceFaceLine[] }) {
  const blanks = invoiceBlankRowCount(lines.length);
  return (
    <div data-testid="invoice-lines">
      <style>{NARROW_TABLE_CSS}</style>
      <div className="invoice-table-wide">
        <div
          data-testid="invoice-table-pill"
          className="relative z-10 rounded-full bg-black text-white"
          style={{ height: "clamp(36px, 5.8cqw, 52px)" }}
        >
          <span className="absolute top-1/2 uppercase" style={{ ...type.pill, left: COL.desc, transform: "translateY(-50%)" }}>Description</span>
          <span className="absolute top-1/2 uppercase" style={{ ...type.pill, left: COL.qty, transform: "translate(-50%, -50%)" }}>Qty.</span>
          <span className="absolute top-1/2 uppercase" style={{ ...type.pill, left: COL.price, transform: "translate(-100%, -50%)" }}>Price</span>
          <span className="absolute top-1/2 uppercase" style={{ ...type.pill, left: COL.total, transform: "translate(-100%, -50%)" }}>Total</span>
        </div>
        <div className="relative z-0" style={{ marginTop: "calc(clamp(36px, 5.8cqw, 52px) * -0.28)" }}>
          <div
            data-testid="invoice-table-body"
            className="absolute inset-x-[2.6%] bottom-0 rounded-b-[18px] bg-[#f3f4f6]"
            style={{ top: "calc(clamp(36px, 5.8cqw, 52px) * 0.28)" }}
          />
          <div className="relative" style={{ paddingTop: "calc(clamp(36px, 5.8cqw, 52px) * 0.28)" }}>
            {lines.length === 0 ? <p className="px-[6%] py-3 text-neutral-500" style={type.address}>No line items yet.</p> : null}
            {lines.map((line, index) => (
              <LineRow key={`${line.name}-${index}`} line={line} />
            ))}
            {Array.from({ length: blanks }, (_, index) => (
              <div key={`blank-${index}`} className="relative" style={{ height: ROW_H }} aria-hidden="true">
                <div className="absolute inset-x-[2.6%] bottom-0 border-b border-[#6b7280]" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="invoice-table-narrow">
        <div className={`${NARROW_GRID} relative z-10 h-9 rounded-full bg-black text-white`}>
          <span className={NARROW_LABEL} style={{ ...narrowPill }}>Description</span>
          <span className={`${NARROW_LABEL} text-center`} style={{ ...narrowPill }}>Qty.</span>
          <span className={`${NARROW_LABEL} text-right`} style={{ ...narrowPill }}>Price</span>
          <span className={`${NARROW_LABEL} text-right`} style={{ ...narrowPill }}>Total</span>
        </div>
        <div className="relative z-0 -mt-2">
          <div className="absolute inset-x-[2.6%] bottom-0 top-2 rounded-b-[18px] bg-[#f3f4f6]" />
          <div className="relative pt-2">
            {lines.length === 0 ? <p className="px-3 py-3 text-neutral-500" style={type.address}>No line items yet.</p> : null}
            {lines.map((line, index) => (
              <NarrowLineRow key={`${line.name}-${index}`} line={line} />
            ))}
            {Array.from({ length: blanks }, (_, index) => (
              <div key={`blank-${index}`} className="relative" style={{ height: ROW_H }} aria-hidden="true">
                <div className="absolute inset-x-[2.6%] bottom-0 border-b border-[#6b7280]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LineRow({ line }: { line: InvoiceFaceLine }) {
  const qty = line.qty > 0 ? line.qty : 1;
  const unit = Math.round((line.price / qty) * 100) / 100;
  const qtyLabel = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
  return (
    <div className="relative" style={{ minHeight: ROW_H }}>
      <div className="absolute inset-x-[2.6%] bottom-0 border-b border-[#6b7280]" />
      <div className="absolute top-1/2" style={{ left: COL.desc, width: "42%", transform: "translateY(-50%)" }}>
        <p className="font-bold uppercase leading-snug" style={{ ...type.line, color: TEAL, ...itemNameWrap }}>
          {line.name || "Service"}
        </p>
        {line.description ? (
          <p className="mt-1 leading-relaxed text-neutral-500" style={{ ...type.address, ...itemNameWrap }}>
            {line.description}
          </p>
        ) : null}
      </div>
      <p className="absolute top-1/2 font-bold" style={{ ...type.line, color: TEAL, left: COL.qty, transform: "translate(-50%, -50%)" }}>{qtyLabel}</p>
      <MoneyAmount className="absolute top-1/2 min-w-0 whitespace-nowrap font-bold" style={{ ...type.line, color: TEAL, left: COL.price, letterSpacing: 0, transform: "translate(-100%, -50%)", minWidth: 0 }}>{formatInvoiceAmount(unit)}</MoneyAmount>
      <MoneyAmount className="absolute top-1/2 min-w-0 whitespace-nowrap font-bold" style={{ ...type.line, color: TEAL, left: COL.total, letterSpacing: 0, transform: "translate(-100%, -50%)", minWidth: 0 }}>{formatInvoiceAmount(line.price)}</MoneyAmount>
    </div>
  );
}

function NarrowLineRow({ line }: { line: InvoiceFaceLine }) {
  const qty = line.qty > 0 ? line.qty : 1;
  const unit = Math.round((line.price / qty) * 100) / 100;
  const qtyLabel = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
  return (
    <div className={`${NARROW_GRID} relative`} style={{ minHeight: ROW_H }}>
      <div className="absolute inset-x-[2.6%] bottom-0 border-b border-[#6b7280]" />
      <div className="min-w-0">
        <p className="font-bold uppercase leading-snug" style={{ color: TEAL, fontSize: "12px", letterSpacing: "0.02em", ...itemNameWrap }}>
          {line.name || "Service"}
        </p>
        {line.description ? (
          <p className="mt-1 leading-relaxed text-neutral-500" style={{ fontSize: "11px", ...itemNameWrap }}>
            {line.description}
          </p>
        ) : null}
      </div>
      <p className="whitespace-nowrap text-center font-bold" style={{ color: TEAL, fontSize: "11px" }}>{qtyLabel}</p>
      <MoneyAmount className="min-w-0 justify-self-end whitespace-nowrap font-bold" style={{ color: TEAL, fontSize: "11px", letterSpacing: 0, minWidth: 0 }}>{formatInvoiceAmount(unit)}</MoneyAmount>
      <MoneyAmount className="min-w-0 justify-self-end whitespace-nowrap font-bold" style={{ color: TEAL, fontSize: "11px", letterSpacing: 0, minWidth: 0 }}>{formatInvoiceAmount(line.price)}</MoneyAmount>
    </div>
  );
}

export function InvoiceFaceSummary({
  face,
}: {
  face: InvoiceFace;
}) {
  const presented = presentInvoiceMoney(face);
  const cells: Array<{ id: string; label: string; amount: string }> = [
    { id: "subtotal", label: "Sub total", amount: formatInvoiceAmount(presented.subtotal) },
    { id: "processing", label: "Processing", amount: formatInvoiceAmount(presented.processing) },
    { id: "promotions", label: "Promotions", amount: presented.promotions > 0 ? formatInvoiceAmount(-presented.promotions) : formatInvoiceAmount(0) },
    { id: "fees", label: "Fees", amount: formatInvoiceAmount(presented.fees) },
  ];
  if (presented.travel !== 0) cells.push({ id: "travel", label: "Travel", amount: formatInvoiceAmount(presented.travel) });
  if (presented.tax !== 0) cells.push({ id: "tax", label: "Tax", amount: formatInvoiceAmount(presented.tax) });
  return (
    <div>
      <div className="mx-[1.1%] rounded-[14px] border-2 border-black px-4 py-4 sm:px-5" data-testid="invoice-total-box">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:items-end sm:justify-between sm:gap-3">
          {cells.map((cell) => (
            <div key={cell.id} data-invoice-row={cell.id}>
              <p className="whitespace-nowrap font-light uppercase text-black" style={type.totals}>{cell.label}</p>
              <MoneyAmount className="mt-1 min-w-0 whitespace-nowrap font-bold text-black" style={{ ...type.totals, letterSpacing: 0, minWidth: 0 }}>{cell.amount}</MoneyAmount>
            </div>
          ))}
          <div className="col-span-2 border-t border-black/15 pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:text-right" data-invoice-row="total">
            <p className="whitespace-nowrap font-light" style={type.grand}>TOTAL</p>
            <MoneyAmount className="min-w-0 whitespace-nowrap font-bold text-black" style={{ ...type.grand, letterSpacing: 0, minWidth: 0 }}>{formatInvoiceAmount(presented.total)}</MoneyAmount>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InvoiceNotes({ notes }: { notes?: string | null }) {
  if (notes == null) return null;
  return (
    <section className="pt-2" data-testid="invoice-notes">
      <h2 className="font-bold" style={{ ...type.notes, color: PINK }}>NOTES:</h2>
      {notes.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-black">{notes}</p> : null}
    </section>
  );
}

export function InvoiceCameraIcon({ className = "h-11 w-14 shrink-0 text-white" }: { className?: string }) {
  return (
    <img
      data-testid="invoice-camera"
      src="/media/logos/iconic-camera-logo.png"
      alt=""
      className={className}
      style={{ filter: "invert(1)", objectFit: "fill" }}
    />
  );
}

export function BrandedInvoice({
  invoiceNumber,
  issuedAt,
  status,
  clientName,
  clientEmail,
  billToAddress,
  face,
  notes = "",
  footer,
}: {
  invoiceNumber: string;
  issuedAt?: unknown;
  status?: string;
  clientName: string;
  clientEmail?: string;
  billToAddress?: string;
  face: InvoiceFace;
  notes?: string;
  footer?: React.ReactNode;
}) {
  const presented: PresentedInvoiceMoney = presentInvoiceMoney(face);
  return (
    <BrandedInvoiceShell
      invoiceNumber={invoiceNumber}
      issuedAt={issuedAt}
      status={status}
      amountPaid={presented.amountPaid}
      amountDue={presented.amountDue}
      notes={notes}
      footer={footer}
      templateFrame
    >
      <InvoiceBillTo name={clientName} email={clientEmail} address={billToAddress} />
      <InvoiceLineTable lines={face.services} />
      <InvoiceFaceSummary face={face} />
    </BrandedInvoiceShell>
  );
}

function xp(x: number) {
  return `${(x / TEMPLATE_W) * 100}%`;
}
function yp(y: number) {
  return `${(y / TEMPLATE_H) * 100}%`;
}
function capEm(cap: number) {
  return `${(cap / INTER_CAP_RATIO / TEMPLATE_W) * 100}cqw`;
}

const FRAME_CSS = `
.invoice-template-narrow { display: none; }
@container (max-width: 560px) {
  .invoice-template-wide { display: none; }
  .invoice-template-narrow { display: block; }
}
`;

function readInvoiceParts(children: React.ReactNode) {
  let billTo: { name?: string; email?: string; address?: string } | null = null;
  let lines: InvoiceFaceLine[] | null = null;
  let face: InvoiceFace | null = null;
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { name?: string; email?: string; address?: string; lines?: InvoiceFaceLine[]; face?: InvoiceFace };
    if (child.type === InvoiceBillTo) billTo = { name: props.name, email: props.email, address: props.address };
    else if (child.type === InvoiceLineTable) lines = props.lines ?? [];
    else if (child.type === InvoiceFaceSummary) face = props.face ?? null;
  });
  return { billTo, lines, face };
}

function placedText(style: React.CSSProperties): React.CSSProperties {
  const top = typeof style.top === "string" ? `calc(${style.top} - 0.13em)` : style.top;
  return { position: "absolute", margin: 0, lineHeight: 1, whiteSpace: "nowrap", ...style, top };
}

function TemplateFrame({
  invoiceNumber,
  date,
  status,
  billTo,
  lines,
  face,
  notes,
  footer,
  amountPaid,
  amountDue,
}: {
  invoiceNumber: string;
  date: string;
  status?: string;
  billTo: { name?: string; email?: string; address?: string } | null;
  lines: InvoiceFaceLine[];
  face: InvoiceFace;
  notes?: string;
  footer?: React.ReactNode;
  amountPaid: number;
  amountDue: number;
}) {
  const presented = presentInvoiceMoney(face);
  const shown = lines.slice(0, 12);
  const rowCount = Math.max(shown.length, 6);
  const rowH = shown.length > 6 ? (T.rowH * 6) / shown.length : T.rowH;
  const cells: Array<{ id: string; label: string; amount: string; x: number }> = [
    { id: "subtotal", label: "SUB TOTAL", amount: formatInvoiceAmount(presented.subtotal), x: T.cells.subtotal },
    { id: "processing", label: "PROCESSING", amount: formatInvoiceAmount(presented.processing), x: T.cells.processing },
    { id: "promotions", label: "PROMOTIONS", amount: presented.promotions > 0 ? formatInvoiceAmount(-presented.promotions) : formatInvoiceAmount(0), x: T.cells.promotions },
    { id: "fees", label: "FEES", amount: formatInvoiceAmount(presented.fees), x: T.cells.fees },
  ];
  if (presented.travel !== 0) cells.push({ id: "travel", label: "TRAVEL", amount: formatInvoiceAmount(presented.travel), x: 0 });
  if (presented.tax !== 0) cells.push({ id: "tax", label: "TAX", amount: formatInvoiceAmount(presented.tax), x: 0 });
  if (cells.some((cell) => cell.x === 0)) {
    const step = (T.grand.right - 90 - T.cells.subtotal) / cells.length;
    cells.forEach((cell, index) => {
      cell.x = T.cells.subtotal + step * index;
    });
  }
  const addressLines = (billTo?.address || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const blanks = Math.max(0, rowCount - shown.length);
  return (
    <div className="invoice-template-wide" style={{ position: "relative", width: "100%", height: `${(TEMPLATE_H / TEMPLATE_W) * 100}cqw` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: yp(T.headerH), background: "#000" }} />
      <h1 style={placedText({ left: xp(T.title.x), top: yp(T.title.y), color: YELLOW, fontSize: capEm(T.title.cap), fontWeight: 700, letterSpacing: `${T.title.track}em` })}>INVOICE</h1>
      <p style={placedText({ left: xp(T.invoiceNo.x), top: yp(T.invoiceNo.y), color: "#fff", fontSize: capEm(T.invoiceNo.cap), fontWeight: 700, letterSpacing: `${T.invoiceNo.track}em` })}>INVOICE NO : {invoiceNumber}</p>
      {date ? <p style={placedText({ left: xp(T.date.x), top: yp(T.date.y), color: "#fff", fontSize: capEm(T.date.cap), fontWeight: 700, letterSpacing: `${T.date.track}em` })}>{date}</p> : null}
      {status ? <p style={placedText({ left: xp(T.date.x), top: yp(T.date.y + 28), color: "rgba(255,255,255,0.75)", fontSize: capEm(12), fontWeight: 600, letterSpacing: "0.12em" })}>{status.toUpperCase()}</p> : null}
      <img src="/media/logos/iconic-graffiti-logo.png" alt="Iconic Images" style={{ position: "absolute", left: xp(T.logo.x), top: yp(T.logo.y), width: xp(T.logo.w), height: yp(T.logo.h), objectFit: "contain" }} />
      <p style={placedText({ right: xp(TEMPLATE_W - T.billTo.right), top: yp(T.billTo.y), color: "#fff", fontSize: capEm(T.billTo.cap), fontWeight: 700, letterSpacing: `${T.billTo.track}em` })}>INVOICE TO :</p>
      <p style={placedText({ right: xp(TEMPLATE_W - T.clientName.right), top: yp(T.clientName.y), color: "#fff", fontSize: capEm(T.clientName.cap), fontWeight: 700, letterSpacing: `${T.clientName.track}em` })}>{(billTo?.name || "Client").toUpperCase()}</p>
      {addressLines.map((line, index) => (
        <p key={line} style={placedText({ right: xp(TEMPLATE_W - T.address.right), top: yp(T.address.y + index * (T.address.cap + 6)), color: "#fff", fontSize: capEm(T.address.cap), fontWeight: 400 })}>{line}</p>
      ))}
      {billTo?.email ? <p style={placedText({ right: xp(TEMPLATE_W - T.address.right), top: yp(T.address.y + addressLines.length * (T.address.cap + 6)), color: "rgba(255,255,255,0.8)", fontSize: capEm(T.address.cap), fontWeight: 400 })}>{billTo.email}</p> : null}
      <div style={{ position: "absolute", left: xp(T.gray.x), right: xp(TEMPLATE_W - T.gray.right), top: yp(T.gray.y), height: yp(T.gray.bottom - T.gray.y), background: "#ededf2", borderBottomLeftRadius: `${(T.gray.radius / TEMPLATE_W) * 100}cqw`, borderBottomRightRadius: `${(T.gray.radius / TEMPLATE_W) * 100}cqw` }} />
      <div style={{ position: "absolute", left: xp(T.pill.x), right: xp(TEMPLATE_W - T.pill.right), top: yp(T.pill.y), height: yp(T.pill.h), borderRadius: 9999, background: "#000", zIndex: 2 }} />
      <span style={placedText({ left: xp(T.descLabelX), top: yp(T.pillLabel.y), zIndex: 3, color: "#fff", fontSize: capEm(T.pillLabel.cap), fontWeight: 300, letterSpacing: `${T.pillLabel.track}em` })}>DESCRIPTION</span>
      <span style={placedText({ left: xp(T.qtyCenter), top: yp(T.pillLabel.y), zIndex: 3, color: "#fff", fontSize: capEm(T.pillLabel.cap), fontWeight: 300, letterSpacing: `${T.pillLabel.track}em`, transform: "translateX(-50%)" })}>QTY.</span>
      <span style={placedText({ right: xp(TEMPLATE_W - T.priceLabelRight), top: yp(T.pillLabel.y), zIndex: 3, color: "#fff", fontSize: capEm(T.pillLabel.cap), fontWeight: 300, letterSpacing: `${T.pillLabel.track}em` })}>PRICE</span>
      <span style={placedText({ right: xp(TEMPLATE_W - T.totalRight), top: yp(T.pillLabel.y), zIndex: 3, color: "#fff", fontSize: capEm(T.pillLabel.cap), fontWeight: 300, letterSpacing: `${T.pillLabel.track}em` })}>TOTAL</span>
      {shown.map((line, index) => {
        const qty = line.qty > 0 ? line.qty : 1;
        const unit = Math.round((line.price / qty) * 100) / 100;
        const qtyLabel = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
        const y = T.rowTextY + index * rowH;
        return (
          <div key={`${line.name}-${index}`}>
            <div style={{ position: "absolute", left: xp(T.gray.x), right: xp(TEMPLATE_W - T.gray.right), top: yp(T.ruleY + index * rowH), borderTop: "1px solid #767679" }} />
            <p style={placedText({ left: xp(T.descX), top: yp(y), color: TEAL, fontSize: capEm(T.lineCap), fontWeight: 700, letterSpacing: `${T.lineTrack}em`, maxWidth: xp(T.qtyCenter - T.descX - 24), overflow: "hidden" })}>{(line.name || "Service").toUpperCase()}</p>
            <p style={placedText({ left: xp(T.qtyCenter), top: yp(y), color: TEAL, fontSize: capEm(T.lineCap), fontWeight: 700, transform: "translateX(-50%)" })}>{qtyLabel}</p>
            <p style={placedText({ right: xp(TEMPLATE_W - T.priceRight), top: yp(y), color: TEAL, fontSize: capEm(T.lineCap), fontWeight: 700 })}>{formatInvoiceAmount(unit)}</p>
            <p style={placedText({ right: xp(TEMPLATE_W - T.totalRight), top: yp(y), color: TEAL, fontSize: capEm(T.lineCap), fontWeight: 700 })}>{formatInvoiceAmount(line.price)}</p>
          </div>
        );
      })}
      {Array.from({ length: blanks }, (_, index) => (
        <div key={`blank-${index}`} style={{ position: "absolute", left: xp(T.gray.x), right: xp(TEMPLATE_W - T.gray.right), top: yp(T.ruleY + (shown.length + index) * rowH), borderTop: "1px solid #767679" }} />
      ))}
      <div data-testid="invoice-total-box" style={{ position: "absolute", left: xp(T.box.x), right: xp(TEMPLATE_W - T.box.right), top: yp(T.box.y), height: yp(T.box.h), border: `${(T.box.border / TEMPLATE_W) * 100}cqw solid #000`, borderRadius: `${(T.box.radius / TEMPLATE_W) * 100}cqw` }} />
      {cells.map((cell) => (
        <div key={cell.id} data-invoice-row={cell.id}>
          <p style={placedText({ left: xp(cell.x), top: yp(T.cellLabelY), color: "#000", fontSize: capEm(T.cellCap), fontWeight: 300, letterSpacing: `${T.cellTrack}em` })}>{cell.label}</p>
          <p style={placedText({ left: xp(cell.x), top: yp(T.cellAmountY), color: "#000", fontSize: capEm(T.cellCap), fontWeight: 700 })}>{cell.amount}</p>
        </div>
      ))}
      <p style={placedText({ right: xp(TEMPLATE_W - T.grand.right), top: yp(T.grand.labelY), color: "#000", fontSize: capEm(T.grand.cap), fontWeight: 300, letterSpacing: `${T.grand.track}em` })}>TOTAL</p>
      <p data-invoice-row="total" style={placedText({ right: xp(TEMPLATE_W - T.grand.right), top: yp(T.grand.amountY), color: "#000", fontSize: capEm(T.grand.cap), fontWeight: 700 })}>{formatInvoiceAmount(presented.total)}</p>
      {notes != null ? <h2 style={placedText({ left: xp(T.notes.x), top: yp(T.notes.y), color: PINK, fontSize: capEm(T.notes.cap), fontWeight: 700, letterSpacing: `${T.notes.track}em` })}>NOTES:</h2> : null}
      {notes?.trim() ? <p style={{ position: "absolute", left: xp(T.notes.x), right: xp(80), top: yp(T.notes.y + T.notes.cap + 8), margin: 0, fontSize: capEm(T.address.cap), whiteSpace: "pre-wrap" }}>{notes}</p> : null}
      {amountPaid > 0 ? <p style={placedText({ left: xp(T.contact.x), top: yp(T.footerY - 28), color: "#4a4a4a", fontSize: capEm(16), fontWeight: 500 })}>Amount paid {formatInvoiceAmount(amountPaid)}    Amount due {formatInvoiceAmount(amountDue)}</p> : null}
      {footer ? <div className="invoice-pay-slot" style={{ position: "absolute", left: xp(80), right: xp(80), top: yp(1520) }}>{footer}</div> : null}
      <div style={{ position: "absolute", left: 0, right: 0, top: yp(T.footerY), bottom: 0, background: "#000" }} />
      <p style={placedText({ left: xp(T.payment.x), top: yp(T.payment.y), color: GREEN, fontSize: capEm(T.payment.cap), fontWeight: 700, letterSpacing: `${T.payment.track}em` })}>PAYMENT INFORMATION:</p>
      <div data-testid="invoice-business-footer">
        <p style={placedText({ left: xp(T.contact.x), top: yp(T.contact.y), color: "#fff", fontSize: capEm(T.contact.cap), fontWeight: 400 })}>{LEGAL_BUSINESS_NAME}</p>
        <p style={placedText({ left: xp(T.contact.x), top: yp(T.contact.y + T.contact.line), color: "#fff", fontSize: capEm(T.contact.cap), fontWeight: 400 })}>{formatInvoicePhone(BUSINESS_CONTACT.phoneDisplay)}</p>
        <p style={placedText({ left: xp(T.contact.x), top: yp(T.emailY), color: "#fff", fontSize: capEm(T.contact.cap), fontWeight: 400 })}>{BUSINESS_CONTACT.email}</p>
        <p style={placedText({ right: xp(TEMPLATE_W - T.contact.right), top: yp(T.contact.y), color: "#fff", fontSize: capEm(T.contact.cap), fontWeight: 400 })}>{BUSINESS_CONTACT.streetAddress}</p>
        <p style={placedText({ right: xp(TEMPLATE_W - T.contact.right), top: yp(T.contact.y + T.contact.line), color: "#fff", fontSize: capEm(T.contact.cap), fontWeight: 400 })}>{BUSINESS_CONTACT.addressLine2}</p>
      </div>
      <p data-testid="invoice-thank-you" style={placedText({ left: xp(T.thanks.x), top: yp(T.thanks.y), color: TEAL, fontSize: capEm(T.thanks.cap), fontWeight: 700, letterSpacing: `${T.thanks.track}em` })}>THANK YOU FOR BEING ICONIC</p>
      <div style={{ position: "absolute", left: xp(T.camera.x), top: yp(T.camera.y), width: xp(T.camera.w), height: yp(T.camera.h) }}>
        <InvoiceCameraIcon className="h-full w-full text-white" />
      </div>
    </div>
  );
}

function splitBillTo(children: React.ReactNode): { billTo: React.ReactNode; rest: React.ReactNode[] } {
  const rest: React.ReactNode[] = [];
  let billTo: React.ReactNode = null;
  React.Children.forEach(children, (child) => {
    if (billTo == null && React.isValidElement(child) && child.type === InvoiceBillTo) {
      billTo = child;
      return;
    }
    rest.push(child);
  });
  return { billTo, rest };
}

const itemNameWrap = { wordBreak: "normal", overflowWrap: "normal", hyphens: "none", whiteSpace: "normal" } as const;

/** Fixed tracks so a 360–390px card keeps DESCRIPTION, QTY, PRICE, and TOTAL apart. */
const NARROW_GRID = "grid grid-cols-[minmax(0,1fr)_2.15rem_3.5rem_3.75rem] items-center gap-x-1.5 px-2.5";
const NARROW_LABEL = "min-w-0 whitespace-nowrap uppercase";
const narrowPill = { fontSize: "10px", fontWeight: 400, letterSpacing: "0.02em" } as const;
const NARROW_TABLE_CSS = `
.invoice-table-narrow { display: none; }
@container (max-width: 560px) {
  .invoice-table-wide { display: none; }
  .invoice-table-narrow { display: block; }
}
`;

/** Column anchors measured from the pill's left edge. */
const COL = { desc: "6%", qty: "55%", price: "72%", total: "90%" } as const;
const ROW_H = "clamp(42px, 6.2cqw, 56px)";

/** Sizes are fractions of the invoice card width. Floors keep a 390px card readable. */
const type = {
  pill: { fontSize: "clamp(11px, 2.4cqw, 22px)", fontWeight: 300, letterSpacing: "0.04em" },
  totals: { fontSize: "clamp(12px, 2.6cqw, 24px)", letterSpacing: "0.03em" },
  grand: { fontSize: "clamp(18px, 4cqw, 36px)", letterSpacing: "0.04em" },
  line: { fontSize: "clamp(13px, 2.2cqw, 20px)", letterSpacing: "0.08em" },
  billTo: { fontSize: "clamp(12px, 2cqw, 18px)", letterSpacing: "0.04em" },
  address: { fontSize: "clamp(11px, 1.8cqw, 16px)" },
  meta: { fontSize: "clamp(12px, 1.8cqw, 16px)", letterSpacing: "0.06em" },
  notes: { fontSize: "clamp(14px, 2.8cqw, 26px)", letterSpacing: "0.08em" },
  payment: { fontSize: "clamp(11px, 2.2cqw, 20px)", letterSpacing: "0.16em" },
  contact: { fontSize: "clamp(10px, 2.2cqw, 18.5px)" },
  thanks: { fontSize: "clamp(8px, 2.2cqw, 18.5px)", letterSpacing: "0.5em" },
} as const;

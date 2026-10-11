import * as React from "react";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import type { InvoiceFace, InvoiceFaceLine } from "@shared/invoiceFace";
import {
  formatInvoiceDisplayDate,
  invoiceBlankRowCount,
  presentInvoiceMoney,
  type PresentedInvoiceMoney,
} from "@shared/invoiceProcessing";

const YELLOW = "#FFD400";
const TEAL = "#00B4C6";
const PINK = "#FF2D78";
const GREEN = "#00A651";
const FONT = '"Inter", Helvetica, Arial, sans-serif';

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
}) {
  const date = formatInvoiceDisplayDate(issuedAt);
  const { billTo, rest } = splitBillTo(children);
  return (
    <article
      className="flex min-h-[920px] flex-col overflow-hidden bg-white text-black sm:min-h-[1100px]"
      style={{ fontFamily: FONT, containerType: "inline-size" }}
      data-testid="branded-invoice"
    >
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
            <MoneyAmount className="min-w-0 font-bold" style={type.contact}>{money(amountPaid)}</MoneyAmount>
          </p>
          <p>
            <span className="font-semibold uppercase tracking-[0.08em] text-neutral-500" style={type.contact}>Amount due </span>
            <MoneyAmount className="min-w-0 font-black" style={type.contact}>{money(amountDue)}</MoneyAmount>
          </p>
        </div>
      ) : null}
      {footer ? <div className="bg-white px-5 pb-6 pt-2 sm:px-8">{footer}</div> : null}
      <footer className="mt-auto bg-black px-5 py-6 text-white sm:px-8">
        <p className="font-bold" style={{ ...type.payment, color: GREEN }}>PAYMENT INFORMATION:</p>
        <div className="mt-3 flex items-start justify-between gap-4" data-testid="invoice-business-footer">
          <div className="min-w-0 space-y-0.5 font-normal" style={type.contact}>
            <p>{LEGAL_BUSINESS_NAME}</p>
            <p><a className="text-white" href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a></p>
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
      <MoneyAmount className="absolute top-1/2 min-w-0 font-bold" style={{ ...type.line, color: TEAL, left: COL.price, transform: "translate(-100%, -50%)" }}>{money(unit)}</MoneyAmount>
      <MoneyAmount className="absolute top-1/2 min-w-0 font-bold" style={{ ...type.line, color: TEAL, left: COL.total, transform: "translate(-100%, -50%)" }}>{money(line.price)}</MoneyAmount>
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
    { id: "subtotal", label: "Sub total", amount: money(presented.subtotal) },
    { id: "processing", label: "Processing", amount: money(presented.processing) },
    { id: "promotions", label: "Promotions", amount: presented.promotions > 0 ? `-${money(presented.promotions)}` : money(0) },
    { id: "fees", label: "Fees", amount: money(presented.fees) },
  ];
  if (presented.travel !== 0) cells.push({ id: "travel", label: "Travel", amount: money(presented.travel) });
  if (presented.tax !== 0) cells.push({ id: "tax", label: "Tax", amount: money(presented.tax) });
  return (
    <div>
      <div className="mx-[1.1%] rounded-[14px] border-2 border-black px-4 py-4 sm:px-5" data-testid="invoice-total-box">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:items-end sm:justify-between sm:gap-3">
          {cells.map((cell) => (
            <div key={cell.id} data-invoice-row={cell.id}>
              <p className="font-light uppercase text-black" style={type.totals}>{cell.label}</p>
              <MoneyAmount className="mt-1 min-w-0 font-bold text-black" style={type.totals}>{cell.amount}</MoneyAmount>
            </div>
          ))}
          <div className="col-span-2 border-t border-black/15 pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:text-right" data-invoice-row="total">
            <p className="font-light" style={type.grand}>TOTAL</p>
            <MoneyAmount className="min-w-0 font-bold text-black" style={type.grand}>{money(presented.total)}</MoneyAmount>
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

export function InvoiceCameraIcon() {
  return (
    <svg data-testid="invoice-camera" viewBox="0 0 64 48" className="h-11 w-14 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1.5" y="1.5" width="61" height="45" rx="12" />
      <rect x="18" y="16" width="28" height="16" rx="2.5" />
      <path d="M26 16l2-3.5h8L38 16" />
      <circle cx="32" cy="24" r="4.5" />
    </svg>
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
    >
      <InvoiceBillTo name={clientName} email={clientEmail} address={billToAddress} />
      <InvoiceLineTable lines={face.services} />
      <InvoiceFaceSummary face={face} />
    </BrandedInvoiceShell>
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

const itemNameWrap = { wordBreak: "normal", overflowWrap: "normal", hyphens: "none" } as const;

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

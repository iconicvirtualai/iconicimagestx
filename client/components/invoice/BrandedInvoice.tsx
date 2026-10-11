import * as React from "react";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import type { InvoiceFace, InvoiceFaceLine } from "@shared/invoiceFace";
import {
  formatInvoiceDisplayDate,
  invoiceBlankRowCount,
  invoiceProcessingMode,
  presentInvoiceMoney,
  type InvoiceProcessingMode,
  type PresentedInvoiceMoney,
} from "@shared/invoiceProcessing";

const YELLOW = "#FFD400";
const TEAL = "#00B4C6";
const PINK = "#FF2D78";
const GREEN = "#00A651";
const FONT = '"Inter", Helvetica, Arial, sans-serif';

const OnDarkContext = React.createContext(false);
const ProcessingModeContext = React.createContext<InvoiceProcessingMode | undefined>(undefined);

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
  processingMode,
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
  /** Defaults to INVOICE_PROCESSING_MODE, which is display. */
  processingMode?: InvoiceProcessingMode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const date = formatInvoiceDisplayDate(issuedAt);
  const mode = processingMode ?? invoiceProcessingMode();
  const { billTo, rest } = splitBillTo(children);
  return (
    <article
      className="flex min-h-[920px] flex-col overflow-hidden bg-white text-black sm:min-h-[1100px]"
      style={{ fontFamily: FONT }}
      data-testid="branded-invoice"
      data-processing-mode={mode}
    >
      <header className="bg-black px-5 py-6 text-white sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="whitespace-nowrap text-[1.7rem] font-extrabold leading-none tracking-[0.16em] sm:text-5xl sm:tracking-[0.18em]" style={{ color: YELLOW }}>
              INVOICE
            </h1>
            <p className="mt-3 text-xs font-semibold tracking-[0.12em] sm:text-sm">INVOICE NO : {invoiceNumber}</p>
            {date ? <p className="mt-3 text-xs tracking-[0.14em] sm:mt-4 sm:text-sm">{date}</p> : null}
            {status ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">{status}</p> : null}
          </div>
          <div className="md:max-w-[46%] md:text-right">
            <div className="md:flex md:justify-end">
              <picture>
                <source srcSet="/media/logos/iconic-graffiti-logo.webp" type="image/webp" />
                <img
                  src="/media/logos/iconic-graffiti-logo.png"
                  alt="Iconic Images"
                  className="h-20 w-auto max-w-[240px] sm:h-24"
                />
              </picture>
            </div>
            {billTo ? (
              <OnDarkContext.Provider value={true}>
                <div className="mt-5">{billTo}</div>
              </OnDarkContext.Provider>
            ) : null}
          </div>
        </div>
      </header>
      <ProcessingModeContext.Provider value={mode}>
        <div className="flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6">
          {rest}
          <InvoiceNotes notes={notes} />
        </div>
      </ProcessingModeContext.Provider>
      {amountPaid > 0 ? (
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-2 text-sm sm:px-8" data-testid="invoice-balance">
          <p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Amount paid </span>
            <MoneyAmount className="font-bold">{money(amountPaid)}</MoneyAmount>
          </p>
          <p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Amount due </span>
            <MoneyAmount className="font-black">{money(amountDue)}</MoneyAmount>
          </p>
        </div>
      ) : null}
      <footer className="mt-auto bg-black px-5 py-6 text-white sm:px-8">
        <p className="text-xs font-bold tracking-[0.14em] sm:text-sm" style={{ color: GREEN }}>PAYMENT INFORMATION:</p>
        <div className="mt-3 flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between" data-testid="invoice-business-footer">
          <div className="space-y-0.5">
            <p className="font-semibold">{LEGAL_BUSINESS_NAME}</p>
            <p><a className="text-white" href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a></p>
            <p><a className="text-white" href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a></p>
          </div>
          <div className="sm:text-right">
            <p>{BUSINESS_CONTACT.streetAddress}</p>
            <p>{BUSINESS_CONTACT.addressLine2}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <p
            data-testid="invoice-thank-you"
            className="text-[10px] font-semibold uppercase leading-relaxed tracking-[0.18em] sm:text-[13px] sm:tracking-[0.38em]"
            style={{ color: TEAL }}
          >
            THANK YOU FOR BEING ICONIC
          </p>
          <InvoiceCameraIcon />
        </div>
      </footer>
      {footer ? <div className="space-y-3 bg-white px-5 py-5 sm:px-8">{footer}</div> : null}
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
    <div className={onDark ? "md:text-right" : undefined} data-testid="invoice-bill-to">
      <p className={`text-[11px] font-semibold tracking-[0.16em] sm:text-xs ${label}`}>INVOICE TO :</p>
      <p className={`mt-1 text-sm font-bold uppercase tracking-[0.08em] ${label}`}>{name || "Client"}</p>
      {address ? <p className={`mt-1 whitespace-pre-wrap text-sm ${label}`}>{address}</p> : null}
      {email ? <p className={`mt-1 text-xs ${muted}`}>{email}</p> : null}
    </div>
  );
}

export function InvoiceLineTable({ lines }: { lines: InvoiceFaceLine[] }) {
  const blanks = invoiceBlankRowCount(lines.length);
  return (
    <div data-testid="invoice-lines">
      <div className="rounded-full bg-black py-2.5 text-white">
        <div className={columnGrid("text-[10px] font-medium uppercase tracking-[0.14em] sm:text-[11px] sm:tracking-[0.2em]")}>
          <span>Description</span>
          <span className="text-center">Qty.</span>
          <span className="text-right">Price</span>
          <span className="text-right">Total</span>
        </div>
      </div>
      <div className="bg-[#f3f4f6]">
        {lines.length === 0 ? <p className="px-3 py-3 text-sm text-neutral-500 sm:px-5">No line items yet.</p> : null}
        {lines.map((line, index) => (
          <LineRow key={`${line.name}-${index}`} line={line} />
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <div key={`blank-${index}`} className={`${columnGrid("min-h-9 border-b border-[#6b7280]")}`} aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}

function LineRow({ line }: { line: InvoiceFaceLine }) {
  const qty = line.qty > 0 ? line.qty : 1;
  const unit = Math.round((line.price / qty) * 100) / 100;
  const qtyLabel = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
  return (
    <div className={columnGrid("border-b border-[#6b7280] py-2.5")}>
      <div className="min-w-0">
        <p className="font-bold uppercase tracking-[0.12em]" style={{ color: TEAL }}>{line.name || "Service"}</p>
        {line.description ? <p className="mt-1 text-xs leading-relaxed text-neutral-500">{line.description}</p> : null}
      </div>
      <p className="text-center text-sm font-bold" style={{ color: TEAL }}>{qtyLabel}</p>
      <MoneyAmount className="text-sm font-bold" style={{ color: TEAL }}>{money(unit)}</MoneyAmount>
      <MoneyAmount className="text-sm font-bold" style={{ color: TEAL }}>{money(line.price)}</MoneyAmount>
    </div>
  );
}

export function InvoiceFaceSummary({
  face,
  processingMode,
}: {
  face: InvoiceFace;
  processingMode?: InvoiceProcessingMode;
}) {
  const contextMode = React.useContext(ProcessingModeContext);
  const presented = presentInvoiceMoney(face, processingMode ?? contextMode ?? invoiceProcessingMode());
  const cells: Array<{ id: string; label: string; amount: string; note?: string }> = [
    { id: "subtotal", label: "Sub total", amount: money(presented.subtotal) },
    {
      id: "processing",
      label: "Processing",
      amount: money(presented.processing),
      note: presented.presentation === "included" ? "Included" : undefined,
    },
    { id: "promotions", label: "Promotions", amount: presented.promotions > 0 ? `-${money(presented.promotions)}` : money(0) },
    { id: "fees", label: "Fees", amount: money(presented.fees) },
  ];
  if (presented.travel !== 0) cells.push({ id: "travel", label: "Travel", amount: money(presented.travel) });
  if (presented.tax !== 0) cells.push({ id: "tax", label: "Tax", amount: money(presented.tax) });
  return (
    <div>
      <div className="rounded-2xl border-2 border-black px-4 py-4 sm:px-5" data-testid="invoice-total-box">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:items-end sm:justify-between sm:gap-3">
          {cells.map((cell) => (
            <div key={cell.id} data-invoice-row={cell.id} data-processing-presentation={cell.id === "processing" ? presented.presentation : undefined}>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700 sm:text-[11px] sm:tracking-[0.16em]">{cell.label}</p>
              <MoneyAmount className="mt-1 text-sm font-bold text-black">{cell.amount}</MoneyAmount>
              {cell.note ? <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: GREEN }}>{cell.note}</p> : null}
            </div>
          ))}
          <div className="col-span-2 border-t border-black/15 pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:text-right" data-invoice-row="total">
            <p className="text-base font-semibold tracking-[0.16em] sm:text-lg">TOTAL</p>
            <MoneyAmount className="text-2xl font-black text-black sm:text-3xl">{money(presented.total)}</MoneyAmount>
          </div>
        </div>
      </div>
      {presented.presentation === "included" ? (
        <p className="mt-2 text-[11px] leading-snug text-neutral-500" data-testid="processing-note">
          Processing is 2.8% of the subtotal and is included in the total. It is not an extra charge.
        </p>
      ) : null}
    </div>
  );
}

export function InvoiceNotes({ notes }: { notes?: string | null }) {
  if (notes == null) return null;
  return (
    <section className="pt-2" data-testid="invoice-notes">
      <h2 className="text-sm font-bold tracking-[0.22em]" style={{ color: PINK }}>NOTES:</h2>
      {notes.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-black">{notes}</p> : null}
    </section>
  );
}

export function InvoiceCameraIcon() {
  return (
    <svg data-testid="invoice-camera" viewBox="0 0 48 36" className="h-8 w-10 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="6" y="10" width="36" height="20" rx="3" />
      <path d="M18 10l2.5-4h7L30 10" />
      <circle cx="24" cy="20" r="6" />
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
  processingMode,
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
  processingMode?: InvoiceProcessingMode;
  footer?: React.ReactNode;
}) {
  const mode = processingMode ?? invoiceProcessingMode();
  const presented: PresentedInvoiceMoney = presentInvoiceMoney(face, mode);
  return (
    <BrandedInvoiceShell
      invoiceNumber={invoiceNumber}
      issuedAt={issuedAt}
      status={status}
      amountPaid={presented.amountPaid}
      amountDue={presented.amountDue}
      notes={notes}
      processingMode={mode}
      footer={footer}
    >
      <InvoiceBillTo name={clientName} email={clientEmail} address={billToAddress} />
      <InvoiceLineTable lines={face.services} />
      <InvoiceFaceSummary face={face} processingMode={mode} />
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

function columnGrid(extra: string): string {
  return `grid grid-cols-[minmax(0,1fr)_2.4rem_minmax(5.5rem,auto)_minmax(5.5rem,auto)] items-center gap-x-2 px-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem] sm:gap-x-3 sm:px-5 ${extra}`;
}

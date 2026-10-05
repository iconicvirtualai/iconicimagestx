import * as React from "react";
import { iconicBusinessFooterLines } from "@shared/iconicBusiness";
import type { InvoiceFace, InvoiceFaceLine } from "@shared/invoiceFace";
import { invoiceFaceRows } from "@shared/invoiceFace";

export function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function BrandedInvoiceShell({
  invoiceNumber,
  status,
  amountPaid,
  amountDue,
  children,
  footer,
}: {
  invoiceNumber: string;
  status?: string;
  amountPaid: number;
  amountDue: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-black bg-white shadow-xl" data-testid="branded-invoice">
      <header className="bg-black px-6 py-6 text-white sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <img src="/media/logos/logo-white-large.png" alt="Iconic Images" className="h-10 w-auto sm:h-12" />
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#FFD700]">Invoice</p>
            <p className="mt-1 text-lg font-black tracking-tight sm:text-xl">{invoiceNumber}</p>
            {status ? (
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-[#FFD700]">{status}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="h-1.5 bg-[#FFD700]" />
      <div className="h-1 bg-[#1d4ed8]" />
      <div className="space-y-8 px-6 py-6 sm:px-8">{children}</div>
      <footer className="bg-black px-6 py-6 text-white sm:px-8">
        <div className="mb-1 h-1 w-16 bg-[#FFD700]" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FFD700]">Payment</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Amount paid</p>
            <p className="mt-1 text-lg font-black">{money(amountPaid)}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FFD700]">Amount due</p>
            <p className="mt-1 text-2xl font-black">{money(amountDue)}</p>
          </div>
        </div>
        <div className="mt-5 border-t border-white/15 pt-4 text-xs leading-relaxed text-white/75" data-testid="invoice-business-footer">
          {iconicBusinessFooterLines().map((line, index) => (
            <p key={line} className={index === 0 ? "font-black text-white" : undefined}>{line}</p>
          ))}
        </div>
        {footer ? <div className="mt-5 space-y-3">{footer}</div> : null}
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
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FFD700]">Bill to</p>
      <p className="mt-2 text-lg font-black text-black">{name || "Client"}</p>
      {email ? <p className="text-sm font-medium text-gray-600">{email}</p> : null}
      {address ? <p className="mt-1 max-w-md whitespace-pre-wrap text-sm text-gray-600">{address}</p> : null}
    </div>
  );
}

export function InvoiceLineTable({ lines }: { lines: InvoiceFaceLine[] }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#1d4ed8]">Line items</p>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No line items yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-gray-100 border-y border-gray-200">
          {lines.map((line, index) => (
            <div key={`${line.name}-${index}`} className="flex items-start justify-between gap-4 border-l-4 border-[#FFD700] py-3 pl-3">
              <div className="min-w-0">
                <p className="font-black text-black">{line.name || "Service"}</p>
                {line.description ? <p className="mt-1 text-xs leading-relaxed text-gray-500">{line.description}</p> : null}
                {line.qty > 1 ? <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Qty {line.qty}</p> : null}
              </div>
              <p className="shrink-0 font-black text-black">{money(line.price)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvoiceFaceSummary({ face }: { face: InvoiceFace }) {
  const rows = invoiceFaceRows(face);
  return (
    <div>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} data-invoice-row={row.id} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="font-bold text-gray-500">{row.label}</dt>
            <dd className="font-black text-black">
              {row.signed === "subtract" ? `-${money(row.amount)}` : money(row.amount)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-xl bg-[#1d4ed8] px-5 py-4 text-white" data-testid="invoice-total-box">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FFD700]">Total</p>
        <p className="mt-1 text-3xl font-black tracking-tight">{money(face.total)}</p>
      </div>
    </div>
  );
}

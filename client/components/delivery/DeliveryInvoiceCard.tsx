import { CheckCircle2, CreditCard } from "lucide-react";
import { formatInvoiceAmount } from "@shared/invoiceProcessing";
import { deliveryPaymentLabel, type ClientDeliveryInvoice } from "@shared/clientDelivery";

function money(value: number): string {
  return formatInvoiceAmount(value);
}

export function DeliveryInvoiceCard({
  invoice,
  compact = false,
}: {
  invoice: ClientDeliveryInvoice;
  compact?: boolean;
}) {
  const paid = invoice.status !== "unpaid";
  const label = deliveryPaymentLabel(invoice.status);
  return (
    <section
      className="rounded-3xl border border-[#e6e9e7] bg-white p-5 shadow-sm"
      data-testid="delivery-invoice"
      data-invoice-status={label.toLowerCase()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Invoice</p>
          <p className="mt-1 text-base font-bold text-black" data-testid="delivery-invoice-number">{invoice.number}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-black text-black" data-testid="delivery-invoice-total">{money(invoice.total)}</p>
      {paid ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-3 text-sm text-emerald-900" data-testid="delivery-paid-badge">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{invoice.paidNote || `Paid ${money(invoice.amountPaid)}. Receipt is on file with Iconic Images.`}</p>
        </div>
      ) : invoice.payPath ? (
        <a
          id="delivery-pay-button"
          href={invoice.payPath}
          data-testid="delivery-pay-button"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-bold text-white"
        >
          <CreditCard className="h-4 w-4" /> Pay Now
        </a>
      ) : (
        <button
          id="delivery-pay-button"
          type="button"
          data-testid="delivery-pay-button"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-bold text-white"
        >
          <CreditCard className="h-4 w-4" /> Pay Now
        </button>
      )}
      {!compact && invoice.lines.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 text-sm">
          {invoice.lines.map((line) => (
            <li key={line.name} className="flex items-center justify-between gap-3 py-2">
              <span className="text-gray-700">{line.name}{line.qty > 1 ? ` × ${line.qty}` : ""}</span>
              <span className="font-semibold text-black">{money(line.price)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-3 space-y-1 text-sm text-gray-600">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-semibold text-black">{money(invoice.subtotal)}</dd></div>
        {invoice.processing != null && invoice.processing > 0 && (
          <div className="flex justify-between" data-testid="delivery-processing"><dt>Processing</dt><dd className="font-semibold text-black">{money(invoice.processing)}</dd></div>
        )}
        <div className="flex justify-between"><dt>Balance due</dt><dd className="font-semibold text-black">{money(invoice.amountDue)}</dd></div>
      </dl>
    </section>
  );
}

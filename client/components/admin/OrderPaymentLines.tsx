import { adminOrderPaymentLabel } from "@shared/adminOrderList";

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function paidStamp(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Payment line on the admin order form. Reads fields already on the order or its invoice. */
export function OrderPaymentLines({
  record,
  dark = false,
}: {
  record: Record<string, unknown>;
  dark?: boolean;
}) {
  const invoice = record.invoice && typeof record.invoice === "object"
    ? record.invoice as Record<string, unknown>
    : null;
  const label = adminOrderPaymentLabel(record);
  const paid = Math.max(money(invoice?.amountPaid), money(record.amountPaid), money(record.depositPaid));
  const when = paidStamp(invoice?.paidAt) || paidStamp(record.paidAt);
  const labelClass = dark ? "text-[10px] font-black text-gray-500 uppercase tracking-widest" : "text-[10px] font-black text-gray-400 uppercase tracking-widest";
  const valueClass = dark ? "font-bold text-white" : "font-bold text-black";
  const paidClass = label === "Paid" || label === "Deposit paid"
    ? "font-black text-[#5eead4]"
    : label === "Partial"
      ? "font-black text-amber-300"
      : valueClass;

  return (
    <div data-testid="order-payment-status" className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className={labelClass}>Payment</span>
        <span className={dark && label !== "Unpaid" && label !== "No invoice" && label !== "—" ? paidClass : valueClass}>{label}</span>
      </div>
      {paid > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <span className={labelClass}>Amount paid</span>
          <span className={valueClass}>${paid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      ) : null}
      {when && (label === "Paid" || label === "Deposit paid") ? (
        <div className="flex items-center justify-between gap-3">
          <span className={labelClass}>Paid</span>
          <span className={valueClass}>{when}</span>
        </div>
      ) : null}
    </div>
  );
}

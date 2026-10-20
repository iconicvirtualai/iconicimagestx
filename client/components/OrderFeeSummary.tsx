import { MoneyAmount } from "@/components/MoneyAmount";
import { cn } from "@/lib/utils";
import type { ManagedOrderPrice } from "@shared/managedOrderPricing";

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Row({
  label,
  amount,
  tone,
  strong,
}: {
  label: string;
  amount: string;
  tone: "light" | "dark";
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("min-w-0 text-sm", strong ? "font-black" : "font-bold", tone === "dark" ? "text-gray-300" : "text-gray-600")}>
        {label}
      </span>
      <MoneyAmount className={cn("text-sm", strong ? "text-base font-black" : "font-bold", tone === "dark" && !strong ? "text-white" : "", strong && tone === "light" ? "text-black" : "", strong && tone === "dark" ? "text-[#0d9488]" : "")}>
        {amount}
      </MoneyAmount>
    </div>
  );
}

/** Subtotal, card fee, travel, discount, deposit, total, and balance due. */
export function OrderFeeSummary({
  price,
  tone = "light",
}: {
  price: ManagedOrderPrice;
  tone?: "light" | "dark";
}) {
  return (
    <div data-testid="order-fee-summary" className={cn("space-y-2 border-t pt-3", tone === "dark" ? "border-white/15" : "border-gray-200")}>
      <Row label="Subtotal" amount={money(price.subtotal)} tone={tone} />
      {price.promotions > 0 && (
        <Row label={price.promoCode ? `Discount (${price.promoCode})` : "Discount"} amount={`-${money(price.promotions)}`} tone={tone} />
      )}
      {price.fees > 0 && <Row label="Fees" amount={money(price.fees)} tone={tone} />}
      {price.travel > 0 && <Row label="Travel" amount={money(price.travel)} tone={tone} />}
      {price.tax > 0 && <Row label="Tax" amount={money(price.tax)} tone={tone} />}
      {price.processing > 0 && (
        <Row label="Card processing (2.8%)" amount={money(price.processing)} tone={tone} />
      )}
      <Row label="Total" amount={money(price.total)} tone={tone} strong />
      {price.depositRequired && (
        <Row label={`Deposit (${price.depositPercent}%)`} amount={money(price.depositAmount)} tone={tone} />
      )}
      {price.depositRequired && (
        <Row label="After deposit" amount={money(price.balanceAfterDeposit)} tone={tone} />
      )}
      <Row label="Balance due" amount={money(price.balanceDue)} tone={tone} strong />
    </div>
  );
}

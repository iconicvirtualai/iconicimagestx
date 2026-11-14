import { shortOrderNumber } from "@shared/orderProjectInvoice";

/** Large #003-style order number. Long ids and the word EXAMPLE are not shown. */
export function OrderNumberMark({ value, light = false }: { value?: unknown; light?: boolean }) {
  const label = shortOrderNumber(value);
  if (!label) return null;
  return (
    <p className={`order-number min-w-0 ${light ? "light" : ""}`} data-testid="order-number">
      <span className={light ? "text-white/70" : undefined}>Order</span>
      <strong className={light ? "text-white" : undefined}>{label}</strong>
    </p>
  );
}

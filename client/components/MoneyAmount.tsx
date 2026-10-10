import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Currency amounts stay on one line inside narrow flex and grid rows.
 * Global text uses overflow-wrap: anywhere, which lets a squeezed amount
 * break character by character ($75.00 rendering as stacked fragments).
 * Labels beside an amount may wrap; the amount must not.
 */
export const moneyAmountClass =
  "inline-block shrink-0 whitespace-nowrap text-right tabular-nums min-w-[5.5rem]";

export function MoneyAmount({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      data-slot="money"
      className={cn(moneyAmountClass, className)}
    >
      {children}
    </span>
  );
}

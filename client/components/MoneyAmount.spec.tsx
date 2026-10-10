import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InvoiceFaceSummary,
  InvoiceLineTable,
} from "@/components/invoice/BrandedInvoice";
import { MoneyAmount, moneyAmountClass } from "@/components/MoneyAmount";
import { invoiceFaceFromStored } from "@shared/invoiceFace";

const orderRequest = readFileSync(
  new URL("../pages/AdminOrderRequest.tsx", import.meta.url),
  "utf8",
);
const orderDetail = readFileSync(
  new URL("../pages/AdminOrderDetail.tsx", import.meta.url),
  "utf8",
);
const bookingForm = readFileSync(
  new URL("./BookingForm.tsx", import.meta.url),
  "utf8",
);
const bookingConfirmation = readFileSync(
  new URL("./BookingConfirmation.tsx", import.meta.url),
  "utf8",
);

describe("money amount layout", () => {
  it("keeps $75.00 on one line with nowrap, no shrink, tabular figures, and a minimum width", () => {
    const html = renderToStaticMarkup(
      <div className="flex w-[4.5rem] items-baseline justify-between gap-3">
        <span className="min-w-0">Market Leader Photography</span>
        <MoneyAmount className="font-bold">$75.00</MoneyAmount>
      </div>,
    );
    expect(html).toContain("$75.00");
    expect(html).toContain('data-slot="money"');
    for (const token of [
      "whitespace-nowrap",
      "shrink-0",
      "tabular-nums",
      "min-w-[5.5rem]",
    ]) {
      expect(moneyAmountClass).toContain(token);
      expect(html).toContain(token);
    }
    const amount = html.slice(html.indexOf('data-slot="money"'));
    expect(amount.startsWith('data-slot="money"')).toBe(true);
    expect(amount).not.toContain("Market Leader");
  });

  it("puts invoice line and summary amounts in the same nowrap cell", () => {
    const face = invoiceFaceFromStored({
      lineItems: [{ name: "Photos", price: 75, qty: 1 }],
      subtotal: 75,
      total: 75,
      amountDue: 75,
    });
    const lines = renderToStaticMarkup(
      <InvoiceLineTable lines={face.services} />,
    );
    const summary = renderToStaticMarkup(<InvoiceFaceSummary face={face} />);
    expect(lines).toContain("$75.00");
    expect(lines).toContain('data-slot="money"');
    expect(lines).toContain("whitespace-nowrap");
    expect(summary).toContain("$75.00");
    expect(summary.match(/data-slot="money"/g)?.length).toBeGreaterThan(1);
  });

  it("uses the nowrap amount on the order request summary, order detail, and booking summary", () => {
    const summary = orderRequest.slice(orderRequest.indexOf("Order Summary"));
    expect(summary).toContain("<MoneyAmount");
    expect(summary).toContain("min-w-0");
    expect(summary).not.toMatch(/\{fmtCurrency\([^)]*\)\}<\/span>/);

    expect(orderDetail).toContain("<MoneyAmount");
    expect(orderDetail).not.toMatch(/\{fmtCurrency\([^)]*\)\}<\/span>/);
    expect(orderDetail).not.toMatch(/\{fmtCurrency\([^)]*\)\}<\/p>/);

    const estimator = bookingForm.slice(
      bookingForm.indexOf('data-testid="booking-estimator"'),
      bookingForm.indexOf("Scheduling helpers"),
    );
    expect(estimator).toContain("<MoneyAmount");
    expect(estimator).toContain('data-testid="booking-total"');
    expect(estimator).not.toContain("YOU'RE IN");

    expect(bookingForm).toContain("<BookingConfirmation");
    expect(bookingConfirmation).toContain("YOU'RE IN");
    expect(bookingConfirmation).not.toContain("MoneyAmount");
  });
});

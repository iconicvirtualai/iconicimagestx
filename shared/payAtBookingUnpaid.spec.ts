import { describe, expect, it } from "vitest";
import { formatPayAtBookingUnpaidReport, payAtBookingUnpaidReport } from "./payAtBookingUnpaid";

describe("Pay at Booking unpaid report", () => {
  it("counts only Pay at Booking orders that Square already collected", () => {
    const report = payAtBookingUnpaidReport([
      { paymentMethod: "pay_now", total: 137.89, amountPaid: 137.89, paymentStatus: "paid", squarePaidCents: 13789 },
      { paymentMethod: "pay_now", total: 137.89, amountPaid: 0, paymentStatus: "unpaid", squarePaidCents: 13789, squareState: "COMPLETED" },
      { paymentMethod: "pay_now", total: 134, amountPaid: 0, paymentStatus: "unpaid" },
      { paymentMethod: "pay_later", total: 139, amountPaid: 0, squarePaidCents: 13900 },
      { paymentMethod: "pay_now", total: 257, amountPaid: 128.5, depositPaid: 128.5, paymentStatus: "partial", squarePaidCents: 12850 },
    ]);
    expect(report).toEqual({
      payAtBooking: 4,
      unpaidLocal: 2,
      paidInSquareUnpaidLocal: 1,
      squareUnchecked: 1,
    });
    expect(formatPayAtBookingUnpaidReport(report, "fixture")).toContain("Paid in Square but showing unpaid: 1");
    expect(formatPayAtBookingUnpaidReport(report, "fixture")).toContain("Read only");
  });
});

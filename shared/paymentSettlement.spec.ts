import { describe, expect, it } from "vitest";
import { paymentFaceLabel, paymentSettlementStatus } from "./paymentSettlement";

describe("payment settlement status", () => {
  it("keeps a 50% deposit of the new total partial until the balance is paid", () => {
    const total = 250.83;
    const deposit = 125.42;
    expect(paymentSettlementStatus(total, deposit)).toBe("partial");
    expect(paymentFaceLabel({ total, amountPaid: deposit, depositPaid: deposit })).toBe("Deposit paid");
    expect(paymentSettlementStatus(total, total)).toBe("paid");
  });

  it("treats a Pay at Booking charge that includes the 2.8% fee as paid", () => {
    // $139 package + $3.89 processing − $5 Pay Now savings.
    expect(paymentSettlementStatus(137.89, 137.89)).toBe("paid");
    expect(paymentFaceLabel({ total: 137.89, amountPaid: 137.89, status: "paid" })).toBe("Paid");
  });

  it("keeps a 50% senior-living deposit partial, including processing in the total", () => {
    // $250 package + 2.8% = $257. Half of that charge is the deposit.
    expect(paymentSettlementStatus(257, 128.5)).toBe("partial");
    expect(paymentFaceLabel({
      total: 257,
      amountPaid: 128.5,
      depositPaid: 128.5,
      status: "draft",
    })).toBe("Deposit paid");
    expect(paymentFaceLabel({ total: 200, amountPaid: 40, status: "partial" })).toBe("Partial");
  });

  it("does not call a zero collection paid", () => {
    expect(paymentSettlementStatus(137.89, 0, "sent")).toBe("unpaid");
    expect(paymentFaceLabel({ total: 137.89, amountPaid: 0, paymentStatus: "unpaid" })).toBe("Unpaid");
    expect(paymentSettlementStatus(0, 0, "paid")).toBe("paid");
  });

  it("lets collected money override a stale paid flag", () => {
    expect(paymentSettlementStatus(257, 128.5, "paid")).toBe("partial");
  });
});

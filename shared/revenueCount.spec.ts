import { describe, expect, it } from "vitest";
import {
  adminRevenueAcceptance,
  countedAppointmentRevenue,
  placedRevenueFields,
  planRevenueAcceptanceUpdates,
  recordCountsTowardRevenue,
  revenueAcceptanceForRequest,
  shouldRunOrderCreated,
  sumListingRevenue,
  sumOperationsPaidRevenue,
  sumTransactionAmounts,
  summarizeBillingTotals,
  summarizeInvoiceRevenue,
} from "./revenueCount";

const SETTINGS = {
  photographerPayRate: 0.35,
  editingCostPerPhoto: 0.5,
  avgPhotosPerOrder: 25,
  platformFeePercent: 0.029,
  platformFeeFlat: 0.3,
};

describe("revenue counts only after an admin accepts", () => {
  it("treats a missing flag as false, so existing orders start at $0", () => {
    const prior = { total: 400, amountPaid: 400, status: "paid" };
    expect(recordCountsTowardRevenue(prior)).toBe(false);
    expect(recordCountsTowardRevenue({ ...prior, countsTowardRevenue: false })).toBe(false);
    expect(summarizeInvoiceRevenue([prior], SETTINGS).collected).toBe(0);
    expect(summarizeInvoiceRevenue([prior], SETTINGS).projected).toBe(0);
    expect(sumOperationsPaidRevenue([prior])).toBe(0);
    expect(sumListingRevenue([{ total: 400 }])).toBe(0);
    expect(sumTransactionAmounts([{ amount: 400, status: "completed" }])).toBe(0);
    expect(countedAppointmentRevenue(prior, 400)).toBe(0);
    expect(summarizeBillingTotals([{ total: 400, paid: 400, due: 0, status: "paid", source: prior }])).toMatchObject({
      total: 0,
      collected: 0,
      outstanding: 0,
      overdue: 0,
    });
  });

  it("counts an admin-accepted order and an admin-created order", () => {
    const accepted = { ...adminRevenueAcceptance("cody@iconicimagestx.com", "2026-11-02T22:00:00.000Z"), total: 250, amountPaid: 100, amountDue: 150, status: "sent" };
    expect(recordCountsTowardRevenue(accepted)).toBe(true);
    expect(summarizeInvoiceRevenue([accepted], SETTINGS)).toMatchObject({
      projected: 250,
      collected: 100,
      counted: 1,
    });
    expect(countedAppointmentRevenue(accepted, 250)).toBe(250);
    expect(revenueAcceptanceForRequest({ source: "admin" }, "office@iconicimagestx.com", "2026-11-02T22:00:00.000Z")).toEqual({
      countsTowardRevenue: true,
      revenueAcceptedAt: "2026-11-02T22:00:00.000Z",
      revenueAcceptedBy: "office@iconicimagestx.com",
    });
    expect(revenueAcceptanceForRequest({ source: "booking_form" }, "office@iconicimagestx.com")).toEqual(placedRevenueFields());
  });

  it("leaves playtest and qaOnly out even when the flag is true", () => {
    const playtest = { countsTowardRevenue: true, playtest: true, total: 1, amountPaid: 1, status: "paid" };
    const qa = { countsTowardRevenue: true, qaOnly: true, total: 80, status: "sent", amountPaid: 0, amountDue: 80 };
    const linked = { countsTowardRevenue: true, total: 50, amountPaid: 50, status: "paid", orderId: "playtest-delivery-qa-order" };
    expect(recordCountsTowardRevenue(playtest)).toBe(false);
    expect(recordCountsTowardRevenue(qa)).toBe(false);
    expect(recordCountsTowardRevenue(linked, { order: { playtest: true } })).toBe(false);
    expect(recordCountsTowardRevenue({ countsTowardRevenue: true, playtest: false, total: 20 })).toBe(true);
    expect(summarizeInvoiceRevenue([playtest, qa, { countsTowardRevenue: true, total: 20, amountPaid: 20, status: "paid" }], SETTINGS).collected).toBe(20);
    expect(sumOperationsPaidRevenue([playtest, qa])).toBe(0);
    expect(shouldRunOrderCreated({ playtest: true })).toBe(false);
    expect(shouldRunOrderCreated({ qaOnly: true })).toBe(false);
    expect(shouldRunOrderCreated({ clientEmail: "jane@brokerage.com" })).toBe(true);
  });

  it("toggles the order and its invoice together", () => {
    const docs = [
      { collection: "orders", id: "ord-1", data: { clientName: "Jane", orderRequestId: "req-1" } },
      { collection: "invoices", id: "inv-1", data: { orderId: "ord-1", total: 300 } },
      { collection: "transactions", id: "pay-1", data: { orderId: "ord-1", amount: 300 } },
      { collection: "listings", id: "list-1", data: { orderId: "ord-1", total: 300 } },
      { collection: "orders", id: "other", data: { clientName: "Someone else" } },
    ];
    const on = planRevenueAcceptanceUpdates({
      docs,
      id: "ord-1",
      countsTowardRevenue: true,
      by: "cody@iconicimagestx.com",
      at: "2026-11-02T23:00:00.000Z",
    });
    expect(on.found).toBe(true);
    expect(on.patches.map((patch) => `${patch.collection}/${patch.id}`).sort()).toEqual([
      "invoices/inv-1",
      "listings/list-1",
      "orders/ord-1",
      "transactions/pay-1",
    ]);
    expect(on.patches[0].fields).toEqual({
      countsTowardRevenue: true,
      revenueAcceptedAt: "2026-11-02T23:00:00.000Z",
      revenueAcceptedBy: "cody@iconicimagestx.com",
    });
    const off = planRevenueAcceptanceUpdates({
      docs,
      id: "ord-1",
      countsTowardRevenue: false,
      by: "cody@iconicimagestx.com",
    });
    expect(off.patches.every((patch) => patch.fields.countsTowardRevenue === false)).toBe(true);
    expect(planRevenueAcceptanceUpdates({ docs, id: "missing", countsTowardRevenue: true, by: "cody" }).found).toBe(false);
  });
});

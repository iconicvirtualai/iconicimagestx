import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { shouldRunOrderCreated } from "./orderCreatedNotify";
import {
  countedAppointmentRevenue,
  isPlaytestRecord,
  linksForPlaytestIds,
  playtestOrderAndClientIds,
  summarizeBillingTotals,
  summarizeInvoiceRevenue,
  sumListingRevenue,
  sumOperationsPaidRevenue,
  sumTransactionAmounts,
  type RevenueCostSettings,
} from "./playtestRecord";

const settings: RevenueCostSettings = {
  photographerPayRate: 0.35,
  editingCostPerPhoto: 0.5,
  avgPhotosPerOrder: 25,
  platformFeePercent: 0.029,
  platformFeeFlat: 0.3,
};

const realInvoice = { total: 100, amountPaid: 40, amountDue: 60, status: "sent" };
const playtestInvoice = {
  total: 1,
  amountPaid: 0,
  amountDue: 1,
  status: "sent",
  playtest: true,
  orderId: "playtest-delivery-qa-order",
  clientId: "playtest-delivery-qa-client",
};

describe("isPlaytestRecord", () => {
  it("is true only when playtest is exactly true", () => {
    expect(isPlaytestRecord({ playtest: true })).toBe(true);
    expect(isPlaytestRecord({ playtest: false })).toBe(false);
    expect(isPlaytestRecord({ total: 1 })).toBe(false);
    expect(isPlaytestRecord({ playtest: "true" })).toBe(false);
    expect(isPlaytestRecord(null)).toBe(false);
  });

  it("follows an already-loaded order, client, or nested invoice", () => {
    const invoice = { total: 1, status: "sent", orderId: "o1", clientId: "c1" };
    expect(isPlaytestRecord(invoice, { order: { playtest: true } })).toBe(true);
    expect(isPlaytestRecord(invoice, { client: { playtest: true } })).toBe(true);
    expect(isPlaytestRecord(invoice, { order: { playtest: false }, client: {} })).toBe(false);
    expect(isPlaytestRecord({ invoice: { playtest: true } })).toBe(true);
  });
});

describe("revenue and AR totals", () => {
  it("excludes a playtest invoice and includes it when the flag is false or missing", () => {
    const withPlaytest = summarizeInvoiceRevenue([realInvoice, playtestInvoice], settings);
    const alone = summarizeInvoiceRevenue([realInvoice], settings);
    expect(withPlaytest).toEqual(alone);
    expect(withPlaytest.projected).toBe(100);
    expect(withPlaytest.earned).toBe(100);
    expect(withPlaytest.invoiced).toBe(100);
    expect(withPlaytest.collected).toBe(40);

    const cleared = { ...playtestInvoice, playtest: false };
    const missing = { total: 1, amountPaid: 0, amountDue: 1, status: "sent" };
    expect(summarizeInvoiceRevenue([realInvoice, cleared], settings).projected).toBe(101);
    expect(summarizeInvoiceRevenue([realInvoice, missing], settings).projected).toBe(101);
    expect(summarizeInvoiceRevenue([realInvoice, cleared], settings).earned).toBe(101);
    expect(summarizeInvoiceRevenue([realInvoice, missing], settings).invoiced).toBe(101);
  });

  it("excludes an invoice whose loaded order or client is playtest", () => {
    const invoice = { total: 1, amountPaid: 0, amountDue: 1, status: "sent", orderId: "o1", clientId: "c1" };
    const linksFor = (row: unknown) => (
      row === invoice ? { order: { playtest: true } } : undefined
    );
    expect(summarizeInvoiceRevenue([realInvoice, invoice], settings, { linksFor }).projected).toBe(100);
    expect(summarizeInvoiceRevenue([realInvoice, invoice], settings, {
      linksFor: (row) => (row === invoice ? { client: { playtest: true } } : undefined),
    }).invoiced).toBe(100);
    expect(summarizeInvoiceRevenue([invoice], settings, {
      linksFor: () => ({ order: { playtest: false } }),
    }).projected).toBe(1);
    expect(summarizeInvoiceRevenue([invoice], settings).projected).toBe(1);
  });

  it("keeps the operations revenue tile and related appointment revenue off playtest money", () => {
    expect(sumOperationsPaidRevenue([realInvoice, playtestInvoice])).toBe(100);
    expect(sumOperationsPaidRevenue([realInvoice, { ...playtestInvoice, playtest: false }])).toBe(101);
    expect(sumOperationsPaidRevenue([realInvoice, { total: 1, amountDue: 1, amountPaid: 0, status: "sent" }])).toBe(101);

    const index = playtestOrderAndClientIds([
      { playtest: true, orderId: "playtest-delivery-qa-order", clientId: "playtest-delivery-qa-client" },
      { playtest: false, orderId: "real-order", clientId: "real-client" },
    ]);
    const unflagged = { total: 1, amountDue: 1, amountPaid: 0, orderId: "playtest-delivery-qa-order" };
    const otherClient = { total: 1, amountDue: 1, amountPaid: 0, clientId: "playtest-delivery-qa-client" };
    const real = { total: 9, amountDue: 9, amountPaid: 0, orderId: "real-order" };
    const links = (invoice: unknown) => linksForPlaytestIds(invoice, index);
    expect(sumOperationsPaidRevenue([unflagged, otherClient, real], links)).toBe(9);

    expect(countedAppointmentRevenue({ playtest: true, total: 1 }, 1)).toBe(0);
    expect(countedAppointmentRevenue({ playtest: false, total: 1 }, 1)).toBe(1);
    expect(countedAppointmentRevenue({ total: 1 }, 1)).toBe(1);
  });

  it("excludes playtest rows from billing, project revenue, and transaction totals", () => {
    const billing = summarizeBillingTotals([
      { total: 40, paid: 10, due: 30, status: "sent", source: { playtest: false } },
      { total: 1, paid: 0, due: 1, status: "overdue", source: { playtest: true } },
      { total: 5, paid: 0, due: 5, status: "overdue" },
    ]);
    expect(billing).toEqual({ total: 45, collected: 10, outstanding: 35, overdue: 5 });

    const nested = summarizeBillingTotals([
      { total: 1, paid: 0, due: 1, status: "sent", source: { invoice: { playtest: true } } },
    ]);
    expect(nested.total).toBe(0);

    expect(sumListingRevenue([
      { total: 200 },
      { total: 1, playtest: true },
      { total: 5, playtest: false },
    ])).toBe(205);

    expect(sumTransactionAmounts([
      { amount: 80, status: "completed", type: "payment" },
      { amount: 1, playtest: true, status: "completed", type: "payment" },
      { amount: 4 },
    ])).toBe(84);
  });
});

describe("onOrderCreated", () => {
  it("does nothing for a playtest order", async () => {
    const run = vi.fn(async () => {});
    expect(shouldRunOrderCreated({ playtest: true, clientEmail: "ops+deliveryqa@iconicimagestx.com" })).toBe(false);
    if (shouldRunOrderCreated({ playtest: true })) await run();
    expect(run).not.toHaveBeenCalled();
  });

  it("still runs when playtest is false or missing", async () => {
    const run = vi.fn(async () => {});
    expect(shouldRunOrderCreated({ playtest: false, total: 1 })).toBe(true);
    expect(shouldRunOrderCreated({ clientEmail: "client@example.com" })).toBe(true);
    if (shouldRunOrderCreated({ playtest: false })) await run();
    if (shouldRunOrderCreated({})) await run();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("returns from the Gmail function before templates or mail", () => {
    const source = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("export const onOrderCreated"));
    const gate = body.indexOf("shouldRunOrderCreated");
    const notify = body.indexOf("CLIENT_NOTIFY_LIVE");
    const gmail = body.indexOf("google.gmail");
    const earlyReturn = body.indexOf("return;");
    expect(gate).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(gate);
    expect(earlyReturn).toBeLessThan(notify);
    expect(notify).toBeLessThan(gmail);
  });
});

import { describe, expect, it } from "vitest";
import { buildAdminOrderTile } from "./adminOrderTile.ts";
import {
  dedupeAdminOrders,
  exclusiveOrderBuckets,
  orderChargeSummary,
  orderServiceLines,
} from "./orderPackageLines.ts";

describe("order package display fallback", () => {
  it("reads line items when services is empty and prices the subtotal from those lines", () => {
    const request = {
      id: "6y4F0RVWBQw5z5IJxbWe",
      selectedService: "Hollywood — $199",
      lineItems: [{ name: "Hollywood — $199", price: 199, qty: 1 }],
      services: [],
      total: 199,
      pricing: { subtotal: 0, total: 199 },
    };
    const lines = orderServiceLines(request);
    expect(lines.map((line) => [line.name, line.price])).toEqual([["Hollywood — $199", 199]]);
    expect(orderChargeSummary(request, lines)).toMatchObject({ subtotal: 199, total: 199 });
    expect(buildAdminOrderTile(request).packageName).toBe("Hollywood");
    expect(buildAdminOrderTile(request).priceLabel).toBe("$199");
  });

  it("uses the linked booking when the order services are empty", () => {
    const order = {
      id: "order1",
      orderRequestId: "req1",
      services: [],
      lineItems: [],
      total: 199,
      clientName: "Sytoya Harvin",
    };
    const linked = {
      id: "req1",
      selectedService: "Hollywood — $199",
      total: 199,
      scheduledDate: "2026-10-12",
      scheduledTime: "Morning",
    };
    const lines = orderServiceLines(order, linked);
    expect(lines).toEqual([{ name: "Hollywood", qty: 1, price: 199 }]);
    expect(orderChargeSummary(order, lines).subtotal).toBe(199);
  });
});

describe("admin order list dedupe", () => {
  it("collapses the same order id and a request linked to that order", () => {
    const request = { id: "nzrcJkJMqB53rMyzMlk4", convertedToOrderId: "order9", clientName: "Adriana Simeria" };
    const again = { id: "nzrcJkJMqB53rMyzMlk4", clientName: "Adriana Simeria" };
    const order = { id: "order9", orderRequestId: "nzrcJkJMqB53rMyzMlk4", clientName: "Adriana Simeria" };
    expect(dedupeAdminOrders([request, again, order])).toEqual([request]);

    const buckets = exclusiveOrderBuckets(
      [
        { id: "nzrcJkJMqB53rMyzMlk4", status: "new" },
        { id: "nzrcJkJMqB53rMyzMlk4", status: "new" },
        { id: "order9", orderRequestId: "nzrcJkJMqB53rMyzMlk4", status: "new" },
        { id: "kept", status: "confirmed" },
      ],
      (record) => (record.status === "new" ? "action" : "active"),
    );
    expect(buckets.action.map((record) => record.id)).toEqual(["nzrcJkJMqB53rMyzMlk4"]);
    expect(buckets.active.map((record) => record.id)).toEqual(["kept"]);
  });
});

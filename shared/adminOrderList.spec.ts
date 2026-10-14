import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveListingPriceLabel } from "./listingPrice.ts";
import {
  ADMIN_ORDER_LIST_COLUMNS,
  adminOrderDetailHref,
  adminOrderNumberLabel,
  adminOrderPaymentLabel,
  adminOrderPhotographer,
  adminOrderShoot,
  adminOrderTotalLabel,
  adminOrdersViewStorageKey,
  buildAdminOrderListRow,
  cycleAdminOrderListSort,
  DEFAULT_ADMIN_ORDER_LIST_SORT,
  filterAdminOrderRecords,
  parseAdminOrdersView,
  sampleAdminOrderRecords,
  sampleAdminOrderStaff,
  sortAdminOrderRows,
} from "./adminOrderList.ts";

const staff = sampleAdminOrderStaff();
const records = sampleAdminOrderRecords();
const byId = (id: string) => records.find((order) => order.id === id)!;
const row = (id: string) => buildAdminOrderListRow(byId(id), staff);

describe("admin orders view memory", () => {
  it("keys the saved view by uid, then email", () => {
    expect(adminOrdersViewStorageKey({ uid: "user-a", email: "a@example.com" })).toBe("adminOrdersView:user-a");
    expect(adminOrdersViewStorageKey({ uid: "  ", email: "Ada@Example.com" })).toBe("adminOrdersView:ada@example.com");
    expect(adminOrdersViewStorageKey(null)).toBe("adminOrdersView:anonymous");
    expect(parseAdminOrdersView("list")).toBe("list");
    expect(parseAdminOrdersView("tile")).toBe("tile");
    expect(parseAdminOrdersView("grid")).toBe("tile");
    expect(parseAdminOrdersView(null)).toBe("tile");
  });
});

describe("admin order list totals", () => {
  it("reuses the listings price helper when there is no invoice", () => {
    for (const order of records) {
      if (order.invoice) continue;
      expect(adminOrderTotalLabel(order)).toBe(resolveListingPriceLabel({ listing: order }));
      expect(row(String(order.id)).totalLabel).toBe(resolveListingPriceLabel({ listing: order }));
    }
    expect(row("fixture-pine").totalLabel).toBe("$199.00");
    expect(row("fixture-birch").totalLabel).toBe("—");
  });

  it("includes the 2.8% processing fee when invoice data exists", () => {
    expect(row("fixture-maple").totalLabel).toBe("$641.47");
    expect(row("fixture-oak").totalLabel).toBe("$359.80");
    expect(row("fixture-cedar").totalLabel).toBe("$255.97");
    expect(adminOrderTotalLabel({
      serviceIds: ["listing-showcase"],
      invoice: { subtotal: 549, total: 549 },
    })).toBe("$564.37");
    expect(adminOrderTotalLabel({
      invoice: { subtotal: 549, processing: 15.37, total: 564.37 },
    })).toBe("$564.37");
    expect(adminOrderTotalLabel({
      invoice: { subtotal: 549, total: 549, processingPolicy: "waived" },
    })).toBe("$549.00");
  });
});

describe("admin order payment status", () => {
  it("maps the invoice on the order to Paid, Unpaid, or No invoice", () => {
    expect(adminOrderPaymentLabel(byId("fixture-maple"))).toBe("Paid");
    expect(adminOrderPaymentLabel(byId("fixture-oak"))).toBe("Unpaid");
    expect(adminOrderPaymentLabel(byId("fixture-pine"))).toBe("No invoice");
    expect(adminOrderPaymentLabel({
      invoice: { status: "partial", amountPaid: 40, total: 200 },
    })).toBe("Unpaid");
    expect(adminOrderPaymentLabel({
      invoice: { status: "sent", amountPaid: 200, total: 200 },
    })).toBe("Paid");
    expect(adminOrderPaymentLabel({ invoiceId: "inv_missing_body" })).toBe("—");
  });
});

describe("admin order list rows", () => {
  it("uses the short order code, Chicago shoot time, package add-ons, and detail href", () => {
    const maple = row("fixture-maple");
    expect(maple.orderCode).toBe("#012");
    expect(row("fixture-oak").orderCode).toBe("#017");
    expect(row("fixture-pine").orderCode).toBe("ORD - L - 33018");
    expect(adminOrderNumberLabel({ orderCode: "ORD - L - 10482" })).toBe("ORD - L - 10482");
    expect(adminOrderNumberLabel({ orderNumber: "#004", orderCode: "ORD - L - 10482" })).toBe("#004");
    expect(adminOrderNumberLabel({ orderNumber: 42 })).toBe("#042");
    expect(maple.href).toBe("/admin/order-request/fixture-maple");
    expect(adminOrderDetailHref("fixture maple")).toBe("/admin/order-request/fixture%20maple");
    expect(maple.clientName).toBe("Sample Client Avery North");
    expect(maple.address).toBe("100 Sample Maple Lane, Conroe, TX 77301");
    expect(maple.shootLabel).toBe("Apr 12, 2026, 10:30 AM");
    expect(maple.packageSummary).toBe("The Showcase + Twilight photos");
    expect(maple.photographer).toBe("Sample Photographer Jordan Hale");
    expect(maple.statusLabel).toBe("Scheduled");
    expect(maple.deliveryLabel).toBe("Editing");
    expect(maple.placedLabel).toBe("Apr 2");
    expect(maple.clientEmail).toBe("sample.avery.north@example.com");
    expect(maple.docIdLabel).toBe("#fixtur");
    expect(maple.notes).toBe(
      "Sample vibe: bright and airy.\nGate code is 0000. Park on the sample street.\nInternal: confirm twilight add-on.",
    );
    expect(maple.items.map((item) => item.name)).toEqual(["The Showcase", "Twilight photos"]);
    expect(maple.items.map((item) => item.priceLabel)).toEqual(["$549.00", "$75.00"]);
    expect(row("fixture-oak").notes).toBe("Sample consult notes for the oak office.");
    expect(row("fixture-pine").notes).toBe("");
    expect(row("fixture-cedar").notes).toBe("Delivered sample set.");
    expect(row("fixture-elm").notes).toBe("Sample archive note.");
    expect(buildAdminOrderListRow({
      id: "note-trim",
      vibeNote: "  ",
      notes: "",
      internalNotes: "  keep  ",
    }).notes).toBe("keep");
    expect(buildAdminOrderListRow({
      id: "items-services",
      services: ["Hollywood"],
    }).items).toEqual([{ name: "Hollywood", priceLabel: null }]);
    expect(buildAdminOrderListRow({
      id: "items-empty-lines",
      lineItems: [],
      services: ["Ignored"],
    }).itemsCount).toBe(0);
    expect(buildAdminOrderListRow({ id: "hold-fail", officeFlag: "calendar_hold_failed" }).calendarHoldFailed).toBe(true);
    expect(buildAdminOrderListRow({ id: "hold-ok", calendarHold: "held" }).calendarHoldFailed).toBe(false);
    expect(row("fixture-pine").photographer).toBe("Sample Photographer Riley Moss");
    expect(adminOrderPhotographer(byId("fixture-oak"), staff)).toBe("—");
    expect(row("fixture-cedar").photographer).toBe("Sample Photographer Alex Kim");
  });

  it("formats a timestamp in America/Chicago and keeps a date-only value dateless", () => {
    expect(adminOrderShoot({ appointmentDate: "2026-07-04T18:30:00Z" })).toEqual({
      label: "Jul 4, 2026, 1:30 PM",
      sortKey: "2026-07-04T13:30",
    });
    expect(adminOrderShoot({ appointmentDate: "2026-01-15T18:00:00Z" })).toEqual({
      label: "Jan 15, 2026, 12:00 PM",
      sortKey: "2026-01-15T12:00",
    });
    expect(adminOrderShoot({ appointmentDate: "2026-04-12T00:00:00.000Z" }).label).toBe("Apr 12, 2026");
  });
});

describe("admin order list sorting", () => {
  const active = ["fixture-maple", "fixture-oak", "fixture-pine", "fixture-cedar"].map(row);

  it("defaults to shoot date descending", () => {
    expect(DEFAULT_ADMIN_ORDER_LIST_SORT).toEqual({ field: "shoot", order: "desc" });
    expect(sortAdminOrderRows(active, "shoot", "desc").map((item) => item.id)).toEqual([
      "fixture-oak",
      "fixture-cedar",
      "fixture-maple",
      "fixture-pine",
    ]);
  });

  it("sorts dates by time, totals numerically, and text without case", () => {
    expect(sortAdminOrderRows(active, "shoot", "asc").map((item) => item.id)).toEqual([
      "fixture-pine",
      "fixture-maple",
      "fixture-cedar",
      "fixture-oak",
    ]);
    expect(sortAdminOrderRows(active, "total", "desc").map((item) => item.id)).toEqual([
      "fixture-maple",
      "fixture-oak",
      "fixture-cedar",
      "fixture-pine",
    ]);
    expect(sortAdminOrderRows(active, "total", "asc").map((item) => item.totalSort)).toEqual([199, 255.97, 359.8, 641.47]);
    const mixed = [
      row("fixture-maple"),
      buildAdminOrderListRow({ ...byId("fixture-oak"), clientName: "sample client blair quinn" }, staff),
    ];
    expect(sortAdminOrderRows(mixed, "client", "asc").map((item) => item.id)).toEqual([
      "fixture-maple",
      "fixture-oak",
    ]);
    expect(sortAdminOrderRows(mixed, "client", "desc")[0].id).toBe("fixture-oak");
    const missing = sortAdminOrderRows([row("fixture-birch"), row("fixture-maple")], "shoot", "asc");
    expect(missing.map((item) => item.id)).toEqual(["fixture-maple", "fixture-birch"]);
    expect(sortAdminOrderRows([row("fixture-birch"), row("fixture-maple")], "total", "desc").map((item) => item.id)).toEqual([
      "fixture-maple",
      "fixture-birch",
    ]);
    expect(sortAdminOrderRows(active, "placed", "desc").map((item) => item.id)).toEqual([
      "fixture-cedar",
      "fixture-maple",
      "fixture-oak",
      "fixture-pine",
    ]);
    expect(sortAdminOrderRows(active, "items", "desc").map((item) => item.id)).toEqual([
      "fixture-maple",
      "fixture-oak",
      "fixture-pine",
      "fixture-cedar",
    ]);
    expect(sortAdminOrderRows(active, "notes", "asc").map((item) => item.id)).toEqual([
      "fixture-pine",
      "fixture-cedar",
      "fixture-oak",
      "fixture-maple",
    ]);
    expect(sortAdminOrderRows([
      row("fixture-maple"),
      buildAdminOrderListRow({ id: "no-placed" }),
    ], "placed", "asc").map((item) => item.id)).toEqual(["fixture-maple", "no-placed"]);
  });

  it("cycles column direction by type", () => {
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "shoot").order).toBe("asc");
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "client")).toEqual({ field: "client", order: "asc" });
    expect(cycleAdminOrderListSort({ field: "client", order: "asc" }, "total")).toEqual({ field: "total", order: "desc" });
    expect(ADMIN_ORDER_LIST_COLUMNS.map((column) => column.kind)).toContain("date");
    expect(ADMIN_ORDER_LIST_COLUMNS.map((column) => column.kind)).toContain("number");
    expect(ADMIN_ORDER_LIST_COLUMNS.map((column) => column.label)).toEqual([
      "Order #",
      "Placed",
      "Client name",
      "Property address",
      "Shoot date & time",
      "Package / services",
      "Items",
      "Photographer",
      "Order status",
      "Payment status",
      "Total",
      "Notes",
      "Gallery / delivery status",
      "#",
    ]);
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "notes")).toEqual({ field: "notes", order: "asc" });
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "items")).toEqual({ field: "items", order: "desc" });
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "placed")).toEqual({ field: "placed", order: "desc" });
  });
});

describe("admin order list filters", () => {
  it("keeps the same search match the tiles use", () => {
    const matched = filterAdminOrderRecords(records, "maple");
    expect(matched.map((order) => order.id)).toEqual(["fixture-maple"]);
    expect(filterAdminOrderRecords(records, "SHOWCASE").map((order) => order.id)).toEqual(["fixture-maple"]);
    expect(filterAdminOrderRecords(records, "blair").map((order) => order.id)).toEqual(["fixture-oak"]);
  });
});

describe("one order page writes", () => {
  it("opens the request page and saves into the collection that was loaded", () => {
    const detail = readFileSync(new URL("../client/pages/AdminOrderDetail.tsx", import.meta.url), "utf8");
    const request = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
    expect(detail).toContain('updateDoc(doc(db, sourceCollection, id), updates)');
    expect(detail).not.toContain('updateDoc(doc(db, "orders", id)');
    expect(detail).toContain("fmtDate(order.scheduledDate || order.appointmentDate || order.requestedDate)");
    expect(request).toContain("Processing (stored)");
    expect(request).toContain('updateDoc(doc(db, "orderRequests", id), updates)');
    expect(request).not.toContain("0.028");
  });
});

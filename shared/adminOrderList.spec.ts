import { describe, expect, it } from "vitest";
import { resolveListingPriceLabel } from "./listingPrice.ts";
import {
  ADMIN_ORDER_LIST_COLUMNS,
  adminOrderDetailHref,
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

describe("admin order list totals reuse the listings price helper", () => {
  it("prints the same label resolveListingPriceLabel returns", () => {
    for (const order of records) {
      expect(adminOrderTotalLabel(order)).toBe(resolveListingPriceLabel({ listing: order }));
      expect(row(String(order.id)).totalLabel).toBe(resolveListingPriceLabel({ listing: order }));
    }
    expect(row("fixture-maple").totalLabel).toBe("$549");
    expect(row("fixture-oak").totalLabel).toBe("$350.00");
    expect(row("fixture-pine").totalLabel).toBe("$199.00");
    expect(row("fixture-cedar").totalLabel).toBe("$249");
    expect(row("fixture-birch").totalLabel).toBe("—");
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
    expect(maple.orderCode).toBe("ORD - L - 10482");
    expect(maple.href).toBe("/admin/orders/fixture-maple");
    expect(adminOrderDetailHref("fixture maple")).toBe("/admin/orders/fixture%20maple");
    expect(maple.clientName).toBe("Sample Client Avery North");
    expect(maple.address).toBe("100 Sample Maple Lane, Conroe, TX 77301");
    expect(maple.shootLabel).toBe("Apr 12, 2026, 10:30 AM");
    expect(maple.packageSummary).toBe("The Showcase + Twilight photos");
    expect(maple.photographer).toBe("Sample Photographer Jordan Hale");
    expect(maple.statusLabel).toBe("Scheduled");
    expect(maple.deliveryLabel).toBe("Editing");
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
    expect(sortAdminOrderRows(active, "total", "asc").map((item) => item.totalSort)).toEqual([199, 249, 350, 549]);
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
  });

  it("cycles column direction by type", () => {
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "shoot").order).toBe("asc");
    expect(cycleAdminOrderListSort(DEFAULT_ADMIN_ORDER_LIST_SORT, "client")).toEqual({ field: "client", order: "asc" });
    expect(cycleAdminOrderListSort({ field: "client", order: "asc" }, "total")).toEqual({ field: "total", order: "desc" });
    expect(ADMIN_ORDER_LIST_COLUMNS.map((column) => column.kind)).toContain("date");
    expect(ADMIN_ORDER_LIST_COLUMNS.map((column) => column.kind)).toContain("number");
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

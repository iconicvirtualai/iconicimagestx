import { describe, expect, it } from "vitest";
import { adminOrderGalleryLabel, adminOrderPaymentLabel, adminOrderStatusLabel } from "./adminOrderList.ts";
import {
  ADMIN_ORDER_BOARD_COLUMNS,
  addDateKey,
  chicagoWeek,
  computeOrderDeskKpis,
  DEFAULT_ORDER_DESK_PREFS,
  deliveryProgress,
  deskFilterCounts,
  orderDeskSection,
  orderDeskTriage,
  orderHasOpenEdit,
  orderIsTodayShoot,
  orderMatchesDeskFilter,
  orderPaidThisWeek,
  parseOrderDeskPrefs,
  reorderDeskSections,
  shootWhen,
} from "./adminOrdersDesk.ts";

const NOW = new Date("2026-11-10T18:00:00.000Z");

function order(partial: Record<string, unknown>): Record<string, unknown> {
  return { id: "order-1", status: "scheduled", ...partial };
}

describe("orders desk week", () => {
  it("uses the Monday–Sunday week in America/Chicago", () => {
    const week = chicagoWeek(NOW);
    expect(week.startKey).toBe("2026-11-09");
    expect(week.endKey).toBe("2026-11-15");
    expect(week.keys).toHaveLength(7);
    expect(week.label).toBe("Nov 9–15");
    expect(addDateKey("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("keeps a late Sunday instant on the Chicago day", () => {
    const lateSunday = new Date("2026-11-16T04:30:00.000Z");
    expect(chicagoWeek(lateSunday).endKey).toBe("2026-11-15");
    expect(orderIsTodayShoot(order({ appointmentDate: "2026-11-15" }), lateSunday)).toBe(true);
    expect(orderIsTodayShoot(order({ appointmentDate: "2026-11-16" }), lateSunday)).toBe(false);
  });
});

describe("orders desk KPIs", () => {
  const rows = [
    order({ id: "today-am", appointmentDate: "2026-11-10", appointmentTime: "9:00 AM", galleryStatus: "in_progress", invoice: { status: "paid", amountPaid: 249, total: 249, paidAt: "2026-11-10T15:00:00.000Z" } }),
    order({ id: "today-pm", appointmentDate: "2026-11-10", appointmentTime: "3:30 PM", galleryStatus: "editing", assignedPhotographerName: "Mike Luna" }),
    order({ id: "open", status: "request" }),
    order({ id: "next", appointmentDate: "2026-11-12", appointmentTime: "10:00 AM", galleryStatus: "in_progress", assignedPhotographerName: "Mike Luna" }),
    order({ id: "old-paid", appointmentDate: "2026-11-02", galleryStatus: "delivered", invoice: { status: "paid", amountPaid: 900, total: 900, paidAt: "2026-11-02" }, assignedPhotographerName: "Armando Reyes" }),
    order({ id: "paid-no-date", appointmentDate: "2026-11-11", invoice: { status: "paid", amountPaid: 100, total: 100 }, assignedPhotographerName: "Mike Luna", galleryStatus: "editing" }),
    order({ id: "play", appointmentDate: "2026-11-03", playtest: true, invoice: { status: "paid", amountPaid: 50, total: 50, paidAt: "2026-11-10" }, galleryStatus: "delivered", assignedPhotographerName: "Mike Luna" }),
    order({ id: "archived", status: "archived", appointmentDate: "2026-10-02", galleryStatus: "delivered", invoice: { status: "paid", amountPaid: 10, total: 10, paidAt: "2026-10-02" }, assignedPhotographerName: "Armando Reyes" }),
    order({ id: "partial", appointmentDate: "2026-11-13", assignedPhotographerName: "Mike Luna", galleryStatus: "pending", invoice: { status: "sent", amountPaid: 40, total: 200, paidAt: "2026-11-09T18:00:00.000Z" } }),
  ];

  it("counts today's shoots, unscheduled orders, gallery in progress, and paid revenue this week", () => {
    const kpis = computeOrderDeskKpis(rows, NOW);
    expect(kpis.todayCount).toBe(2);
    expect(kpis.todayHint).toContain("Tue, Nov 10");
    expect(kpis.todayHint).toContain("9:00 AM");
    expect(kpis.todayHint).toContain("3:30 PM");
    expect(kpis.unscheduledCount).toBe(1);
    expect(kpis.progressCount).toBe(2);
    expect(kpis.revenueAmount).toBe(249 + 40);
    expect(kpis.revenueCount).toBe(2);
    expect(kpis.revenueHint).toBe("2 orders · Nov 9–15");
    expect(orderPaidThisWeek(rows.find((row) => row.id === "paid-no-date")!, NOW)).toBe(false);
    expect(orderPaidThisWeek(rows.find((row) => row.id === "play")!, NOW)).toBe(false);
    expect(orderPaidThisWeek(rows.find((row) => row.id === "old-paid")!, NOW)).toBe(false);
    expect(orderPaidThisWeek(order({
      status: "archived",
      invoice: { status: "paid", amountPaid: 80, total: 80, paidAt: "2026-11-12" },
    }), NOW)).toBe(true);
  });

  it("uses the same predicates for the filter tabs", () => {
    const counts = deskFilterCounts(rows, NOW);
    expect(counts.today).toBe(2);
    expect(counts.unscheduled).toBe(1);
    expect(counts.progress).toBe(2);
    expect(counts.revenue).toBe(2);
    expect(counts.all).toBe(rows.filter((row) => adminOrderStatusLabel(row) !== "Archived" && adminOrderStatusLabel(row) !== "Cancelled").length);
    expect(orderMatchesDeskFilter(rows[0], "today", NOW)).toBe(true);
    expect(orderMatchesDeskFilter(rows[2], "unscheduled", NOW)).toBe(true);
    expect(orderMatchesDeskFilter(rows[4], "week", NOW)).toBe(false);
  });
});

describe("orders desk sections", () => {
  it("puts each order in exactly one section", () => {
    const rows = [
      order({ id: "bare", status: "request" }),
      order({ id: "solo", appointmentDate: "2026-11-11", appointmentTime: "2:00 PM" }),
      order({ id: "edit", appointmentDate: "2026-11-04", assignedPhotographerName: "Samir", status: "pending_edit", galleryStatus: "editing" }),
      order({ id: "ready", appointmentDate: "2026-11-05", assignedPhotographerName: "Casey", galleryStatus: "ready_for_review" }),
      order({ id: "fine", appointmentDate: "2026-11-13", assignedPhotographerName: "Mike Luna", galleryStatus: "in_progress" }),
      order({ id: "gone", status: "cancelled", appointmentDate: "2026-11-02" }),
      order({ id: "box", status: "archived", galleryStatus: "delivered", assignedPhotographerName: "Armando Reyes" }),
    ];
    expect(orderDeskTriage(rows[0])?.label).toBe("Unscheduled");
    expect(orderDeskTriage(rows[1])?.action).toBe("Assign");
    expect(orderDeskTriage(rows[2])?.action).toBe("Open request");
    expect(orderDeskTriage(rows[3])?.action).toBe("Open gallery");
    expect(orderDeskTriage(rows[4])).toBeNull();
    expect(rows.map((row) => orderDeskSection(row))).toEqual([
      "action", "action", "action", "action", "active", "archived", "archived",
    ]);
    const placed = new Map<string, string>();
    for (const row of rows) {
      const section = orderDeskSection(row);
      expect(placed.has(String(row.id))).toBe(false);
      placed.set(String(row.id), section);
    }
    expect([...placed.values()].filter((section) => section === "action")).toHaveLength(4);
    expect([...placed.values()].filter((section) => section === "active")).toHaveLength(1);
  });

  it("reads an open edit from the order or a linked edit request", () => {
    expect(orderHasOpenEdit(order({ editRequests: [{ id: "e1", status: "requested" }] }))).toBe(true);
    expect(orderHasOpenEdit(order({ photoEditRequests: [{ id: "p1", status: "received_back" }] }))).toBe(false);
    expect(orderHasOpenEdit(order({ id: "ord-9" }), [{ id: "e2", orderRequestId: "ord-9", status: "sent_out" }])).toBe(true);
    expect(orderHasOpenEdit(order({ id: "ord-9" }), [{ id: "e3", orderRequestId: "ord-9", status: "closed" }])).toBe(false);
  });

  it("prefers unscheduled over a missing photographer", () => {
    expect(orderDeskTriage(order({ status: "request" }))?.reason).toBe("unscheduled");
  });
});

describe("orders desk display helpers", () => {
  it("keeps board columns on the real status labels", () => {
    const samples: Record<string, Record<string, unknown>> = {
      Unscheduled: { status: "request" },
      Confirmed: { status: "confirmed" },
      Scheduled: { status: "scheduled" },
      Pending: { status: "pending" },
      "In Review": { status: "in_review" },
      "Delivered — Unpaid": { status: "delivered" },
      "Delivered — Paid": { status: "delivered", invoice: { status: "paid", amountPaid: 10, total: 10 } },
      Cancelled: { status: "cancelled" },
      Archived: { status: "archived" },
    };
    expect(ADMIN_ORDER_BOARD_COLUMNS.map((label) => adminOrderStatusLabel(samples[label]))).toEqual([...ADMIN_ORDER_BOARD_COLUMNS]);
    expect(adminOrderGalleryLabel({ galleryStatus: "ready_for_review" })).toBe("Ready for review");
    expect(adminOrderPaymentLabel({ invoiceId: "inv_only" })).toBe("—");
  });

  it("labels today and a missing shoot without inventing a time", () => {
    expect(shootWhen(order({ appointmentDate: "2026-11-10", appointmentTime: "9:00 AM" }), NOW)).toEqual({ day: "Today, Nov 10", time: "9:00 AM" });
    expect(shootWhen(order({ status: "request" }), NOW)).toEqual({ day: "Date TBD", time: "" });
  });

  it("reads delivery progress only from stored counts", () => {
    expect(deliveryProgress(order({ images: [{ status: "delivered" }, { status: "editing" }, {}, {}] }))).toEqual({ delivered: 1, total: 4 });
    expect(deliveryProgress(order({ photoCount: 4 }))).toBeNull();
    expect(deliveryProgress(order({ photoCount: 4, deliveredCount: 2 }))).toEqual({ delivered: 2, total: 4 });
  });
});

describe("orders desk preferences", () => {
  it("defaults archives to collapsed and ignores a partial section list", () => {
    expect(DEFAULT_ORDER_DESK_PREFS.collapsed.archived).toBe(true);
    expect(parseOrderDeskPrefs({ sectionOrder: ["archived", "action"], collapsed: { action: true, archived: false }, kpi: { revenue: "1804.91", today: "  " } })).toEqual({
      kpi: { today: null, unscheduled: null, progress: null, revenue: "1804.91" },
      sectionOrder: ["archived", "action", "active"],
      collapsed: { action: true, active: false, archived: false },
    });
    expect(parseOrderDeskPrefs(null).sectionOrder).toEqual(["action", "active", "archived"]);
    expect(parseOrderDeskPrefs(null).collapsed.archived).toBe(true);
  });

  it("reorders a section in front of another", () => {
    expect(reorderDeskSections(["action", "active", "archived"], "action", "archived")).toEqual(["active", "action", "archived"]);
    expect(reorderDeskSections(["action", "active", "archived"], "archived", "end")).toEqual(["action", "active", "archived"]);
    expect(reorderDeskSections(["action", "active", "archived"], "active", "end")).toEqual(["action", "archived", "active"]);
  });
});

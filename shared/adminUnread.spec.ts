import { describe, expect, it } from "vitest";
import { HOLIDAY_RSVP_LEAD, HOLIDAY_SOCIAL_SAVES_LEAD } from "./holidayCheckout.ts";
import {
  assignmentBumps,
  communicationTabUnreadKey,
  communicationUnreadTotal,
  formatUnreadBadge,
  navUnreadCount,
  newlyAssignedStaffIds,
  orderRequestSignal,
  shellUnreadTotal,
  signalForCommunication,
  unreadCounts,
  unreadDelta,
} from "./adminUnread.ts";

const totals = {
  channels: { chat: 4, inbox: 12, sms: 2, botroom: 1, orders: 3, events: 5 },
  taskTotals: { "staff-a": 6, "staff-b": 2 },
};

describe("admin unread counts", () => {
  it("keeps each staff member's seen cursor separate", () => {
    const a = unreadCounts({ ...totals, uid: "staff-a", seen: { chat: 4, inbox: 10, tasks: 6 } });
    const b = unreadCounts({ ...totals, uid: "staff-b", seen: { chat: 1, tasks: 0 } });
    expect(a.chat).toBe(0);
    expect(a.inbox).toBe(2);
    expect(a.tasks).toBe(0);
    expect(b.chat).toBe(3);
    expect(b.inbox).toBe(12);
    expect(b.tasks).toBe(2);
    expect(a.orders).toBe(3);
    expect(b.events).toBe(5);
  });

  it("ignores missing, zero, and negative counters", () => {
    expect(unreadDelta(0, 0)).toBe(0);
    expect(unreadDelta(-3, 1)).toBe(0);
    expect(unreadDelta("nope", 0)).toBe(0);
    expect(unreadCounts({ channels: { chat: 2 }, seen: { chat: 9 } }).chat).toBe(0);
  });

  it("formats a small red count and caps the rest", () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(1)).toBe("1");
    expect(formatUnreadBadge(9)).toBe("9");
    expect(formatUnreadBadge(10)).toBe("9+");
    expect(formatUnreadBadge(120, 99)).toBe("99+");
  });

  it("sums communications children onto the parent and leaves other links alone", () => {
    const counts = unreadCounts({ ...totals, uid: "staff-a", seen: {} });
    expect(communicationUnreadTotal(counts, true)).toBe(4 + 12 + 2 + 1);
    expect(communicationUnreadTotal(counts, false)).toBe(4 + 12 + 2);
    expect(navUnreadCount("/admin/communications", counts, "admin")).toBe(19);
    expect(navUnreadCount("/admin/communications", counts, "coordinator")).toBe(18);
    expect(navUnreadCount("/admin/communications/email", counts, "admin")).toBe(0);
    expect(navUnreadCount("/admin/botroom", counts, "admin")).toBe(1);
    expect(navUnreadCount("/admin/botroom", counts, "coordinator")).toBe(0);
    expect(navUnreadCount("/admin/orders", counts, "coordinator")).toBe(3);
    expect(navUnreadCount("/admin/events", counts, "coordinator")).toBe(5);
    expect(navUnreadCount("/admin/tasks", counts, "admin")).toBe(6);
    expect(navUnreadCount("/admin/tasks", counts, "coordinator")).toBe(0);
    expect(navUnreadCount("/admin/dashboard", counts, "admin")).toBe(0);
    expect(shellUnreadTotal(counts, "admin")).toBe(19 + 3 + 5 + 6);
    expect(shellUnreadTotal(counts, "photographer")).toBe(0);
  });

  it("maps communications tabs and real arrival signals", () => {
    expect(communicationTabUnreadKey("contact")).toBe("chat");
    expect(communicationTabUnreadKey("inbox")).toBe("inbox");
    expect(communicationTabUnreadKey("sms")).toBe("sms");
    expect(communicationTabUnreadKey("botroom")).toBe("botroom");
    expect(communicationTabUnreadKey("sweep")).toBeNull();
    expect(communicationTabUnreadKey("compose")).toBeNull();
    expect(orderRequestSignal(HOLIDAY_RSVP_LEAD)).toBe("events");
    expect(orderRequestSignal(HOLIDAY_SOCIAL_SAVES_LEAD)).toBe("orders");
    expect(orderRequestSignal("Booking form")).toBe("orders");
    expect(signalForCommunication({ direction: "inbound", channel: "in-app", senderType: "client" })).toBe("inbox");
    expect(signalForCommunication({ direction: "inbound", channel: "contact", senderType: "client" })).toBe("inbox");
    expect(signalForCommunication({ direction: "inbound", channel: "sms", senderType: "client" })).toBe("sms");
    expect(signalForCommunication({ direction: "inbound", channel: "sms", senderType: "photographer" })).toBe("sms");
    expect(signalForCommunication({ direction: "outbound", channel: "sms", senderType: "staff" })).toBeNull();
    expect(signalForCommunication({ direction: "inbound", channel: "email", senderType: "staff" })).toBeNull();
  });

  it("counts a new assignee once per task and skips the person who assigned themselves", () => {
    const previous = [
      { id: "a", assigneeId: "mike" },
      { id: "b", assigneeId: null },
    ];
    const next = [
      { id: "a", assigneeId: "cadi" },
      { id: "b", assigneeId: "cadi" },
      { id: "c", assigneeId: "mike" },
    ];
    expect(newlyAssignedStaffIds(previous, next, "mike")).toEqual(["cadi", "cadi"]);
    expect(assignmentBumps(newlyAssignedStaffIds(previous, next, "mike"))).toEqual({ cadi: 2 });
    expect(newlyAssignedStaffIds(previous, [{ id: "a", assigneeId: "mike" }], "cadi")).toEqual([]);
  });
});

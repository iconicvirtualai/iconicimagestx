import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QA_STAFF_ASSIGN_ERROR } from "../../shared/qaStaff";
import { refuseQaStaffAssignment, refuseQaStaffPhone } from "./qaStaffAssign.ts";

const QA = {
  id: "qa-coord",
  name: "QA TEST Do Not Assign",
  phone: "(281) 555-0199",
  qaOnly: true,
};

const ARMANDO = { id: "armando", name: "Armando", phone: "2815550100" };

function loader(id: string) {
  if (id === QA.id) return Promise.resolve(QA);
  if (id === ARMANDO.id) return Promise.resolve(ARMANDO);
  return Promise.resolve(null);
}

describe("refuseQaStaffAssignment", () => {
  it("returns 400 when a QA login is assigned to a real order", async () => {
    await expect(refuseQaStaffAssignment({
      staffIds: [QA.id],
      record: { id: "order-real" },
    }, loader)).resolves.toEqual({ status: 400, error: QA_STAFF_ASSIGN_ERROR });

    await expect(refuseQaStaffAssignment({
      staff: [{ id: "play-photo", playtest: true, name: "Playtest Photo" }],
      record: { id: "listing-real" },
    }, loader)).resolves.toEqual({ status: 400, error: QA_STAFF_ASSIGN_ERROR });
  });

  it("allows a QA login on a playtest order and a real photographer on a real order", async () => {
    await expect(refuseQaStaffAssignment({
      staffIds: [QA.id],
      record: { id: "order-play", playtest: true },
    }, loader)).resolves.toBeNull();

    await expect(refuseQaStaffAssignment({
      staffIds: [QA.id],
      record: { id: "playtest-shoot-1" },
    }, loader)).resolves.toBeNull();

    await expect(refuseQaStaffAssignment({
      staffIds: [ARMANDO.id],
      record: { id: "order-real" },
    }, loader)).resolves.toBeNull();

    await expect(refuseQaStaffAssignment({
      staffIds: [],
      record: { id: "order-real" },
    }, loader)).resolves.toBeNull();
  });

  it("refuses photographer SMS to a QA phone on a real order and allows it on a playtest order", () => {
    expect(refuseQaStaffPhone({
      photographerPhone: "281-555-0199",
      staff: [QA, ARMANDO],
      record: { id: "order-real" },
    })).toEqual({ status: 400, error: QA_STAFF_ASSIGN_ERROR });

    expect(refuseQaStaffPhone({
      photographerPhone: QA.phone,
      staff: [QA, ARMANDO],
      record: { id: "order-play", playtest: true },
    })).toBeNull();

    expect(refuseQaStaffPhone({
      photographerPhone: ARMANDO.phone,
      staff: [QA, ARMANDO],
      record: { id: "order-real" },
    })).toBeNull();
  });
});

describe("assignment endpoints call the guard before they write or notify", () => {
  it("checks bookings confirm, order assign, and photographer SMS before side effects", () => {
    const bookings = readFileSync(new URL("../routes/bookings.ts", import.meta.url), "utf8");
    const orders = readFileSync(new URL("../routes/orders.ts", import.meta.url), "utf8");
    const sms = readFileSync(new URL("../routes/sms.ts", import.meta.url), "utf8");

    const confirmAt = bookings.indexOf("await refuseQaStaffAssignment");
    const orderWriteAt = bookings.indexOf('collection("orders").add');
    const calendarAt = bookings.indexOf("await createCalendarBookingEvent");
    const confirmMailAt = bookings.indexOf('template: "order_confirmed"');
    expect(confirmAt).toBeGreaterThan(-1);
    expect(orderWriteAt).toBeGreaterThan(confirmAt);
    expect(calendarAt).toBeGreaterThan(confirmAt);
    expect(confirmMailAt).toBeGreaterThan(confirmAt);

    const patchAt = orders.indexOf("await refuseQaStaffAssignment");
    const patchWriteAt = orders.indexOf(".update(updates)");
    expect(patchAt).toBeGreaterThan(-1);
    expect(patchWriteAt).toBeGreaterThan(patchAt);

    const smsAt = sms.indexOf("refuseQaStaffPhone({");
    const convoAt = sms.indexOf("await createMaskedConversation");
    expect(smsAt).toBeGreaterThan(-1);
    expect(convoAt).toBeGreaterThan(smsAt);
  });
});

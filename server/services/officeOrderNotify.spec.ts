import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./email", () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));

import { sendEmail } from "./email";
import type { OrderPackageRepair } from "../../shared/orderPackageRepair";
import { notifyOfficeOfOrder } from "./officeOrderNotify";
import { runOrderPackageBackfill } from "./orderPackageRepair";

const sendEmailMock = vi.mocked(sendEmail);

const saved = {
  id: "6y4F0RVWBQw5z5IJxbWe",
  orderNumber: "ORD-L-00534",
  clientName: "Sytoya Harvin",
  email: "sytoya@example.com",
  clientEmail: "sytoya@example.com",
  lineItems: [{ id: "hollywood", name: "Hollywood", price: 199, qty: 1 }],
  total: 199,
  pricing: { subtotal: 199, tax: 0, total: 199 },
  address: "123 Main St",
  scheduledDate: "2026-10-12",
  leadSource: "Iconic temporary booking page",
};

describe("office new order delivery", () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
    sendEmailMock.mockResolvedValue({ sent: true });
  });

  it("emails staff from the saved order and never the client", async () => {
    const result = await notifyOfficeOfOrder({
      isNewOrder: true,
      saved,
      adminUrl: "https://iconicimagestx.com/admin/order-request/6y4F0RVWBQw5z5IJxbWe",
      env: {
        ADMIN_EMAIL: "office@iconicimagestx.com",
        COORDINATOR_EMAIL: "coord@iconicimagestx.com, sytoya@example.com",
        CLIENT_COMMS_ZONE: "RED",
      },
    });
    expect(result.sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const message = sendEmailMock.mock.calls[0][0];
    expect(message.to).toBe("office@iconicimagestx.com, coord@iconicimagestx.com");
    expect(message.to).not.toContain("sytoya@example.com");
    expect(message.audience).toBe("staff");
    expect(message.template).toBe("office_new_order");
    expect(message.subject).toContain("Hollywood");
    expect(message.subject).toContain("ORD-L-00534");
    expect(message.html).toContain("Hollywood");
    expect(message.html).toContain("$199.00");
  });

  it("prefixes [TEST] from the saved client name", async () => {
    await notifyOfficeOfOrder({
      isNewOrder: true,
      saved: { ...saved, clientName: "TEST ORDER Sytoya" },
      env: { ADMIN_EMAIL: "office@iconicimagestx.com" },
    });
    expect(sendEmailMock.mock.calls[0][0].subject?.startsWith("[TEST] ")).toBe(true);
  });

  it("does not send when the order is not new", async () => {
    const result = await notifyOfficeOfOrder({
      isNewOrder: false,
      saved: { ...saved, clientName: "TEST ORDER Sytoya", vibeNote: "TEST ORDER" },
      env: { ADMIN_EMAIL: "office@iconicimagestx.com", COORDINATOR_EMAIL: "coord@iconicimagestx.com" },
    });
    expect(result).toEqual({ sent: false, reason: "not-new" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("order package backfill", () => {
  it("repairs empty lines and sends nothing", async () => {
    sendEmailMock.mockClear();
    const write = vi.fn(async (_patch: OrderPackageRepair) => undefined);
    const result = await runOrderPackageBackfill({
      id: "6y4F0RVWBQw5z5IJxbWe",
      clientName: "TEST ORDER Sytoya",
      selectedService: "Hollywood — $199",
      total: 199,
      lineItems: [],
      services: [],
      vibeNote: "TEST ORDER",
    }, write);
    expect(result.updated).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]?.lineItems[0]).toMatchObject({ name: "Hollywood", price: 199 });
    expect(sendEmailMock).not.toHaveBeenCalled();

    const repairSource = readFileSync(new URL("./orderPackageRepair.ts", import.meta.url), "utf8");
    expect(repairSource).not.toContain("sendEmail");
    expect(repairSource).not.toContain("notifyOfficeOfOrder");

    const bookings = readFileSync(new URL("../routes/bookings.ts", import.meta.url), "utf8");
    const notifyAt = bookings.indexOf("notifyOfficeOfOrder");
    const confirmAt = bookings.indexOf('router.patch("/:id/confirm"');
    expect(notifyAt).toBeGreaterThan(-1);
    expect(confirmAt).toBeGreaterThan(notifyAt);
    expect(bookings.slice(confirmAt)).not.toContain("notifyOfficeOfOrder");
    const post = bookings.slice(bookings.indexOf('router.post("/"'), confirmAt);
    expect(post.indexOf("const savedSnap = await docRef.get()")).toBeGreaterThan(-1);
    expect(post.indexOf("const savedSnap = await docRef.get()")).toBeLessThan(post.indexOf("notifyOfficeOfOrder"));
    expect(post).toContain("isNewOrder: true");
    expect(post).toContain("saved: savedOrder");
  });
});

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./email", () => ({
  sendEmail: vi.fn(async () => ({ sent: true, delivery: "sent" as const })),
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
    sendEmailMock.mockResolvedValue({ sent: true, delivery: "sent" });
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
    expect(message.variables).toMatchObject({
      orderNumber: "ORD-L-00534",
      packageName: "Hollywood",
      serviceName: "Hollywood",
    });
  });

  it("passes the admin order code and package name when the saved record omitted them", async () => {
    await notifyOfficeOfOrder({
      isNewOrder: true,
      saved: {
        id: "order74499",
        clientName: "Test Client",
        email: "client@example.com",
        address: "100 Congress Ave, Austin, TX 78701",
        lineItems: [{ id: "hollywood", name: "Hollywood", price: 199, qty: 1 }],
        total: 199,
        packageName: "Hollywood",
      },
      env: { ADMIN_EMAIL: "office@iconicimagestx.com" },
    });
    const message = sendEmailMock.mock.calls[0][0];
    expect(message.subject?.startsWith("New order ORD - L - 74499 — Hollywood")).toBe(true);
    expect(message.subject).not.toContain("New order Not provided");
    expect(message.variables?.orderNumber).toBe("ORD - L - 74499");
    expect(message.variables?.packageName).toBe("Hollywood");
    expect(message.variables?.serviceName).toBe("Hollywood");
    expect(message.html).toContain("ORD - L - 74499");
    expect(message.html).toContain("Hollywood");
  });

  it("prefixes [TEST] from the saved client name", async () => {
    await notifyOfficeOfOrder({
      isNewOrder: true,
      saved: { ...saved, clientName: "TEST ORDER Sytoya" },
      env: { ADMIN_EMAIL: "office@iconicimagestx.com" },
    });
    expect(sendEmailMock.mock.calls[0][0].subject?.startsWith("[TEST] ")).toBe(true);
  });

  it("includes a saved calendar-hold office note", async () => {
    const note = "Calendar hold failed for Mike Luna at Wed, Oct 14 · 9:00 AM. Add it to the calendar manually.";
    await notifyOfficeOfOrder({
      isNewOrder: true,
      saved: { ...saved, officeNote: note },
      env: { ADMIN_EMAIL: "office@iconicimagestx.com" },
    });
    const message = sendEmailMock.mock.calls[0][0];
    expect(message.html).toContain(note);
    expect(message.variables?.body).toContain(`Office note: ${note}`);
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const write = vi.fn(async (_patch: OrderPackageRepair) => undefined);
    const result = await runOrderPackageBackfill({
      id: "6y4F0RVWBQw5z5IJxbWe",
      clientName: "TEST ORDER Sytoya",
      selectedService: "Hollywood — $199",
      total: 175,
      lineItems: [],
      services: [],
      vibeNote: "TEST ORDER",
    }, write);
    expect(result.updated).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const patch = write.mock.calls[0]?.[0];
    expect(patch && Object.keys(patch).sort()).toEqual(["lineItems", "services"]);
    expect(patch).not.toHaveProperty("total");
    expect(patch).not.toHaveProperty("subtotal");
    expect(patch).not.toHaveProperty("pricing");
    expect(patch).not.toHaveProperty("paymentStatus");
    expect(patch).not.toHaveProperty("invoice");
    expect(patch).not.toHaveProperty("amountPaid");
    expect(patch?.lineItems[0]?.name).toBe("Hollywood");
    expect(warn.mock.calls.flat().join(" ")).toContain("kept stored total 175");
    warn.mockRestore();
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
    const savedOrderBlock = post.slice(post.indexOf("const savedOrder"), post.indexOf("notifyOfficeOfOrder"));
    expect(savedOrderBlock).toContain("orderNumber,");
    expect(savedOrderBlock).toContain("packageName");
    const officeNotify = readFileSync(new URL("./officeOrderNotify.ts", import.meta.url), "utf8");
    expect(officeNotify).toContain("orderNumber: message.orderNumber");
    expect(officeNotify).toContain("packageName: message.packageName");
    expect(officeNotify).toContain("serviceName: message.packageName");
  });
});

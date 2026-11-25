import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_EMAIL_NOTIFY_TEST_SINK } from "../../shared/aryeoEmailNotify";
import {
  createMemoryEmailNotifyStore,
  dispatchClientEmailNotifications,
  resetEmailNotifyForTests,
  runDueClientEmailJobs,
  sendTestNotification,
  setClientEmailDeliveryOverride,
  setEmailNotifyStoreForTests,
} from "./aryeoEmailNotify";

const sent: Array<{ to: string; subject: string; html: string }> = [];

afterEach(() => {
  sent.length = 0;
  setClientEmailDeliveryOverride(null);
  resetEmailNotifyForTests();
  delete process.env.CLIENT_EMAIL_NOTIFY_LIVE;
});

function arm() {
  const store = createMemoryEmailNotifyStore();
  setEmailNotifyStoreForTests(store);
  setClientEmailDeliveryOverride(async (message) => {
    sent.push(message);
  });
  return store;
}

const order = {
  orderNumber: "#1042",
  clientName: "Jordan Hale",
  clientEmail: "jordan@example.com",
  address: "1200 Sample Oak Lane, Spring, TX 77380",
  scheduledDate: "2026-12-01",
  scheduledTime: "10:00 AM",
  total: 200,
  balanceDue: 200,
  lineItems: [{ name: "Photos", price: 200 }],
};

describe("Aryeo email delivery", () => {
  it("sends only to the QA sink while the flag is off and does not duplicate", async () => {
    arm();
    const first = await dispatchClientEmailNotifications({
      type: "order_placed",
      record: order,
      recordId: "req1",
      collection: "orderRequests",
      requestId: "req1",
    });
    const again = await dispatchClientEmailNotifications({
      type: "order_placed",
      record: order,
      recordId: "order1",
      collection: "orders",
      requestId: "req1",
    });
    expect(first.some((item) => item.status === "sent")).toBe(true);
    expect(sent.every((message) => message.to === CLIENT_EMAIL_NOTIFY_TEST_SINK)).toBe(true);
    expect(again.every((item) => item.status === "duplicate" || item.status === "disabled" || item.status === "no_recipient")).toBe(true);
    expect(sent.filter((message) => message.subject.includes("New order confirmation"))).toHaveLength(1);
    expect(sent.some((message) => message.html.includes("sms") && message.html.includes("twilio"))).toBe(false);
  });

  it("never emails Marco Brito, even when the flag is on", async () => {
    arm();
    process.env.CLIENT_EMAIL_NOTIFY_LIVE = "true";
    const result = await dispatchClientEmailNotifications({
      type: "order_placed",
      record: { ...order, clientName: "Marco Brito", clientEmail: "marco.brito@example.com" },
      recordId: "req-marco",
      collection: "orderRequests",
      requestId: "req-marco",
    });
    expect(result.find((item) => item.status === "suppressed")).toBeTruthy();
    expect(sent.some((message) => /marco/i.test(message.to))).toBe(false);
  });

  it("keeps a test send on the QA sink and schedules a 24 hour reminder", async () => {
    const store = arm();
    const test = await sendTestNotification({ key: "customer_appointment_reminder", to: "cadi@example.com" });
    expect(test.deliveredTo).toEqual([CLIENT_EMAIL_NOTIFY_TEST_SINK]);
    await dispatchClientEmailNotifications({
      type: "appointment_scheduled",
      record: order,
      recordId: "order-1",
      collection: "orders",
      requestId: "req-1",
    });
    const due = await store.dueJobs(new Date("2026-11-30T16:00:00.000Z"));
    expect(due.some((job) => job.kind === "reminder")).toBe(true);
    const ran = await runDueClientEmailJobs(new Date("2026-11-30T16:00:00.000Z"));
    expect(ran.ran).toBeGreaterThan(0);
    expect(sent.some((message) => message.subject.includes("Appointment Reminder"))).toBe(true);
  });
});

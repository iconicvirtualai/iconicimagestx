import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
  seq: 0,
}));
const availability = vi.hoisted(() => vi.fn());
const createEvent = vi.hoisted(() => vi.fn());
const deleteEvent = vi.hoisted(() => vi.fn(async () => true));

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

vi.mock("firebase-admin", () => {
  function ref(name: string, id: string) {
    return {
      id,
      async get() {
        const data = docs(name).get(id);
        return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
      },
      async update(patch: Record<string, unknown>) {
        docs(name).set(id, { ...(docs(name).get(id) || {}), ...patch });
      },
    };
  }
  function query(name: string, filters: Array<[string, unknown]>) {
    return {
      where(field: string, _op: string, value: unknown) {
        return query(name, [...filters, [field, value]]);
      },
      async get() {
        return {
          docs: [...docs(name).entries()]
            .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
            .map(([id, data]) => ({ id, data: () => ({ ...data }) })),
        };
      },
    };
  }
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id?: string) {
            return ref(name, id || `auto-${++store.seq}`);
          },
          async add(data: Record<string, unknown>) {
            const id = `auto-${++store.seq}`;
            docs(name).set(id, { ...data });
            return ref(name, id);
          },
          where(field: string, _op: string, value: unknown) {
            return query(name, [[field, value]]);
          },
        };
      },
      async runTransaction(fn: (tx: unknown) => Promise<unknown>) {
        const writes: Array<() => Promise<void>> = [];
        const tx = {
          get: (target: { get: () => Promise<unknown> }) => target.get(),
          update: (target: { update: (p: Record<string, unknown>) => Promise<void> }, patch: Record<string, unknown>) => {
            writes.push(() => target.update(patch));
          },
        };
        const result = await fn(tx);
        for (const write of writes) await write();
        return result;
      },
    };
  }
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  return { default: { apps: [{ name: "holds-test" }], firestore } };
});

vi.mock("./apprenticeshipCalendar", () => ({
  readApprenticeshipAvailability: availability,
  createApprenticeshipEvent: createEvent,
  deleteApprenticeshipEvent: deleteEvent,
}));

import {
  releaseExpiredApprenticeshipHolds,
  resolveLateApprenticeshipPayment,
} from "./apprenticeshipHolds";

const NOW = new Date("2026-10-24T15:00:00.000Z");
const SLOT = {
  start: "2026-10-26T14:00:00.000Z",
  end: "2026-10-26T14:20:00.000Z",
  date: "2026-10-26",
  time: "9:00 AM",
  label: "Mon, Oct 26 · 9:00 AM",
};

function seedHold(id: string, overrides: Record<string, unknown> = {}) {
  docs("orders").set(id, {
    source: "apprenticeship",
    status: "awaiting_deposit",
    depositStatus: "awaiting",
    depositPaid: 0,
    orderNumber: `#${id}`,
    orderRequestId: `req-${id}`,
    invoiceId: `inv-${id}`,
    packageId: "apprentice-25",
    slotStart: SLOT.start,
    calendarEventId: `evt-${id}`,
    calendarId: "apprentice-calendar",
    holdExpiresAt: "2026-10-24T14:30:00.000Z",
    ...overrides,
  });
  docs("orderRequests").set(`req-${id}`, { source: "apprenticeship", status: "new", depositStatus: "awaiting" });
  docs("invoices").set(`inv-${id}`, { status: "draft", depositPaid: 0, depositRequired: true });
}

beforeEach(() => {
  store.collections = {};
  store.seq = 0;
  deleteEvent.mockReset();
  deleteEvent.mockResolvedValue(true);
  createEvent.mockReset();
  availability.mockReset();
});

describe("release unpaid apprentice holds", () => {
  it("expires a hold older than 60 minutes and deletes its calendar HOLD", async () => {
    seedHold("old");
    const result = await releaseExpiredApprenticeshipHolds({ now: NOW });
    expect(result).toMatchObject({ released: 1, eventsDeleted: 1, eventErrors: 0 });
    expect(docs("orders").get("old")).toMatchObject({
      status: "expired_unpaid",
      depositStatus: "expired",
      calendarEventReleased: true,
    });
    expect(docs("orderRequests").get("req-old")).toMatchObject({ status: "expired_unpaid" });
    expect(docs("invoices").get("inv-old")).toMatchObject({ holdExpired: true, status: "draft" });
    expect(deleteEvent).toHaveBeenCalledWith({ calendarId: "apprentice-calendar", eventId: "evt-old" });
  });

  it("falls back to createdAt + 60 minutes when holdExpiresAt is missing", async () => {
    seedHold("legacy", { holdExpiresAt: undefined, createdAt: { toDate: () => new Date("2026-10-24T13:30:00.000Z") } });
    seedHold("recent", { holdExpiresAt: undefined, createdAt: { toDate: () => new Date("2026-10-24T14:30:00.000Z") } });
    const result = await releaseExpiredApprenticeshipHolds({ now: NOW });
    expect(result.released).toBe(1);
    expect(docs("orders").get("legacy")?.status).toBe("expired_unpaid");
    expect(docs("orders").get("recent")?.status).toBe("awaiting_deposit");
  });

  it("leaves fresh holds, paid invoices, and other sources alone", async () => {
    seedHold("fresh", { holdExpiresAt: "2026-10-24T15:30:00.000Z" });
    seedHold("paid");
    docs("invoices").set("inv-paid", { status: "draft", depositPaid: 25, depositPaidAt: "x" });
    seedHold("senior", { source: "senior-living" });
    const result = await releaseExpiredApprenticeshipHolds({ now: NOW });
    expect(result.released).toBe(0);
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(docs("orders").get("fresh")?.status).toBe("awaiting_deposit");
    expect(docs("orders").get("paid")?.status).toBe("awaiting_deposit");
  });

  it("retries a calendar delete that failed on an earlier run", async () => {
    seedHold("stuck");
    deleteEvent.mockRejectedValueOnce(new Error("calendar down"));
    const first = await releaseExpiredApprenticeshipHolds({ now: NOW });
    expect(first).toMatchObject({ released: 1, eventsDeleted: 0, eventErrors: 1 });
    expect(docs("orders").get("stuck")).toMatchObject({ status: "expired_unpaid", calendarEventReleased: false });
    const second = await releaseExpiredApprenticeshipHolds({ now: NOW });
    expect(second).toMatchObject({ released: 0, eventsDeleted: 1 });
    expect(docs("orders").get("stuck")?.calendarEventReleased).toBe(true);
  });
});

describe("fee paid after the hold expired", () => {
  it("re-confirms and re-books the calendar when the same time is still open", async () => {
    seedHold("late", { status: "expired_unpaid", depositStatus: "paid" });
    availability.mockResolvedValue({ available: true, slots: [SLOT] });
    createEvent.mockResolvedValue({ calendarId: "apprentice-calendar", eventId: "evt-new", htmlLink: null });
    expect(await resolveLateApprenticeshipPayment("late")).toBe("confirmed");
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ slot: SLOT, orderNumber: "#late" }));
    expect(createEvent.mock.calls[0][0].hold).toBeUndefined();
    expect(docs("orders").get("late")).toMatchObject({
      status: "confirmed",
      depositStatus: "paid",
      reconfirmedAfterExpiry: true,
      calendarEventId: "evt-new",
    });
    expect(docs("agentLogs")?.size || 0).toBe(0);
  });

  it("flags the office (no client message) when the time was taken", async () => {
    seedHold("taken", { status: "expired_unpaid" });
    availability.mockResolvedValue({ available: true, slots: [] });
    expect(await resolveLateApprenticeshipPayment("taken")).toBe("flagged");
    expect(createEvent).not.toHaveBeenCalled();
    expect(docs("orders").get("taken")).toMatchObject({
      status: "paid_needs_reschedule",
      depositStatus: "paid",
      needsOfficeReview: true,
    });
    expect(String(docs("orders").get("taken")?.officeNote)).toMatch(/Call the agent/);
    const log = [...docs("agentLogs").values()][0];
    expect(log).toMatchObject({ status: "flagged", requiresHumanReview: true, relatedId: "taken" });
  });

  it("flags the office when the calendar cannot be read", async () => {
    seedHold("down", { status: "expired_unpaid" });
    availability.mockResolvedValue({ available: false, slots: [] });
    expect(await resolveLateApprenticeshipPayment("down")).toBe("flagged");
    expect(String(docs("orders").get("down")?.officeNote)).toMatch(/could not be read/);
  });

  it("confirms a preferred-time order with no slot to re-check", async () => {
    seedHold("pref", { status: "expired_unpaid", slotStart: null, calendarEventId: null });
    expect(await resolveLateApprenticeshipPayment("pref")).toBe("confirmed");
    expect(availability).not.toHaveBeenCalled();
  });

  it("skips orders that are not expired apprentice holds", async () => {
    seedHold("live");
    expect(await resolveLateApprenticeshipPayment("live")).toBe("skipped");
  });
});

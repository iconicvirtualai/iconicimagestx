import { describe, expect, it, vi } from "vitest";
import { driveCacheKey } from "../../shared/bookingAvailability";
import {
  calendarBlockFromEvent,
  createDriveTimeCache,
  readBookingAvailability,
  resolveDriveMinutes,
} from "./bookingAvailability";

const accountEnv = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
    client_email: "iconic-images-aicon@project.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  }),
};

describe("booking calendar availability", () => {
  it("drops cancelled, free, and working-location events and keeps the shoot address", () => {
    expect(calendarBlockFromEvent({
      status: "confirmed",
      location: "10 Oak St",
      start: { dateTime: "2026-10-14T14:00:00-05:00" },
      end: { dateTime: "2026-10-14T15:00:00-05:00" },
    })).toMatchObject({ location: "10 Oak St" });
    expect(calendarBlockFromEvent({ status: "cancelled", start: { dateTime: "a" }, end: { dateTime: "b" } })).toBeNull();
    expect(calendarBlockFromEvent({
      transparency: "transparent",
      start: { dateTime: "a" },
      end: { dateTime: "b" },
    })).toBeNull();
    expect(calendarBlockFromEvent({
      eventType: "workingLocation",
      start: { date: "2026-10-14" },
      end: { date: "2026-10-15" },
    })).toBeNull();
  });

  it("stays on the standard time list when no calendar can be read", async () => {
    const missing = await readBookingAvailability({ env: {}, selectedService: "listing-essentials" });
    expect(missing.live).toBe(false);
    expect(missing.slots).toEqual([]);
    expect(missing.durationMinutes).toBe(90);

    const unread = await readBookingAvailability({
      env: accountEnv,
      now: new Date("2026-10-13T12:00:00.000Z"),
      address: "200 Oak Ave, Houston, TX",
      preferenceId: "no-preference",
      selectedService: "listing-essentials",
      listEvents: async () => {
        throw new Error("not shared");
      },
    });
    expect(unread.live).toBe(false);
    expect(unread.slots).toEqual([]);
  });

  it("hides one unshared calendar and still offers the photographers that can be read", async () => {
    const result = await readBookingAvailability({
      env: accountEnv,
      now: new Date("2026-10-13T12:00:00.000Z"),
      address: "200 Oak Ave, Houston, TX",
      preferenceId: "no-preference",
      selectedBasics: ["apprentice-25"],
      listEvents: async (person) => {
        if (person.id === "steven-banda") throw new Error("404");
        if (person.id !== "mike-luna") return [];
        return [{
          start: "2026-10-13T09:00:00-05:00",
          end: "2026-10-13T09:20:00-05:00",
          location: "",
        }];
      },
    });
    expect(result.live).toBe(true);
    expect(result.durationMinutes).toBe(20);
    expect(result.driveMode).toBe("buffer");
    const nine = result.slots.find((slot) => slot.date === "2026-10-13" && slot.time === "9:00 AM");
    expect(nine?.photographerName).not.toBe("Mike Luna");
    expect(nine?.photographerName).toBe("Armando Martinez");
    expect(result.slots.some((slot) => slot.photographerId === "steven-banda")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("@");
  });

  it("offers Sunday only for Steven and keeps Saturday company starts before noon", async () => {
    const result = await readBookingAvailability({
      env: { ...accountEnv, BOOKING_TRAVEL_BUFFER_MINUTES: "0" },
      now: new Date("2026-10-13T12:00:00.000Z"),
      address: "200 Oak Ave, Houston, TX",
      preferenceId: "no-preference",
      selectedBasics: ["apprentice-50"],
      listEvents: async (person) => {
        if (person.id !== "steven-banda") return [];
        return [{
          start: "2026-10-18T14:00:00-05:00",
          end: "2026-10-18T15:00:00-05:00",
          location: "10 Oak St",
        }];
      },
    });
    expect(result.live).toBe(true);
    expect(result.bufferMinutes).toBe(0);
    expect(result.durationMinutes).toBe(60);
    const saturday = result.slots.filter((slot) => slot.date === "2026-10-17");
    expect(saturday.some((slot) => slot.time === "11:00 AM" && slot.photographerId !== "steven-banda")).toBe(true);
    expect(saturday.some((slot) => slot.time === "12:00 PM" && slot.photographerId !== "steven-banda")).toBe(false);
    expect(saturday.some((slot) => slot.time === "12:00 PM" && slot.photographerId === "steven-banda")).toBe(true);
    const sunday = result.slots.filter((slot) => slot.date === "2026-10-18");
    expect(sunday.length).toBeGreaterThan(0);
    expect(sunday.every((slot) => slot.photographerId === "steven-banda")).toBe(true);
    expect(sunday.some((slot) => slot.time === "2:00 PM")).toBe(false);
    expect(sunday.some((slot) => slot.time === "1:00 PM")).toBe(true);
    expect(sunday.some((slot) => slot.time === "3:00 PM")).toBe(true);
  });

  it("suggests times that the same availability check already allows", async () => {
    const result = await readBookingAvailability({
      env: { ...accountEnv, BOOKING_TRAVEL_BUFFER_MINUTES: "25" },
      now: new Date("2026-10-13T12:00:00.000Z"),
      address: "200 Oak Ave, Houston, TX",
      preferenceId: "mike-luna",
      durationMinutes: 60,
      listEvents: async (person) => {
        if (person.id !== "mike-luna") return [];
        return [{
          start: "2026-10-13T09:00:00-05:00",
          end: "2026-10-13T10:00:00-05:00",
          location: "200 Oak Ave, Houston, TX",
        }];
      },
    });
    expect(result.live).toBe(true);
    expect(result.suggestions.map((slot) => slot.time)).toEqual(["11:00 AM"]);
    expect(result.suggestions.every((slot) => result.slots.some((item) => item.start === slot.start))).toBe(true);
    expect(result.suggestions.some((slot) => slot.time === "10:00 AM" || slot.date === "2026-10-18")).toBe(false);
    expect(JSON.stringify(result.suggestions)).not.toContain("@");
  });

  it("asks Routes once per uncached pair and falls back when the key is missing", async () => {
    const departAtMs = Date.now() + 2 * 60 * 60 * 1000;
    const queries = [
      { from: "100 Main St, Houston, TX", to: "200 Oak Ave, Houston, TX", departAtMs },
      { from: "100 Main St, Houston, TX", to: "200 Oak Ave, Houston, TX", departAtMs },
    ];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([
      { originIndex: 0, destinationIndex: 0, duration: "1500s", condition: "ROUTE_EXISTS" },
    ]), { status: 200 }));
    const cache = createDriveTimeCache();
    const first = await resolveDriveMinutes({
      queries,
      apiKey: "test-key",
      cache,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const key = driveCacheKey(queries[0].from, queries[0].to, queries[0].departAtMs);
    expect(first.get(key)).toBe(25);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.routingPreference).toBe("TRAFFIC_AWARE");
    expect(body.travelMode).toBe("DRIVE");
    await resolveDriveMinutes({
      queries,
      apiKey: "test-key",
      cache,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const offline = await resolveDriveMinutes({
      queries,
      apiKey: "",
      cache: createDriveTimeCache(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(offline.get(key)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

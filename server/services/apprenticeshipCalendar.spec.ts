import { describe, expect, it } from "vitest";
import { APPRENTICESHIP_CALENDAR_ID } from "../../shared/apprenticeship";
import { availabilityFromFreeBusy, firebaseServiceAccount } from "./apprenticeshipCalendar";

describe("apprenticeship calendar access", () => {
  it("reads the Firebase service account and never the private key back out", () => {
    const account = firebaseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
        client_email: "firebase@project.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
      }),
    });
    expect(account?.client_email).toBe("firebase@project.iam.gserviceaccount.com");
    expect(account?.private_key).toContain("BEGIN PRIVATE KEY");
    expect(firebaseServiceAccount({ FIREBASE_SERVICE_ACCOUNT: "" })).toBeNull();
    expect(firebaseServiceAccount({})).toBeNull();
  });

  it("turns a freeBusy miss into an admin setup note and no public slots", async () => {
    const missed = await availabilityFromFreeBusy({
      now: new Date("2026-10-13T15:00:00.000Z"),
      packageId: "apprentice-25",
      accountEmail: "firebase@project.iam.gserviceaccount.com",
      query: async () => ({ busy: [], error: true }),
    });
    expect(missed.available).toBe(false);
    expect(missed.slots).toEqual([]);
    expect(missed.setupNote).toContain(APPRENTICESHIP_CALENDAR_ID);
    expect(missed.setupNote).toContain("firebase@project.iam.gserviceaccount.com");
    expect(missed.setupNote).toMatch(/domain-wide delegation/i);
    expect(JSON.stringify(missed).toLowerCase()).not.toContain("not configured");

    const open = await availabilityFromFreeBusy({
      now: new Date("2026-10-13T15:00:00.000Z"),
      packageId: "apprentice-50",
      accountEmail: "firebase@project.iam.gserviceaccount.com",
      query: async () => ({ busy: [], error: false }),
    });
    expect(open.available).toBe(true);
    expect(open.setupNote).toBeNull();
    expect(open.durationMinutes).toBe(60);
    expect(open.slots.length).toBeGreaterThan(0);
    expect(open.slots.find((slot) => slot.date === "2026-10-14")?.time).toBe("9:00 AM");
  });

  it("asks for the service account when FIREBASE_SERVICE_ACCOUNT is missing", async () => {
    const missing = await availabilityFromFreeBusy({
      now: new Date("2026-10-13T15:00:00.000Z"),
      packageId: "apprentice-25",
      accountEmail: null,
      query: async () => {
        throw new Error("should not query");
      },
    });
    expect(missing.available).toBe(false);
    expect(missing.missingCredentials).toBe(true);
    expect(missing.setupNote).toMatch(/FIREBASE_SERVICE_ACCOUNT/);
    expect(missing.setupNote).toMatch(/share/i);
  });
});

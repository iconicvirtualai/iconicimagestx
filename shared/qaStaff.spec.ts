import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DELIVERY_QA_CLIENT_EMAIL, DELIVERY_QA_CLIENT_ID } from "./deliveryQaClient.ts";
import {
  QA_STAFF_ASSIGN_ERROR,
  assigneeNamesForOps,
  filterAssignableStaff,
  isQaStaff,
  qaStaffAssignmentError,
  recordAllowsQaStaff,
} from "./qaStaff.ts";

const QA = {
  id: "qa-coord",
  name: "QA TEST Do Not Assign",
  firstName: "QA TEST",
  lastName: "Do Not Assign",
  email: "qa-test@iconicimagestx.com",
  role: "coordinator",
  qaOnly: true,
};

const PLAYTEST_PHOTO = {
  id: "play-photo",
  name: "Playtest Photo",
  role: "photographer",
  playtest: true,
};

const ARMANDO = {
  id: "armando",
  name: "Armando",
  role: "photographer",
};

const ROSTER = [QA, PLAYTEST_PHOTO, ARMANDO];

const PICKER_FILES = [
  "client/pages/AdminListings.tsx",
  "client/pages/AdminOrderDetail.tsx",
  "client/pages/AdminOrderRequest.tsx",
  "client/pages/AdminOrders.tsx",
  "client/pages/AdminSchedule.tsx",
  "client/hooks/useOperationsMetrics.ts",
];

describe("isQaStaff", () => {
  it("is true only when qaOnly or playtest is exactly true", () => {
    expect(isQaStaff(QA)).toBe(true);
    expect(isQaStaff(PLAYTEST_PHOTO)).toBe(true);
    expect(isQaStaff({ qaOnly: true, playtest: true, name: "QA TEST Do Not Assign" })).toBe(true);
    expect(isQaStaff(ARMANDO)).toBe(false);
    expect(isQaStaff({ qaOnly: "true", playtest: 1 })).toBe(false);
    expect(isQaStaff(null)).toBe(false);
    expect(isQaStaff(undefined)).toBe(false);
  });
});

describe("filterAssignableStaff", () => {
  it("excludes QA staff from a real order picker and includes them for a playtest order", () => {
    expect(filterAssignableStaff(ROSTER, { forPlaytest: false }).map((person) => person.id)).toEqual(["armando"]);
    expect(filterAssignableStaff(ROSTER).map((person) => person.id)).toEqual(["armando"]);
    expect(filterAssignableStaff(ROSTER, { forPlaytest: true }).map((person) => person.id)).toEqual([
      "qa-coord",
      "play-photo",
      "armando",
    ]);
  });

  it("treats a missing list as empty", () => {
    expect(filterAssignableStaff(null, { forPlaytest: true })).toEqual([]);
    expect(filterAssignableStaff(undefined)).toEqual([]);
  });
});

describe("playtest assignment", () => {
  it("allows QA staff on playtest records and the delivery QA client, and rejects them on a real order", () => {
    expect(recordAllowsQaStaff({ id: "order-1", playtest: true })).toBe(true);
    expect(recordAllowsQaStaff({ id: "playtest-job-1" })).toBe(true);
    expect(recordAllowsQaStaff({
      id: "order-qa",
      clientId: DELIVERY_QA_CLIENT_ID,
      clientEmail: DELIVERY_QA_CLIENT_EMAIL,
    })).toBe(true);
    expect(recordAllowsQaStaff({ id: "order-1", clientEmail: "ada@example.com" })).toBe(false);

    expect(qaStaffAssignmentError([QA], { id: "order-1" })).toBe(QA_STAFF_ASSIGN_ERROR);
    expect(qaStaffAssignmentError([PLAYTEST_PHOTO], { id: "listing-1" })).toBe(QA_STAFF_ASSIGN_ERROR);
    expect(qaStaffAssignmentError([ARMANDO], { id: "order-1" })).toBeNull();
    expect(qaStaffAssignmentError([QA], { id: "order-1", playtest: true })).toBeNull();
    expect(qaStaffAssignmentError([QA], { id: "playtest-listing" })).toBeNull();
    expect(qaStaffAssignmentError([], { id: "order-1" })).toBeNull();
  });
});

describe("ops metrics", () => {
  it("excludes QA staff from shooter counts and team leaderboards", () => {
    const names = assigneeNamesForOps(
      ["QA TEST Do Not Assign", "Armando", "Playtest Photo", "qa-test@iconicimagestx.com"],
      ROSTER,
    );
    const shooters: Record<string, number> = {};
    names.forEach((name) => {
      shooters[name] = (shooters[name] || 0) + 1;
    });

    expect(names).toEqual(["Armando"]);
    expect(shooters).toEqual({ Armando: 1 });
    expect(Object.keys(shooters)).not.toContain("QA TEST Do Not Assign");
    expect(Object.keys(shooters)).not.toContain("Playtest Photo");

    const revenue = 400;
    const team: Record<string, { rev: number; vol: number }> = {};
    names.forEach((name) => {
      team[name] = { rev: revenue, vol: 1 };
    });
    expect(team).toEqual({ Armando: { rev: 400, vol: 1 } });
  });
});

describe("picker wiring", () => {
  it("filters every staff picker and the ops metrics hook through the shared predicate", () => {
    for (const file of PICKER_FILES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, file).toContain("filterAssignableStaff");
    }
    const team = readFileSync(new URL("../client/pages/AdminTeam.tsx", import.meta.url), "utf8");
    expect(team).toContain("QA / test accounts");
    expect(team).toContain("isQaStaff");
    const scheduleWrite = readFileSync(new URL("../client/lib/scheduleRecords.ts", import.meta.url), "utf8");
    const guardAt = scheduleWrite.indexOf("qaStaffAssignmentError");
    const writeAt = scheduleWrite.indexOf("writeBatch(db)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(guardAt);
  });
});

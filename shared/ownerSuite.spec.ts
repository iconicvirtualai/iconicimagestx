import { describe, expect, it } from "vitest";
import { ownerSuiteFixtureGrids } from "../server/services/ownerSuiteFixtures";
import { parseMoney, parseOwnerSuite, toneOf } from "./ownerSuite";

describe("owner scorecard parser", () => {
  it("reads the preview scorecard by header name", () => {
    const data = parseOwnerSuite(ownerSuiteFixtureGrids(), new Date("2026-10-10T18:00:00Z"));
    expect(data.cashWeek).toEqual({ amount: 4280, goal: 5000 });
    expect(data.cashMonth).toEqual({ amount: 18640, goal: 22000 });
    expect(data.savings.amount).toBe(12400);
    expect(data.savings.goal).toBe(15000);
    expect(data.savings.note).toBe("Reserve");
    expect(data.moneyIn.map((row) => row.method)).toEqual(["Card", "Zelle", "Check", "Invoice"]);
    expect(data.receivables[0]).toMatchObject({ name: "Northwind Realty", amount: 1800 });
    expect(data.owes.map((row) => row.name)).toEqual(["Lab prints", "Software"]);
    expect(data.businesses).toHaveLength(6);
    expect(data.businesses.map((row) => row.tone)).toEqual(["green", "green", "yellow", "green", "red", "yellow"]);
    expect(data.today.map((item) => item.title)).toContain("Edit the lake house");
    expect(data.calendar).toHaveLength(3);
    expect(data.decisions.map((item) => item.title)).not.toContain("Archive last spring's prices");
    expect(data.decisions).toHaveLength(3);
    expect(data.tracker).toMatchObject({ goal: 100000, current: 63400 });
    expect(data.horizons.map((row) => row.horizon)).toEqual(["30", "60", "90"]);
    expect(data.bots.state).toBe("ready");
    expect(data.bots.entries.find((entry) => entry.bot === "Booking bot")).toMatchObject({
      loop: "Follow-up",
      actionsDone: 14,
      salesClosed: 3,
      accuracy: 98,
    });
  });

  it("hides the bot feed when the Action Log tab is missing", () => {
    const data = parseOwnerSuite(ownerSuiteFixtureGrids({ actionLog: false }));
    expect(data.bots).toEqual({ state: "missing", entries: [] });
    expect(data.cashWeek.amount).toBe(4280);
  });

  it("follows renamed headers and ignores an empty sheet without throwing", () => {
    const renamed = parseOwnerSuite([
      {
        title: "Friday Scorecard",
        rows: [
          ["Collected this week", "10", "Weekly goal", "40"],
          ["Collected this month", "$1,000.50", "Monthly goal", "$2,000"],
          ["Source", "Total"],
          ["Wire", "25"],
        ],
      },
    ]);
    expect(renamed.cashWeek).toEqual({ amount: 10, goal: 40 });
    expect(renamed.cashMonth.amount).toBe(1000.5);
    expect(renamed.moneyIn).toEqual([{ method: "Wire", amount: 25 }]);

    expect(() => parseOwnerSuite([{ title: "Friday Scorecard", rows: [["???"], []] }])).not.toThrow();
    const empty = parseOwnerSuite([{ title: "Nope", rows: [] }]);
    expect(empty.cashWeek.amount).toBeNull();
    expect(empty.businesses).toEqual([]);
    expect(empty.bots.state).toBe("missing");
  });

  it("reads an action log that is present but blank as no data", () => {
    const data = parseOwnerSuite([{ title: "Action Log", rows: [["Bot", "Loop", "Actions"]] }]);
    expect(data.bots.state).toBe("empty");
  });
});

describe("scorecard helpers", () => {
  it("parses money and status words", () => {
    expect(parseMoney("$1,200")).toBe(1200);
    expect(parseMoney("($20)")).toBe(-20);
    expect(parseMoney("n/a")).toBeNull();
    expect(toneOf("Behind")).toBe("red");
    expect(toneOf("")).toBe("unknown");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerCommandCenterStructureGrids, ownerSuiteFixtureGrids } from "../server/services/ownerSuiteFixtures";
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

  it("returns an empty action log when the tab is missing", () => {
    const data = parseOwnerSuite(ownerSuiteFixtureGrids({ actionLog: false }));
    expect(data.bots).toEqual({ state: "empty", entries: [] });
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
    expect(empty.bots.state).toBe("empty");
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
    expect(parseMoney("~1,234+")).toBe(1234);
    expect(parseMoney("12+")).toBe(12);
    expect(parseMoney("~0+")).toBe(0);
    expect(parseMoney("0 / 0")).toBeNull();
    expect(parseMoney("Active")).toBeNull();
    expect(toneOf("Behind")).toBe("red");
    expect(toneOf("")).toBe("unknown");
    expect(toneOf("YELLOW")).toBe("yellow");
    expect(toneOf("Amber")).toBe("yellow");
    expect(toneOf("A")).toBe("yellow");
    expect(toneOf("y")).toBe("yellow");
    expect(toneOf("R")).toBe("red");
    expect(toneOf("G")).toBe("green");
    expect(toneOf("green")).toBe("green");
  });
});

describe("live command center structure", () => {
  it("reads placeholder tabs without treating section headers as metrics", () => {
    const grids = ownerCommandCenterStructureGrids();
    expect(grids.map((sheet) => sheet.title)).not.toContain("Action Log");
    expect(JSON.stringify(grids)).not.toMatch(/\b5818\b|\b4280\b|\b9040\b/);

    const data = parseOwnerSuite(grids, new Date("2026-10-10T18:00:00Z"));
    expect(data.cashWeek.amount).toBe(0);
    expect(data.savings.amount).toBe(0);
    expect(data.scorecard.metrics.map((metric) => metric.label)).toEqual([
      "Cash collected this week",
      "Toward $100k identified moves",
      "Payroll reserve",
      "Steven paid (Cash App)",
      "Payroll HOLD unpaid",
      "AR > 7 days (client)",
      "Past-due count",
      "New bookings",
      "DOT paid claims / upgrades",
      "Job apps / interviews",
      "Kids items done",
      "Square Loan remaining",
    ]);
    expect(data.scorecard.metrics.map((metric) => metric.label)).not.toContain("METRIC");
    expect(data.scorecard.metrics.some((metric) => /next week target|week cash detail|^business$/i.test(metric.label))).toBe(false);
    expect(data.scorecard.metrics.find((metric) => metric.label === "Payroll HOLD unpaid")).toMatchObject({ amount: 0, text: "~0+" });
    expect(data.scorecard.metrics.find((metric) => metric.label === "Past-due count")).toMatchObject({ amount: 0, text: "0+" });
    expect(data.scorecard.metrics.find((metric) => metric.label === "New bookings")).toMatchObject({ amount: null, text: "Active" });
    expect(data.scorecard.metrics.find((metric) => metric.label === "DOT paid claims / upgrades")).toMatchObject({ amount: null, text: "0 / 0" });
    expect(data.scorecard.metrics.find((metric) => metric.label === "AR > 7 days (client)")).toMatchObject({ amount: null, text: "Placeholder client" });
    expect(data.scorecard.rag.map((row) => row.tone)).toEqual(["red", "yellow", "green", "yellow", "yellow", "green"]);
    expect(data.scorecard.nextWeek).toEqual([{ text: "Placeholder target", owner: "Placeholder owner" }]);
    expect(data.scorecard.payments).toEqual([{ payment: "P-0", date: "2026-10-12" }]);

    expect(data.businesses.map((row) => [row.name, row.tone, row.label])).toEqual([
      ["Iconic Images", "yellow", "Yellow"],
      ["Iconic Studios", "yellow", "Yellow"],
      ["KDP", "red", "Red"],
      ["Iconic Virtual.ai", "green", "Green"],
      ["Doors Open Tour", "yellow", "Yellow"],
      ["aICON", "green", "Green"],
    ]);
    expect(data.businesses[0]).toMatchObject({
      note: "Placeholder standing",
      milestone: "Placeholder milestone",
      milestoneDue: "2026-11-08",
      nextDate: "2026-10-16",
      target: "Placeholder target",
      targetAmount: 0,
      owners: "Placeholder owner",
      profitCheck: "Placeholder",
    });

    const horizon = (key: string) => data.horizons.find((row) => row.horizon === key)?.items.join(" | ") || "";
    expect(horizon("30")).toContain("Placeholder early item");
    expect(horizon("30")).toMatch(/DAY\s*30/i);
    expect(horizon("30")).toContain("Placeholder hard milestone");
    expect(horizon("60")).toMatch(/DAY\s*60/i);
    expect(horizon("90")).toMatch(/DAY\s*90/i);
    expect(horizon("later")).toContain("Placeholder undated");
    expect(horizon("later")).toContain("Placeholder later");
    expect(horizon("later")).toContain("Placeholder when stable");

    expect(data.planBoard.columns.find((column) => column.business === "KDP")?.todos[0]).toMatchObject({
      item: "Data tab placeholder",
      date: "2026-10-12",
      amount: 0,
      status: null,
      notes: "Placeholder note",
    });
    expect(JSON.stringify(data.planBoard)).not.toContain("Visual only placeholder");
    expect(data.bots).toEqual({ state: "empty", entries: [] });
  });

  it("matches scorecard labels loosely and keeps non-numeric text", () => {
    const data = parseOwnerSuite([
      {
        title: "Friday Scorecard",
        rows: [
          ["FRIDAY SCORECARD · Week ending placeholder"],
          [],
          ["  metric  ", " Value "],
          ["  cash   COLLECTED   this   week  ", "$0"],
          ["payroll   HOLD unpaid", " ~1,234+ "],
          ["NEW   bookings", "  Active  "],
        ],
      },
    ]);
    expect(data.cashWeek.amount).toBe(0);
    expect(data.scorecard.metrics.map((metric) => metric.label)).toEqual([
      "cash   COLLECTED   this   week",
      "payroll   HOLD unpaid",
      "NEW   bookings",
    ]);
    expect(data.scorecard.metrics[1]).toMatchObject({ amount: 1234, text: "~1,234+" });
    expect(data.scorecard.metrics[2]).toMatchObject({ amount: null, text: "Active" });
    expect(data.scorecard.metrics.some((metric) => metric.label.trim().toLowerCase() === "metric")).toBe(false);
  });

  it("buckets dated milestones from the day 30 60 90 note when the text has no DAY mark", () => {
    const data = parseOwnerSuite([
      {
        title: "30-60-90",
        rows: [
          ["30-60-90 · Oct 9, 2026 → Jan 7, 2027"],
          ["Day 30 = Nov 8 · Day 60 = Dec 8 · Day 90 = Jan 7, 2027"],
          ["Date", "Milestone"],
          ["Mon Oct 12", "Placeholder window thirty"],
          ["Fri Nov 20", "Placeholder window sixty"],
          ["Wed Dec 16", "Placeholder window ninety"],
          ["Fri Feb 5, 2027", "Placeholder window later"],
          ["Fri Oct 16", "DAY 90: Placeholder mark wins"],
        ],
      },
    ]);
    const items = (key: string) => data.horizons.find((row) => row.horizon === key)?.items.join(" | ") || "";
    expect(items("30")).toContain("Placeholder window thirty");
    expect(items("60")).toContain("Placeholder window sixty");
    expect(items("90")).toContain("Placeholder window ninety");
    expect(items("90")).toContain("DAY 90: Placeholder mark wins");
    expect(items("later")).toContain("Placeholder window later");
    expect(items("30")).not.toContain("DAY 90");
  });

  it("reads day section rows when the sheet is not a date list", () => {
    const data = parseOwnerSuite([
      {
        title: "30-60-90",
        rows: [
          ["Day 30"],
          ["Placeholder day thirty"],
          ["Day 60"],
          ["Placeholder day sixty"],
          ["Day 90"],
          ["Placeholder day ninety"],
        ],
      },
    ]);
    expect(data.horizons.map((row) => [row.horizon, row.items])).toEqual([
      ["30", ["Placeholder day thirty"]],
      ["60", ["Placeholder day sixty"]],
      ["90", ["Placeholder day ninety"]],
    ]);
  });

  it("asks the suite to show a quiet empty action log", () => {
    const page = readFileSync(new URL("../client/pages/OwnersSuite.tsx", import.meta.url), "utf8");
    expect(page).toContain("No action log yet");
    expect(page).not.toContain("Coming soon");
    expect(page).not.toContain("font-serif");
    expect(page).not.toContain("Cormorant");
  });
});

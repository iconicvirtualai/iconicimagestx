import { describe, expect, it } from "vitest";
import { ownerSuiteFixtureGrids } from "../server/services/ownerSuiteFixtures";
import { PLAN_BUSINESSES } from "./planBusinesses";
import { parsePlanBoard } from "./ownerPlan";
import { parseOwnerSuite } from "./ownerSuite";

describe("plan board parser", () => {
  it("groups the preview sheet into the six businesses", () => {
    const board = parseOwnerSuite(ownerSuiteFixtureGrids(), new Date("2026-10-10T18:00:00Z")).planBoard;
    expect(board.columns.map((column) => column.business)).toEqual([...PLAN_BUSINESSES]);

    const images = board.columns[0];
    expect(images.revenue).toBe(9040);
    expect(images.expenses).toBe(1550);
    expect(images.calendar.map((line) => line.item)).toEqual(["Gallery night", "Broker breakfast"]);
    expect(images.social.map((line) => line.date)).toEqual(["2026-10-11", "2026-10-18"]);
    expect(images.events.map((line) => line.item)).toEqual(["Referral card", "Fall mini sessions"]);
    expect(images.email.map((line) => line.item)).toEqual(["Past client note", "Newsletter"]);
    expect(images.todos.map((line) => [line.item, line.done])).toEqual([
      ["File the lens receipt", true],
      ["Confirm weekend crew", false],
    ]);
    expect(images.calendar[0].notes).toBe("Studio");
    expect(JSON.stringify(images)).not.toContain("ignore-me");
    expect(JSON.stringify(images)).not.toContain("Should not appear");
    expect(JSON.stringify(images)).not.toContain("Ignore this lane");

    expect(board.columns[1]).toMatchObject({ business: "Iconic Studios", revenue: 3200, expenses: 800 });
    expect(board.columns[2].social.map((line) => line.item)).toEqual(["Feature the board"]);
    expect(board.columns[2].todos[0]).toMatchObject({ item: "Review the owner gate", done: true });
    expect(board.columns[4]).toMatchObject({
      business: "DOT",
      revenue: null,
      expenses: null,
      calendar: [],
      social: [],
      events: [],
      email: [],
      todos: [],
    });
    expect(board.columns[5].revenue).toBe(720);
  });

  it("keeps the scorecard numbers when the plan tab is present", () => {
    const data = parseOwnerSuite(ownerSuiteFixtureGrids(), new Date("2026-10-10T18:00:00Z"));
    expect(data.cashWeek).toEqual({ amount: 4280, goal: 5000 });
    expect(data.businesses).toHaveLength(6);
    expect(data.planBoard.columns[0].revenue).toBe(9040);
  });

  it("returns an empty board when the tab or a business is missing", () => {
    const missing = parseOwnerSuite(ownerSuiteFixtureGrids({ planBoard: false }));
    expect(missing.cashWeek.amount).toBe(4280);
    expect(missing.planBoard.columns).toHaveLength(6);
    expect(missing.planBoard.columns.every((column) => column.revenue == null && column.todos.length === 0)).toBe(true);

    expect(() => parsePlanBoard([{ title: "Plan Board", rows: [["???"], [], ["nope"]] }])).not.toThrow();
    const blank = parsePlanBoard([{ title: "Plan Board", rows: null }]);
    expect(blank.columns.map((column) => column.business)).toEqual([...PLAN_BUSINESSES]);
    expect(blank.columns.every((column) => column.calendar.length === 0)).toBe(true);
    expect(parsePlanBoard(undefined).columns).toHaveLength(6);
  });

  it("matches headers and section values without caring about case", () => {
    const board = parsePlanBoard([
      {
        title: "plan board",
        rows: [
          ["BUSINESS", "Section", "ITEM", "DATE", "AMOUNT", "STATUS", "NOTES", "Extra"],
          ["dot", "to do", "Call the printer", "2026-10-30", "", "DONE", "Afternoon", "hidden"],
          ["DOT", "expense", "Ink", "", "25", "", "", "nope"],
          ["DOT", "To-Do", "Mail the proof", "2026-10-12", "", "open", "", ""],
          ["DOT", "Expenses", "Paper", "", "$10.50", "", "", ""],
          ["DOT", "Calendar", "Press check", "Friday", "", "Done", "", ""],
          ["  ", "Revenue", "Blank business", "", "80", "", "", ""],
        ],
      },
    ]);
    const dot = board.columns.find((column) => column.business === "DOT");
    expect(dot?.expenses).toBe(35.5);
    expect(dot?.revenue).toBeNull();
    expect(dot?.todos.map((line) => [line.item, line.done, line.date])).toEqual([
      ["Mail the proof", false, "2026-10-12"],
      ["Call the printer", true, "2026-10-30"],
    ]);
    expect(dot?.todos[1].notes).toBe("Afternoon");
    expect(dot?.calendar[0]).toMatchObject({ item: "Press check", date: null, done: false });
    expect(JSON.stringify(dot)).not.toContain("hidden");
    expect(JSON.stringify(board)).not.toContain("Blank business");
  });

  it("prefers Plan Board Data and falls back to Plan Board when that tab is missing", () => {
    const preferred = parsePlanBoard([
      {
        title: "Plan Board",
        rows: [
          ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes"],
          ["Iconic Studios", "To-do", "Visual only placeholder", "2026-10-12", "0", "", ""],
        ],
      },
      {
        title: "Plan Board Data",
        rows: [
          ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes"],
          ["KDP", "To-do", "Data tab placeholder", "2026-10-12", "0", "", "Placeholder note"],
        ],
      },
    ]);
    const kdp = preferred.columns.find((column) => column.business === "KDP");
    expect(kdp?.todos[0]).toMatchObject({ item: "Data tab placeholder", date: "2026-10-12", amount: 0, status: null, notes: "Placeholder note" });
    expect(JSON.stringify(preferred)).not.toContain("Visual only placeholder");

    const fallback = parsePlanBoard([
      {
        title: "Plan Board",
        rows: [
          ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes"],
          ["Iconic Studios", "To-do", "Visual only placeholder", "2026-10-12", "0", "", ""],
        ],
      },
    ]);
    expect(fallback.columns.find((column) => column.business === "Iconic Studios")?.todos[0].item).toBe("Visual only placeholder");
  });
});

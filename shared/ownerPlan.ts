/**
 * Plan Board parser. The sheet is a long list:
 * Business | Section | Item | Date | Amount | Status | Notes
 * Extra columns are ignored. A missing tab or an unknown business
 * becomes empty sections instead of an error.
 */

import { PLAN_BUSINESSES, type PlanBusiness } from "./planBusinesses";
import { normalizeTabTitle, parseMoney, type SheetGrid } from "./ownerSuite";

export { PLAN_BUSINESSES };
export type { PlanBusiness };

export interface PlanLine {
  item: string;
  date: string | null;
  amount: number | null;
  status: string | null;
  notes: string | null;
  done: boolean;
}

export interface PlanColumn {
  business: PlanBusiness;
  revenue: number | null;
  expenses: number | null;
  calendar: PlanLine[];
  social: PlanLine[];
  events: PlanLine[];
  email: PlanLine[];
  todos: PlanLine[];
}

export interface PlanBoard {
  columns: PlanColumn[];
}

const HEADER_KEYS = ["business", "section", "item", "date", "amount", "status", "notes"] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

const BUSINESS_ALIASES: Record<string, PlanBusiness> = {
  "iconic images m m": "Iconic Images M&M",
  "iconic images mm": "Iconic Images M&M",
  "iconic images m and m": "Iconic Images M&M",
  "iconic studios": "Iconic Studios",
  "iconic studio": "Iconic Studios",
  aicon: "aICON",
  "a icon": "aICON",
  "iconic virtual": "Iconic Virtual",
  dot: "DOT",
  kdp: "KDP",
};

type ListKey = "calendar" | "social" | "events" | "email" | "todos";

interface DraftLine extends PlanLine {
  index: number;
}

export function emptyPlanBoard(): PlanBoard {
  return {
    columns: PLAN_BUSINESSES.map((business) => ({
      business,
      revenue: null,
      expenses: null,
      calendar: [],
      social: [],
      events: [],
      email: [],
      todos: [],
    })),
  };
}

export function parsePlanBoard(sheets: unknown): PlanBoard {
  const board = emptyPlanBoard();
  try {
    const sheet = findPlanSheet(sheets);
    if (!sheet) return board;
    const rows = cleanRows(sheet.rows);
    const headerAt = rows.findIndex((row) => headerMap(row) != null);
    if (headerAt < 0) return board;
    const headers = headerMap(rows[headerAt]);
    if (!headers) return board;

    const lists = new Map<PlanBusiness, Record<ListKey, DraftLine[]>>();
    for (const business of PLAN_BUSINESSES) {
      lists.set(business, { calendar: [], social: [], events: [], email: [], todos: [] });
    }
    const money = new Map<PlanBusiness, { revenue: number | null; expenses: number | null; sawRevenue: boolean; sawExpense: boolean }>();
    for (const business of PLAN_BUSINESSES) {
      money.set(business, { revenue: null, expenses: null, sawRevenue: false, sawExpense: false });
    }

    rows.slice(headerAt + 1).forEach((row, index) => {
      const business = businessOf(cellAt(row, headers.business));
      const kind = sectionOf(cellAt(row, headers.section));
      if (!business || !kind) return;
      const purse = money.get(business);
      const buckets = lists.get(business);
      if (!purse || !buckets) return;
      if (kind === "revenue" || kind === "expense") {
        const amount = parseMoney(cellAt(row, headers.amount));
        if (kind === "revenue") {
          purse.sawRevenue = true;
          if (amount != null) purse.revenue = roundMoney((purse.revenue ?? 0) + amount);
        } else {
          purse.sawExpense = true;
          if (amount != null) purse.expenses = roundMoney((purse.expenses ?? 0) + amount);
        }
        return;
      }
      const item = cellAt(row, headers.item);
      if (!item) return;
      const status = cellAt(row, headers.status);
      buckets[kind].push({
        item,
        date: dateKey(cellAt(row, headers.date)),
        amount: parseMoney(cellAt(row, headers.amount)),
        status: status || null,
        notes: cellAt(row, headers.notes) || null,
        done: kind === "todos" && isDone(status),
        index,
      });
    });

    for (const column of board.columns) {
      const purse = money.get(column.business);
      const buckets = lists.get(column.business);
      if (!purse || !buckets) continue;
      column.revenue = purse.sawRevenue ? purse.revenue ?? 0 : null;
      column.expenses = purse.sawExpense ? purse.expenses ?? 0 : null;
      column.calendar = sortLines(buckets.calendar);
      column.social = sortLines(buckets.social);
      column.events = sortLines(buckets.events);
      column.email = sortLines(buckets.email);
      column.todos = sortLines(buckets.todos);
    }
    return board;
  } catch {
    return emptyPlanBoard();
  }
}

function findPlanSheet(sheets: unknown): SheetGrid | undefined {
  if (!Array.isArray(sheets)) return undefined;
  return sheets.find((sheet) => {
    if (!sheet || typeof sheet !== "object") return false;
    const title = normalizeTabTitle(String((sheet as SheetGrid).title || ""));
    return title === "plan board" || title.includes("plan board");
  }) as SheetGrid | undefined;
}

function cleanRows(rows: unknown): string[][] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => (Array.isArray(row) ? row.map((item) => (item == null ? "" : String(item).trim())) : []));
}

function headerMap(row: string[]): Partial<Record<HeaderKey, number>> | null {
  const map: Partial<Record<HeaderKey, number>> = {};
  row.forEach((value, index) => {
    const key = value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if ((HEADER_KEYS as readonly string[]).includes(key) && map[key as HeaderKey] == null) {
      map[key as HeaderKey] = index;
    }
  });
  if (map.business == null || map.section == null) return null;
  return map;
}

function cellAt(row: string[], index: number | undefined): string {
  if (index == null) return "";
  return row[index] || "";
}

function businessOf(value: string): PlanBusiness | null {
  const key = value.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return BUSINESS_ALIASES[key] || null;
}

function sectionOf(value: string): "revenue" | "expense" | ListKey | null {
  const key = value.toLowerCase().replace(/[^a-z]+/g, "");
  if (key === "revenue") return "revenue";
  if (key === "expense" || key === "expenses") return "expense";
  if (key === "calendar") return "calendar";
  if (key === "social" || key === "socials") return "social";
  if (key === "event" || key === "events" || key === "promo" || key === "promos" || key === "promotion" || key === "promotions") return "events";
  if (key === "email" || key === "emails") return "email";
  if (key === "todo" || key === "todos") return "todos";
  return null;
}

function isDone(status: string): boolean {
  const key = status.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return key === "done" || key === "complete" || key === "completed";
}

function dateKey(value: string): string | null {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  const month = slash[1].padStart(2, "0");
  const day = slash[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortLines(lines: DraftLine[]): PlanLine[] {
  return [...lines]
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return a.index - b.index;
    })
    .map(({ index: _index, ...line }) => line);
}

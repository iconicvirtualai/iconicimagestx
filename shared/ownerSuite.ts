/**
 * Defensive parser for the owner scorecard.
 * Tabs are matched by name and cells by header / label text, so a rearranged
 * sheet degrades to "no data" instead of throwing.
 */

import { emptyPlanBoard, parsePlanBoard, type PlanBoard } from "./ownerPlan";

export interface SheetGrid {
  title: string;
  rows: string[][];
}

export interface CashProgress {
  amount: number | null;
  goal: number | null;
}

export interface MoneyInRow {
  method: string;
  amount: number | null;
}

export interface PartyAmount {
  name: string;
  amount: number | null;
  detail: string | null;
}

export type BusinessTone = "green" | "yellow" | "red" | "unknown";

export interface BusinessStatus {
  name: string;
  tone: BusinessTone;
  label: string;
  note: string | null;
  milestone: string | null;
  milestoneDue: string | null;
  nextDate: string | null;
  target: string | null;
  targetAmount: number | null;
  owners: string | null;
  profitCheck: string | null;
}

export interface PlanItem {
  when: string | null;
  title: string;
  detail: string | null;
  dateKey: string | null;
  weekday: string | null;
}

export interface DecisionItem {
  title: string;
  detail: string | null;
  by: string | null;
}

export interface TrackerSnapshot {
  goal: number | null;
  current: number | null;
  rows: Array<{ label: string; amount: number | null }>;
}

export interface HorizonPlan {
  horizon: "30" | "60" | "90" | "later";
  items: string[];
}

export interface ScorecardMetric {
  label: string;
  amount: number | null;
  text: string | null;
}

export interface ScorecardRag {
  name: string;
  tone: BusinessTone;
}

export interface ScorecardTarget {
  text: string;
  owner: string | null;
}

export interface ScorecardPayment {
  payment: string;
  date: string | null;
}

export interface FridayScorecard {
  metrics: ScorecardMetric[];
  rag: ScorecardRag[];
  nextWeek: ScorecardTarget[];
  payments: ScorecardPayment[];
}

export interface BotStat {
  bot: string;
  loop: string;
  actionsDone: number | null;
  salesClosed: number | null;
  accuracy: number | null;
}

export type BotFeedState = "missing" | "empty" | "ready" | "unknown";

export interface OwnerSuiteData {
  generatedAt: string;
  cashWeek: CashProgress;
  cashMonth: CashProgress;
  savings: CashProgress & { note: string | null };
  moneyIn: MoneyInRow[];
  receivables: PartyAmount[];
  owes: PartyAmount[];
  businesses: BusinessStatus[];
  today: PlanItem[];
  calendar: PlanItem[];
  decisions: DecisionItem[];
  tracker: TrackerSnapshot;
  horizons: HorizonPlan[];
  scorecard: FridayScorecard;
  bots: {
    state: BotFeedState;
    entries: BotStat[];
  };
  planBoard: PlanBoard;
}

const WEEK_AMOUNT = ["cash collected this week", "cash this week", "this week cash", "collected this week", "week collected", "revenue this week"];
const WEEK_GOAL = ["week goal", "this week goal", "weekly goal", "goal this week"];
const MONTH_AMOUNT = ["cash this month", "this month cash", "collected this month", "month collected", "revenue this month", "mtd cash", "month to date"];
const MONTH_GOAL = ["month goal", "this month goal", "monthly goal", "goal this month"];
const SAVINGS_AMOUNT = ["payroll reserve", "savings", "savings balance", "saved", "reserve balance"];
const SAVINGS_GOAL = ["savings goal", "reserve goal", "savings target"];
const MONEY_SECTIONS = ["money in", "money in by payment", "payments", "by payment", "payment method"];
const AR_SECTIONS = ["accounts receivable", "receivables", "money owed to us", "outstanding invoices", "ar"];
const OWE_SECTIONS = ["owes", "we owe", "accounts payable", "bills"];
const CLOSED_DECISIONS = new Set(["done", "closed", "decided", "yes", "no", "approved", "declined", "complete", "completed", "settled"]);

export function normalizeTabTitle(title: string): string {
  return title.toLowerCase().replace(/\$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function emptyOwnerSuiteData(now = new Date()): OwnerSuiteData {
  return {
    generatedAt: now.toISOString(),
    cashWeek: { amount: null, goal: null },
    cashMonth: { amount: null, goal: null },
    savings: { amount: null, goal: null, note: null },
    moneyIn: [],
    receivables: [],
    owes: [],
    businesses: [],
    today: [],
    calendar: [],
    decisions: [],
    tracker: { goal: null, current: null, rows: [] },
    horizons: [],
    scorecard: emptyScorecard(),
    bots: { state: "unknown", entries: [] },
    planBoard: emptyPlanBoard(),
  };
}

function emptyScorecard(): FridayScorecard {
  return { metrics: [], rag: [], nextWeek: [], payments: [] };
}

export function parseOwnerSuite(sheets: SheetGrid[], now = new Date()): OwnerSuiteData {
  const data = emptyOwnerSuiteData(now);
  const safeSheets = Array.isArray(sheets) ? sheets : [];
  data.cashWeek = {
    amount: labeledNumber(safeSheets, WEEK_AMOUNT, WEEK_GOAL),
    goal: labeledNumber(safeSheets, WEEK_GOAL),
  };
  data.cashMonth = {
    amount: labeledNumber(safeSheets, MONTH_AMOUNT, MONTH_GOAL),
    goal: labeledNumber(safeSheets, MONTH_GOAL),
  };
  data.savings = {
    amount: labeledNumber(safeSheets, SAVINGS_AMOUNT, SAVINGS_GOAL),
    goal: labeledNumber(safeSheets, SAVINGS_GOAL),
    note: labeledNote(findSheet(safeSheets, ["friday scorecard", "scorecard"])?.rows || [], SAVINGS_AMOUNT, SAVINGS_GOAL),
  };
  data.moneyIn = moneyIn(safeSheets);
  data.receivables = parties(safeSheets, AR_SECTIONS, ["receivable", "ar", "outstanding"]);
  data.owes = owes(safeSheets);
  data.scorecard = fridayScorecard(findSheet(safeSheets, ["friday scorecard", "scorecard"]));
  if (data.cashWeek.amount == null) {
    const week = data.scorecard.metrics.find((metric) => matchesAlias(metric.label, WEEK_AMOUNT, WEEK_GOAL));
    if (week?.amount != null) data.cashWeek.amount = week.amount;
  }
  if (data.savings.amount == null) {
    const reserve = data.scorecard.metrics.find((metric) => matchesAlias(metric.label, SAVINGS_AMOUNT, SAVINGS_GOAL));
    if (reserve?.amount != null) data.savings.amount = reserve.amount;
  }
  data.businesses = businesses(findSheet(safeSheets, ["businesses", "business"]));
  if (!data.businesses.length) {
    data.businesses = data.scorecard.rag.map((row) => business(row.name, row.tone, null));
  }
  const plan = weekPlan(findSheet(safeSheets, ["this week"]), now);
  data.today = plan.today;
  data.calendar = plan.calendar;
  data.decisions = decisions(findSheet(safeSheets, ["decisions", "needs your yes"]));
  data.tracker = tracker(findSheet(safeSheets, ["100k tracker", "100k"]));
  data.horizons = horizons(findSheet(safeSheets, ["30 60 90"]));
  data.bots = bots(findSheet(safeSheets, ["action log", "bot log"]));
  try {
    data.planBoard = parsePlanBoard(safeSheets);
  } catch {
    data.planBoard = emptyPlanBoard();
  }
  return data;
}

function findSheet(sheets: SheetGrid[], aliases: string[]): SheetGrid | undefined {
  return sheets.find((sheet) => {
    const title = normalizeTabTitle(sheet?.title || "");
    return aliases.some((alias) => title === alias || title.includes(alias));
  });
}

function cell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function rowsOf(sheet: SheetGrid | undefined): string[][] {
  if (!sheet || !Array.isArray(sheet.rows)) return [];
  return sheet.rows.map((row) => (Array.isArray(row) ? row.map((item) => cell(item)) : []));
}

export function parseMoney(raw: string): number | null {
  const original = cell(raw);
  if (!original || /^(-|—|–|n\/a|na|tbd)$/i.test(original)) return null;
  const text = original.replace(/^~\s*/, "").replace(/\s*\+\s*$/, "").trim();
  if (!text || /^(-|—|–|n\/a|na|tbd)$/i.test(text)) return null;
  if (/[a-z]/i.test(text.replace(/[$%,\s().-]/g, "")) && !/^\$/.test(text)) return null;
  const figures = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) || [];
  if (figures.length !== 1) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const numeric = text.replace(/[$,%\s]/g, "").replace(/[()]/g, "");
  if (!numeric || numeric === "-" || numeric === ".") return null;
  const value = Number(numeric);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

export function parsePercent(raw: string): number | null {
  const text = cell(raw);
  if (!text) return null;
  const value = parseMoney(text.replace(/%/g, ""));
  if (value == null) return null;
  if (text.includes("%") || value > 1) return Math.round(value * 10) / 10;
  return Math.round(value * 1000) / 10;
}

function norm(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
}

function phraseHas(name: string, alias: string): boolean {
  if (!name || !alias) return false;
  if (name === alias) return true;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(name);
}

function matchesAlias(value: string, aliases: string[], avoid: string[] = []): boolean {
  const name = norm(value);
  if (!name) return false;
  if (avoid.some((alias) => phraseHas(name, alias))) return false;
  return aliases.some((alias) => phraseHas(name, alias));
}

function inlineNumber(value: string, aliases: string[]): number | null {
  const name = norm(value);
  const alias = aliases.find((item) => name.startsWith(item));
  if (!alias) return null;
  const rest = value.slice(value.toLowerCase().indexOf(alias.slice(0, 4)) >= 0 ? 0 : 0);
  const money = value.match(/-?\$?\s*\d[\d,]*(?:\.\d+)?%?/);
  if (!money) return null;
  const before = value.slice(0, money.index).toLowerCase();
  if (!aliases.some((item) => norm(before).includes(item) || norm(value).startsWith(item))) return null;
  if (norm(before) === "" && !aliases.some((item) => name.startsWith(item))) return null;
  void rest;
  const parsed = parseMoney(money[0]);
  if (parsed == null) return null;
  if (norm(value) === money[0].toLowerCase()) return null;
  return parsed;
}

function labeledNumber(sheets: SheetGrid[], aliases: string[], avoid: string[] = []): number | null {
  for (const sheet of sheets) {
    const found = labeledNumberInRows(rowsOf(sheet), aliases, avoid);
    if (found != null) return found;
  }
  return null;
}

function labeledNumberInRows(rows: string[][], aliases: string[], avoid: string[] = []): number | null {
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const current = rows[r][c] || "";
      if (!matchesAlias(current, aliases, avoid)) continue;
      const inline = inlineNumber(current, aliases);
      if (inline != null) return inline;
      const right = parseMoney(rows[r][c + 1] || "");
      if (right != null) return right;
      const below = rows[r + 1]?.[c] || "";
      if (!matchesAlias(below, aliases, avoid)) {
        const down = parseMoney(below);
        if (down != null) return down;
      }
    }
  }
  return null;
}

function labeledNote(rows: string[][], aliases: string[], avoid: string[]): string | null {
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      if (!matchesAlias(rows[r][c] || "", aliases, avoid)) continue;
      const notes = rows[r].slice(c + 1).filter((item) => item && parseMoney(item) == null && !matchesAlias(item, [...aliases, ...avoid]));
      return notes[0] || null;
    }
  }
  return null;
}

function sectionBlock(rows: string[][], aliases: string[]): string[][] | null {
  for (let r = 0; r < rows.length; r += 1) {
    const filled = rows[r].filter(Boolean);
    if (filled.length !== 1 || !matchesAlias(filled[0], aliases)) continue;
    const block: string[][] = [];
    for (let i = r + 1; i < rows.length; i += 1) {
      const next = rows[i].filter(Boolean);
      if (next.length === 0) {
        if (block.length) break;
        continue;
      }
      if (next.length === 1 && isSectionTitle(next[0])) break;
      block.push(rows[i]);
    }
    return block;
  }
  return null;
}

function isSectionTitle(value: string): boolean {
  return matchesAlias(value, [...MONEY_SECTIONS, ...AR_SECTIONS, ...OWE_SECTIONS, "businesses", "decisions", "this week"]);
}

function isHeaderRow(row: string[]): boolean {
  const filled = row.filter(Boolean);
  if (filled.length < 2) return false;
  const words = filled.filter((item) => /[a-z]/i.test(item) && parseMoney(item) == null);
  const amounts = filled.filter((item) => parseMoney(item) != null);
  if (amounts.length > 0) return false;
  return words.length >= 2;
}

function pairs(rows: string[][]): PartyAmount[] {
  const items: PartyAmount[] = [];
  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    const texts: string[] = [];
    let amount: number | null = null;
    for (const item of row) {
      if (!item) continue;
      const money = parseMoney(item);
      if (money != null && amount == null && !/[a-z]/i.test(item.replace(/[$%,\s().-]/g, ""))) {
        amount = money;
        continue;
      }
      texts.push(item);
    }
    if (!texts.length) continue;
    items.push({ name: texts[0], amount, detail: texts[1] || null });
  }
  return items.filter((item) => item.name && !matchesAlias(item.name, MONEY_SECTIONS));
}

function moneyIn(sheets: SheetGrid[]): MoneyInRow[] {
  const collected: MoneyInRow[] = [];
  for (const sheet of sheets) {
    const block = sectionBlock(rowsOf(sheet), MONEY_SECTIONS);
    if (block) collected.push(...pairs(block).map((item) => ({ method: item.name, amount: item.amount })));
  }
  if (collected.length) return collected;
  for (const sheet of sheets) {
    const records = tableRecords(rowsOf(sheet));
    const rows = records
      .map((record) => ({
        method: pick(record, ["method", "source", "payment", "tender"]),
        amount: parseMoney(pick(record, ["amount", "total", "in", "collected"])),
      }))
      .filter((row) => row.method && !pickMatchesOnly(row.method));
    if (rows.length && records.some((record) => pick(record, ["method", "source", "payment", "tender"]))) {
      return rows;
    }
  }
  return [];
}

function pickMatchesOnly(value: string): boolean {
  return matchesAlias(value, ["method", "source", "amount", "total"]);
}

function parties(sheets: SheetGrid[], sections: string[], kinds: string[]): PartyAmount[] {
  const fromSections: PartyAmount[] = [];
  for (const sheet of sheets) {
    const block = sectionBlock(rowsOf(sheet), sections);
    if (block) fromSections.push(...pairs(block));
  }
  if (fromSections.length) return fromSections;
  return recordsByKind(sheets, kinds);
}

function owes(sheets: SheetGrid[]): PartyAmount[] {
  const sheet = findSheet(sheets, ["owes"]);
  const records = tableRecords(rowsOf(sheet));
  const typed = splitKind(records);
  if (typed.owes.length || typed.receivables.length) return typed.owes;
  const fromSheet = records.map(recordToParty).filter((item) => item.name);
  if (fromSheet.length) return fromSheet;
  return parties(sheets, OWE_SECTIONS, ["owe", "owes", "payable", "bill"]);
}

function recordsByKind(sheets: SheetGrid[], kinds: string[]): PartyAmount[] {
  const sheet = findSheet(sheets, ["owes"]);
  const typed = splitKind(tableRecords(rowsOf(sheet)));
  if (kinds.some((kind) => kind === "ar" || kind === "receivable" || kind === "outstanding")) return typed.receivables;
  return [];
}

function splitKind(records: Array<Record<string, string>>): { owes: PartyAmount[]; receivables: PartyAmount[] } {
  const owesRows: PartyAmount[] = [];
  const receivables: PartyAmount[] = [];
  let sawKind = false;
  for (const record of records) {
    const kind = norm(pick(record, ["type", "kind", "category"]));
    const party = recordToParty(record);
    if (!party.name) continue;
    if (!kind) continue;
    sawKind = true;
    if (["ar", "receivable", "receivables", "outstanding", "incoming"].includes(kind)) receivables.push(party);
    else owesRows.push(party);
  }
  if (!sawKind) return { owes: [], receivables: [] };
  return { owes: owesRows, receivables };
}

function recordToParty(record: Record<string, string>): PartyAmount {
  return {
    name: pick(record, ["name", "who", "client", "customer", "account", "vendor", "business"]),
    amount: parseMoney(pick(record, ["amount", "balance", "due", "total", "owes"])),
    detail: pick(record, ["detail", "note", "notes", "due date", "status", "when"]) || null,
  };
}

const BUSINESS_FIELDS: Array<{ field: "name" | "status" | "note" | "milestone" | "milestoneDue" | "nextDate" | "target" | "targetAmount" | "owners" | "profitCheck"; phrases: string[] }> = [
  { field: "name", phrases: ["business", "company"] },
  { field: "status", phrases: ["rag", "status", "health", "ryg", "color"] },
  { field: "note", phrases: ["where it stands", "notes", "note", "detail", "comment"] },
  { field: "milestone", phrases: ["next milestone"] },
  { field: "milestoneDue", phrases: ["milestone due"] },
  { field: "nextDate", phrases: ["next date on the calendar", "next date"] },
  { field: "target", phrases: ["30 day target"] },
  { field: "targetAmount", phrases: ["30 day $"] },
  { field: "owners", phrases: ["owner"] },
  { field: "profitCheck", phrases: ["profit check", "15% profit"] },
];

function businesses(sheet: SheetGrid | undefined): BusinessStatus[] {
  const rows = rowsOf(sheet);
  const headerAt = rows.findIndex((row) => businessHeader(row) != null);
  if (headerAt >= 0) {
    const header = businessHeader(rows[headerAt]);
    if (header) {
      return rows.slice(headerAt + 1).flatMap((row) => {
        const name = cellAt(row, header.name);
        if (!name || phraseHas(norm(name), "business")) return [];
        const status = cellAt(row, header.status);
        const note = cellAt(row, header.note) || null;
        const targetRaw = cellAt(row, header.targetAmount);
        return [business(name, status, note, {
          milestone: cellAt(row, header.milestone) || null,
          milestoneDue: cellAt(row, header.milestoneDue) || null,
          nextDate: cellAt(row, header.nextDate) || null,
          target: cellAt(row, header.target) || null,
          targetAmount: parseMoney(targetRaw),
          owners: cellAt(row, header.owners) || null,
          profitCheck: cellAt(row, header.profitCheck) || null,
        })];
      }).filter((item) => item.name);
    }
  }
  const records = tableRecords(rows);
  const fromTable = records
    .map((record) => {
      const name = pick(record, ["business", "name", "company"]);
      const status = pick(record, ["status", "health", "ryg", "rag", "color", "state"]);
      const note = pick(record, ["where it stands", "note", "notes", "detail", "comment"]) || null;
      return business(name, status, note);
    })
    .filter((item) => item.name);
  if (fromTable.length) return fromTable;
  return pairs(rows)
    .map((item) => business(item.name, item.detail || "", null))
    .filter((item) => item.name && !isHeaderRow([item.name]));
}

function businessHeader(row: string[]): Partial<Record<(typeof BUSINESS_FIELDS)[number]["field"], number>> | null {
  const map: Partial<Record<(typeof BUSINESS_FIELDS)[number]["field"], number>> = {};
  const score: Partial<Record<(typeof BUSINESS_FIELDS)[number]["field"], number>> = {};
  row.forEach((value, index) => {
    const key = looseHeader(value);
    if (!key) return;
    let best: { field: (typeof BUSINESS_FIELDS)[number]["field"]; score: number } | null = null;
    for (const field of BUSINESS_FIELDS) {
      for (const phrase of field.phrases) {
        if ((key === phrase || key.includes(phrase)) && (!best || phrase.length > best.score)) {
          best = { field: field.field, score: phrase.length };
        }
      }
    }
    if (!best) return;
    if (score[best.field] == null || best.score > (score[best.field] || 0)) {
      map[best.field] = index;
      score[best.field] = best.score;
    }
  });
  if (map.name == null || map.status == null) return null;
  return map;
}

function looseHeader(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9$%]+/g, " ").replace(/\s+/g, " ").trim();
}

function cellAt(row: string[], index: number | undefined): string {
  if (index == null) return "";
  return row[index] || "";
}

function business(
  name: string,
  status: string,
  note: string | null,
  extra: Partial<Omit<BusinessStatus, "name" | "tone" | "label" | "note">> = {},
): BusinessStatus {
  const tone = toneOf(status);
  return {
    name,
    tone,
    label: toneLabel(tone, status),
    note,
    milestone: extra.milestone ?? null,
    milestoneDue: extra.milestoneDue ?? null,
    nextDate: extra.nextDate ?? null,
    target: extra.target ?? null,
    targetAmount: extra.targetAmount ?? null,
    owners: extra.owners ?? null,
    profitCheck: extra.profitCheck ?? null,
  };
}

export function toneOf(raw: string): BusinessTone {
  const name = norm(raw);
  if (!name) return "unknown";
  if (name === "g" || name === "green" || name === "good" || name === "ok" || name === "okay" || name.includes("green") || name.includes("on track") || name.includes("healthy")) {
    return "green";
  }
  if (
    name === "y" ||
    name === "a" ||
    name === "yellow" ||
    name === "amber" ||
    name.includes("yellow") ||
    name.includes("amber") ||
    name.includes("watch") ||
    name.includes("caution") ||
    name.includes("attention")
  ) {
    return "yellow";
  }
  if (name === "r" || name === "red" || name.includes("red") || name.includes("behind") || name.includes("off track") || name.includes("risk") || name.includes("late")) {
    return "red";
  }
  return "unknown";
}

function toneLabel(tone: BusinessTone, raw: string): string {
  const name = norm(raw);
  const colorWord = name === "r" || name === "y" || name === "g" || name === "a"
    || name === "red" || name === "yellow" || name === "green" || name === "amber"
    || name.includes("yellow") || name.includes("amber") || name.includes("green") || /(^|\s)red(\s|$)/.test(name);
  if (colorWord && tone === "green") return "Green";
  if (colorWord && tone === "yellow") return "Yellow";
  if (colorWord && tone === "red") return "Red";
  if (tone === "green") return "On track";
  if (tone === "yellow") return "Watch";
  if (tone === "red") return "Behind";
  return "No status";
}

function weekPlan(sheet: SheetGrid | undefined, now: Date): { today: PlanItem[]; calendar: PlanItem[] } {
  const todayKey = chicagoDateKey(now);
  const weekday = chicagoWeekday(now);
  const records = tableRecords(rowsOf(sheet));
  const items = (records.length ? records.map((record) => planFromRecord(record)) : pairs(rowsOf(sheet)).map((item) => ({
    when: null,
    title: item.name,
    detail: item.detail,
    dateKey: null,
    weekday: null,
    flagged: false,
  }))).filter((item) => item.title);
  const today = items.filter((item) => item.flagged || item.dateKey === todayKey || item.weekday === weekday);
  return {
    today: today.map(stripFlag),
    calendar: items.map(stripFlag),
  };
}

function planFromRecord(record: Record<string, string>): PlanItem & { flagged: boolean } {
  const whenCell = pick(record, ["when", "today", "flag"]);
  const day = pick(record, ["day", "weekday"]);
  const date = pick(record, ["date"]);
  const calendar = pick(record, ["calendar", "event", "appointment"]);
  const plan = pick(record, ["plan", "focus", "item", "task", "title"]);
  const where = pick(record, ["where", "location", "place"]);
  const time = pick(record, ["time"]);
  const weekday = weekdayName(day) || weekdayName(date);
  return {
    when: time || null,
    title: plan || calendar || day,
    detail: [calendar && plan ? calendar : "", where].filter(Boolean).join(" · ") || null,
    dateKey: dateKeyFromCell(date),
    weekday,
    flagged: /^(today|yes|y)$/i.test(whenCell),
  };
}

function stripFlag(item: PlanItem & { flagged?: boolean }): PlanItem {
  return {
    when: item.when,
    title: item.title,
    detail: item.detail,
    dateKey: item.dateKey,
    weekday: item.weekday,
  };
}

function decisions(sheet: SheetGrid | undefined): DecisionItem[] {
  const records = tableRecords(rowsOf(sheet));
  const items = records.length
    ? records.map((record) => ({
      title: pick(record, ["decision", "title", "question", "item", "need"]),
      detail: pick(record, ["detail", "note", "notes", "context"]) || null,
      by: pick(record, ["by", "due", "needed", "when", "date"]) || null,
      status: pick(record, ["status", "state"]),
    }))
    : pairs(rowsOf(sheet)).map((item) => ({ title: item.name, detail: item.detail, by: null, status: "" }));
  return items
    .filter((item) => item.title && !CLOSED_DECISIONS.has(norm(item.status || "")))
    .map(({ title, detail, by }) => ({ title, detail, by }));
}

function tracker(sheet: SheetGrid | undefined): TrackerSnapshot {
  const rows = rowsOf(sheet);
  const goal = labeledNumberInRows(rows, ["goal", "target", "tracker goal"], ["savings goal"]);
  const current = labeledNumberInRows(rows, ["current", "collected", "actual", "progress", "to date"]);
  const records = tableRecords(rows);
  const breakdown = records
    .map((record) => ({
      label: pick(record, ["source", "business", "name", "label", "stream"]),
      amount: parseMoney(pick(record, ["amount", "total", "current", "collected"])),
    }))
    .filter((row) => row.label && !matchesAlias(row.label, ["goal", "current", "target", "source", "amount"]));
  return { goal, current, rows: breakdown };
}

function fridayScorecard(sheet: SheetGrid | undefined): FridayScorecard {
  const card = emptyScorecard();
  const rows = rowsOf(sheet);
  let section: "metrics" | "rag" | "targets" | "payments" | null = null;
  let columns: { label: number; value: number } = { label: 0, value: 1 };
  for (const row of rows) {
    if (row.every((value) => !cell(value))) {
      section = null;
      continue;
    }
    const next = scorecardSection(row);
    if (next) {
      section = next;
      columns = scorecardColumns(row, next);
      continue;
    }
    if (!section) continue;
    const label = cell(row[columns.label]);
    const value = cell(row[columns.value]);
    if (!label || scorecardSection(row)) continue;
    if (section === "metrics") {
      if (norm(label) === "metric" || norm(label) === "value") continue;
      card.metrics.push({ label, amount: parseMoney(value), text: value || null });
    } else if (section === "rag") {
      if (phraseHas(norm(label), "business")) continue;
      card.rag.push({ name: label, tone: toneOf(value) });
    } else if (section === "targets") {
      card.nextWeek.push({ text: label, owner: value || null });
    } else if (section === "payments") {
      card.payments.push({ payment: label, date: value || null });
    }
  }
  return card;
}

function scorecardSection(row: string[]): "metrics" | "rag" | "targets" | "payments" | null {
  const cells = row.map((value) => norm(value)).filter(Boolean);
  if (cells.length < 2) return null;
  const blob = cells.join(" ");
  if (cells.some((value) => value === "metric" || value === "metrics") && cells.some((value) => value === "value" || value === "values")) {
    return "metrics";
  }
  if (cells.some((value) => value === "business" || value === "businesses") && cells.some((value) => value === "rag")) return "rag";
  if (blob.includes("next week target")) return "targets";
  if (blob.includes("week cash detail")) return "payments";
  return null;
}

function scorecardColumns(row: string[], section: "metrics" | "rag" | "targets" | "payments"): { label: number; value: number } {
  const keys = row.map((value) => norm(value));
  if (section === "metrics") {
    return { label: Math.max(0, keys.findIndex((value) => value === "metric" || value === "metrics")), value: Math.max(1, keys.findIndex((value) => value === "value" || value === "values")) };
  }
  if (section === "rag") {
    return { label: Math.max(0, keys.findIndex((value) => value === "business" || value === "businesses")), value: Math.max(1, keys.findIndex((value) => value === "rag")) };
  }
  if (section === "payments") {
    const date = keys.findIndex((value) => value === "date");
    return { label: 0, value: date >= 0 ? date : 1 };
  }
  const owner = keys.findIndex((value) => value === "owner" || value === "owners");
  return { label: 0, value: owner >= 0 ? owner : 1 };
}

function horizons(sheet: SheetGrid | undefined): HorizonPlan[] {
  const rows = rowsOf(sheet);
  const columns = columnHorizons(rows);
  if (columns.length) return columns;
  const listed = milestoneListHorizons(rows);
  if (listed.length) return listed;
  const sections = sectionHorizons(rows);
  if (sections.length) return sections;
  return recordHorizons(rows);
}

function columnHorizons(rows: string[][]): HorizonPlan[] {
  for (let i = 0; i < rows.length; i += 1) {
    const columns = rows[i]
      .map((value, index) => ({ horizon: horizonKey(value), index }))
      .filter((column): column is { horizon: "30" | "60" | "90"; index: number } => column.horizon != null);
    if (columns.length < 2) continue;
    const plans = columns.map((column) => ({
      horizon: column.horizon,
      items: rows.slice(i + 1).map((row) => cell(row[column.index])).filter((item) => Boolean(item) && horizonKey(item) == null),
    })).filter((column) => column.items.length);
    if (plans.length) return plans;
  }
  return [];
}

function milestoneListHorizons(rows: string[][]): HorizonPlan[] {
  const headerAt = rows.findIndex((row) => row.some((value) => norm(value) === "date") && row.some((value) => norm(value) === "milestone"));
  if (headerAt < 0) return [];
  const header = rows[headerAt];
  const dateCol = header.findIndex((value) => norm(value) === "date");
  const milestoneCol = header.findIndex((value) => norm(value) === "milestone");
  const anchors = horizonAnchors(rows);
  const groups = new Map<"30" | "60" | "90" | "later", string[]>();
  for (const row of rows.slice(headerAt + 1)) {
    const when = cell(row[dateCol]);
    const milestone = cell(row[milestoneCol]);
    if (!when && !milestone) continue;
    if (norm(when) === "date" && norm(milestone) === "milestone") continue;
    const marked = dayMark(milestone) || dayMark(when);
    const iso = parseLooseDate(when, anchors.year, anchors.startMonth);
    const horizon = marked || (iso ? bucketDate(iso, anchors) : "later");
    const item = milestone && when ? `${when} · ${milestone}` : milestone || when;
    pushHorizon(groups, horizon, item);
  }
  collectStarMilestones(rows, anchors, groups);
  return packHorizons(groups);
}

function sectionHorizons(rows: string[][]): HorizonPlan[] {
  const groups = new Map<"30" | "60" | "90" | "later", string[]>();
  let current: "30" | "60" | "90" | null = null;
  for (const row of rows) {
    const filled = row.map((value) => cell(value)).filter(Boolean);
    if (!filled.length) continue;
    const section = filled.length === 1 ? dayMark(filled[0]) || horizonKey(filled[0]) : null;
    if (section) {
      current = section;
      continue;
    }
    if (!current) continue;
    pushHorizon(groups, current, filled.join(" · "));
  }
  return packHorizons(groups);
}

function recordHorizons(rows: string[][]): HorizonPlan[] {
  const records = tableRecords(rows);
  const groups = new Map<"30" | "60" | "90" | "later", string[]>();
  for (const record of records) {
    const horizon = horizonKey(pick(record, ["horizon", "window", "days", "phase"]));
    const item = pick(record, ["item", "plan", "focus", "goal", "task", "milestone"]);
    if (!horizon || !item) continue;
    pushHorizon(groups, horizon, item);
  }
  return packHorizons(groups);
}

function pushHorizon(groups: Map<"30" | "60" | "90" | "later", string[]>, horizon: "30" | "60" | "90" | "later", item: string) {
  const text = cell(item);
  if (!text) return;
  const existing = [...groups.values()].flat();
  if (existing.some((value) => sameHorizonItem(value, text))) return;
  groups.set(horizon, [...(groups.get(horizon) || []), text]);
}

function sameHorizonItem(left: string, right: string): boolean {
  const clean = (value: string) => norm(value.replace(/★/g, " "));
  return clean(left) === clean(right);
}

function packHorizons(groups: Map<"30" | "60" | "90" | "later", string[]>): HorizonPlan[] {
  return (["30", "60", "90", "later"] as const).flatMap((horizon) => {
    const items = groups.get(horizon) || [];
    return items.length ? [{ horizon, items }] : [];
  });
}

interface HorizonAnchors {
  year: number;
  startMonth: number | null;
  day30: string | null;
  day60: string | null;
  day90: string | null;
}

function horizonAnchors(rows: string[][]): HorizonAnchors {
  const note = rows.slice(0, 3).map((row) => row.join(" ")).join("\n");
  const start = note.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(20\d{2})/i);
  const year = start ? Number(start[2]) : Number(note.match(/\b(20\d{2})\b/)?.[1] || new Date().getFullYear());
  const startMonth = start ? monthIndex(start[1]) : null;
  return {
    year,
    startMonth,
    day30: anchorDate(note, "30", year, startMonth),
    day60: anchorDate(note, "60", year, startMonth),
    day90: anchorDate(note, "90", year, startMonth),
  };
}

function anchorDate(text: string, day: string, defaultYear: number, startMonth: number | null): string | null {
  const match = text.match(new RegExp(`\\bday\\s*${day}\\s*=\\s*([a-z]+)\\s+(\\d{1,2})(?:\\s*,\\s*(20\\d{2}))?`, "i"));
  if (!match) return null;
  return toIso(match[1], Number(match[2]), match[3] ? Number(match[3]) : null, defaultYear, startMonth);
}

function bucketDate(iso: string, anchors: HorizonAnchors): "30" | "60" | "90" | "later" {
  if (anchors.day30 && iso <= anchors.day30) return "30";
  if (anchors.day60 && iso <= anchors.day60) return "60";
  if (anchors.day90 && iso <= anchors.day90) return "90";
  return "later";
}

function dayMark(text: string): "30" | "60" | "90" | null {
  const match = text.match(/\bDAY\s*(30|60|90)\b/i);
  if (!match) return null;
  return match[1] as "30" | "60" | "90";
}

function parseLooseDate(value: string, defaultYear: number, startMonth: number | null): string | null {
  const text = cell(value);
  if (/^20\d{2}-\d{2}-\d{2}$/.test(text)) return text;
  const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(20\d{2}))?\b/i);
  if (named && Number(named[2]) <= 31) {
    return toIso(named[1], Number(named[2]), named[3] ? Number(named[3]) : null, defaultYear, startMonth);
  }
  const monthYear = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i);
  if (monthYear) return toIso(monthYear[1], 1, Number(monthYear[2]), defaultYear, startMonth);
  return null;
}

function toIso(monthName: string, day: number, year: number | null, defaultYear: number, startMonth: number | null): string | null {
  const month = monthIndex(monthName);
  if (!month || day < 1 || day > 31) return null;
  let resolved = year ?? defaultYear;
  if (year == null && startMonth != null && month < startMonth) resolved += 1;
  return `${resolved}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthIndex(name: string): number | null {
  const key = name.toLowerCase().slice(0, 3);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(key);
  return index < 0 ? null : index + 1;
}

function collectStarMilestones(
  rows: string[][],
  anchors: HorizonAnchors,
  groups: Map<"30" | "60" | "90" | "later", string[]>,
) {
  let month: number | null = null;
  let year: number | null = null;
  for (const row of rows) {
    for (const value of row) {
      const header = value.trim().match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})$/i);
      if (!header) continue;
      month = monthIndex(header[1]);
      year = Number(header[2]);
    }
    if (month == null || year == null) continue;
    for (const value of row) {
      if (!value.includes("★")) continue;
      const text = value.split("★").slice(1).join("★").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const dayMatch = value.split("\n")[0].trim().match(/^(\d{1,2})$/);
      const day = dayMatch ? Number(dayMatch[1]) : null;
      const iso = day ? toIso(monthName(month), day, year, year, null) : null;
      const horizon = iso ? bucketDate(iso, anchors) : "later";
      pushHorizon(groups, horizon, `★ ${text}`);
    }
  }
}

function monthName(month: number): string {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][month - 1] || "jan";
}

function horizonKey(value: string): "30" | "60" | "90" | null {
  const name = norm(value);
  if (name === "30" || name === "30 days" || name === "30 day" || name.startsWith("30 ")) return "30";
  if (name === "60" || name === "60 days" || name === "60 day" || name.startsWith("60 ")) return "60";
  if (name === "90" || name === "90 days" || name === "90 day" || name.startsWith("90 ")) return "90";
  return null;
}

function bots(sheet: SheetGrid | undefined): OwnerSuiteData["bots"] {
  if (!sheet) return { state: "empty", entries: [] };
  const records = tableRecords(rowsOf(sheet));
  if (!records.length) return { state: "empty", entries: [] };
  const groups = new Map<string, BotStat & { accuracySamples: number[] }>();
  for (const record of records) {
    const bot = pick(record, ["bot", "agent", "name"]) || "Bot";
    const loop = pick(record, ["loop", "workflow", "lane"]) || "All loops";
    const key = `${norm(bot)}::${norm(loop)}`;
    const current = groups.get(key) || { bot, loop, actionsDone: 0, salesClosed: 0, accuracy: null, accuracySamples: [] };
    const actions = parseMoney(pick(record, ["actions", "actions done", "done", "count"]));
    const sales = parseMoney(pick(record, ["sales closed", "sales", "closed", "sold"]));
    const accuracy = parsePercent(pick(record, ["accuracy", "score"]));
    current.actionsDone = (current.actionsDone || 0) + (actions != null ? actions : 1);
    if (sales != null) current.salesClosed = (current.salesClosed || 0) + sales;
    else if (/\b(closed|sold|won|paid)\b/i.test(pick(record, ["result", "status", "outcome"]))) {
      current.salesClosed = (current.salesClosed || 0) + 1;
    }
    if (accuracy != null) current.accuracySamples.push(accuracy);
    current.bot = bot;
    current.loop = loop;
    groups.set(key, current);
  }
  const entries = [...groups.values()].map((entry) => ({
    bot: entry.bot,
    loop: entry.loop,
    actionsDone: entry.actionsDone,
    salesClosed: entry.salesClosed,
    accuracy: entry.accuracySamples.length
      ? Math.round((entry.accuracySamples.reduce((sum, value) => sum + value, 0) / entry.accuracySamples.length) * 10) / 10
      : null,
  }));
  return { state: entries.length ? "ready" : "empty", entries };
}

function tableRecords(rows: string[][]): Array<Record<string, string>> {
  let headerAt = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (!isHeaderRow(rows[i])) continue;
    headerAt = i;
    break;
  }
  if (headerAt < 0) return [];
  const headers = rows[headerAt].map((header) => norm(header));
  const records: Array<Record<string, string>> = [];
  for (const row of rows.slice(headerAt + 1)) {
    if (row.every((item) => !item)) continue;
    if (isSectionTitle(row.filter(Boolean)[0] || "") && row.filter(Boolean).length === 1) break;
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cell(row[index]);
    });
    if (Object.values(record).some(Boolean)) records.push(record);
  }
  return records;
}

function pick(record: Record<string, string>, aliases: string[]): string {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const exact = entries.find(([key]) => key === alias);
    if (exact?.[1]) return exact[1];
  }
  for (const alias of aliases) {
    const partial = entries.find(([key]) => key.startsWith(`${alias} `) || key.endsWith(` ${alias}`));
    if (partial?.[1]) return partial[1];
  }
  return "";
}

function weekdayName(value: string): string | null {
  const name = norm(value);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days.find((day) => name === day || name.startsWith(`${day} `)) || null;
}

function dateKeyFromCell(value: string): string | null {
  const text = cell(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
}

export function chicagoDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function chicagoWeekday(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long" }).format(now).toLowerCase();
}

export function chicagoStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

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
  horizon: "30" | "60" | "90";
  items: string[];
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
  bots: {
    state: BotFeedState;
    entries: BotStat[];
  };
  planBoard: PlanBoard;
}

const WEEK_AMOUNT = ["cash this week", "this week cash", "collected this week", "week collected", "revenue this week"];
const WEEK_GOAL = ["week goal", "this week goal", "weekly goal", "goal this week"];
const MONTH_AMOUNT = ["cash this month", "this month cash", "collected this month", "month collected", "revenue this month", "mtd cash", "month to date"];
const MONTH_GOAL = ["month goal", "this month goal", "monthly goal", "goal this month"];
const SAVINGS_AMOUNT = ["savings", "savings balance", "saved", "reserve balance"];
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
    bots: { state: "unknown", entries: [] },
    planBoard: emptyPlanBoard(),
  };
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
  data.businesses = businesses(findSheet(safeSheets, ["businesses", "business"]));
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
  const text = cell(raw);
  if (!text || /^(-|—|n\/a|na|tbd)$/i.test(text)) return null;
  if (/[a-z]/i.test(text.replace(/[$%,\s().-]/g, "")) && !/^\$/.test(text)) return null;
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

function matchesAlias(value: string, aliases: string[], avoid: string[] = []): boolean {
  const name = norm(value);
  if (!name) return false;
  if (avoid.some((alias) => name === alias || name.startsWith(`${alias} `))) return false;
  return aliases.some((alias) => name === alias || name.startsWith(`${alias} `) || name.startsWith(`${alias}:`));
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

function businesses(sheet: SheetGrid | undefined): BusinessStatus[] {
  const records = tableRecords(rowsOf(sheet));
  const fromTable = records
    .map((record) => {
      const name = pick(record, ["business", "name", "company"]);
      const status = pick(record, ["status", "health", "ryg", "color", "state"]);
      const note = pick(record, ["note", "notes", "detail", "comment"]) || null;
      return business(name, status, note);
    })
    .filter((item) => item.name);
  if (fromTable.length) return fromTable;
  return pairs(rowsOf(sheet))
    .map((item) => business(item.name, item.detail || "", null))
    .filter((item) => item.name && !isHeaderRow([item.name]));
}

function business(name: string, status: string, note: string | null): BusinessStatus {
  const tone = toneOf(status);
  return { name, tone, label: toneLabel(tone), note };
}

export function toneOf(raw: string): BusinessTone {
  const name = norm(raw);
  if (!name) return "unknown";
  if (name === "g" || name === "green" || name === "good" || name === "ok" || name === "okay" || name.includes("green") || name.includes("on track") || name.includes("healthy")) {
    return "green";
  }
  if (name === "y" || name === "yellow" || name.includes("yellow") || name.includes("watch") || name.includes("caution") || name.includes("attention")) {
    return "yellow";
  }
  if (name === "r" || name === "red" || name.includes("red") || name.includes("behind") || name.includes("off track") || name.includes("risk") || name.includes("late")) {
    return "red";
  }
  return "unknown";
}

function toneLabel(tone: BusinessTone): string {
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

function horizons(sheet: SheetGrid | undefined): HorizonPlan[] {
  const rows = rowsOf(sheet);
  const header = rows.find((row) => row.filter(Boolean).length >= 2);
  if (header) {
    const columns = header
      .map((value, index) => ({ horizon: horizonKey(value), index }))
      .filter((column): column is { horizon: "30" | "60" | "90"; index: number } => column.horizon != null);
    if (columns.length >= 2) {
      const headerAt = rows.indexOf(header);
      return columns.map((column) => ({
        horizon: column.horizon,
        items: rows.slice(headerAt + 1).map((row) => cell(row[column.index])).filter(Boolean),
      })).filter((column) => column.items.length);
    }
  }
  const records = tableRecords(rows);
  const grouped = new Map<"30" | "60" | "90", string[]>();
  for (const record of records) {
    const horizon = horizonKey(pick(record, ["horizon", "window", "days", "phase"]));
    const item = pick(record, ["item", "plan", "focus", "goal", "task"]);
    if (!horizon || !item) continue;
    grouped.set(horizon, [...(grouped.get(horizon) || []), item]);
  }
  return (["30", "60", "90"] as const).flatMap((horizon) => {
    const items = grouped.get(horizon) || [];
    return items.length ? [{ horizon, items }] : [];
  });
}

function horizonKey(value: string): "30" | "60" | "90" | null {
  const name = norm(value);
  if (name === "30" || name === "30 days" || name === "30 day" || name.startsWith("30 ")) return "30";
  if (name === "60" || name === "60 days" || name === "60 day" || name.startsWith("60 ")) return "60";
  if (name === "90" || name === "90 days" || name === "90 day" || name.startsWith("90 ")) return "90";
  return null;
}

function bots(sheet: SheetGrid | undefined): OwnerSuiteData["bots"] {
  if (!sheet) return { state: "missing", entries: [] };
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

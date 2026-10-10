/**
 * Read-only scorecard fetch. Cell values stay in memory for the cache window
 * and are never written to disk or logs.
 */

import { google } from "googleapis";
import { emptyOwnerSuiteData, parseOwnerSuite, type OwnerSuiteData, type SheetGrid } from "../../shared/ownerSuite";
import { ownerSuiteFixtureGrids } from "./ownerSuiteFixtures";
import { ownerFixturesEnabled, ownerRuntimeEnv } from "./ownerGate";

export const OWNER_SHEET_ID = "1vHkdHRhAWKcnsv8-d1ZZSWRr-OZyy0xCaqK1Bi3VB3Q";
const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const CACHE_MS = 60_000;
const ERROR_CACHE_MS = 15_000;

const TAB_ALIASES: Array<{ aliases: string[] }> = [
  { aliases: ["friday scorecard"] },
  { aliases: ["this week"] },
  { aliases: ["100k tracker"] },
  { aliases: ["businesses"] },
  { aliases: ["30 60 90"] },
  { aliases: ["owes"] },
  { aliases: ["decisions"] },
  { aliases: ["action log"] },
];

export interface SheetsCredentials {
  client_email: string;
  private_key: string;
}

export interface OwnerSuitePayload {
  data: OwnerSuiteData;
  source: "sheet" | "fixture" | "empty";
  configured: boolean;
  notice: string | null;
  readerEmail: string | null;
}

type Env = ReturnType<typeof ownerRuntimeEnv>;

let cache: { expires: number; payload: OwnerSuitePayload } | null = null;

export function clearOwnerSuiteCacheForTests() {
  cache = null;
}

export function resolveSheetsCredentials(env: Env = ownerRuntimeEnv()): SheetsCredentials | null {
  const fromFirebase = credentialsFromJson(env.FIREBASE_SERVICE_ACCOUNT);
  if (fromFirebase) return fromFirebase;
  const email = env.OWNER_SHEETS_SA_EMAIL?.trim();
  const key = env.OWNER_SHEETS_SA_KEY?.replace(/\\n/g, "\n").trim();
  if (email && key) return { client_email: email, private_key: key };
  return null;
}

export async function loadOwnerSuite(options: { fresh?: boolean; now?: Date } = {}): Promise<OwnerSuitePayload> {
  const env = ownerRuntimeEnv();
  const now = options.now ?? new Date();
  if (ownerFixturesEnabled(env)) {
    return {
      data: parseOwnerSuite(ownerSuiteFixtureGrids(), now),
      source: "fixture",
      configured: true,
      notice: null,
      readerEmail: null,
    };
  }

  if (!options.fresh && cache && cache.expires > Date.now()) return cache.payload;

  const credentials = resolveSheetsCredentials(env);
  if (!credentials) {
    const payload: OwnerSuitePayload = {
      data: unknownData(now),
      source: "empty",
      configured: false,
      notice: "Scorecard is not connected.",
      readerEmail: null,
    };
    cache = { expires: Date.now() + ERROR_CACHE_MS, payload };
    return payload;
  }

  try {
    const grids = await fetchScorecard(credentials);
    const payload: OwnerSuitePayload = {
      data: parseOwnerSuite(grids, now),
      source: "sheet",
      configured: true,
      notice: null,
      readerEmail: credentials.client_email,
    };
    cache = { expires: Date.now() + CACHE_MS, payload };
    return payload;
  } catch (error) {
    const status = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "error";
    console.error(`[Owners] Scorecard read failed (${status})`);
    const payload: OwnerSuitePayload = {
      data: unknownData(now),
      source: "empty",
      configured: true,
      notice: "The scorecard could not be read.",
      readerEmail: credentials.client_email,
    };
    cache = { expires: Date.now() + ERROR_CACHE_MS, payload };
    return payload;
  }
}

function unknownData(now: Date): OwnerSuiteData {
  const data = emptyOwnerSuiteData(now);
  data.bots.state = "unknown";
  return data;
}

function credentialsFromJson(raw: string | undefined): SheetsCredentials | null {
  if (!raw || !raw.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

async function fetchScorecard(credentials: SheetsCredentials): Promise<SheetGrid[]> {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [READONLY_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: OWNER_SHEET_ID,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets || [])
    .map((sheet) => sheet.properties?.title || "")
    .filter(Boolean);
  const matched = TAB_ALIASES.map((wanted) => titles.find((title) => {
    const name = title.toLowerCase().replace(/\$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    return wanted.aliases.some((alias) => name === alias || name.includes(alias));
  })).filter((title): title is string => Boolean(title));
  if (!matched.length) return [];
  const values = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: OWNER_SHEET_ID,
    ranges: matched.map((title) => `'${title.replace(/'/g, "''")}'`),
    valueRenderOption: "FORMATTED_VALUE",
  });
  return (values.data.valueRanges || []).map((range, index) => ({
    title: matched[index] || "",
    rows: (range.values || []).map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
  }));
}

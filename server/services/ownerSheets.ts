/**
 * Owner scorecard payload. The owners portal workbook is no longer read.
 * Sheets credentials here are the shared reader used by other workbooks.
 */

import { google } from "googleapis";
import { emptyOwnerSuiteData, normalizeTabTitle, parseOwnerSuite, type OwnerSuiteData } from "../../shared/ownerSuite";
import { ownerSuiteFixtureGrids } from "./ownerSuiteFixtures";
import { ownerFixturesEnabled, ownerRuntimeEnv } from "./ownerGate";

/** Read-only Sheets scope used by other workbook clients. The owners portal workbook is not one of them. */
export const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const ERROR_CACHE_MS = 15_000

const TAB_ALIASES: Array<{ aliases: string[] }> = [
  { aliases: ["friday scorecard"] },
  { aliases: ["this week"] },
  { aliases: ["100k tracker"] },
  { aliases: ["businesses"] },
  { aliases: ["30 60 90"] },
  { aliases: ["owes"] },
  { aliases: ["decisions"] },
  { aliases: ["action log"] },
  { aliases: ["plan board data", "plan board"] },
];

export function selectOwnerTabs(titles: string[]): string[] {
  const cleaned = titles.filter(Boolean);
  const picked: string[] = [];
  for (const wanted of TAB_ALIASES) {
    const match = matchOwnerTab(cleaned, wanted.aliases);
    if (match && !picked.includes(match)) picked.push(match);
  }
  return picked;
}

function matchOwnerTab(titles: string[], aliases: string[]): string | undefined {
  const named = titles.map((title) => ({ title, name: normalizeTabTitle(title) }));
  for (const alias of aliases) {
    const exact = named.find((item) => item.name === alias);
    if (exact) return exact.title;
  }
  for (const alias of aliases) {
    const partial = named.find((item) => item.name.includes(alias));
    if (partial) return partial.title;
  }
  return undefined;
}

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

export function createReadonlySheetsClient(credentials: SheetsCredentials) {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SHEETS_READONLY_SCOPE],
  });
  return google.sheets({ version: "v4", auth });
}

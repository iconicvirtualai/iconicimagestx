/**
 * Read-only Marketing Holy Grail audience.
 * values.get only. campaignSheetAccess refuses every write, and names columns H–N and P.
 */

import { google } from "googleapis";
import {
  AUDIENCE_MAX_PAGES,
  AUDIENCE_PAGE_SIZE,
  campaignSheetAccess,
  phoneDigits,
  type ChannelPerson,
} from "../../shared/channelCampaigns";
import {
  HOLY_GRAIL_SHEET_ID,
  HOLY_GRAIL_TABS,
  isDncStatus,
  isEmailOkNo,
  normalizeHeader,
  normalizeSyncEmail,
  normalizeSyncPhone,
  quoteTab,
  suppressionFromGrid,
} from "../../shared/holyGrailSync";
import { normalizePersonName } from "../../shared/emailMarketing/contacts";
import { SHEETS_READONLY_SCOPE, resolveSheetsCredentials } from "./ownerSheets";

export interface HolyGrailAudienceRead {
  configured: boolean;
  note: string;
  people: ChannelPerson[];
  blockedEmails: string[];
  blockedPhones: string[];
  blockedNames: string[];
  truncated: boolean;
}

export interface SheetValueReader {
  get(range: string): Promise<string[][]>;
}

let testReader: SheetValueReader | null | undefined;

export function setHolyGrailAudienceReaderForTests(reader: SheetValueReader | null | undefined): void {
  testReader = reader;
}

function empty(note: string, configured = false): HolyGrailAudienceRead {
  return { configured, note, people: [], blockedEmails: [], blockedPhones: [], blockedNames: [], truncated: false };
}

function column(header: string[], label: string): number {
  const want = normalizeHeader(label);
  return header.findIndex((cell) => normalizeHeader(cell) === want);
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

async function readGrid(reader: SheetValueReader, tab: string): Promise<{ rows: string[][]; truncated: boolean }> {
  const headerRange = quoteTab(tab, "A1:ZZ1");
  campaignSheetAccess("get", headerRange);
  const headerRows = await reader.get(headerRange);
  const header = headerRows[0] || [];
  const rows: string[][] = [header];
  let truncated = false;
  for (let page = 0; page < AUDIENCE_MAX_PAGES; page += 1) {
    const start = 2 + page * AUDIENCE_PAGE_SIZE;
    const end = start + AUDIENCE_PAGE_SIZE - 1;
    const range = quoteTab(tab, `A${start}:ZZ${end}`);
    campaignSheetAccess("get", range);
    const chunk = await reader.get(range);
    rows.push(...chunk);
    if (chunk.length < AUDIENCE_PAGE_SIZE) return { rows, truncated };
    if (page === AUDIENCE_MAX_PAGES - 1) truncated = true;
  }
  return { rows, truncated };
}

function peopleFromContacts(rows: string[][]): ChannelPerson[] {
  const header = rows[0] || [];
  const emailCol = column(header, "Email");
  if (emailCol < 0) return [];
  const phoneCol = column(header, "Phone");
  const liveCol = column(header, "Live Status");
  const okCol = column(header, "Email OK");
  const firstCol = column(header, "First Name");
  const lastCol = column(header, "Last Name");
  const nameCol = column(header, "Name");
  const companyCol = column(header, "Company");
  const sectionCol = column(header, "Section");
  const tagsCol = column(header, "Tags");
  const people: ChannelPerson[] = [];
  for (const row of rows.slice(1)) {
    const email = normalizeSyncEmail(cell(row, emailCol));
    const phone = normalizeSyncPhone(cell(row, phoneCol));
    if (!email && !phone) continue;
    let firstName = cell(row, firstCol);
    let lastName = cell(row, lastCol);
    if (!firstName && !lastName && nameCol >= 0) {
      const parts = cell(row, nameCol).split(/\s+/).filter(Boolean);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ");
    }
    const live = cell(row, liveCol);
    const emailOk = cell(row, okCol);
    const section = cell(row, sectionCol);
    const tags = cell(row, tagsCol).split(/[,;]/).map((tag) => tag.trim()).filter(Boolean);
    if (section) tags.push(`section:${section}`);
    people.push({
      email,
      firstName,
      lastName,
      phone,
      company: cell(row, companyCol),
      tags,
      emailVerified: true,
      source: "sheet",
      doNotContact: isDncStatus(live) || isEmailOkNo(emailOk),
    });
  }
  return people;
}

export async function readHolyGrailAudience(reader?: SheetValueReader | null): Promise<HolyGrailAudienceRead> {
  let active: SheetValueReader | null;
  if (reader !== undefined) active = reader;
  else if (testReader !== undefined) active = testReader;
  else if (process.env.NODE_ENV === "test") active = null;
  else active = await liveReader();
  if (!active) {
    if (process.env.NODE_ENV === "test") return empty("Sheet read is off in tests until a reader is set.");
    return empty("Holy Grail sheet is not connected. Audience uses Iconic contacts.");
  }
  try {
    const contacts = await readGrid(active, HOLY_GRAIL_TABS.contacts);
    const suppression = await readGrid(active, HOLY_GRAIL_TABS.suppression);
    const dnc = await readGrid(active, HOLY_GRAIL_TABS.doNotContact);
    const blocked = suppressionFromGrid(suppression.rows);
    const held = suppressionFromGrid(dnc.rows);
    return {
      configured: true,
      note: "Read from Marketing Holy Grail. Nothing was written.",
      people: peopleFromContacts(contacts.rows),
      blockedEmails: [...blocked.emails, ...held.emails],
      blockedPhones: [...blocked.phones, ...held.phones].map((phone) => phoneDigits(phone) || phone),
      blockedNames: [...blocked.names, ...held.names].map((name) => normalizePersonName(name)).filter(Boolean),
      truncated: contacts.truncated || suppression.truncated || dnc.truncated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/private key|credentials/i.test(message)) {
      return empty("Holy Grail credentials could not be used. Audience uses Iconic contacts.", true);
    }
    if (message.includes("Refusing to write")) throw error;
    return empty("Holy Grail could not be read. Audience uses Iconic contacts.", true);
  }
}

async function liveReader(): Promise<SheetValueReader | null> {
  const credentials = resolveSheetsCredentials();
  if (!credentials) return null;
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SHEETS_READONLY_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });
  return {
    async get(range: string) {
      campaignSheetAccess("get", range);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: HOLY_GRAIL_SHEET_ID,
        range,
        majorDimension: "ROWS",
      });
      return (response.data.values || []).map((row) => (row || []).map((cell) => String(cell ?? "")));
    },
  };
}

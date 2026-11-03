import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SuppressionEntry } from "./emailMarketing/types";
import {
  ACTION_POSSIBLE_DUPE,
  ACTION_SUPPRESSED,
  CONTACTS_NEVER_WRITE_COLUMNS,
  CONTACTS_WRITE_COLUMNS,
  HOLY_GRAIL_NEVER_WRITE_TABS,
  HOLY_GRAIL_TABS,
  INBOX_FORMULA_COLUMN,
  assertAllowedSheetRange,
  buildContactIndex,
  cityFromAddressText,
  contactWrites,
  emailOkColumnFromHeader,
  emptyCursor,
  holyGrailLive,
  columnLetter,
  inboxAppendRange,
  inboxRowValues,
  isTestRecord,
  lastOrderLabel,
  leadFromHar,
  leadsFromChanges,
  mapOrderStatus,
  normalizeSyncEmail,
  normalizeSyncPhone,
  parseSheetRange,
  planHolyGrailLead,
  selectFresh,
  sheetText,
  sourceSyncedValue,
  suppressionFromGrid,
  type ContactIndexRow,
  type HolyGrailIndexes,
  type HolyGrailLead,
  type LeadMemory,
} from "./holyGrailSync";

const NOW = Date.parse("2026-11-03T21:00:00.000Z");

function indexes(contacts: ContactIndexRow[], extra: Partial<HolyGrailIndexes> = {}): HolyGrailIndexes {
  return {
    contacts,
    suppressionEmails: [],
    suppressionPhones: [],
    suppressionNames: [],
    marketingSuppression: [],
    ...extra,
  };
}

function row(partial: Partial<ContactIndexRow> & Pick<ContactIndexRow, "row">): ContactIndexRow {
  return {
    clientId: "",
    email: "",
    phone: "",
    liveStatus: "",
    emailOk: "",
    ...partial,
  };
}

function lead(partial: Partial<HolyGrailLead> = {}): HolyGrailLead {
  return {
    key: "email:ada@example.com",
    siteClientId: "client-1",
    iconicClientId: "",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "7135550100",
    phoneRaw: "(713) 555-0100",
    company: "Analytical Engines",
    city: "Houston",
    notes: "Order #0142",
    source: "Website",
    receivedAt: "2026-11-03T21:00Z",
    lastOrder: "#0142 · 2026-11-03",
    orderStatus: "Booked",
    harListingId: "",
    ...partial,
  };
}

function columnsIn(range: string): string[] {
  const parsed = parseSheetRange(range);
  const letters: string[] = [];
  for (let col = parsed.startCol; col <= parsed.endCol; col += 1) letters.push(columnLetter(col));
  return letters;
}

function domainBlock(domain: string): SuppressionEntry {
  return {
    id: `domain:${domain}`,
    kind: "domain",
    value: domain,
    reason: "manual",
    hold: "",
    note: "",
    aliases: [],
    email: "",
    source: "manual",
    createdAt: "",
    updatedAt: "",
  };
}

describe("Holy Grail normalization", () => {
  it("normalizes email by trimming, lowercasing, and removing spaces", () => {
    expect(normalizeSyncEmail("  Ada @ Example.COM ")).toBe("ada@example.com");
  });

  it("normalizes phone to digits and drops a leading US country code", () => {
    expect(normalizeSyncPhone("+1 (713) 555-0100")).toBe("7135550100");
    expect(normalizeSyncPhone("713.555.0100")).toBe("7135550100");
    expect(normalizeSyncPhone("555")).toBe("");
  });

  it("maps site order statuses onto the sheet lifecycle", () => {
    expect(mapOrderStatus("new")).toBe("Pending");
    expect(mapOrderStatus("confirmed")).toBe("Booked");
    expect(mapOrderStatus("delivered_paid")).toBe("Delivered");
    expect(mapOrderStatus("cancelled")).toBe("Canceled");
    expect(mapOrderStatus("mystery")).toBe("");
  });

  it("builds the last-order label and the source stamp", () => {
    expect(lastOrderLabel("#0142", "2026-11-03")).toBe("#0142 · 2026-11-03");
    expect(sourceSyncedValue("Website", NOW)).toBe("website:2026-11-03T21:00Z");
    expect(sourceSyncedValue("HAR", NOW, "12345")).toBe("har:listing:12345");
  });

  it("pulls a city out of a single-line address and neutralizes formula text", () => {
    expect(cityFromAddressText("123 Main St, Houston, TX 77002")).toBe("Houston");
    expect(sheetText("=cmd|'/bin/sh'")).toBe("'=cmd|'/bin/sh'");
  });

  it("turns the live flag on only for the exact string true", () => {
    expect(holyGrailLive({ HOLY_GRAIL_SYNC_LIVE: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(holyGrailLive({ HOLY_GRAIL_SYNC_LIVE: "TRUE" } as NodeJS.ProcessEnv)).toBe(false);
    expect(holyGrailLive({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("Holy Grail test sources", () => {
  it("skips test, playtest, localhost, staging, sandbox, and archived test-data", () => {
    expect(isTestRecord("c1", { source: "booking_form", email: "ada@example.com" })).toBe(false);
    expect(isTestRecord("c1", { source: "latest" })).toBe(false);
    expect(isTestRecord("c1", { source: "contest" })).toBe(false);
    expect(isTestRecord("c1", { source: "test" })).toBe(true);
    expect(isTestRecord("c1", { leadSource: "playtest" })).toBe(true);
    expect(isTestRecord("c1", { email: "qa@localhost" })).toBe(true);
    expect(isTestRecord("c1", { environment: "staging" })).toBe(true);
    expect(isTestRecord("c1", { leadSource: "Cody sandbox" })).toBe(true);
    expect(isTestRecord("c1", { playtest: true, source: "booking_form" })).toBe(true);
    expect(isTestRecord("playtest-job-1", { source: "booking_form" })).toBe(true);
    expect(isTestRecord("c1", { status: "archived", source: "booking_form" })).toBe(false);
    expect(isTestRecord("c1", { status: "archived", archivedFrom: "/admin/test-data" })).toBe(true);
  });
});

describe("Holy Grail column mapping", () => {
  it("appends inbox A–H and never includes formula column I", () => {
    const planned = planHolyGrailLead(lead(), indexes([]), NOW);
    expect(planned.disposition).toBe("append");
    expect(planned.inbox && inboxRowValues(planned.inbox)).toEqual([
      "2026-11-03T21:00Z",
      "Website",
      "Ada Lovelace",
      "ada@example.com",
      "(713) 555-0100",
      "Analytical Engines",
      "Houston",
      "Order #0142",
    ]);
    expect(inboxAppendRange()).toBe(`'${HOLY_GRAIL_TABS.inbox}'!A:H`);
    expect(columnsIn(inboxAppendRange())).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(columnsIn(inboxAppendRange())).not.toContain(INBOX_FORMULA_COLUMN);
    expect(Object.keys(planned.inbox || {})).not.toContain(INBOX_FORMULA_COLUMN);
  });

  it("updates only Contacts AH, AL, AM, and AN for a known client", () => {
    const planned = planHolyGrailLead(lead({ iconicClientId: "IC-08515" }), indexes([
      row({ row: 15, clientId: "IC-08515", email: "ada@example.com", phone: "7135550100" }),
    ]), NOW);
    expect(planned.disposition).toBe("known");
    expect(planned.contactRow).toBe(15);
    expect(planned.inbox).toBeNull();
    const writes = contactWrites(planned);
    expect(writes.map((write) => write.range)).toEqual([
      `'${HOLY_GRAIL_TABS.contacts}'!AH15`,
      `'${HOLY_GRAIL_TABS.contacts}'!AN15`,
      `'${HOLY_GRAIL_TABS.contacts}'!AL15`,
      `'${HOLY_GRAIL_TABS.contacts}'!AM15`,
    ]);
    expect(writes.map((write) => write.value)).toEqual([
      "website:2026-11-03T21:00Z",
      "client-1",
      "#0142 · 2026-11-03",
      "Booked",
    ]);
    const written = writes.flatMap((write) => columnsIn(write.range));
    for (const column of CONTACTS_NEVER_WRITE_COLUMNS) {
      expect(written).not.toContain(column);
    }
    expect(written).toEqual(["AH", "AN", "AL", "AM"]);
    expect(CONTACTS_WRITE_COLUMNS).toEqual(["AH", "AL", "AM", "AN"]);
  });

  it("puts a possible-dupe flag in column J and does not update Contacts", () => {
    const planned = planHolyGrailLead(lead(), indexes([
      row({ row: 4, email: "someone@example.com", phone: "7135550100" }),
    ]), NOW);
    expect(planned.disposition).toBe("possible-dupe");
    expect(planned.action).toBe(ACTION_POSSIBLE_DUPE);
    expect(planned.flag).toBe(ACTION_POSSIBLE_DUPE);
    expect(planned.contactCells).toBeNull();
    expect(planned.inbox?.H).toContain("Possible duplicate");
  });

  it("refuses ranges outside the contract", () => {
    expect(() => assertAllowedSheetRange(inboxAppendRange())).not.toThrow();
    expect(() => assertAllowedSheetRange(`'${HOLY_GRAIL_TABS.inbox}'!J12`)).not.toThrow();
    expect(() => assertAllowedSheetRange(`'${HOLY_GRAIL_TABS.inbox}'!I2`)).toThrow(/column I/);
    expect(() => assertAllowedSheetRange(`'${HOLY_GRAIL_TABS.inbox}'!A:J`)).toThrow(/column I/);
    expect(() => assertAllowedSheetRange(`'${HOLY_GRAIL_TABS.contacts}'!AH12:AN12`)).toThrow(/column AI/);
    for (const tab of HOLY_GRAIL_NEVER_WRITE_TABS) {
      expect(() => assertAllowedSheetRange(`'${tab}'!A1`)).toThrow(/Refusing to write tab/);
    }
  });

  it("finds the Email OK header and reads suppression emails without treating row 1 as a person", () => {
    const header = Array.from({ length: 40 }, () => "");
    header[19] = "Email OK";
    expect(emailOkColumnFromHeader(header)).toBe("T");
    const contacts = buildContactIndex({
      clientIds: ["Client ID", "IC-00001", ""],
      liveStatus: ["Live Status", "Active", ""],
      emails: ["Email", "ada@example.com", ""],
      phones: ["Phone", "7135550100", ""],
      emailOk: ["Email OK", "YES", ""],
    });
    expect(contacts).toEqual([
      row({ row: 2, clientId: "IC-00001", email: "ada@example.com", phone: "7135550100", liveStatus: "Active", emailOk: "YES" }),
    ]);
    expect(suppressionFromGrid([
      ["Name", "Email", "Phone"],
      ["Ada Lovelace", "Ada@Example.com", "(713) 555-0100"],
    ])).toEqual({
      emails: ["ada@example.com"],
      phones: ["7135550100"],
      names: ["ada lovelace"],
    });
  });
});

describe("Holy Grail dedupe", () => {
  const ada = row({ row: 8, clientId: "IC-00008", email: "ada@example.com", phone: "7135550100", liveStatus: "Active", emailOk: "YES" });

  it("treats a clean email match as a known client, including when one phone is blank", () => {
    const matched = planHolyGrailLead(lead(), indexes([ada]), NOW);
    expect(matched.disposition).toBe("known");
    expect(matched.contactRow).toBe(8);
    const blankPhone = planHolyGrailLead(lead({ phone: "", phoneRaw: "" }), indexes([
      row({ ...ada, phone: "" }),
    ]), NOW);
    expect(blankPhone.disposition).toBe("known");
  });

  it("flags a single-identifier conflict and does not merge", () => {
    const differentPhone = planHolyGrailLead(lead({ phone: "2815550199", phoneRaw: "2815550199" }), indexes([ada]), NOW);
    expect(differentPhone.disposition).toBe("possible-dupe");
    expect(differentPhone.contactCells).toBeNull();

    const split = planHolyGrailLead(lead(), indexes([
      row({ row: 2, email: "ada@example.com", phone: "9995550100" }),
      row({ row: 9, email: "other@example.com", phone: "7135550100" }),
    ]), NOW);
    expect(split.disposition).toBe("possible-dupe");
    expect(split.reason).toContain("another");
    expect(split.contactCells).toBeNull();
  });

  it("never auto-merges a phone-only match", () => {
    const planned = planHolyGrailLead(lead({ email: "", key: "phone:7135550100" }), indexes([ada]), NOW);
    expect(planned.disposition).toBe("possible-dupe");
    expect(planned.action).toBe(ACTION_POSSIBLE_DUPE);
    expect(planned.contactCells).toBeNull();
  });

  it("flags suppression, DNC, and Email OK = NO without appending a new lead", () => {
    const listed = planHolyGrailLead(lead(), indexes([], { suppressionEmails: ["ada@example.com"] }), NOW);
    expect(listed.disposition).toBe("suppressed");
    expect(listed.flag).toBe(ACTION_SUPPRESSED);
    expect(listed.inbox).toBeNull();
    expect(listed.contactCells).toBeNull();

    const dnc = planHolyGrailLead(lead(), indexes([
      row({ ...ada, liveStatus: "⛔ DNC" }),
    ]), NOW);
    expect(dnc.disposition).toBe("known");
    expect(dnc.flag).toBe(ACTION_SUPPRESSED);
    expect(dnc.inbox).toBeNull();
    expect(dnc.contactCells?.AH).toBe("website:2026-11-03T21:00Z");

    const emailNo = planHolyGrailLead(lead({ phone: "", phoneRaw: "" }), indexes([
      row({ ...ada, phone: "", emailOk: "NO" }),
    ]), NOW);
    expect(emailNo.flag).toBe(ACTION_SUPPRESSED);
    expect(emailNo.inbox).toBeNull();

    const blockedPhone = planHolyGrailLead(lead({ email: "", key: "phone:7135550100" }), indexes([
      row({ ...ada, liveStatus: "⛔ DNC" }),
    ]), NOW);
    expect(blockedPhone.disposition).toBe("suppressed");
    expect(blockedPhone.inbox).toBeNull();

    const marketing = planHolyGrailLead(lead({ email: "ada@thekinkteam.com", key: "email:ada@thekinkteam.com" }), indexes([], {
      marketingSuppression: [domainBlock("thekinkteam.com")],
    }), NOW);
    expect(marketing.disposition).toBe("suppressed");
    expect(marketing.reason).toContain("marketingSuppression");
  });

  it("does not append the same inbox lead twice", () => {
    const first = planHolyGrailLead(lead(), indexes([]), NOW);
    const memory: LeadMemory = { fingerprint: first.fingerprint, inboxAppended: true, contactRow: null };
    const second = planHolyGrailLead(lead({ notes: "Order #0143", lastOrder: "#0143 · 2026-11-04" }), indexes([]), NOW, memory);
    expect(second.disposition).toBe("unchanged");
    expect(second.inbox).toBeNull();
  });
});

describe("Holy Grail change merge", () => {
  it("joins a client and an order into one website lead and drops test docs", () => {
    const leads = leadsFromChanges([
      {
        collection: "clients",
        id: "c1",
        ms: 10,
        data: {
          email: "Ada@Example.com",
          firstName: "Ada",
          lastName: "Lovelace",
          phone: "(713) 555-0100",
          company: "Analytical Engines",
          city: "Houston",
          updatedAt: 10,
        },
      },
      {
        collection: "orders",
        id: "o1",
        ms: Date.parse("2026-11-03T18:00:00.000Z"),
        data: {
          clientId: "c1",
          clientEmail: "ada@example.com",
          status: "confirmed",
          orderNumber: "#0142",
          scheduledDate: "2026-11-03",
          updatedAt: Date.parse("2026-11-03T18:00:00.000Z"),
        },
      },
      {
        collection: "orderRequests",
        id: "playtest-job-9",
        ms: 30,
        data: { email: "play@example.com", source: "playtest", status: "new" },
      },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      siteClientId: "c1",
      email: "ada@example.com",
      phone: "7135550100",
      company: "Analytical Engines",
      city: "Houston",
      source: "Website",
      orderStatus: "Booked",
      lastOrder: "#0142 · 2026-11-03",
    });
  });

  it("keeps two different emails that share a phone as separate people", () => {
    const leads = leadsFromChanges([
      { collection: "clients", id: "a", ms: 1, data: { email: "a@example.com", phone: "7135550100" } },
      { collection: "clients", id: "b", ms: 2, data: { email: "b@example.com", phone: "7135550100" } },
    ]);
    expect(leads.map((item) => item.email).sort()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("maps a HAR lead onto Source HAR and the same dedupe", () => {
    const har = leadFromHar({
      listingId: "12345",
      name: "Grace Hopper",
      email: "Grace@Navy.mil",
      phone: "2025550100",
      company: "Navy",
      city: "Arlington",
      notes: "Listing agent",
      receivedAtMs: NOW,
    });
    expect(har?.source).toBe("HAR");
    expect(har?.email).toBe("grace@navy.mil");
    const planned = planHolyGrailLead(har!, indexes([]), NOW);
    expect(planned.inbox?.B).toBe("HAR");
    expect(sourceSyncedValue("HAR", NOW, "12345")).toBe("har:listing:12345");
  });
});

describe("Holy Grail cursor", () => {
  it("skips ids already seen at the cursor millisecond and steps past a full repeated page", () => {
    const previous = { ms: 5, seenIds: ["a"] };
    const page = [
      { id: "a", ms: 5 },
      { id: "b", ms: 6 },
    ];
    const selected = selectFresh(previous, page, 40);
    expect(selected.fresh.map((doc) => doc.id)).toEqual(["b"]);
    expect(selected.next).toEqual({ ms: 6, seenIds: ["b"] });

    const stuck = selectFresh({ ms: 5, seenIds: ["a", "b"] }, [
      { id: "a", ms: 5 },
      { id: "b", ms: 5 },
    ], 2);
    expect(stuck.fresh).toEqual([]);
    expect(stuck.stalled).toBe(true);
    expect(stuck.next.ms).toBe(6);
    expect(emptyCursor(0).seenIds).toEqual([]);
  });
});

describe("Holy Grail route contract", () => {
  it("schedules the website and HAR crons and does not touch client notification flags", () => {
    const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
    expect(vercel).toContain('"/api/holy-grail/sync"');
    expect(vercel).toContain('"*/15 * * * *"');
    expect(vercel).toContain('"/api/holy-grail/har"');
    const source = [
      readFileSync(new URL("./holyGrailSync.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../server/services/holyGrailSync.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../server/services/holyGrailHar.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../server/routes/holyGrail.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(source).not.toMatch(/CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE|nodemailer|twilio|sendMail|sendSms/);
  });
});

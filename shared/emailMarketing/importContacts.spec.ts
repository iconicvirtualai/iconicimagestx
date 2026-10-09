import { describe, expect, it } from "vitest";
import { syncClientsIntoContacts } from "./contacts";
import { buildImportPlan, mapTable, parseCsv, suggestMapping } from "./importContacts";
import type { MarketingContact } from "./types";

const now = "2026-10-09T15:00:00.000Z";

describe("csv import", () => {
  it("maps columns, drops bad emails, and collapses duplicates", () => {
    const table = parseCsv(`Email,First Name,Last,Company,Tags
"ada@Example.com","Ada","Lovelace","Analytical",vip
bad-email,Grace,Hopper,Navy,agents
ada@example.com,Ada,Lovelace,Analytical Engines,"vip, austin"
,No,Email,X,
bob@example.com,Bob,Stone,Iconic,`);
    expect(suggestMapping(table.headers).Email).toBe("email");
    expect(suggestMapping(table.headers)["First Name"]).toBe("firstName");
    const plan = buildImportPlan({
      rows: mapTable(table, suggestMapping(table.headers)),
      existing: [],
      now,
      extraTags: ["import-oct"],
    });
    expect(plan.summary.invalid.map((issue) => issue.reason)).toEqual(["Invalid email", "Missing email"]);
    expect(plan.summary.duplicatesInFile).toBe(1);
    expect(plan.summary.created).toBe(2);
    const ada = plan.upserts.find((contact) => contact.email === "ada@example.com");
    expect(ada?.tags).toEqual(["vip", "import-oct", "austin"]);
    expect(ada?.company).toBe("Analytical Engines");
    expect(ada?.emailVerified).toBe(false);
  });

  it("updates an existing contact without forking a second record", () => {
    const existing: MarketingContact = {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "",
      phone: "",
      tags: ["customer"],
      custom: {},
      source: "client",
      clientId: "c1",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    };
    const table = parseCsv("email,company\nada@example.com,New Co");
    const plan = buildImportPlan({
      rows: mapTable(table, suggestMapping(table.headers)),
      existing: [existing],
      now,
    });
    expect(plan.summary.created).toBe(0);
    expect(plan.summary.updated).toBe(1);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0].clientId).toBe("c1");
    expect(plan.upserts[0].emailVerified).toBe(true);
    expect(plan.upserts[0].tags).toContain("customer");
    expect(plan.upserts[0].company).toBe("New Co");
  });
});

describe("customer sync", () => {
  it("links a client onto the imported contact with the same email", () => {
    const imported: MarketingContact = {
      email: "ada@example.com",
      firstName: "A",
      lastName: "",
      company: "",
      phone: "",
      tags: ["vip"],
      custom: {},
      source: "import",
      clientId: "",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    };
    const result = syncClientsIntoContacts([imported], [{
      id: "client-1",
      email: "Ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "281-555-0100",
      company: "Iconic",
    }], now);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].clientId).toBe("client-1");
    expect(result.contacts[0].firstName).toBe("Ada");
    expect(result.contacts[0].tags).toEqual(["vip"]);
    expect(result.contacts[0].emailVerified).toBe(true);
    expect(result.created).toBe(0);
  });

  it("moves the contact when the customer email changes", () => {
    const linked: MarketingContact = {
      email: "old@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "",
      phone: "",
      tags: ["vip"],
      custom: {},
      source: "client",
      clientId: "client-1",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    };
    const result = syncClientsIntoContacts([linked], [{
      id: "client-1",
      email: "new@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "",
      company: "",
    }], now);
    expect(result.relinked).toBe(1);
    expect(result.contacts.map((contact) => contact.email)).toEqual(["new@example.com"]);
    expect(result.contacts[0].tags).toEqual(["vip"]);
  });
});

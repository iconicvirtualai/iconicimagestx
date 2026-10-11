import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clientInvoiceUrl } from "../shared/invoicePayLink";
import {
  fixtureAllocator,
  fixtureMigrationInput,
  formatInvoiceMigrationPlan,
  needsInvoiceRename,
  planInvoiceIdMigration,
} from "./migrate-invoice-ids";

const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const cwd = fileURLToPath(new URL("..", import.meta.url));

function run(args: string[]) {
  return spawnSync(tsx, ["scripts/migrate-invoice-ids.ts", ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("invoice id migration plan", () => {
  it("renames derived ids, adds missing tokens, and leaves tokenized auto-ids alone", () => {
    const actions = planInvoiceIdMigration(fixtureMigrationInput(), fixtureAllocator());
    const byId = new Map(actions.map((action) => [action.fromId, action]));
    expect(needsInvoiceRename("listing_studio1")).toBe(true);
    expect(needsInvoiceRename("playtest-delivery-qa-invoice")).toBe(false);

    const listing = byId.get("listing_studio1");
    expect(listing?.action).toBe("rename");
    expect(listing?.toId).toBe("Mig00000000000000001");
    expect(listing?.tombstone).toBe(true);
    expect(listing?.squareFields).toEqual(["squareOrderId", "squarePaymentLinkId"]);
    expect(listing?.links.map((link) => `${link.collection}/${link.id}`)).toEqual([
      "listings/studio1",
      "galleries/gal-1",
      "orders/order-1",
    ]);
    expect(listing?.paymentUrl).toBe(clientInvoiceUrl({
      id: listing?.toId,
      payToken: listing?.payToken,
      status: "sent",
    }));
    expect(listing?.paymentUrl).toContain("?t=");
    expect(listing?.paymentUrl).not.toMatch(/\/invoice\/listing_/);

    expect(byId.get("ordreq_req1")?.action).toBe("rename");
    expect(byId.get("playtest-invoice-client1")?.action).toBe("rename");
    expect(byId.get("AbCdEfGhIjKlMnOpQrSt")?.action).toBe("add-token");
    expect(byId.get("AbCdEfGhIjKlMnOpQrSt")?.toId).toBe("AbCdEfGhIjKlMnOpQrSt");
    expect(byId.get("AbCdEfGhIjKlMnOpQrSt")?.note).toMatch(/emailed without the token/);
    expect(byId.get("playtest-delivery-qa-invoice")?.action).toBe("add-token");
    expect(byId.get("playtest-delivery-qa-invoice")?.toId).toBe("playtest-delivery-qa-invoice");
    expect(byId.get("ZzYyXxWwVvUuTtSsRrQq")?.action).toBe("unchanged");

    const printed = formatInvoiceMigrationPlan(actions, "built-in fixture. Firestore was not read.");
    expect(printed).toContain("DRY RUN");
    expect(printed).toContain("tombstone");
    expect(printed).not.toContain("ada@example.com");
    expect(printed).not.toContain("512-555-0100");
    expect(printed).not.toContain("lockbox");
  });

  it("prints the fixture plan and refuses every write flag", () => {
    const fixture = run(["--fixture"]);
    expect(fixture.status).toBe(0);
    expect(fixture.stdout).toContain("listing_studio1 -> Mig00000000000000001");
    expect(fixture.stdout).toContain("Nothing was written");
    expect(fixture.stdout).not.toContain("ada@example.com");

    const write = run(["--write"]);
    expect(write.status).toBe(1);
    expect(`${write.stderr}`).toContain("Refusing --write without --i-understand");
    expect(write.stdout).not.toContain("Mig");

    const understood = run(["--write", "--i-understand"]);
    expect(understood.status).toBe(1);
    expect(`${understood.stderr}`).toContain("Dry run is the only implemented mode");
    expect(understood.stdout).not.toContain("Wrote");
  });
});

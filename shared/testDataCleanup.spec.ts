import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  applyTestDataCleanup,
  classifyTestData,
  formatCleanupPlainList,
  parseCleanupArgs,
  unarchiveTestData,
  type CleanupRecord,
} from "./testDataCleanup";

const REAL: CleanupRecord = {
  collection: "orders",
  id: "real-1",
  data: { orderNumber: "#180", clientName: "Jane Agent", clientEmail: "jane@brokerage.com", total: 249, clientId: "client-jane" },
};

const KNOWN: CleanupRecord = {
  collection: "orders",
  id: "order-149",
  data: {
    orderNumber: "#149",
    clientName: "QA",
    clientId: "client-real",
    calendarEventId: "evt-149",
    calendarId: "cal-1",
    squareInvoiceId: "sq-inv-149",
  },
};

const INVOICE: CleanupRecord = {
  collection: "invoices",
  id: "inv-149",
  data: { orderId: "order-149", invoiceNumber: "INV-149", total: 10, squareInvoiceId: "sq-inv-149" },
};

const JOB: CleanupRecord = {
  collection: "editJobs",
  id: "job-1",
  data: { listingId: "listing-149", status: "pending" },
};

const LISTING: CleanupRecord = {
  collection: "listings",
  id: "listing-149",
  data: { orderId: "order-149", title: "123 Test skipped" },
};

const CLIENT: CleanupRecord = {
  collection: "clients",
  id: "client-real",
  data: { email: "jane@brokerage.com", firstName: "Jane" },
};

const PLAYTEST: CleanupRecord = {
  collection: "orders",
  id: "playtest-delivery-qa-order",
  data: { playtest: true, clientEmail: "ops+deliveryqa@iconicimagestx.com" },
};

const BORDER: CleanupRecord = {
  collection: "orders",
  id: "maybe",
  data: { orderNumber: "#181", clientName: "Test Person", clientEmail: "test.person@brokerage.com" },
};

function world(): CleanupRecord[] {
  return [REAL, KNOWN, INVOICE, LISTING, JOB, CLIENT, PLAYTEST, BORDER];
}

describe("test data cleanup", () => {
  it("dry run lists clear matches and leaves borderline records for a human", () => {
    const report = classifyTestData(world());
    const ids = report.matched.map((row) => `${row.collection}/${row.id}`);
    expect(ids).toContain("orders/order-149");
    expect(ids).toContain("orders/playtest-delivery-qa-order");
    expect(ids).toContain("invoices/inv-149");
    expect(ids).toContain("listings/listing-149");
    expect(ids).toContain("editJobs/job-1");
    expect(ids).not.toContain("orders/real-1");
    expect(ids).not.toContain("orders/maybe");
    expect(ids).not.toContain("clients/client-real");
    expect(report.borderline.map((row) => row.id)).toContain("maybe");
    expect(report.borderline.map((row) => row.id)).toContain("client-real");
    expect(report.archiveRecords.map((row) => row.id)).not.toContain("client-real");
    expect(report.backupRecords.map((row) => row.id)).toContain("client-real");
    expect(report.squareInvoices.map((row) => row.squareInvoiceId)).toContain("sq-inv-149");

    const plain = formatCleanupPlainList(report);
    expect(plain).toContain("collection\tid\tlabel\treason");
    expect(plain).toContain("orders\torder-149\t#149\tknown test order #149");
    expect(plain).toContain("needs a human look");
    expect(plain).toContain("orders\tmaybe\t");
    expect(plain).not.toContain("orders\treal-1");
  });

  it("matches the known order numbers, seeds, flags, and test domains only", () => {
    const report = classifyTestData([
      { collection: "orders", id: "a", data: { orderNumber: "ORD-L-74499" } },
      { collection: "orders", id: "b", data: { orderNumber: "ORD-L-00000" } },
      { collection: "orders", id: "c", data: { orderNumber: "#155" } },
      { collection: "orders", id: "d", data: { orderNumber: "#160" } },
      { collection: "orders", id: "e", data: { orderNumber: "#161" } },
      { collection: "orders", id: "f", data: { orderNumber: "#162" } },
      { collection: "orders", id: "g", data: { orderNumber: "#169" } },
      { collection: "orders", id: "h", data: { orderNumber: "#170" } },
      { collection: "orders", id: "near", data: { orderNumber: "#1490" } },
      { collection: "clients", id: "seed-delivery-qa", data: { email: "person@gmail.com" } },
      { collection: "clients", id: "qa-mail", data: { qaOnly: true, email: "ops@iconicimagestx.com" } },
      { collection: "clients", id: "example", data: { email: "fake@example.com" } },
      { collection: "orders", id: "phone", data: { clientPhone: "5125550149", clientName: "Real Buyer" } },
    ]);
    const matched = report.matched.map((row) => row.id).sort();
    expect(matched).toEqual(["a", "b", "c", "d", "e", "example", "f", "g", "h", "qa-mail", "seed-delivery-qa"]);
    expect(report.matched.map((row) => row.id)).not.toContain("near");
    expect(report.matched.map((row) => row.id)).not.toContain("phone");
  });

  it("refuses to archive when the backup write fails", async () => {
    const updates: string[] = [];
    const result = await applyTestDataCleanup({
      records: world(),
      actor: "office@iconicimagestx.com",
      runId: "cleanup-test",
      writeBackup: async () => {
        throw new Error("firestore rejected the backup");
      },
      update: async (collection, id) => {
        updates.push(`${collection}/${id}`);
      },
      removeHold: vi.fn(),
    });
    expect(result.applied).toBe(false);
    expect(result.error).toMatch(/backup/i);
    expect(updates).toEqual([]);
    expect(result.notificationsSent).toEqual([]);
  });

  it("archives only after the backup, cancels holds silently, and restores from that backup", async () => {
    const backups: unknown[] = [];
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const holds: unknown[] = [];
    const notify = vi.fn();
    const result = await applyTestDataCleanup({
      records: world(),
      actor: "office@iconicimagestx.com",
      now: "2026-11-02T23:30:00.000Z",
      runId: "cleanup-run",
      writeBackup: async (backup) => {
        backups.push(backup);
      },
      update: async (_collection, id, patch) => {
        updates.push({ id, patch });
      },
      removeHold: async (hold) => {
        holds.push(hold);
      },
    });
    expect(result.applied).toBe(true);
    expect(backups).toHaveLength(1);
    expect(updates.map((row) => row.id).sort()).toEqual(["inv-149", "job-1", "listing-149", "order-149", "playtest-delivery-qa-order"]);
    expect(updates.find((row) => row.id === "order-149")?.patch).toMatchObject({
      status: "cancelled",
      archivedAt: "2026-11-02T23:30:00.000Z",
      archivedBy: "office@iconicimagestx.com",
      testData: true,
      calendarHold: "cancelled",
    });
    expect(updates.find((row) => row.id === "listing-149")?.patch.status).toBe("archived");
    expect(holds).toEqual([{ calendarId: "cal-1", eventId: "evt-149", sendUpdates: "none" }]);
    expect(result.squareInvoices[0].squareInvoiceId).toBe("sq-inv-149");
    expect(result.notificationsSent).toEqual([]);
    expect(notify).not.toHaveBeenCalled();

    const replaced: Array<{ id: string; data: Record<string, unknown> }> = [];
    const restored = await unarchiveTestData({
      backup: backups[0] as { runId: string; createdAt: string; createdBy: string; records: Array<{ collection: string; id: string; data: Record<string, unknown> }>; squareInvoices: [] },
      replace: async (_collection, id, data) => {
        replaced.push({ id, data });
      },
    });
    expect(restored.notificationsSent).toEqual([]);
    expect(replaced.find((row) => row.id === "order-149")?.data.orderNumber).toBe("#149");
    expect(replaced.find((row) => row.id === "order-149")?.data.testData).toBeUndefined();
  });

  it("does not import a mail, sms, or Square client", () => {
    const source = readFileSync(new URL("./testDataCleanup.ts", import.meta.url), "utf8");
    const runner = readFileSync(new URL("../server/services/testDataCleanupRun.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../server/routes/testDataCleanup.ts", import.meta.url), "utf8");
    for (const file of [source, runner, route]) {
      expect(file).not.toMatch(/nodemailer|twilio|sendEmail|sendSMS|square\.invoices|invoicesApi/);
    }
    expect(runner).toContain('sendUpdates: "none"');
    expect(parseCleanupArgs([])).toEqual({ apply: false, unarchive: null, unknown: [] });
    expect(parseCleanupArgs(["--apply"]).apply).toBe(true);
    expect(parseCleanupArgs(["--unarchive", "cleanup-1"]).unarchive).toBe("cleanup-1");
  });
});

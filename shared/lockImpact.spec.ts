import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assessLockImpact,
  formatLockImpactReport,
  lockImpactFixtureScan,
  narrowStalePaidCopy,
  oldStudioDownloadsUnlocked,
  strictStudioDownloadsUnlocked,
  studioDownloadsUnlocked,
  type LockImpactSubject,
} from "./lockImpact";

function subject(id: string): LockImpactSubject {
  const scan = lockImpactFixtureScan();
  const listing = scan.listings.find((doc) => doc.id === id) || null;
  const galleries = scan.galleries.filter((doc) => doc.listingId === id);
  const invoiceId = listing?.invoiceId;
  const invoice = scan.invoices.find((doc) => doc.id === invoiceId) || null;
  return { listing, galleries, invoice };
}

describe("lock impact", () => {
  it("keeps staff signals and the stale paid copy unlocked, and locks a real unpaid job", () => {
    const missingInvoice = subject("listing-staff-paid");
    expect(oldStudioDownloadsUnlocked(missingInvoice)).toBe(true);
    expect(strictStudioDownloadsUnlocked(missingInvoice)).toBe(false);
    expect(studioDownloadsUnlocked(missingInvoice)).toBe(true);
    expect(narrowStalePaidCopy(missingInvoice)).toBe(false);

    const stale = subject("listing-pagemill");
    expect(oldStudioDownloadsUnlocked(stale)).toBe(false);
    expect(strictStudioDownloadsUnlocked(stale)).toBe(false);
    expect(studioDownloadsUnlocked(stale)).toBe(true);
    expect(narrowStalePaidCopy(stale)).toBe(true);

    const flagged = subject("listing-payment-status");
    expect(narrowStalePaidCopy(flagged)).toBe(true);
    expect(studioDownloadsUnlocked(flagged)).toBe(true);

    const unpaid = subject("listing-unpaid");
    expect(oldStudioDownloadsUnlocked(unpaid)).toBe(false);
    expect(strictStudioDownloadsUnlocked(unpaid)).toBe(false);
    expect(studioDownloadsUnlocked(unpaid)).toBe(false);
    expect(narrowStalePaidCopy(unpaid)).toBe(false);

    const released = subject("listing-released");
    expect(oldStudioDownloadsUnlocked(released)).toBe(true);
    expect(strictStudioDownloadsUnlocked(released)).toBe(true);
    expect(studioDownloadsUnlocked(released)).toBe(true);
    expect(narrowStalePaidCopy(released)).toBe(false);

    const settled = subject("listing-settled");
    expect(strictStudioDownloadsUnlocked(settled)).toBe(true);
    expect(studioDownloadsUnlocked(settled)).toBe(true);
  });

  it("prints the fixture impact without a write path", () => {
    const report = assessLockImpact(lockImpactFixtureScan());
    expect(report.scannedListings).toBe(8);
    expect(report.scannedGalleries).toBe(6);
    expect(report.skippedPlaytestListings).toBe(1);
    expect(report.skippedPlaytestGalleries).toBe(1);
    expect(report.runtimeNewlyLocked).toBe(0);
    expect(report.strictWouldLock.map((row) => row.listingId)).toEqual([
      "listing-blank-status",
      "listing-staff-paid",
    ]);
    expect(report.needsReview.map((row) => row.listingId)).toEqual([
      "listing-pagemill",
      "listing-payment-status",
    ]);
    expect(report.staffPaymentSignal.map((row) => row.listingId)).toEqual(["listing-comped-flag"]);

    const stale = report.needsReview.find((row) => row.listingId === "listing-pagemill");
    expect(stale).toMatchObject({
      galleryId: "gallery-pagemill",
      address: "20 Pagemill Rd",
      clientName: "Cam Stale",
      invoiceId: "inv-pagemill",
      invoiceStatus: "sent",
      amountPaid: "0",
      amountDue: "450",
      oldUnlockFields: "(none)",
      stalePaidFields: "listing.invoiceStatus=paid",
      disposition: "needs review, kept unlocked",
    });
    const copied = report.strictWouldLock.find((row) => row.listingId === "listing-staff-paid");
    expect(copied).toMatchObject({
      galleryId: "gallery-staff-paid",
      address: "10 Oak St",
      clientName: "Ada Paid",
      invoiceId: "missing-invoice",
      invoiceStatus: "(none)",
      amountPaid: "(none)",
      amountDue: "(none)",
      oldUnlockFields: "listing.invoiceStatus=paid",
      disposition: "kept unlocked by safety net",
    });

    const printed = formatLockImpactReport(lockImpactFixtureScan(), "fixtures");
    expect(printed).toContain("Firebase project: fixtures");
    expect(printed).toContain("No documents were written.");
    expect(printed).toContain("Runtime newly locked: 0");
    expect(printed).toContain("Old rule unlocked, strict invoice rule would lock: 2");
    expect(printed).toContain("Needs review, kept unlocked: 2");
    expect(printed).not.toContain("playtest-delivery-qa");
    expect(printed).not.toContain("listing-unpaid");
    expect(printed).not.toContain("listing-settled");
    expect(printed).not.toContain("listing-released");
    expect(printed).not.toContain("gallery-orphan");
    expect(printed).not.toContain("gallery-download-only");

    const source = readFileSync(new URL("../scripts/report-lock-impact.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.(set|update|delete|create)\s*\(/);
    expect(source).not.toMatch(/\bbatch\s*\(/);
    expect(source).not.toMatch(/\bcommit\s*\(/);
    expect(source).not.toMatch(/writeBatch/);
    expect(source).not.toMatch(/FieldValue/);
    expect(readFileSync(new URL("./lockImpact.ts", import.meta.url), "utf8")).not.toContain("firebase");
  });

  it("runs the fixture report without reading Firebase", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/report-lock-impact.ts", "--fixtures"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        env: {
          ...process.env,
          FIREBASE_SERVICE_ACCOUNT: "not-json",
          GOOGLE_APPLICATION_CREDENTIALS: "",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(formatLockImpactReport(lockImpactFixtureScan(), "fixtures"));
    expect(result.stderr).not.toContain("not-json");
  });
});

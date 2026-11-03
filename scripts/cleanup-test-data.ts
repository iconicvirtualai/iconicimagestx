/**
 * Scan Firestore for test and fake records.
 *
 *   pnpm cleanup:test-data
 *   pnpm cleanup:test-data -- --apply
 *   pnpm cleanup:test-data -- --unarchive cleanup-xxxxx
 *
 * Dry run is the default. It prints a pasteable list and writes nothing.
 * --apply writes cleanupBackups/{runId} first. If that write fails, nothing
 * is archived. Archive sets status cancelled or archived, archivedAt,
 * archivedBy, and testData. It does not hard-delete.
 * No email, SMS, Square cancel, or client notice is sent.
 * Square invoice ids are printed so staff can void them by hand.
 */

import { parseCleanupArgs } from "../shared/testDataCleanup.ts";
import {
  applyTestData,
  dryRunTestData,
  unarchiveTestDataRun,
} from "../server/services/testDataCleanupRun.ts";

const parsed = parseCleanupArgs(process.argv.slice(2));

if (parsed.unknown.length > 0) {
  console.error(`Unknown argument: ${parsed.unknown.join(" ")}. Dry run is the default. Flags are --apply and --unarchive <runId>.`);
  process.exit(2);
}

if (parsed.apply && parsed.unarchive) {
  console.error("Pass either --apply or --unarchive, not both.");
  process.exit(2);
}

const isDirect = process.argv[1]?.includes("cleanup-test-data");
if (isDirect) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

async function main() {
  if (parsed.unarchive) {
    const result = await unarchiveTestDataRun(parsed.unarchive);
    if (!result) {
      console.error(`No backup named ${parsed.unarchive}.`);
      process.exit(1);
    }
    console.log(`Restored ${result.restored.length} records from ${result.runId}.`);
    console.log("No email, SMS, Square notification, or client notice was sent.");
    return;
  }

  if (!parsed.apply) {
    const report = await dryRunTestData();
    process.stdout.write(report.plainList);
    console.log(`Dry run only. ${report.matched.length} clear matches, ${report.borderline.length} need a human look, ${report.archiveCount} would be archived.`);
    console.log("Nothing was written. Re-run with --apply after Cody checks this list.");
    return;
  }

  const result = await applyTestData("cli");
  if (!result.applied) {
    console.error(result.error || "Backup failed. Nothing was archived.");
    process.exit(1);
  }
  process.stdout.write(result.plainList);
  console.log(`Applied ${result.runId}. Backup: ${result.location}. Archived ${result.archived.length}.`);
  if (result.squareInvoices.length) {
    console.log("Void these Square invoices by hand. This script did not call Square.");
    for (const note of result.squareInvoices) console.log(`- ${note.squareInvoiceId} (${note.collection}/${note.id})`);
  }
  if (result.holdErrors.length) {
    console.log("Calendar holds that still need a hand:");
    for (const error of result.holdErrors) console.log(`- ${error}`);
  }
  console.log("No email, SMS, Square notification, or client notice was sent.");
}

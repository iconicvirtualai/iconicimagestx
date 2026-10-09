/**
 * Backfill for an existing order whose package line is missing.
 * Persists the repaired lines only. Does not send the office email.
 */

import { planOrderPackageRepair, type OrderPackageRepair } from "../../shared/orderPackageRepair";

export async function runOrderPackageBackfill(
  record: Record<string, unknown>,
  write: (patch: OrderPackageRepair) => Promise<void>,
): Promise<{ updated: boolean }> {
  const plan = planOrderPackageRepair(record);
  if (!plan) return { updated: false };
  await write(plan);
  return { updated: true };
}

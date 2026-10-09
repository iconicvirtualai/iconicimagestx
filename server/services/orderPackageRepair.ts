/**
 * Backfill for an existing order whose package line is missing.
 * Writes the missing line items only. Does not change prices or send the office email.
 */

import { planOrderPackageRepair, type OrderPackageRepair } from "../../shared/orderPackageRepair";

export async function runOrderPackageBackfill(
  record: Record<string, unknown>,
  write: (patch: OrderPackageRepair) => Promise<void>,
): Promise<{ updated: boolean }> {
  const plan = planOrderPackageRepair(record);
  if (!plan) return { updated: false };
  await write({
    lineItems: plan.lineItems,
    services: plan.services,
  });
  return { updated: true };
}

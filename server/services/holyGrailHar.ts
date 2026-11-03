/**
 * HAR listing-agent feed.
 *
 * The public ingest that doorsopentour PR #6 added is not in this repo.
 * iconicimagestx has no HAR client, no HAR credentials, and no listing-agent
 * feed module. This stub keeps the daily cron from scraping or inventing leads.
 * Website sync does not depend on it.
 *
 * A later adapter can return HarLeadInput rows. runHolyGrailHar already runs
 * those through the same dedupe and inbox writer with Source = HAR.
 */

import type { HarLeadInput } from "../../shared/holyGrailSync";

export const HAR_STUB_REASON = "HAR ingest is not implemented in iconicimagestx. The public HAR feed lives in the doorsopentour repo (PR #6), which is not part of this codebase, and this repo has no HAR client, credentials, or listing-agent feed. The daily cron is a stub and does not scrape or invent leads.";

export interface HarFetchResult {
  stub: boolean;
  reason: string;
  leads: HarLeadInput[];
}

export async function fetchHarLeads(): Promise<HarFetchResult> {
  return { stub: true, reason: HAR_STUB_REASON, leads: [] };
}

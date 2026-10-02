/**
 * One order edit per request.
 * OpenAI image edits abort at 45s and the host function is about 60s,
 * so a full gallery cannot run inside one HTTP call. Callers advance
 * one claimable job, then follow up while runnable work remains.
 */

export const ORDER_EDIT_RUN_PER_REQUEST = 1;
export const ORDER_EDIT_STALE_MS = 3 * 60 * 1000;

export interface OrderQueueJob {
  id: string;
  origin?: string;
  status?: string;
  type?: string;
  sourcePath?: string;
  updatedAtMs?: number | null;
}

export function orderEditClaimable(
  job: { status?: string; updatedAtMs?: number | null },
  now = Date.now(),
): boolean {
  if (job.status === "pending") return true;
  if (job.status !== "processing") return false;
  if (job.updatedAtMs == null) return false;
  return now - job.updatedAtMs >= ORDER_EDIT_STALE_MS;
}

/** Twilight slots first, then listing photos. Jobs without a source stay waiting. */
export function runnableOrderEdits(jobs: OrderQueueJob[], now = Date.now()): OrderQueueJob[] {
  return jobs
    .filter((job) => job.origin === "order" && Boolean(job.sourcePath) && orderEditClaimable(job, now))
    .sort((a, b) => {
      const rank = (job: OrderQueueJob) => (job.type === "twilight" ? 0 : 1);
      return rank(a) - rank(b);
    });
}

export function orderQueueAdvancePlan(jobs: OrderQueueJob[], now = Date.now()) {
  const runnable = runnableOrderEdits(jobs, now);
  const next = runnable[0] || null;
  const remainingAfter = next ? Math.max(0, runnable.length - ORDER_EDIT_RUN_PER_REQUEST) : 0;
  return {
    nextId: next?.id || null,
    runnable: runnable.length,
    remainingAfter,
    shouldFollowUp: remainingAfter > 0,
    perRequest: ORDER_EDIT_RUN_PER_REQUEST,
  };
}

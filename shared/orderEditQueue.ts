/**
 * One order edit per request.
 * OpenAI image edits abort at 45s and the host function is about 60s,
 * so a full gallery cannot run inside one HTTP call.
 *
 * Each listing runs one test photo, then pauses until that photo is approved.
 * After that, a batch is at most 25 photos, then the queue pauses until
 * staff continue. A pause never follows itself into the next photo.
 */

export const ORDER_EDIT_RUN_PER_REQUEST = 1;
export const ORDER_EDIT_STALE_MS = 3 * 60 * 1000;
export const ORDER_EDIT_BATCH_LIMIT = 25;

export type StudioQueuePause = "awaiting_test_approval" | "awaiting_batch_review";

export interface StudioEditQueueState {
  pause: StudioQueuePause | null;
  testApproved: boolean;
  batchProcessed: number;
  testJobId: string | null;
}

export const IDLE_STUDIO_EDIT_QUEUE: StudioEditQueueState = {
  pause: null,
  testApproved: false,
  batchProcessed: 0,
  testJobId: null,
};

export interface OrderQueueJob {
  id: string;
  origin?: string;
  status?: string;
  type?: string;
  sourcePath?: string;
  updatedAtMs?: number | null;
}

export interface OrderQueueAdvance {
  nextId: string | null;
  runnable: number;
  remainingAfter: number;
  shouldFollowUp: boolean;
  perRequest: number;
  /** Pause already stored. While set, nothing runs. */
  pause: StudioQueuePause | null;
  /** Pause to store when this run is claimed. */
  pauseAfter: StudioQueuePause | null;
  batchProcessedAfter: number;
}

export function readStudioEditQueue(value: unknown): StudioEditQueueState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pause = row.pause === "awaiting_test_approval" || row.pause === "awaiting_batch_review"
    ? row.pause
    : null;
  const batch = Number(row.batchProcessed);
  const testJobId = typeof row.testJobId === "string" && row.testJobId.trim() ? row.testJobId.trim() : null;
  return {
    pause,
    testApproved: row.testApproved === true,
    batchProcessed: Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 0,
    testJobId,
  };
}

export function studioQueuePauseCopy(pause: StudioQueuePause | null): string {
  if (pause === "awaiting_test_approval") {
    return "Test photo is in review. The queue is paused until that photo is approved.";
  }
  if (pause === "awaiting_batch_review") {
    return "This batch is paused after 25 photos. Continue when you want the next batch.";
  }
  return "";
}

/** A paused listing is not a kick target. Clearing the pause is a staff action. */
export function listingQueueAcceptsKick(queue: { pause: StudioQueuePause | null }): boolean {
  return queue.pause == null;
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

export function orderQueueAdvancePlan(
  jobs: OrderQueueJob[],
  now = Date.now(),
  queue: StudioEditQueueState = IDLE_STUDIO_EDIT_QUEUE,
  onlyId?: string,
): OrderQueueAdvance {
  let runnable = runnableOrderEdits(jobs, now);
  if (onlyId) runnable = runnable.filter((job) => job.id === onlyId);
  const held = queue.pause
    ? {
      nextId: null,
      runnable: runnable.length,
      remainingAfter: 0,
      shouldFollowUp: false,
      perRequest: ORDER_EDIT_RUN_PER_REQUEST,
      pause: queue.pause,
      pauseAfter: queue.pause,
      batchProcessedAfter: queue.batchProcessed,
    }
    : null;
  if (held) return held;

  if (!queue.testApproved) {
    const next = runnable[0] || null;
    return {
      nextId: next?.id || null,
      runnable: runnable.length,
      remainingAfter: 0,
      shouldFollowUp: false,
      perRequest: ORDER_EDIT_RUN_PER_REQUEST,
      pause: null,
      pauseAfter: next ? "awaiting_test_approval" : null,
      batchProcessedAfter: 0,
    };
  }

  const processed = queue.batchProcessed;
  if (processed >= ORDER_EDIT_BATCH_LIMIT) {
    return {
      nextId: null,
      runnable: runnable.length,
      remainingAfter: 0,
      shouldFollowUp: false,
      perRequest: ORDER_EDIT_RUN_PER_REQUEST,
      pause: null,
      pauseAfter: runnable.length > 0 ? "awaiting_batch_review" : null,
      batchProcessedAfter: processed,
    };
  }

  const next = runnable[0] || null;
  if (!next) {
    return {
      nextId: null,
      runnable: 0,
      remainingAfter: 0,
      shouldFollowUp: false,
      perRequest: ORDER_EDIT_RUN_PER_REQUEST,
      pause: null,
      pauseAfter: null,
      batchProcessedAfter: processed,
    };
  }

  const processedAfter = processed + 1;
  const others = runnable.length - 1;
  const hitCap = processedAfter >= ORDER_EDIT_BATCH_LIMIT && others > 0;
  return {
    nextId: next.id,
    runnable: runnable.length,
    remainingAfter: hitCap ? 0 : others,
    shouldFollowUp: others > 0 && !hitCap,
    perRequest: ORDER_EDIT_RUN_PER_REQUEST,
    pause: null,
    pauseAfter: hitCap ? "awaiting_batch_review" : null,
    batchProcessedAfter: processedAfter,
  };
}

export function queueStateAfterRun(
  queue: StudioEditQueueState,
  plan: Pick<OrderQueueAdvance, "pauseAfter" | "batchProcessedAfter">,
  jobId: string,
): StudioEditQueueState {
  if (!queue.testApproved) {
    return {
      pause: "awaiting_test_approval",
      testApproved: false,
      batchProcessed: 0,
      testJobId: jobId,
    };
  }
  return {
    pause: plan.pauseAfter,
    testApproved: true,
    batchProcessed: plan.batchProcessedAfter,
    testJobId: queue.testJobId,
  };
}

/** Approving the test photo is what lets the first batch start. */
export function unblockQueueAfterTestApproval(queue: StudioEditQueueState): StudioEditQueueState {
  return {
    pause: null,
    testApproved: true,
    batchProcessed: 0,
    testJobId: queue.testJobId,
  };
}

export function continueStudioEditQueue(
  queue: StudioEditQueueState,
): { ok: true; queue: StudioEditQueueState } | { ok: false; error: string } {
  if (queue.pause === "awaiting_test_approval" || !queue.testApproved) {
    return { ok: false, error: "Approve the test photo before the queue can continue." };
  }
  if (queue.pause === "awaiting_batch_review") {
    return {
      ok: true,
      queue: {
        pause: null,
        testApproved: true,
        batchProcessed: 0,
        testJobId: queue.testJobId,
      },
    };
  }
  return { ok: true, queue: { ...queue, pause: null } };
}

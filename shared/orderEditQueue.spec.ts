import { describe, expect, it } from "vitest";
import {
  ORDER_EDIT_BATCH_LIMIT,
  ORDER_EDIT_RUN_PER_REQUEST,
  ORDER_EDIT_STALE_MS,
  continueStudioEditQueue,
  listingQueueAcceptsKick,
  orderEditClaimable,
  orderQueueAdvancePlan,
  queueStateAfterRun,
  readStudioEditQueue,
  runnableOrderEdits,
  studioQueuePauseCopy,
  unblockQueueAfterTestApproval,
  type OrderQueueJob,
  type StudioEditQueueState,
} from "./orderEditQueue";

const now = 1_700_000_000_000;

function job(partial: Partial<OrderQueueJob> & { id: string }): OrderQueueJob {
  return {
    origin: "order",
    status: "pending",
    type: "photo",
    sourcePath: `listings/job123456/photos/${partial.id}.jpg`,
    updatedAtMs: now,
    ...partial,
  };
}

const batchOpen: StudioEditQueueState = {
  pause: null,
  testApproved: true,
  batchProcessed: 0,
  testJobId: "test-photo",
};

describe("order edit auto-queue", () => {
  it("advances one twilight before photos and follows up only after the test is approved", () => {
    const jobs = [
      job({ id: "photo-a", type: "photo" }),
      job({ id: "twilight-front", type: "twilight" }),
      job({ id: "photo-b", type: "photo" }),
      job({ id: "waiting", type: "twilight", sourcePath: "" }),
      job({ id: "review", status: "review" }),
      job({ id: "failed", status: "failed" }),
      job({ id: "staff", origin: "staff_override", status: "pending" }),
    ];
    const first = orderQueueAdvancePlan(jobs, now);
    expect(ORDER_EDIT_RUN_PER_REQUEST).toBe(1);
    expect(ORDER_EDIT_BATCH_LIMIT).toBe(25);
    expect(first.nextId).toBe("twilight-front");
    expect(first.shouldFollowUp).toBe(false);
    expect(first.pauseAfter).toBe("awaiting_test_approval");
    const plan = orderQueueAdvancePlan(jobs, now, batchOpen);
    expect(plan.nextId).toBe("twilight-front");
    expect(plan.runnable).toBe(3);
    expect(plan.remainingAfter).toBe(2);
    expect(plan.shouldFollowUp).toBe(true);
    expect(plan.perRequest).toBe(1);
    expect(runnableOrderEdits(jobs, now).map((item) => item.id)).toEqual([
      "twilight-front",
      "photo-a",
      "photo-b",
    ]);
  });

  it("stops when the last runnable photo is the one that would run", () => {
    const plan = orderQueueAdvancePlan([job({ id: "only" })], now, batchOpen);
    expect(plan.nextId).toBe("only");
    expect(plan.remainingAfter).toBe(0);
    expect(plan.shouldFollowUp).toBe(false);
    expect(plan.pauseAfter).toBeNull();
  });

  it("runs one test photo, pauses, then a batch of 25, then continues", () => {
    let queue = readStudioEditQueue(undefined);
    let jobs = [
      job({ id: "twilight", type: "twilight" }),
      job({ id: "failed", status: "failed" }),
      ...Array.from({ length: 29 }, (_, index) => job({ id: `photo-${index}` })),
    ];
    expect(queue.testApproved).toBe(false);

    let plan = orderQueueAdvancePlan(jobs, now, queue);
    expect(plan.nextId).toBe("twilight");
    expect(plan.shouldFollowUp).toBe(false);
    expect(plan.pauseAfter).toBe("awaiting_test_approval");
    jobs = jobs.map((item) => item.id === plan.nextId ? { ...item, status: "review" } : item);
    queue = queueStateAfterRun(queue, plan, plan.nextId || "");
    expect(queue.pause).toBe("awaiting_test_approval");
    expect(queue.testJobId).toBe("twilight");
    expect(listingQueueAcceptsKick(queue)).toBe(false);
    expect(studioQueuePauseCopy(queue.pause)).toMatch(/paused until that photo is approved/);
    expect(studioQueuePauseCopy(queue.pause)).not.toMatch(/no quality loss/i);

    plan = orderQueueAdvancePlan(jobs, now, queue);
    expect(plan.nextId).toBeNull();
    expect(plan.shouldFollowUp).toBe(false);
    expect(continueStudioEditQueue(queue).ok).toBe(false);

    queue = unblockQueueAfterTestApproval(queue);
    expect(queue.pause).toBeNull();
    expect(queue.testApproved).toBe(true);
    expect(queue.batchProcessed).toBe(0);
    expect(listingQueueAcceptsKick(queue)).toBe(true);

    const batch: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      plan = orderQueueAdvancePlan(jobs, now, queue);
      if (!plan.nextId) break;
      expect(plan.nextId).not.toBe("failed");
      batch.push(plan.nextId);
      jobs = jobs.map((item) => item.id === plan.nextId ? { ...item, status: "review" } : item);
      queue = queueStateAfterRun(queue, plan, plan.nextId);
      if (queue.pause) break;
    }
    expect(batch).toHaveLength(ORDER_EDIT_BATCH_LIMIT);
    expect(queue.pause).toBe("awaiting_batch_review");
    expect(queue.batchProcessed).toBe(ORDER_EDIT_BATCH_LIMIT);
    expect(plan.shouldFollowUp).toBe(false);
    expect(listingQueueAcceptsKick(queue)).toBe(false);
    expect(studioQueuePauseCopy(queue.pause)).toMatch(/paused after 25/);
    expect(jobs.filter((item) => item.status === "pending")).toHaveLength(4);
    expect(jobs.find((item) => item.id === "failed")?.status).toBe("failed");

    const continued = continueStudioEditQueue(queue);
    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    queue = continued.queue;
    expect(queue.pause).toBeNull();
    expect(queue.batchProcessed).toBe(0);
    plan = orderQueueAdvancePlan(jobs, now, queue);
    expect(plan.nextId).toBe("photo-25");
    expect(plan.shouldFollowUp).toBe(true);
    expect(listingQueueAcceptsKick(queue)).toBe(true);
  });

  it("reclaims a stale processing job and leaves a fresh one alone", () => {
    const stale = job({
      id: "stale",
      status: "processing",
      updatedAtMs: now - ORDER_EDIT_STALE_MS - 1,
    });
    const fresh = job({
      id: "fresh",
      status: "processing",
      updatedAtMs: now - 1_000,
    });
    expect(orderEditClaimable(stale, now)).toBe(true);
    expect(orderEditClaimable(fresh, now)).toBe(false);
    expect(orderQueueAdvancePlan([fresh, stale], now).nextId).toBe("stale");
    expect(orderQueueAdvancePlan([job({ id: "done", status: "approved" })], now)).toMatchObject({
      nextId: null,
      shouldFollowUp: false,
    });
  });
});

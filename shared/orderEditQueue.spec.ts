import { describe, expect, it } from "vitest";
import {
  ORDER_EDIT_RUN_PER_REQUEST,
  ORDER_EDIT_STALE_MS,
  orderEditClaimable,
  orderQueueAdvancePlan,
  runnableOrderEdits,
  type OrderQueueJob,
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

describe("order edit auto-queue", () => {
  it("advances one twilight before photos and asks for a follow-up while work remains", () => {
    const jobs = [
      job({ id: "photo-a", type: "photo" }),
      job({ id: "twilight-front", type: "twilight" }),
      job({ id: "photo-b", type: "photo" }),
      job({ id: "waiting", type: "twilight", sourcePath: "" }),
      job({ id: "review", status: "review" }),
      job({ id: "failed", status: "failed" }),
      job({ id: "staff", origin: "staff_override", status: "pending" }),
    ];
    const plan = orderQueueAdvancePlan(jobs, now);
    expect(ORDER_EDIT_RUN_PER_REQUEST).toBe(1);
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
    const plan = orderQueueAdvancePlan([job({ id: "only" })], now);
    expect(plan.nextId).toBe("only");
    expect(plan.remainingAfter).toBe(0);
    expect(plan.shouldFollowUp).toBe(false);
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

import { describe, expect, it } from "vitest";
import {
  estimateTitusPayAtClose,
  formatScheduleDollars,
  titusTopDeferralCap,
} from "./titusPayAtCloseSchedule.ts";

describe("Titus Texas Pay at Close schedule", () => {
  it("matches the agent prime example", () => {
    const estimate = estimateTitusPayAtClose({
      role: "agent",
      tier: "prime",
      property: "single-family",
      media: 549 + 899 + 1599,
    });
    expect(estimate.media).toBe(3047);
    expect(estimate.rate).toBe(0.04);
    expect(Math.round(estimate.fee || 0)).toBe(122);
    expect(Math.round(estimate.payoff || 0)).toBe(3169);
    expect(estimate.dueToday).toBe(0);
    expect(estimate.cap).toBe(20000);
  });

  it("uses the Texas homeowner near-prime rate", () => {
    const estimate = estimateTitusPayAtClose({
      role: "homeowner",
      tier: "near-prime",
      property: "single-family",
      media: 549 + 2499,
    });
    expect(estimate.media).toBe(3048);
    expect(estimate.rate).toBe(0.05);
    expect(Math.round(estimate.fee || 0)).toBe(152);
    expect(Math.round(estimate.payoff || 0)).toBe(3200);
  });

  it("marks deep-subprime as not on the schedule", () => {
    const estimate = estimateTitusPayAtClose({
      role: "agent",
      tier: "deep-subprime",
      property: "single-family",
      media: 549,
    });
    expect(estimate.unavailable).toBe(true);
    expect(estimate.fee).toBeNull();
    expect(estimate.note).toMatch(/not on the standard agent/);
  });

  it("caps manufactured homes for agents and blocks homeowners", () => {
    const agent = estimateTitusPayAtClose({
      role: "agent",
      tier: "prime",
      property: "manufactured-home",
      media: 3000,
    });
    expect(agent.cap).toBe(2500);
    expect(agent.overCap).toBe(true);
    const owner = estimateTitusPayAtClose({
      role: "homeowner",
      tier: "prime",
      property: "manufactured-home",
      media: 500,
    });
    expect(owner.unavailable).toBe(true);
    expect(owner.note).toMatch(/agent-only/);
  });

  it("keeps the published top cap at 20000", () => {
    expect(titusTopDeferralCap()).toBe(20000);
    expect(formatScheduleDollars(20000)).toBe("$20,000");
  });
});

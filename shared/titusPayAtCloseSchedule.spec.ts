import { describe, expect, it } from "vitest";
import { mergePricingAdjustments } from "./pricingSettings.ts";
import { payAtCloseListedPrice, payAtClosePublicOffer } from "./payAtClose.ts";
import {
  estimateTitusPayAtClose,
  formatScheduleDollars,
  titusTopDeferralCap,
} from "./titusPayAtCloseSchedule.ts";

const defaultOffer = payAtClosePublicOffer({}, mergePricingAdjustments([]));

function listed(catalogPrice: number): number {
  return payAtCloseListedPrice(catalogPrice, defaultOffer);
}

describe("Titus Texas Pay at Close schedule", () => {
  it("matches the agent prime example on Pay at Close prices", () => {
    const estimate = estimateTitusPayAtClose({
      role: "agent",
      tier: "prime",
      property: "single-family",
      media: listed(549) + listed(899) + listed(1599),
    });
    expect(listed(549)).toBe(582);
    expect(estimate.media).toBe(3230);
    expect(estimate.rate).toBe(0.04);
    expect(Math.round(estimate.fee || 0)).toBe(129);
    expect(Math.round(estimate.payoff || 0)).toBe(3359);
    expect(estimate.dueToday).toBe(0);
    expect(estimate.cap).toBe(20000);
  });

  it("uses the Texas homeowner near-prime rate", () => {
    const estimate = estimateTitusPayAtClose({
      role: "homeowner",
      tier: "near-prime",
      property: "single-family",
      media: listed(549) + listed(2499),
    });
    expect(estimate.media).toBe(3231);
    expect(estimate.rate).toBe(0.05);
    expect(Math.round(estimate.fee || 0)).toBe(162);
    expect(Math.round(estimate.payoff || 0)).toBe(3393);
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

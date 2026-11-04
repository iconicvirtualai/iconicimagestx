/**
 * Titus Pay at Close fee schedule for Texas.
 * Source: Titus estimate config for Iconic Images Media Marketing, fetched 2026-11-03.
 * Agent product: agent-commission-advance (no Texas override).
 * Homeowner product: homeowner-cloc defaults, with Texas overrides on near-prime and upper-subprime.
 * Null means that tier is not on the standard schedule.
 * This is an estimate. It is not a loan offer.
 * Do not surface the 2.8% card fee or Titus's 3.99% vendor fee from this module.
 */

export type TitusCreditTier =
  | "super-prime"
  | "prime"
  | "near-prime"
  | "upper-subprime"
  | "mid-subprime"
  | "deep-subprime";

export type TitusBorrowerRole = "agent" | "homeowner";

export type TitusPropertyType =
  | "single-family"
  | "condo"
  | "townhome"
  | "multi-unit"
  | "manufactured-home";

export interface TitusTierOption {
  id: TitusCreditTier;
  label: string;
}

export const TITUS_TEXAS_PAY_AT_CLOSE = {
  /** What the borrower pays Iconic on an approved Pay at Close order. */
  dueToday: 0,
  manufacturedAgentMax: 2500,
  tiers: [
    { id: "super-prime", label: "Exceptional (800+)" },
    { id: "prime", label: "Very good (740–799)" },
    { id: "near-prime", label: "Good (670–739)" },
    { id: "upper-subprime", label: "Average (640–669)" },
    { id: "mid-subprime", label: "Fair (570–639)" },
    { id: "deep-subprime", label: "Poor (300–569)" },
  ] as const satisfies readonly TitusTierOption[],
  agent: {
    "super-prime": 0,
    prime: 0.04,
    "near-prime": 0.065,
    "upper-subprime": 0.08,
    "mid-subprime": 0.08,
    "deep-subprime": null,
  },
  homeowner: {
    "super-prime": 0,
    prime: 0.04,
    "near-prime": 0.05,
    "upper-subprime": 0.05,
    "mid-subprime": null,
    "deep-subprime": null,
  },
  /** 670+ is $20,000. 640–669 is $5,000. Deep-subprime is not funded on the standard schedule. */
  caps: {
    "super-prime": 20000,
    prime: 20000,
    "near-prime": 20000,
    "upper-subprime": 5000,
    "mid-subprime": 5000,
    "deep-subprime": null,
  },
} as const;

export interface TitusPayAtCloseEstimate {
  dueToday: number;
  media: number;
  rate: number | null;
  fee: number | null;
  payoff: number | null;
  cap: number | null;
  unavailable: boolean;
  overCap: boolean;
  note: string;
}

export function titusFlatFeeRate(role: TitusBorrowerRole, tier: TitusCreditTier): number | null {
  return role === "agent" ? TITUS_TEXAS_PAY_AT_CLOSE.agent[tier] : TITUS_TEXAS_PAY_AT_CLOSE.homeowner[tier];
}

export function titusDeferralCap(tier: TitusCreditTier): number | null {
  return TITUS_TEXAS_PAY_AT_CLOSE.caps[tier];
}

/** Largest cap on the schedule. Used for the "up to" line, not a package price. */
export function titusTopDeferralCap(): number {
  return Math.max(...Object.values(TITUS_TEXAS_PAY_AT_CLOSE.caps).filter((cap): cap is number => cap != null));
}

export function titusFeePercentLabel(rate: number): string {
  const points = rate * 100;
  const shown = Number.isInteger(points) ? String(points) : points.toFixed(1);
  return `${shown}%`;
}

export function estimateTitusPayAtClose(input: {
  role: TitusBorrowerRole;
  tier: TitusCreditTier;
  property: TitusPropertyType;
  media: number;
}): TitusPayAtCloseEstimate {
  const media = Math.max(0, Number(input.media) || 0);
  const rate = titusFlatFeeRate(input.role, input.tier);
  const listedCap = titusDeferralCap(input.tier);
  let cap = listedCap;
  if (input.property === "manufactured-home") {
    cap = input.role === "agent"
      ? Math.min(listedCap || TITUS_TEXAS_PAY_AT_CLOSE.manufacturedAgentMax, TITUS_TEXAS_PAY_AT_CLOSE.manufacturedAgentMax)
      : null;
  }

  const dueToday = TITUS_TEXAS_PAY_AT_CLOSE.dueToday;
  if (rate == null || cap == null) {
    return {
      dueToday,
      media,
      rate: null,
      fee: null,
      payoff: null,
      cap: null,
      unavailable: true,
      overCap: false,
      note: input.property === "manufactured-home" && input.role === "homeowner"
        ? "Manufactured / mobile homes: Titus lists agent-only eligibility (max $2,500). Run the official estimate."
        : `This credit tier is not on the standard ${input.role === "agent" ? "agent" : "homeowner"} TX flat-fee schedule. Get an official Titus estimate for eligibility.`,
    };
  }

  const fee = media * rate;
  const payoff = media + fee;
  const overCap = media > cap;
  let note = "Estimate only. Soft credit pull for pre-qualification. Exact fee shown before you accept on Titus.";
  if (overCap) {
    note = `Your media total exceeds the typical $${cap.toLocaleString("en-US")} deferral cap for this credit tier. Trim the order or confirm a higher approval on Titus.`;
  } else if (media === 0) {
    note = `Pick packages above. Estimate uses Titus TX ${input.role} flat fees. Soft pull for pre-qualification. Exact fee shown before you accept.`;
  } else {
    note = `Estimate: $0 due now · ${formatScheduleDollars(payoff)} at close (media + ${titusFeePercentLabel(rate)} Titus flat fee). Term: due at sale or 6 months. Confirm on official estimate.`;
  }

  return { dueToday, media, rate, fee, payoff, cap, unavailable: false, overCap, note };
}

export function formatScheduleDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export const PLAN_BUSINESSES = [
  "Iconic Images M&M",
  "Iconic Studios",
  "aICON",
  "Iconic Virtual",
  "DOT",
  "KDP",
] as const;

export type PlanBusiness = (typeof PLAN_BUSINESSES)[number];

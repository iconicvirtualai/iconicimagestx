import type { AudienceResult } from "./audience";
import type { MarketingSettings } from "./types";

export function deliverabilityWarnings(input: {
  audience: AudienceResult;
  settings: MarketingSettings;
  sentToday: number;
}): string[] {
  const warnings: string[] = [];
  if (input.audience.unverified > 0) {
    warnings.push(`${input.audience.unverified} recipient${input.audience.unverified === 1 ? "" : "s"} were imported and never verified.`);
  }
  const remaining = input.settings.gmailDailyLimit - input.sentToday;
  if (input.audience.recipients.length > input.settings.gmailDailyLimit) {
    warnings.push(`This send is ${input.audience.recipients.length} people. The Gmail daily limit is set to ${input.settings.gmailDailyLimit}.`);
  } else if (input.audience.recipients.length > remaining) {
    warnings.push(`About ${input.sentToday} marketing emails already went out today. ${input.audience.recipients.length} more would pass the ${input.settings.gmailDailyLimit} daily limit.`);
  }
  return warnings;
}

/** Documented GMass dashboard destinations. The API cannot do these. */
export const GMASS_LINKS = [
  {
    id: "dashboard",
    label: "GMass dashboard",
    href: "https://gmass.co/dashboard",
    detail: "Campaign reports and the settings gear.",
  },
  {
    id: "account",
    label: "Plan, billing, and card",
    href: "https://gmass.co/dashboard",
    detail: "Settings → My Account. Change plan, card, invoices, and billing contacts there.",
  },
  {
    id: "pricing",
    label: "Compare plans",
    href: "https://www.gmass.co/pricing",
    detail: "Upgrade and downgrade from My Account. There is no billing API.",
  },
  {
    id: "gmail",
    label: "Connected Gmail",
    href: "https://gmass.co/dashboard",
    detail: "The connected Gmail stays photos@iconicimagestx.com. A campaign can still send as photos@ or another Send-as alias, such as news@, once that alias exists on the mailbox. The API cannot change the connected Gmail.",
  },
  {
    id: "keys",
    label: "API keys",
    href: "https://gmass.co/dashboard",
    detail: "Settings → API Keys → Manage API Keys. Paste the key into GMASS_API_KEY on the server.",
  },
  {
    id: "support",
    label: "GMass support",
    href: "https://www.gmass.co/g/support",
    detail: "For account changes this portal cannot make.",
  },
] as const;

export const GMASS_IN_PORTAL = [
  "Account payload from GET /api/user (fields are whatever GMass returns; the spec does not list them).",
  "Warm-up stats from GET /api/user/WarmupStats.",
  "Unsubscribe domains from GET /api/unsubscribes/domains, plus add or remove an address or domain.",
  "Campaign settings at send time: from name, reply-to, preheader, open and click tracking, Chicago schedule, emails per day, and GMass suppressionDays.",
  "Reports from GET /api/campaigns, GET /api/campaigns/{id}, and GET /api/reports/{id}/recipients|opens|clicks|bounces|blocks|unsubscribes|replies.",
];

export const GMASS_LINK_OUT = [
  "Billing, invoices, credit card, and plan changes.",
  "Changing the connected Gmail account.",
  "Creating or rotating API keys.",
  "Pausing a campaign that is already sending. The API has no pause endpoint, so a bounce spike becomes a recommendation and a dashboard link.",
  "Webhooks. The webhook route is for Zapier, and end users manage webhooks in the dashboard.",
];

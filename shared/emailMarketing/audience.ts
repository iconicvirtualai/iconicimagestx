import { contactMatchesFilter, isValidEmail, normalizeEmail } from "./contacts";
import { matchSuppression } from "./suppression";
import type { MarketingContact, MarketingSettings, SegmentFilter, SuppressionEntry } from "./types";

export interface SendRecord {
  email: string;
  campaignId: string;
  sentAt: string;
}

export interface OverlapCampaign {
  id: string;
  name: string;
  status: string;
  sentAt: string;
  scheduledAt: string;
  recipientEmails: string[];
}

export interface AudienceRemoval {
  email: string;
  name: string;
  reason: "invalid" | "duplicate" | "suppressed" | "frequency" | "overlap";
  detail: string;
}

export interface AudienceResult {
  recipients: MarketingContact[];
  removed: AudienceRemoval[];
  duplicatesRemoved: number;
  suppressed: number;
  frequencyCapped: number;
  overlapHeld: number;
  unverified: number;
}

function hoursBetween(laterIso: string, earlierIso: string): number {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return Number.POSITIVE_INFINITY;
  return (later - earlier) / 36e5;
}

export function resolveAudience(input: {
  contacts: MarketingContact[];
  suppression: SuppressionEntry[];
  sends: SendRecord[];
  campaigns: OverlapCampaign[];
  settings: MarketingSettings;
  filter?: SegmentFilter | null;
  sendAt: string;
  excludeCampaignId?: string;
  overlapOverride?: boolean;
}): AudienceResult {
  const removed: AudienceRemoval[] = [];
  const seen = new Set<string>();
  const recipients: MarketingContact[] = [];
  let duplicatesRemoved = 0;

  const pool = input.filter
    ? input.contacts.filter((contact) => contactMatchesFilter(contact, input.filter!))
    : input.contacts;

  for (const contact of pool) {
    const email = normalizeEmail(contact.email);
    const name = `${contact.firstName} ${contact.lastName}`.trim() || email;
    if (!isValidEmail(email)) {
      removed.push({ email, name, reason: "invalid", detail: "Invalid email" });
      continue;
    }
    if (seen.has(email)) {
      duplicatesRemoved += 1;
      removed.push({ email, name, reason: "duplicate", detail: "Duplicate in this send" });
      continue;
    }
    seen.add(email);

    const suppressed = matchSuppression(contact, input.suppression);
    if (suppressed) {
      const detail = suppressed.hold === "personal"
        ? "Personal hold"
        : suppressed.reason;
      removed.push({ email, name, reason: "suppressed", detail });
      continue;
    }

    const windowStart = Date.parse(input.sendAt) - input.settings.frequencyDays * 864e5;
    const recent = input.sends.filter((send) => {
      return normalizeEmail(send.email) === email && Date.parse(send.sentAt) >= windowStart;
    });
    if (input.settings.frequencyMax > 0 && recent.length >= input.settings.frequencyMax) {
      removed.push({
        email,
        name,
        reason: "frequency",
        detail: `${recent.length} marketing emails in ${input.settings.frequencyDays} days`,
      });
      continue;
    }

    if (!input.overlapOverride) {
      const clash = input.campaigns.find((campaign) => {
        if (campaign.id === input.excludeCampaignId) return false;
        if (!campaign.recipientEmails.map(normalizeEmail).includes(email)) return false;
        if (campaign.status === "sending") return true;
        if (campaign.status === "scheduled" && campaign.scheduledAt) {
          return Math.abs(hoursBetween(campaign.scheduledAt, input.sendAt)) <= input.settings.overlapHours;
        }
        if (campaign.status === "sent" && campaign.sentAt) {
          return hoursBetween(input.sendAt, campaign.sentAt) <= input.settings.overlapHours
            && hoursBetween(input.sendAt, campaign.sentAt) >= 0;
        }
        return false;
      });
      if (clash) {
        removed.push({ email, name, reason: "overlap", detail: clash.name });
        continue;
      }
    }

    recipients.push({ ...contact, email });
  }

  return {
    recipients,
    removed,
    duplicatesRemoved,
    suppressed: removed.filter((item) => item.reason === "suppressed").length,
    frequencyCapped: removed.filter((item) => item.reason === "frequency").length,
    overlapHeld: removed.filter((item) => item.reason === "overlap").length,
    unverified: recipients.filter((contact) => !contact.emailVerified).length,
  };
}

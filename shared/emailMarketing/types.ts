export type ContactSource = "client" | "import" | "manual";

export interface MarketingContact {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  tags: string[];
  custom: Record<string, string>;
  source: ContactSource;
  /** clients/{id} when this person is in the Iconic customer database. */
  clientId: string;
  /** Imported addresses stay false until someone marks them verified. Customers are verified. */
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSource {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
}

export type SuppressionReason = "bounced" | "blocked" | "unsubscribed" | "complained" | "manual";

export interface SuppressionEntry {
  id: string;
  kind: "email" | "domain" | "name";
  /** Normalized email, domain, or primary name key. */
  value: string;
  reason: SuppressionReason;
  /** Personal hold: still never mailed by a campaign. Cadi writes them herself. */
  hold: "" | "personal";
  note: string;
  /** Extra name spellings that should match, already normalized. */
  aliases: string[];
  /** Filled in later when Cadi has the address for a name hold. */
  email: string;
  source: "seed" | "manual" | "gmass" | "unsubscribe";
  createdAt: string;
  updatedAt: string;
}

export interface SegmentFilter {
  query: string;
  tagsAll: string[];
  tagsAny: string[];
  tagsNone: string[];
  source: "" | ContactSource;
  verified: "" | "yes" | "no";
  fields: { key: string; value: string }[];
}

export interface Segment {
  id: string;
  name: string;
  filter: SegmentFilter;
  createdAt: string;
  updatedAt: string;
}

/** A From address on the Gmail account connected to GMass. photos@ today; news@ can be added later. */
export interface SendingAccount {
  email: string;
  label: string;
}

export interface MarketingSettings {
  frequencyMax: number;
  frequencyDays: number;
  overlapHours: number;
  gmailDailyLimit: number;
  bounceWarnRate: number;
  bouncePauseRate: number;
  fromName: string;
  /** Default From for a new campaign. Must be one of sendingAccounts. */
  fromEmail: string;
  replyTo: string;
  sendingAccounts: SendingAccount[];
  suppressionSeededAt: string;
}

export interface ActivityEvent {
  id: string;
  email: string;
  campaignId: string;
  campaignName: string;
  type: "sent" | "delivered" | "open" | "click" | "bounce" | "block" | "unsubscribe" | "reply" | "complained";
  at: string;
  detail: string;
}

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "pause-recommended";

export interface AudienceConfirmation {
  token: string;
  sendAt: string;
  overlapOverride: boolean;
  recipientCount: number;
  recipientEmails: string[];
  suppressed: number;
  frequencyCapped: number;
  overlapHeld: number;
  duplicatesRemoved: number;
  unverified: number;
  warnings: string[];
  removedPreview: { email: string; reason: string; detail: string }[];
  /** From address locked into this confirm. */
  fromEmail: string;
  at: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  audienceMode: "all" | "segment" | "tags";
  segmentId: string;
  tags: string[];
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  html: string;
  templateId: string;
  scheduledAt: string;
  overlapOverride: boolean;
  confirmation: AudienceConfirmation | null;
  gmassDraftId: string;
  gmassCampaignId: string;
  recipientEmails: string[];
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingTemplate {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  html: string;
  updatedAt: string;
}

export const EMPTY_SEGMENT_FILTER: SegmentFilter = {
  query: "",
  tagsAll: [],
  tagsAny: [],
  tagsNone: [],
  source: "",
  verified: "",
  fields: [],
};

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  frequencyMax: 2,
  frequencyDays: 7,
  overlapHours: 24,
  gmailDailyLimit: 2000,
  bounceWarnRate: 0.05,
  bouncePauseRate: 0.08,
  fromName: "Iconic Images",
  fromEmail: "photos@iconicimagestx.com",
  replyTo: "photos@iconicimagestx.com",
  sendingAccounts: [{ email: "photos@iconicimagestx.com", label: "Photos" }],
  suppressionSeededAt: "",
};

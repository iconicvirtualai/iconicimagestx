import { buildSuppression } from "../../shared/emailMarketing/suppression";
import { EMPTY_SEGMENT_FILTER, type MarketingContact, type Segment } from "../../shared/emailMarketing/types";
import { normalizeCampaign, type ChannelCampaign } from "../../shared/channelCampaigns";
import { isHostedDeployment, liveServerEnv } from "../../shared/tempAdmin";
import { getMarketingStore } from "./marketingStore";
import { getChannelCampaignStore } from "./channelCampaignStore";

export function sampleSeedAllowed(): boolean {
  if (process.env.CHANNEL_CAMPAIGN_SAMPLE !== "true") return false;
  return !isHostedDeployment(liveServerEnv());
}

export async function ensureCampaignSample(): Promise<void> {
  if (!sampleSeedAllowed()) return;
  const store = getChannelCampaignStore();
  const existing = await store.get("spring-listing-refresh");
  if (existing) return;
  const now = new Date().toISOString();
  const marketing = getMarketingStore();
  await marketing.ensureSeed();
  const contacts = await marketing.listContacts();
  if (contacts.length === 0) {
    const people: MarketingContact[] = [
      contact("ada@example.com", "Ada", "Lovelace", "2815550101", "Lovelace Homes", ["past-client"], "client"),
      contact("sam@example.com", "Sam", "Rivera", "2815550144", "Rivera Group", ["prospect"], "import"),
      contact("bounce@example.com", "Bo", "Unced", "", "", [], "import"),
      contact("unsub@example.com", "Una", "Subbed", "", "", [], "import"),
      contact("dnc@example.com", "Dana", "Quiet", "2815550177", "", [], "manual"),
    ].map((person) => ({ ...person, createdAt: now, updatedAt: now }));
    await marketing.saveContacts(people);
    for (const entry of [
      buildSuppression(now, { kind: "email", value: "bounce@example.com", reason: "bounced", note: "Bounced", source: "manual" }),
      buildSuppression(now, { kind: "email", value: "unsub@example.com", reason: "unsubscribed", note: "Unsubscribed", source: "unsubscribe" }),
      buildSuppression(now, { kind: "email", value: "dnc@example.com", reason: "manual", note: "Do not contact", source: "manual" }),
    ]) {
      if (entry) await marketing.saveSuppression(entry);
    }
    const segment: Segment = {
      id: "past-clients",
      name: "Past clients",
      filter: { ...EMPTY_SEGMENT_FILTER, tagsAll: ["past-client"] },
      createdAt: now,
      updatedAt: now,
    };
    await marketing.saveSegment(segment);
  }
  await store.save(sampleCampaign(now));
  await store.save(normalizeCampaign({
    name: "Agent check-in",
    purpose: "A short note to agent prospects before the holiday rush.",
    status: "scheduled",
    ownerUid: "temp-admin-uid",
    ownerName: "Cadi",
    ownerEmail: "temp-admin@iconicimagestx.com",
    startsOn: "2026-11-24",
    endsOn: "2026-11-24",
    segmentId: "",
    email: {
      enabled: true,
      mode: "builder",
      subject: "Checking in, {FirstName}",
      preheader: "One date left this month",
      html: "",
      blocks: [{ id: "t", type: "text", text: "Hello {FirstName}, we held a November date for you.", url: "", href: "" }],
      scheduledAt: "2026-11-24T15:00:00.000Z",
    },
    sms: { enabled: false, body: "", scheduledAt: "" },
    posts: [],
  }, now, "agent-check-in"));
}

function contact(
  email: string,
  firstName: string,
  lastName: string,
  phone: string,
  company: string,
  tags: string[],
  source: MarketingContact["source"],
): MarketingContact {
  return {
    email,
    firstName,
    lastName,
    company,
    phone,
    tags,
    custom: {},
    source,
    clientId: "",
    emailVerified: true,
    createdAt: "",
    updatedAt: "",
  };
}

function sampleCampaign(now: string): ChannelCampaign {
  return normalizeCampaign({
    name: "Spring listing refresh",
    purpose: "Invite past clients and prospects to book a spring media refresh before listing season.",
    status: "ready",
    ownerUid: "temp-admin-uid",
    ownerName: "Cadi",
    ownerEmail: "temp-admin@iconicimagestx.com",
    startsOn: "2026-11-18",
    endsOn: "2026-11-30",
    segmentId: "",
    email: {
      enabled: true,
      mode: "builder",
      subject: "Spring photos for {FirstName}",
      preheader: "A fresh set before the listing goes live",
      html: "",
      blocks: [
        { id: "h", type: "heading", text: "Hello {FirstName}", url: "", href: "" },
        { id: "p", type: "text", text: "Listing season is close. We saved a spring media date for your next property.", url: "", href: "" },
        { id: "i", type: "image", text: "Iconic listing photo", url: "/email/holiday-2026/header-v5.jpg", href: "" },
        { id: "b", type: "button", text: "Book a date", url: "", href: "https://iconicimagestx.com/book" },
      ],
      scheduledAt: "2026-11-18T15:00:00.000Z",
    },
    sms: {
      enabled: true,
      body: "Hi {FirstName}, Iconic saved a spring photo date for your next listing.",
      scheduledAt: "2026-11-19T16:00:00.000Z",
    },
    posts: [{
      id: "ig-spring",
      platform: "instagram",
      copy: "Spring listings deserve a fresh set. Media dates are open.",
      mediaUrl: "/email/holiday-2026/header-v5.jpg",
      mediaName: "header-v5.jpg",
      scheduledAt: "2026-11-20T18:00:00.000Z",
      queuedAt: "",
    }],
  }, now, "spring-listing-refresh");
}

import { describe, expect, it } from "vitest";
import { EMPTY_SEGMENT_FILTER } from "./emailMarketing/types";
import { buildSuppression } from "./emailMarketing/suppression";
import {
  CAMPAIGN_SHEET_NEVER_WRITE,
  buildChannelAudience,
  calendarItems,
  campaignSendLive,
  campaignSheetAccess,
  campaignSmsBody,
  normalizeCampaign,
  planDelivery,
  renderCampaignEmail,
  smsMetrics,
  statusChangeError,
  type ChannelCampaign,
  type ChannelPerson,
} from "./channelCampaigns";

const now = "2026-11-10T12:00:00.000Z";

function person(partial: Partial<ChannelPerson>): ChannelPerson {
  return {
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    company: "",
    tags: [],
    emailVerified: true,
    source: "import",
    doNotContact: false,
    ...partial,
  };
}

function campaign(partial: Partial<ChannelCampaign> = {}): ChannelCampaign {
  return normalizeCampaign({
    name: "Spring listing refresh",
    purpose: "Invite past clients to book a spring media refresh.",
    status: "approved",
    email: {
      enabled: true,
      mode: "builder",
      subject: "Spring photos for {FirstName}",
      preheader: "A fresh set for the listing",
      html: "",
      blocks: [{ id: "h", type: "heading", text: "Hello {FirstName}", url: "", href: "" }],
      scheduledAt: "2026-11-18T15:00:00.000Z",
    },
    sms: { enabled: true, body: "Hi {FirstName}, spring dates are open.", scheduledAt: "2026-11-19T16:00:00.000Z" },
    posts: [{ id: "p1", platform: "instagram", copy: "Spring listings", mediaUrl: "/email/holiday-2026/logo.png", mediaName: "logo.png", scheduledAt: "2026-11-20T18:00:00.000Z", queuedAt: "" }],
    ...partial,
  }, now, partial.id || "camp-1");
}

describe("campaign send switch", () => {
  it("stays off unless CAMPAIGN_SEND_LIVE is exactly true", () => {
    expect(campaignSendLive({})).toBe(false);
    expect(campaignSendLive({ CAMPAIGN_SEND_LIVE: "TRUE" })).toBe(false);
    expect(campaignSendLive({ CAMPAIGN_SEND_LIVE: "true", CLIENT_NOTIFY_LIVE: "" })).toBe(true);
  });
});

describe("Holy Grail write guard", () => {
  it("names columns H through N and P and allows reads", () => {
    expect(CAMPAIGN_SHEET_NEVER_WRITE).toEqual(["H", "I", "J", "K", "L", "M", "N", "P"]);
    expect(() => campaignSheetAccess("get", "'📇 Contacts'!A2:ZZ200")).not.toThrow();
    expect(() => campaignSheetAccess("update", "'📇 Contacts'!H2:N2")).toThrow(/columns H, I, J, K, L, M, N/);
    expect(() => campaignSheetAccess("update", "'📇 Contacts'!P2")).toThrow(/columns P/);
    expect(() => campaignSheetAccess("append", "'📇 Contacts'!A2")).toThrow(/read-only/);
  });
});

describe("status", () => {
  it("lets only an admin approve, and only from Ready for review", () => {
    expect(statusChangeError({ from: "ready", to: "approved", isAdmin: false, hasSchedule: false })).toMatch(/admin/);
    expect(statusChangeError({ from: "ready", to: "approved", isAdmin: true, hasSchedule: false })).toBeNull();
    expect(statusChangeError({ from: "draft", to: "approved", isAdmin: true, hasSchedule: false })).toMatch(/Ready for review/);
    expect(statusChangeError({ from: "approved", to: "scheduled", isAdmin: false, hasSchedule: false })).toMatch(/date/);
    expect(statusChangeError({ from: "approved", to: "scheduled", isAdmin: false, hasSchedule: true })).toBeNull();
  });
});

describe("sms", () => {
  it("counts gsm segments and appends STOP", () => {
    expect(smsMetrics("Hi")).toEqual({ encoding: "gsm", chars: 2, segments: 1 });
    expect(smsMetrics("a".repeat(161)).segments).toBe(2);
    expect(smsMetrics("Hello 😀").encoding).toBe("unicode");
    const body = campaignSmsBody("Hi {FirstName}, open dates.", "Ada");
    expect(body).toContain("Hi Ada");
    expect(body).toMatch(/Reply STOP to opt out/);
    expect(campaignSmsBody("Already STOP", "Ada")).not.toMatch(/Reply STOP/);
  });
});

describe("audience", () => {
  const people = [
    person({ email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", phone: "(281) 555-0101", tags: ["past-client"] }),
    person({ email: "sam@example.com", firstName: "Sam", lastName: "Rivera", phone: "2815550144", tags: ["prospect"] }),
    person({ email: "bounce@example.com", firstName: "Bo", lastName: "Unced", phone: "2815550199" }),
    person({ email: "unsub@example.com", firstName: "Una", lastName: "Subbed" }),
    person({ email: "dnc@example.com", firstName: "Dana", lastName: "Quiet", phone: "2815550177", doNotContact: true }),
  ];
  const suppression = [
    buildSuppression(now, { kind: "email", value: "bounce@example.com", reason: "bounced", note: "bounced", source: "manual" })!,
    buildSuppression(now, { kind: "email", value: "unsub@example.com", reason: "unsubscribed", note: "left", source: "unsubscribe" })!,
  ];

  it("counts recipients and holds unsubscribes, bounces, and do-not-contact", () => {
    const preview = buildChannelAudience({ people, suppression, phoneStops: [], segment: null });
    expect(preview.emailCount).toBe(2);
    expect(preview.smsCount).toBe(3);
    expect(preview.unsubscribe).toBe(1);
    expect(preview.bounce).toBe(1);
    expect(preview.doNotContact).toBe(1);
    expect(preview.emailPeople.map((item) => item.email).sort()).toEqual(["ada@example.com", "sam@example.com"]);
    expect(preview.smsPeople.map((item) => item.email).sort()).toEqual(["ada@example.com", "bounce@example.com", "sam@example.com"]);
  });

  it("applies a segment from the contact list", () => {
    const preview = buildChannelAudience({
      people,
      suppression,
      phoneStops: [],
      segment: { id: "past", name: "Past clients", filter: { ...EMPTY_SEGMENT_FILTER, tagsAll: ["past-client"] }, createdAt: now, updatedAt: now },
    });
    expect(preview.emailCount).toBe(1);
    expect(preview.emailPeople[0].email).toBe("ada@example.com");
  });

  it("drops a phone that texted STOP", () => {
    const preview = buildChannelAudience({ people, suppression, phoneStops: ["2815550101"], segment: null });
    expect(preview.smsPeople.some((item) => item.email === "ada@example.com")).toBe(false);
    expect(preview.emailPeople.some((item) => item.email === "ada@example.com")).toBe(true);
  });
});

describe("email and calendar", () => {
  it("includes the business address and an unsubscribe link", () => {
    const item = campaign();
    const rendered = renderCampaignEmail(item.email, person({ email: "ada@example.com", firstName: "Ada" }), "https://iconicimagestx.vercel.app/unsubscribe?email=ada%40example.com");
    expect(rendered.subject).toBe("Spring photos for Ada");
    expect(rendered.html).toContain("26410 Oakridge Dr");
    expect(rendered.html).toContain("https://iconicimagestx.vercel.app/unsubscribe?email=ada%40example.com");
    expect(rendered.html).toContain("Hello Ada");
    expect(rendered.text).toContain("Unsubscribe:");
  });

  it("places email, text, and a post on the calendar", () => {
    const items = calendarItems([campaign({ startsOn: "2026-11-18" })]);
    expect(items.map((item) => `${item.date}:${item.label}`)).toEqual([
      "2026-11-18:Starts",
      "2026-11-18:Email",
      "2026-11-19:Text",
      "2026-11-20:instagram",
    ]);
  });

  it("plans a dry run without dropping the STOP line", () => {
    const item = campaign();
    const audience = buildChannelAudience({
      people: [person({ email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", phone: "2815550101" })],
      suppression: [],
      phoneStops: [],
      segment: null,
    });
    const lines = planDelivery(item, audience, (email) => `https://example.com/unsubscribe?email=${email}`);
    expect(lines.map((line) => line.channel)).toEqual(["email", "sms", "post"]);
    expect(lines[1].detail).toMatch(/STOP/);
    expect(lines[0].to).toBe("ada@example.com");
  });
});

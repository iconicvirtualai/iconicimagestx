import { describe, expect, it } from "vitest";
import { buildPublicListingSite } from "./listingSite";
import {
  applyProfileToAgent,
  billingPrefill,
  canPlaceOrder,
  cardLabel,
  cardOnFileFromSquare,
  containsRawCard,
  exampleBilling,
  exampleProfile,
  grantFromMembers,
  hubAllows,
  marketingMaterialFromProfile,
  parseContactsCsv,
  portalBillingStamp,
  sanitizeBilling,
  shareContactsFromListing,
  squareBuyerPrefill,
  teamInviteDelivery,
  type TeamMemberRecord,
} from "./clientHubSettings";

function member(overrides: Partial<TeamMemberRecord> = {}): TeamMemberRecord {
  return {
    id: "member-1",
    teamId: "team-1",
    ownerClientId: "owner-1",
    name: "Teammate",
    email: "teammate@example.com",
    phone: "",
    permissions: ["view"],
    logoUrl: "",
    status: "active",
    linkedClientId: "member-uid",
    inviteEmail: "paused",
    ...overrides,
  };
}

describe("client hub permissions", () => {
  const owner = "owner-1";

  it("lets the owner read and write every section and place an order", () => {
    for (const section of ["profile", "team", "clients", "billing", "orders"] as const) {
      expect(hubAllows({ uid: owner, action: "read", section, ownerClientId: owner })).toBe(true);
      expect(hubAllows({ uid: owner, action: "write", section, ownerClientId: owner })).toBe(true);
    }
    expect(canPlaceOrder(owner, owner)).toBe(true);
  });

  it("keeps a view-only teammate out of billing, orders, and CRM edits", () => {
    const grant = grantFromMembers(owner, "team-1", [member()]);
    expect(hubAllows({ uid: "member-uid", action: "read", section: "clients", ownerClientId: owner, grant })).toBe(true);
    expect(hubAllows({ uid: "member-uid", action: "write", section: "clients", ownerClientId: owner, grant })).toBe(false);
    expect(hubAllows({ uid: "member-uid", action: "read", section: "billing", ownerClientId: owner, grant })).toBe(false);
    expect(hubAllows({ uid: "member-uid", action: "read", section: "orders", ownerClientId: owner, grant })).toBe(false);
    expect(hubAllows({ uid: "member-uid", action: "write", section: "profile", ownerClientId: owner, grant })).toBe(false);
    expect(canPlaceOrder("member-uid", owner, grant)).toBe(false);
  });

  it("lets billing and order permissions through, and blocks another team", () => {
    const grant = grantFromMembers(owner, "team-1", [
      member({ permissions: ["view", "order", "billing"], linkedClientId: "booker" }),
    ]);
    expect(hubAllows({ uid: "booker", action: "read", section: "billing", ownerClientId: owner, grant })).toBe(true);
    expect(hubAllows({ uid: "booker", action: "write", section: "orders", ownerClientId: owner, grant })).toBe(true);
    expect(canPlaceOrder("booker", owner, grant)).toBe(true);
    expect(hubAllows({ uid: "booker", action: "read", section: "billing", ownerClientId: "other-owner", grant })).toBe(false);
    expect(hubAllows({ uid: "stranger", action: "read", section: "clients", ownerClientId: owner, grant })).toBe(false);
  });

  it("does not treat download as billing or CRM access", () => {
    const grant = grantFromMembers(owner, "team-1", [
      member({ permissions: ["view", "download"], linkedClientId: "downloader" }),
    ]);
    expect(grant.downloadUids).toEqual(["downloader"]);
    expect(hubAllows({ uid: "downloader", action: "read", section: "billing", ownerClientId: owner, grant })).toBe(false);
    expect(hubAllows({ uid: "downloader", action: "write", section: "clients", ownerClientId: owner, grant })).toBe(false);
  });

  it("gives an admin the team, without making them the owner of a different account", () => {
    const grant = grantFromMembers(owner, "team-1", [
      member({ permissions: ["admin"], linkedClientId: "admin-uid" }),
    ]);
    expect(hubAllows({ uid: "admin-uid", action: "write", section: "team", ownerClientId: owner, grant })).toBe(true);
    expect(hubAllows({ uid: "admin-uid", action: "write", section: "billing", ownerClientId: owner, grant })).toBe(true);
    expect(hubAllows({ uid: "admin-uid", action: "read", section: "profile", ownerClientId: "someone-else", grant })).toBe(false);
  });
});

describe("profile autofill", () => {
  const profile = exampleProfile();

  it("fills a blank listing agent and leaves a listing phone in place", () => {
    const agent = applyProfileToAgent({
      name: "",
      brokerage: "",
      license: "7654321",
      phone: "(713) 555-0142",
      email: "",
    }, profile);
    expect(agent.name).toBe("Example Agent");
    expect(agent.brokerage).toBe("Example Brokerage");
    expect(agent.license).toBe("7654321");
    expect(agent.phone).toBe("(713) 555-0142");
    expect(agent.email).toBe("example.agent@example.com");
    expect(agent.headshotUrl).toBe("/media/photos/headshot-gracepoint-1.jpg");
    expect(agent.companyLogoUrl).toBe("/media/brand/iconic-camera-logo.png");
    expect(agent.website).toBe("https://example.com");
    expect(agent.socials.map((item) => item.label)).toEqual([
      "Facebook",
      "Instagram",
      "TikTok",
      "YouTube",
      "X",
      "LinkedIn",
      "Pinterest",
      "Threads",
      "Snapchat",
      "Google Business",
      "Zillow",
      "Realtor.com",
      "Example podcast",
    ]);
  });

  it("puts the profile on a published listing site and on marketing materials", () => {
    const site = buildPublicListingSite({
      id: "listing1234",
      address: { street: "100 Example Street", city: "Spring", state: "TX" },
      portalWebsite: { published: true, design: "index", showPhotos: false },
      clientHubProfile: profile,
    });
    expect(site?.agent.name).toBe("Example Agent");
    expect(site?.agent.brokerage).toBe("Example Brokerage");
    expect(site?.agent.headshotUrl).toBe(profile.headshotUrl);
    expect(site?.agent.socials?.some((item) => item.label === "Instagram")).toBe(true);

    const material = marketingMaterialFromProfile(profile);
    expect(material?.name).toBe("Example Agent");
    expect(material?.brokerageLogoUrl).toBe(profile.brokerageLogoUrl);
    expect(material?.socials.find((item) => item.label === "X")?.url).toContain("example-x");
  });

  it("prefills checkout and invoices from billing, without a card number", () => {
    const billing = exampleBilling();
    const prefill = billingPrefill(profile, billing);
    expect(prefill).toMatchObject({
      firstName: "Example",
      lastName: "Agent",
      email: "example.agent@example.com",
      phone: "(281) 555-0100",
      brokerage: "Example Brokerage",
      billingEmail: "example.billing@example.com",
      billingPhone: "(281) 555-0199",
      billToAddress: "100 Example Street, Suite 200, Spring, TX 77373",
      cardLabel: "VISA •••• 4242",
    });
    expect(prefill.cardLabel).not.toMatch(/\d{13,19}/);
    const stamp = portalBillingStamp({ billing });
    expect(stamp.billingEmail).toBe("example.billing@example.com");
    expect(squareBuyerPrefill({
      clientEmail: "example.agent@example.com",
      ...stamp,
    })).toMatchObject({
      buyer_email: "example.billing@example.com",
      buyer_phone_number: "(281) 555-0199",
      buyer_address: { address_line_1: stamp.billToAddress, country: "US" },
    });
  });
});

describe("billing card safety and CRM import", () => {
  it("drops raw card fields and keeps only Square's last four", () => {
    expect(containsRawCard({ cardNumber: "4242424242424242", cvv: "123" })).toBe(true);
    expect(containsRawCard({ billing: { pan: "4242424242424242" } })).toBe(true);
    expect(sanitizeBilling({ email: "Example.Billing@Example.com", line1: "100 Example Street" }).email).toBe("example.billing@example.com");
    const card = cardOnFileFromSquare({ id: "ccof:example", card_brand: "VISA", last_4: "4242", exp_month: 12, exp_year: 2028 }, "cus");
    expect(cardLabel(card)).toBe("VISA •••• 4242");
    expect(JSON.stringify(card)).not.toMatch(/4242424242424242/);
  });

  it("reads share records and a CSV into contacts for that owner only", () => {
    const shares = shareContactsFromListing({
      id: "listing1234",
      listingSiteInquiries: [{ name: "Example Buyer", contact: "buyer@example.com", when: "Saturday", at: "2026-10-02" }],
      shares: [{ name: "Example Gallery", email: "gallery@example.com" }],
    }, "owner-1");
    expect(shares.map((row) => row.email)).toEqual(["buyer@example.com", "gallery@example.com"]);
    expect(shares.every((row) => row.ownerClientId === "owner-1" && row.source === "share")).toBe(true);

    const parsed = parseContactsCsv("name,email,tags,status\nExample Client,client@example.com,vip|past,active\n,missing@example.com,,lead\n");
    expect(parsed.contacts).toHaveLength(1);
    expect(parsed.contacts[0]).toMatchObject({ name: "Example Client", email: "client@example.com", tags: ["vip", "past"], status: "active", source: "import" });
    expect(parsed.errors).toEqual(["Row 3 is missing a name."]);
  });

  it("pauses team invite mail unless client notifications are live", () => {
    expect(teamInviteDelivery({})).toBe("paused");
    expect(teamInviteDelivery({ CLIENT_NOTIFY_LIVE: "TRUE" })).toBe("paused");
    expect(teamInviteDelivery({ CLIENT_NOTIFY_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe("paused");
    expect(teamInviteDelivery({ CLIENT_NOTIFY_LIVE: "true" })).toBe("send");
  });
});

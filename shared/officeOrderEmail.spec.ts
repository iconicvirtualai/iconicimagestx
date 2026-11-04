import { describe, expect, it } from "vitest";
import type { StaffCatalogPackage } from "./bookingCatalog.ts";
import {
  NOT_PROVIDED,
  officeNewOrderEmail,
  officeOrderEmailFieldLabels,
} from "./officeOrderEmail.ts";

const catalog: StaffCatalogPackage[] = [
  {
    id: "hollywood",
    name: "Hollywood",
    price: 199,
    description: "Listing launch",
    category: "photography",
    bookingKind: "service",
    tier: "standard",
    includedServices: [
      "30 daytime listing photos",
      "5 aerial photos",
      "Social reel",
      "1 twilight render",
      "Listing video",
      "2D floor plan",
      "Same-day delivery",
    ],
    sortOrder: 1,
    isActive: true,
    bookingId: "hollywood",
  },
  {
    id: "same-day",
    name: "Same-Day Delivery",
    price: 50,
    description: "Same day",
    category: "addon",
    bookingKind: "addon",
    tier: "addon",
    includedServices: [],
    sortOrder: 2,
    isActive: true,
    bookingId: "same-day",
  },
];

const saved = {
  id: "6y4F0RVWBQw5z5IJxbWe",
  orderNumber: "ORD-L-00534",
  clientName: "Sytoya Harvin",
  email: "sytoya@example.com",
  phone: "281-555-0100",
  agentName: "Ada Agent",
  agentEmail: "ada@harbor.com",
  agentPhone: "713-555-0199",
  brokerage: "Harbor Realty",
  address: "123 Main St, Conroe, TX",
  unit: "12",
  gateCode: "1234",
  lockboxCode: "4455",
  accessNotes: "Use the side gate",
  mlsNumber: "MLS123",
  lineItems: [
    { id: "hollywood", name: "Hollywood", price: 199, qty: 1 },
    { id: "same-day", name: "Same-Day Delivery", price: 50, qty: 2 },
  ],
  pricing: { subtotal: 249, tax: 8, total: 257 },
  total: 257,
  paymentStatus: "unpaid",
  scheduledDate: "2026-10-12",
  scheduledTime: "Morning",
  squareFootage: "2400",
  occupancy: "Vacant",
  vibeNote: "Shoot the backyard",
  leadSource: "Iconic temporary booking page",
  source: "booking_form",
};

describe("office new order email", () => {
  it("renders every field from the saved order", () => {
    const email = officeNewOrderEmail(saved, {
      adminUrl: "https://iconicimagestx.com/admin/order-request/6y4F0RVWBQw5z5IJxbWe",
      catalog,
    });
    expect(email.subject).toBe("New order ORD-L-00534 — Hollywood — 123 Main St, Conroe, TX — Oct 12, 2026");
    expect(email.text).not.toContain(NOT_PROVIDED);
    expect(email.html).toContain("Hollywood");
    for (const label of officeOrderEmailFieldLabels()) {
      expect(email.text).toContain(`${label}:`);
    }
    expect(email.text).toContain("Order number: ORD-L-00534");
    expect(email.text).toContain("Admin link: https://iconicimagestx.com/admin/order-request/6y4F0RVWBQw5z5IJxbWe");
    expect(email.text).toContain("Client name: Sytoya Harvin");
    expect(email.text).toContain("Client email: sytoya@example.com");
    expect(email.text).toContain("Client phone: 281-555-0100");
    expect(email.text).toContain("Agent: Ada Agent");
    expect(email.text).toContain("Agent email/phone: ada@harbor.com / 713-555-0199");
    expect(email.text).toContain("Brokerage: Harbor Realty");
    expect(email.text).toContain("Property address: 123 Main St, Conroe, TX");
    expect(email.text).toContain("Unit: 12");
    expect(email.text).toContain("Gate code: 1234");
    expect(email.text).toContain("Lockbox: 4455");
    expect(email.text).toContain("Access notes: Use the side gate");
    expect(email.text).toContain("MLS #: MLS123");
    expect(email.text).toContain("Package: Hollywood");
    expect(email.text).toContain("Photo count: 30 daytime listing photos");
    expect(email.text).toContain("Aerials: 5 aerial photos");
    expect(email.text).toContain("Reels: Social reel");
    expect(email.text).toContain("Twilights: 1 twilight render");
    expect(email.text).toContain("Walkthrough: Listing video");
    expect(email.text).toContain("Floor plan: 2D floor plan");
    expect(email.text).toContain("Turnaround: Same-day delivery");
    expect(email.text).toContain("Add-ons: Same-Day Delivery × 2 — $50.00");
    expect(email.text).toContain("Subtotal: $249.00");
    expect(email.text).toContain("Tax: $8.00");
    expect(email.text).toContain("Total: $257.00");
    expect(email.text).toContain("Payment: Unpaid");
    expect(email.text).toContain("Requested date: Oct 12, 2026");
    expect(email.text).toContain("Requested time: Morning");
    expect(email.text).toContain("Square footage: 2400");
    expect(email.text).toContain("Occupancy: Vacant");
    expect(email.text).toContain("Notes: Shoot the backyard");
    expect(email.text).toContain("Booked via: Site");
  });

  it("prints the stored travel quote and miles on their own line", () => {
    const zoned = officeNewOrderEmail({
      ...saved,
      travelZone: 2,
      travelMiles: 27.21,
      travelFeeCents: 5000,
      travelQuoted: false,
    }, { catalog });
    expect(zoned.text).toContain("Travel: Travel fee — Zone 2 — $50.00 (27.21 mi)");
    expect(zoned.text).not.toMatch(/Travel:.*\$0/);

    const quoted = officeNewOrderEmail({
      ...saved,
      address: "100 Congress Ave, Austin, TX 78701",
      travelZone: null,
      travelMiles: 137.23,
      travelFeeCents: null,
      travelQuoted: true,
    }, { catalog });
    expect(quoted.text).toContain("Travel: Travel quoted (137.23 mi)");
    expect(quoted.text).not.toMatch(/\$0/);
  });

  it("keeps a UTC-midnight requested date on that calendar day", () => {
    const email = officeNewOrderEmail({
      ...saved,
      scheduledDate: "2026-11-17T00:00:00.000Z",
    }, { catalog });
    expect(email.subject).toContain("Nov 17, 2026");
    expect(email.subject).not.toContain("Nov 16");
    expect(email.text).toContain("Requested date: Nov 17, 2026");
  });

  it("prints a Google Places address in the subject and body", () => {
    const email = officeNewOrderEmail({
      ...saved,
      addressLabel: "",
      address: {
        formatted: "100 Congress Ave, Austin, TX 78701",
        lat: 30.2648,
        lng: -97.7431,
        placeId: "place_congress",
      },
    }, { catalog });
    expect(email.subject).toContain("100 Congress Ave, Austin, TX 78701");
    expect(email.text).toContain("Property address: 100 Congress Ave, Austin, TX 78701");
    expect(email.text).not.toContain("place_congress");
    expect(email.text).not.toContain("[object Object]");
  });

  it("uses the admin order code and package name when the saved record omitted them", () => {
    const email = officeNewOrderEmail({
      id: "order74499",
      clientName: "Test Client",
      email: "test@example.com",
      address: "100 Congress Ave, Austin, TX 78701",
      lineItems: [{ id: "hollywood", name: "Hollywood", price: 199, qty: 1 }],
      total: 199,
      scheduledDate: "2026-10-12",
    }, { catalog });
    expect(email.orderNumber).toBe("ORD - L - 74499");
    expect(email.packageName).toBe("Hollywood");
    expect(email.subject).toBe("New order ORD - L - 74499 — Hollywood — 100 Congress Ave, Austin, TX 78701 — Oct 12, 2026");
    expect(email.subject).not.toContain(NOT_PROVIDED);
    expect(email.text).toContain("Order number: ORD - L - 74499");
    expect(email.text).toContain("Package: Hollywood");
    expect(email.text).not.toContain(`Order number: ${NOT_PROVIDED}`);
  });

  it("reads a passed service name when the saved lines do not name a package", () => {
    const email = officeNewOrderEmail({
      id: "order74499",
      serviceName: "The Essentials",
      total: 249,
      address: "100 Congress Ave, Austin, TX 78701",
    });
    expect(email.packageName).toBe("The Essentials");
    expect(email.subject).toContain("The Essentials");
    expect(email.text).toContain("Package: The Essentials");
    expect(email.orderNumber).toBe("ORD - L - 74499");
  });

  it("leads the office email with a failed calendar hold note", () => {
    const note = "Calendar hold failed for Mike Luna at Wed, Oct 14 · 9:00 AM. Add it to the calendar manually.";
    const email = officeNewOrderEmail({ ...saved, officeNote: note }, { catalog });
    expect(email.text.startsWith(`Office note: ${note}`)).toBe(true);
    expect(email.html).toContain("Add it to the calendar manually.");
    expect(email.html).toContain("Mike Luna");
  });

  it("shows Not provided for every missing field and does not throw", () => {
    const email = officeNewOrderEmail({});
    expect(email.subject).toBe(`New order ${NOT_PROVIDED} — ${NOT_PROVIDED} — ${NOT_PROVIDED} — ${NOT_PROVIDED}`);
    for (const label of officeOrderEmailFieldLabels()) {
      expect(email.text).toContain(`${label}: ${NOT_PROVIDED}`);
    }
  });

  it("shows agent email and phone only when they differ from the client", () => {
    const same = officeNewOrderEmail({
      ...saved,
      agentEmail: "sytoya@example.com",
      agentPhone: "(281) 555-0100",
    }, { catalog });
    expect(same.text).toContain(`Agent email/phone: ${NOT_PROVIDED}`);
    const namedOnly = officeNewOrderEmail({
      ...saved,
      agentEmail: "ada@harbor.com",
      agentPhone: "281-555-0100",
    }, { catalog });
    expect(namedOnly.text.split("\n").find((row) => row.startsWith("Agent email/phone:"))).toBe("Agent email/phone: ada@harbor.com");
  });

  it("prefixes [TEST] when the client name or notes contain TEST ORDER", () => {
    const named = officeNewOrderEmail({ ...saved, clientName: "TEST ORDER Sytoya" }, { catalog });
    expect(named.subject.startsWith("[TEST] ")).toBe(true);
    const noted = officeNewOrderEmail({ ...saved, vibeNote: "Please ignore. TEST ORDER" }, { catalog });
    expect(noted.subject.startsWith("[TEST] ")).toBe(true);
    const plain = officeNewOrderEmail(saved, { catalog });
    expect(plain.subject.startsWith("[TEST]")).toBe(false);
  });

  it("opens a mailto draft to the booking client and does not send from the button", () => {
    const email = officeNewOrderEmail(saved, { catalog });
    const draft = replyDraft(email.html);
    expect(email.replyTo).toBe("sytoya@example.com");
    expect(draft.email).toBe("sytoya@example.com");
    expect(draft.subject).toBe("Re: ORD-L-00534 — 123 Main St, Conroe, TX");
    expect(draft.body).toBe("Hi Sytoya,");
    expect(email.html).toContain(">Reply to Sytoya</a>");
    expect(email.html.indexOf(">Reply to Sytoya</a>")).toBeLessThan(email.html.indexOf("<table"));
    expect(email.html).toContain('href="tel:+12815550100"');
    expect(email.html).toContain('href="sms:+12815550100"');
    expect(email.html).toContain("Call 281-555-0100");
    expect(email.html).toContain("Text 281-555-0100");
    expect(email.html).not.toContain("<form");
    expect(email.html).not.toContain("<script");
    expect(email.text.startsWith("Reply to agent: sytoya@example.com\n")).toBe(true);
    expect(email.text).toContain("Client email: sytoya@example.com");
    expect(email.text).toContain("Client phone: 281-555-0100");
    expect(email.text).toContain("Package: Hollywood");
  });

  it("prefers clientEmail and clientPhone, and greets the saved first name", () => {
    const email = officeNewOrderEmail({
      ...saved,
      firstName: "Sia",
      clientEmail: "Sia Agent <sia@harbor.com>",
      email: "sytoya@example.com",
      clientPhone: "(713) 555-0142",
      phone: "281-555-0100",
    }, { catalog });
    const draft = replyDraft(email.html);
    expect(email.replyTo).toBe("sia@harbor.com");
    expect(draft.email).toBe("sia@harbor.com");
    expect(draft.body).toBe("Hi Sia,");
    expect(email.html).toContain(">Reply to Sia</a>");
    expect(email.html).toContain('href="tel:+17135550142"');
    expect(email.html).toContain('href="sms:+17135550142"');
    expect(email.text).toContain("Reply to agent: sia@harbor.com");
    expect(email.text).not.toContain("Reply to agent: sytoya@example.com");
  });

  it("uses the name after a TEST ORDER marker", () => {
    const email = officeNewOrderEmail({
      ...saved,
      clientName: "TEST ORDER Sytoya",
    }, { catalog });
    expect(replyDraft(email.html).body).toBe("Hi Sytoya,");
    expect(email.html).toContain(">Reply to Sytoya</a>");
  });

  it("escapes the first name in the button and still encodes it in the draft", () => {
    const email = officeNewOrderEmail({
      ...saved,
      clientName: "A&B Smith",
    }, { catalog });
    expect(email.html).toContain(">Reply to A&amp;B</a>");
    expect(email.html).not.toContain(">Reply to A&B</a>");
    expect(replyDraft(email.html).body).toBe("Hi A&B,");
  });

  it("omits the reply draft when the order has no client email and skips a phone that is not dialable", () => {
    const email = officeNewOrderEmail({
      clientName: "Sytoya Harvin",
      phone: "ask the builder",
      address: "123 Main St",
    });
    expect(email.replyTo).toBeUndefined();
    expect(email.html).not.toContain("mailto:");
    expect(email.html).not.toContain("tel:");
    expect(email.html).not.toContain("sms:");
    expect(email.text).not.toContain("Reply to agent:");
    expect(email.text).toContain("Client phone: ask the builder");
  });

  it("shows call and text links without a reply button when only a phone is saved", () => {
    const email = officeNewOrderEmail({
      clientName: "Sytoya Harvin",
      phone: "281-555-0100",
    });
    expect(email.replyTo).toBeUndefined();
    expect(email.html).not.toContain("mailto:");
    expect(email.html).toContain('href="tel:+12815550100"');
    expect(email.html).toContain('href="sms:+12815550100"');
    expect(email.text).not.toContain("Reply to agent:");
  });

  it("keeps the office note first and puts the reply line directly under it", () => {
    const note = "Calendar hold failed for Mike Luna.\nAdd it to the calendar manually.";
    const email = officeNewOrderEmail({ ...saved, officeNote: note }, { catalog });
    expect(email.text.startsWith(`Office note: ${note}\nReply to agent: sytoya@example.com\n`)).toBe(true);
    expect(email.html.indexOf("Reply to Sytoya")).toBeLessThan(email.html.indexOf("Calendar hold failed"));
  });
});

function replyDraft(html: string): { email: string; subject: string; body: string } {
  const match = html.match(/href="(mailto:[^"]+)"/);
  if (!match) throw new Error("Office email is missing the reply draft link.");
  const url = new URL(match[1].replace(/&amp;/g, "&"));
  return {
    email: decodeURIComponent(url.pathname),
    subject: url.searchParams.get("subject") || "",
    body: url.searchParams.get("body") || "",
  };
}

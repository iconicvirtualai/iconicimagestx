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
    expect(email.subject).toBe("New order ORD-L-00534 — Hollywood — 123 Main St, Conroe, TX — 2026-10-12");
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
    expect(email.text).toContain("Requested date: 2026-10-12");
    expect(email.text).toContain("Requested time: Morning");
    expect(email.text).toContain("Square footage: 2400");
    expect(email.text).toContain("Occupancy: Vacant");
    expect(email.text).toContain("Notes: Shoot the backyard");
    expect(email.text).toContain("Booked via: Site");
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
});

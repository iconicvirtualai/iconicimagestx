import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SMS_TEMPLATES } from "../server/services/sms";
import {
  bookingPackageSeedDocs,
  findCatalogPriceMismatches,
  hardcodedChargePrice,
  promoDiscountFor,
  PROMO_DISCOUNTS,
} from "./bookingCatalog";
import {
  buildSubmittedLineItems,
  calculateSidebarTotal,
  normalizeBookingLineItems,
  orderTotalLabel,
  separatePromoDiscount,
  sumLineItemPrices,
  type BookingPriceInput,
} from "./bookingPricing";

const bookingForm = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");
const catalogSource = readFileSync(new URL("./bookingCatalog.ts", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const adminPricing = readFileSync(new URL("../client/pages/AdminCurrentPricing.tsx", import.meta.url), "utf8");
const packageSchema = readFileSync(new URL("../client/lib/schema.ts", import.meta.url), "utf8");

const fixedSelection: BookingPriceInput = {
  selectedService: "listing-showcase",
  selectedBasics: ["photos-35"],
  selectedAddOns: ["aerial-drone", "same-day", "agent-intro"],
  premiumUpgrade: true,
  virtualStagingCredits: 2,
  specializedPhotography: "social",
  promo: { code: "ICONICAI", discount: PROMO_DISCOUNTS.ICONICAI },
  lifeOfTheListingCare: true,
};

describe("booking total contract", () => {
  it("keeps sidebar, submitted total, and email/SMS amount on the same number", () => {
    const sidebar = calculateSidebarTotal(fixedSelection);
    const lineItems = buildSubmittedLineItems(fixedSelection);
    const submitted = sumLineItemPrices(lineItems);
    const label = orderTotalLabel(submitted);

    expect(sidebar).toBe(1118);
    expect(submitted).toBe(sidebar);
    expect(label).toBe("$1118.00");
    expect(orderTotalLabel(sidebar)).toBe(label);
    expect(lineItems.map((item) => [item.name, item.price])).toEqual([
      ["The Showcase", 549],
      ["35 Photos", 150],
      ["Aerial Drone Stills", 99],
      ["Same-Day Delivery", 50],
      ["Agent Intro/Outro", 75],
      ["Iconic Finish (Premium Upgrade)", 75],
      ["Virtual Staging (2 credits)", 70],
      ["Social Media Optimized Photography", 85],
      ["Promo Code: ICONICAI", -35],
    ]);
    expect(lineItems.find((item) => item.id === "virtual-staging")).toMatchObject({
      unitPrice: 35,
      qty: 2,
      price: 70,
    });
    expect(lineItems.filter((item) => item.price < 0)).toHaveLength(1);
    expect(separatePromoDiscount(lineItems, 35)).toBe(0);

    const sms = SMS_TEMPLATES.bookingConfirmation("Ada", "Monday", "1 Main St", label);
    expect(sms).toContain(`Estimated total: ${label}`);
    expect(sms).not.toMatch(/life of the listing/i);
  });

  it("leaves Life of the Listing Care out of the money total", () => {
    const withCare = calculateSidebarTotal(fixedSelection);
    const withoutCare = calculateSidebarTotal({ ...fixedSelection, lifeOfTheListingCare: false });
    const items = buildSubmittedLineItems(fixedSelection);

    expect(withCare).toBe(withoutCare);
    expect(items.some((item) => /life of the listing/i.test(item.name))).toBe(false);
  });

  it("keeps catalog notes off the charged total", () => {
    const items = buildSubmittedLineItems(fixedSelection);
    const normalized = normalizeBookingLineItems(items.map((item) => ({
      ...item,
      description: "Staff note",
      category: "photography",
      bookingKind: "service",
      tier: "campaign",
    })));
    expect(sumLineItemPrices(normalized)).toBe(sumLineItemPrices(items));
    expect(orderTotalLabel(sumLineItemPrices(normalized))).toBe("$1118.00");
    expect(normalized[0]).toMatchObject({
      description: "Staff note",
      category: "photography",
      bookingKind: "service",
      tier: "campaign",
      price: items[0].price,
    });
    expect(normalizeBookingLineItems([{ name: "Photos", price: 150 }])[0]).not.toHaveProperty("description");
  });

  it("keeps ICONICAI at $35 and NEWYEAR at $50", () => {
    expect(promoDiscountFor("iconicai")).toEqual({ code: "ICONICAI", discount: 35 });
    expect(promoDiscountFor("newyear")).toEqual({ code: "NEWYEAR", discount: 50 });

    const essentials: BookingPriceInput = {
      selectedService: "listing-essentials",
      promo: promoDiscountFor("NEWYEAR"),
      lifeOfTheListingCare: true,
    };
    expect(calculateSidebarTotal(essentials)).toBe(199);
    expect(sumLineItemPrices(buildSubmittedLineItems(essentials))).toBe(199);
    expect(orderTotalLabel(199)).toBe("$199.00");
  });

  it("preserves the sidebar floor and the unclamped submitted line sum", () => {
    const promoOnly: BookingPriceInput = {
      promo: { code: "NEWYEAR", discount: 50 },
      lifeOfTheListingCare: true,
    };
    expect(calculateSidebarTotal(promoOnly)).toBe(0);
    expect(sumLineItemPrices(buildSubmittedLineItems(promoOnly))).toBe(-50);
  });

  it("wires the booking form through the shared helpers", () => {
    expect(bookingForm).toContain("calculateSidebarTotal(bookingPriceInput())");
    expect(bookingForm).toContain("buildSubmittedLineItems(bookingPriceInput())");
    expect(bookingForm).toContain("sumLineItemPrices(lineItems)");
    expect(bookingForm).toContain("promoDiscountFor(promoInput)");
    expect(bookingForm).not.toContain("lifeOfTheListingCarePrice");
  });
});

describe("booking catalog parity", () => {
  it("seeds packages from the booking form and services.ts, not AdminCurrentPricing", () => {
    expect(catalogSource).not.toMatch(/from\s+["'].*AdminCurrentPricing/);
    expect(catalogSource).toContain("../client/lib/services.ts");

    const docs = bookingPackageSeedDocs();
    const ids = docs.map((doc) => doc.bookingId);
    expect(ids).toContain("listing-showcase");
    expect(ids).toContain("photos-35");
    expect(ids).toContain("aerial-drone");
    expect(ids).toContain("iconic-finish");
    expect(new Set(ids).size).toBe(ids.length);

    for (const doc of docs) {
      expect(doc.price).toBe(hardcodedChargePrice(doc.bookingId));
      expect(doc.source).toBe("booking-form-hardcoded");
      expect(doc.name).not.toMatch(/life of the listing/i);
    }
  });

  it("logs a catalog mismatch without changing the charged price", () => {
    const mismatches = findCatalogPriceMismatches([
      { id: "listing-showcase", price: 1 },
      { id: "photos-35", price: 150 },
      { bookingId: "unknown-sku", price: 10 },
    ]);
    expect(mismatches).toEqual([
      { id: "listing-showcase", hardcodedPrice: 549, catalogPrice: 1 },
    ]);
    expect(calculateSidebarTotal({ selectedService: "listing-showcase" })).toBe(549);
    expect(bookingForm).toContain("charging hardcoded prices");
  });

  it("prices apprenticeship packages at the hard time caps and seeds them with the basics", () => {
    expect(calculateSidebarTotal({ selectedBasics: ["apprentice-25"] })).toBe(75);
    expect(calculateSidebarTotal({ selectedBasics: ["apprentice-50"] })).toBe(125);
    expect(sumLineItemPrices(buildSubmittedLineItems({ selectedBasics: ["apprentice-25", "apprentice-50"] }))).toBe(200);

    const twentyFive = buildSubmittedLineItems({ selectedBasics: ["apprentice-25"] })[0];
    const fifty = buildSubmittedLineItems({ selectedBasics: ["apprentice-50"] })[0];
    expect(twentyFive).toMatchObject({
      id: "apprentice-25",
      unitPrice: 75,
      qty: 1,
      price: 75,
    });
    expect(fifty).toMatchObject({ id: "apprentice-50", unitPrice: 125, qty: 1, price: 125 });
    expect(twentyFive.name).toContain("20 Minute Appointment ONLY");
    expect(fifty.name).toContain("1 Hour Appointment ONLY");
    expect(twentyFive.name).not.toMatch(/aerial|video|floor plan/i);

    const docs = bookingPackageSeedDocs();
    const apprentice25 = docs.find((doc) => doc.id === "apprentice-25");
    const apprentice50 = docs.find((doc) => doc.id === "apprentice-50");
    expect(apprentice25).toMatchObject({
      price: 75,
      tier: "basic",
      bookingKind: "basic",
      category: "photography",
      appointmentLimit: "20 Minute Appointment ONLY",
      overage: "$25 per 15-minute increment",
    });
    expect(apprentice50).toMatchObject({
      price: 125,
      appointmentLimit: "1 Hour Appointment ONLY",
      overage: "$25 per 15-minute increment",
    });
    expect(apprentice25?.rules?.join(" ")).toMatch(/do not make additional trips/i);
    expect(apprentice25?.rules?.join(" ")).toMatch(/do not edit out anything additional/i);
    expect(apprentice25?.price).toBe(hardcodedChargePrice("apprentice-25"));
    expect(apprentice50?.price).toBe(hardcodedChargePrice("apprentice-50"));

    const pricingPage = readFileSync(new URL("../client/pages/Pricing.tsx", import.meta.url), "utf8");
    expect(catalogSource).toContain("Need to go even lower? That's okay — we don't judge… but you have to follow the rules.");
    expect(bookingForm).toContain("APPRENTICESHIP_BRIDGE_COPY");
    expect(bookingForm).toContain("APPRENTICESHIP_RULES");
    expect(pricingPage).toContain("APPRENTICESHIP_BRIDGE_COPY");
    expect(pricingPage).toContain("APPRENTICESHIP_RULES");
    expect(pricingPage).toContain("services-apprenticeship");
    expect(adminPricing).toContain("apprenticeshipPackages");
    expect(adminPricing).toContain("APPRENTICESHIP_RULES");
    expect(adminPricing).toContain("APPRENTICESHIP_OVERAGE_LABEL");
    expect(adminPricing).toContain("whitespace-normal");
    expect(adminPricing).not.toContain("truncate");
    expect(packageSchema).toContain("appointmentLimit?: string;");
    expect(packageSchema).toContain("overage?: string;");
    expect(packageSchema).toContain("rules?: string[];");
  });

  it("lets active staff write the public packages catalog", () => {
    const block = rules.slice(rules.indexOf("match /packages/{packageId}"));
    expect(block).toContain("allow read: if true;");
    expect(block).toContain("allow create, update, delete: if isStaff();");
  });
});

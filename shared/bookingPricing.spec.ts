import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SMS_TEMPLATES } from "../server/services/sms";
import {
  bookingOffer,
  bookingPackageSeedDocs,
  catalogPackageSaveData,
  hardcodedChargePrice,
  newCatalogPackageData,
  packagesForStaffEditor,
  promoDiscountFor,
  PROMO_DISCOUNTS,
} from "./bookingCatalog";
import { bookingEmbedAvailability } from "./bookingEmbeds";
import {
  buildSubmittedLineItems,
  calculateSidebarTotal,
  chargedServiceLines,
  hasBookingSelection,
  normalizeBookingLineItems,
  orderTotalLabel,
  resolveSubmittedBooking,
  separatePromoDiscount,
  sumLineItemPrices,
  type BookingPriceInput,
} from "./bookingPricing";

const bookingForm = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");
const catalogSource = readFileSync(new URL("./bookingCatalog.ts", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const adminPricing = readFileSync(new URL("../client/pages/AdminCurrentPricing.tsx", import.meta.url), "utf8");
const packageSchema = readFileSync(new URL("../client/lib/schema.ts", import.meta.url), "utf8");
const catalogPage = readFileSync(new URL("../client/pages/AdminBookingCatalog.tsx", import.meta.url), "utf8");
const appPage = readFileSync(new URL("../client/App.tsx", import.meta.url), "utf8");
const bookingsRoute = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");

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

function jsNumberMap(source: string, name: string): Record<string, number> {
  const match = source.match(new RegExp(`const ${name}=(\\{[^}]+\\})`));
  if (!match) throw new Error(`missing ${name}`);
  return JSON.parse(match[1].replace(/'/g, '"')) as Record<string, number>;
}

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
    expect(bookingForm).toContain("hasBookingSelection(bookingPriceInput())");
    expect(bookingForm).toContain("Select a package");
    expect(bookingForm).toContain("buildSubmittedLineItems(bookingPriceInput())");
    expect(bookingForm).toContain("sumLineItemPrices(lineItems)");
    expect(bookingForm).toContain("promoDiscountFor(promoInput)");
    expect(bookingForm).toContain("bookingOffer(catalog)");
    expect(bookingForm).toContain('collection(db, "packages")');
    expect(bookingForm).not.toContain("charging hardcoded prices");
    expect(bookingForm).not.toContain("lifeOfTheListingCarePrice");
  });

  it("hides an estimate until a priced package or tier is selected", () => {
    expect(hasBookingSelection({})).toBe(false);
    expect(hasBookingSelection({ promo: { code: "NEWYEAR", discount: 50 } })).toBe(false);
    expect(hasBookingSelection({ specializedPhotography: "mls" })).toBe(false);
    expect(hasBookingSelection({ selectedService: "listing-essentials" })).toBe(true);
    expect(hasBookingSelection({ selectedBasics: ["photos-35"] })).toBe(true);
    expect(calculateSidebarTotal({})).toBe(0);
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

  it("charges a maintained catalog price and hides a package that staff turned off", () => {
    const catalog = packagesForStaffEditor([
      { id: "listing-showcase", price: 600, name: "Showcase Plus" },
      { id: "photos-35", price: 140 },
      { id: "iconic-finish", price: 80 },
      { id: "aerial-drone", isActive: false },
    ]);
    const input: BookingPriceInput = {
      selectedService: "listing-showcase",
      selectedBasics: ["photos-35"],
      selectedAddOns: ["aerial-drone"],
      premiumUpgrade: true,
      catalog,
    };
    expect(calculateSidebarTotal(input)).toBe(820);
    expect(buildSubmittedLineItems(input).map((item) => [item.id, item.name, item.price])).toEqual([
      ["listing-showcase", "Showcase Plus", 600],
      ["photos-35", "35 Photos", 140],
      ["iconic-finish", "Iconic Finish (Premium Upgrade)", 80],
    ]);
    expect(bookingOffer(catalog).services.some((item) => item.id === "aerial-drone")).toBe(false);
    expect(bookingOffer(catalog).addOns.some((group) => group.items.some((item) => item.id === "aerial-drone"))).toBe(false);
    expect(hasBookingSelection({ selectedAddOns: ["aerial-drone"], catalog })).toBe(false);
    expect(calculateSidebarTotal({ selectedService: "listing-showcase" })).toBe(549);
    expect(sumLineItemPrices(buildSubmittedLineItems({
      selectedBasics: ["aerial-drone"],
      selectedAddOns: ["aerial-drone"],
    }))).toBe(99);
  });

  it("lets staff add a package the booking form can select", () => {
    const created = newCatalogPackageData({
      id: "Dusk Hero",
      name: "Dusk Hero",
      price: 120,
      description: "One dusk frame.",
      bookingKind: "addon",
      category: "addon",
      addonGroup: "The Space",
    });
    expect(created.ok).toBe(false);

    const draft = newCatalogPackageData({
      id: "dusk-hero",
      name: "Dusk Hero",
      price: 120,
      description: "One dusk frame.",
      bookingKind: "addon",
      category: "addon",
      addonGroup: "The Space",
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const catalog = packagesForStaffEditor([draft.data]);
    const group = bookingOffer(catalog).addOns.find((entry) => entry.category === "The Space");
    expect(group?.items.some((item) => item.id === "dusk-hero" && item.price === 120)).toBe(true);
    expect(calculateSidebarTotal({ selectedAddOns: ["dusk-hero"], catalog })).toBe(120);

    const saved = catalogPackageSaveData(catalog.find((item) => item.id === "photos-35")!, {
      name: "35 Photos",
      price: 160,
      description: "Updated photo set.",
      isActive: false,
      sortOrder: 4,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data).toMatchObject({ price: 160, isActive: false, source: "booking-catalog" });
    const hidden = packagesForStaffEditor([saved.data]);
    expect(hidden.some((item) => item.id === "photos-35")).toBe(false);
    expect(packagesForStaffEditor([saved.data], { includeInactive: true }).some((item) => item.id === "photos-35")).toBe(true);
  });

  it("resolves a booking submission from the catalog and ignores posted prices", () => {
    const catalog = packagesForStaffEditor([
      { id: "listing-essentials", price: 260 },
      { id: "iconic-finish", price: 90 },
    ]);
    const resolved = resolveSubmittedBooking({
      selectedService: "listing-essentials",
      premiumUpgrade: true,
      promoCode: "newyear",
      promoDiscount: 500,
      lineItems: [{ id: "listing-essentials", name: "hack", price: 1 }],
      lifeOfTheListingCare: true,
    }, catalog);

    expect(resolved.promoCode).toBe("NEWYEAR");
    expect(resolved.promoDiscount).toBe(50);
    expect(resolved.total).toBe(300);
    expect(resolved.lineItems.map((item) => [item.id, item.price])).toEqual([
      ["listing-essentials", 260],
      ["iconic-finish", 90],
      ["promo-NEWYEAR", -50],
    ]);
    expect(resolved.lineItems.some((item) => /life of the listing/i.test(item.name))).toBe(false);

    const fromLines = resolveSubmittedBooking({
      lineItems: [
        { id: "aerial-drone", name: "Drone", price: 1, qty: 1 },
        { id: "virtual-staging", name: "Staging", price: 1, qty: 3 },
      ],
    });
    expect(fromLines.selectedAddOns).toEqual(["aerial-drone"]);
    expect(fromLines.virtualStagingCredits).toBe(3);
    expect(fromLines.total).toBe(99 + 105);
    expect(bookingEmbedAvailability().status).toBe("deferred");
    expect(catalogPage).toContain("packagesForStaffEditor");
    expect(catalogPage).toContain("catalogPackageSaveData");
    expect(catalogPage).toContain("bookingEmbedAvailability");
    expect(bookingEmbedAvailability().reason).toMatch(/later pass/i);
    expect(appPage).toContain('path="/admin/booking-catalog"');
    expect(bookingsRoute).toContain("resolveSubmittedBooking");
    expect(bookingsRoute).toContain("loadBookingCatalog");
  });

  it("keeps ordericonic name+price lines when no catalog id matches", () => {
    const html = readFileSync(new URL("../public/ordericonic.html", import.meta.url), "utf8");
    const basePrices = jsNumberMap(html, "basePrices");
    const addonPrices = jsNumberMap(html, "addonPrices");
    const addonLines = Object.entries(addonPrices).map(([name, price]) => ({ name, price }));

    expect(html).toContain("selectedService:p.value");
    expect(html).toContain("selectedAddOns:addons");
    expect(html).toContain("lineItems");
    expect(html).toContain(">Studio booking / pre-sale</option>");
    expect(Object.keys(basePrices).length).toBeGreaterThan(0);
    expect(basePrices["The Essentials — $249"]).toBe(249);

    for (const [label, price] of Object.entries(basePrices)) {
      const lineItems = [{ name: label, price }, ...addonLines];
      const resolved = resolveSubmittedBooking({
        selectedService: label,
        selectedAddOns: addonLines.map((item) => item.name),
        lineItems,
        total: lineItems.reduce((sum, item) => sum + item.price, 0),
        leadSource: "Iconic temporary booking page",
      });
      expect(chargedServiceLines(resolved.lineItems).map((item) => [item.name, item.price])).toEqual(
        lineItems.map((item) => [item.name, item.price]),
      );
      expect(resolved.total).toBe(lineItems.reduce((sum, item) => sum + item.price, 0));
      expect(resolved.selectedService).toBe(label);
    }

    const studio = resolveSubmittedBooking({
      selectedService: "Studio booking / pre-sale",
      lineItems: [
        { name: "Studio booking / pre-sale", price: 0 },
        { name: "Same-Day Delivery $50", price: 50 },
      ],
      selectedAddOns: ["Same-Day Delivery $50"],
    });
    expect(studio.lineItems.map((item) => [item.name, item.price])).toEqual([
      ["Studio booking / pre-sale", 0],
      ["Same-Day Delivery $50", 50],
    ]);
    expect(chargedServiceLines(studio.lineItems)).toHaveLength(2);

    const fromLinesOnly = resolveSubmittedBooking({
      lineItems: [{ name: "Hollywood — $199", price: 199 }],
    });
    expect(fromLinesOnly.total).toBe(199);
    expect(chargedServiceLines(fromLinesOnly.lineItems)).toHaveLength(1);

    const withPromo = resolveSubmittedBooking({
      selectedService: "Hollywood — $199",
      promoCode: "newyear",
      lineItems: [{ name: "Hollywood — $199", price: 199 }],
    });
    expect(withPromo.total).toBe(149);
    expect(withPromo.lineItems.map((item) => item.id ?? item.name)).toEqual([
      "Hollywood — $199",
      "promo-NEWYEAR",
    ]);

    const labelWithoutLines = resolveSubmittedBooking({
      selectedService: "The Essentials — $249",
      selectedAddOns: ["Same-Day Delivery $50"],
    });
    expect(chargedServiceLines(labelWithoutLines.lineItems)).toHaveLength(0);
    expect(chargedServiceLines(resolveSubmittedBooking({
      lineItems: [{ name: "   ", price: 10 }, { price: 20 }],
    }).lineItems)).toHaveLength(0);

    const catalogWins = resolveSubmittedBooking({
      selectedService: "listing-showcase",
      lineItems: [
        { id: "listing-showcase", name: "hack", price: 1 },
        { name: "Hollywood — $199", price: 199 },
      ],
    });
    expect(catalogWins.lineItems.map((item) => [item.id, item.price])).toEqual([["listing-showcase", 549]]);
    expect(catalogWins.total).toBe(549);
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

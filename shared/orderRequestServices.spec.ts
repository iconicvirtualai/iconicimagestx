import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagesForStaffEditor } from "./bookingCatalog.ts";
import { buildLinkedInvoiceDraft, invoiceDraftFromOrder } from "./orderProjectInvoice.ts";
import { orderServiceInvoicePatch } from "./staffInvoice.ts";
import { processingFee } from "./invoiceProcessing.ts";
import {
  catalogServiceChoices,
  customOrderLine,
  editorRowsFromStored,
  formatAppointmentLength,
  lineFromChoice,
  orderServiceQuote,
  orderServiceSavePatch,
  presentOrderCharges,
  withLineQty,
} from "./orderRequestServices.ts";

const orderPage = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");

describe("order request catalog choices", () => {
  const catalog = packagesForStaffEditor([
    {
      id: "listing-essentials",
      durationMinutes: 30,
      variants: [
        { id: "essentials-rush", name: "Rush", price: 299, durationMinutes: 30 },
        { id: "", name: "Skipped", price: 1 },
      ],
    },
  ]);

  it("lists packages, photo sets, add-ons, and variants from the catalog", () => {
    const choices = catalogServiceChoices(catalog);
    const essentials = choices.find((choice) => choice.packageId === "listing-essentials" && !choice.variantId);
    const rush = choices.find((choice) => choice.variantId === "essentials-rush");
    const photos = choices.find((choice) => choice.packageId === "photos-35");
    const drone = choices.find((choice) => choice.packageId === "aerial-drone");
    expect(essentials).toMatchObject({ name: "The Essentials", price: 249, group: "service", durationMinutes: 30 });
    expect(rush).toMatchObject({
      name: "The Essentials — Rush",
      price: 299,
      group: "variant",
      durationMinutes: 30,
      packageId: "listing-essentials",
    });
    expect(photos).toMatchObject({ group: "basic", price: 150 });
    expect(drone).toMatchObject({ group: "addon", price: 99 });
    expect(choices.some((choice) => choice.name === "Skipped")).toBe(false);
  });

  it("keeps an apprentice appointment length and leaves an unstated length blank", () => {
    const choices = catalogServiceChoices(packagesForStaffEditor([]));
    const apprentice = choices.find((choice) => choice.packageId === "apprentice-25");
    const showcase = choices.find((choice) => choice.packageId === "listing-showcase");
    expect(apprentice?.durationMinutes).toBe(20);
    expect(apprentice?.price).toBe(75);
    expect(showcase?.durationMinutes).toBeNull();
    expect(formatAppointmentLength(20)).toBe("20 min");
    expect(formatAppointmentLength(60)).toBe("1 hour");
    expect(formatAppointmentLength(null)).toBe("");
  });
});

describe("order request service save", () => {
  const catalog = packagesForStaffEditor([
    {
      id: "listing-essentials",
      durationMinutes: 30,
      variants: [{ id: "essentials-rush", name: "Rush", price: 299, durationMinutes: 30 }],
    },
  ]);
  const choices = catalogServiceChoices(catalog);

  it("prices a catalog service, keeps the id, and adds 2.8% on top", () => {
    const essentials = choices.find((choice) => choice.key === "listing-essentials");
    if (!essentials) throw new Error("missing essentials");
    const line = withLineQty(lineFromChoice(essentials), 1);
    const patch = orderServiceSavePatch([line]);
    expect(line).toMatchObject({
      id: "listing-essentials",
      catalogId: "listing-essentials",
      unitPrice: 249,
      price: 249,
      durationMinutes: 30,
    });
    expect(patch.catalogPackageIds).toEqual(["listing-essentials"]);
    expect(patch.selectedService).toBe("listing-essentials");
    expect(patch.selectedBasics).toEqual([]);
    expect(patch.selectedAddOns).toEqual([]);
    expect(patch.subtotal).toBe(249);
    expect(patch.processing).toBe(6.97);
    expect(patch.processing).toBe(processingFee(249));
    expect(patch.total).toBe(255.97);
    expect(patch.appointmentDuration).toBe(30);
    expect(patch.lineItems.map((item) => item.id)).toEqual(["listing-essentials"]);
    expect(patch.lineItems.some((item) => item.id === "adjustment-processing")).toBe(false);
  });

  it("saves a variant id and multiplies the catalog unit price by quantity", () => {
    const rush = choices.find((choice) => choice.variantId === "essentials-rush");
    const photos = choices.find((choice) => choice.packageId === "photos-20");
    const drone = choices.find((choice) => choice.packageId === "aerial-drone");
    if (!rush || !photos || !drone) throw new Error("missing choices");
    const patch = orderServiceSavePatch([
      withLineQty(lineFromChoice(rush), 2),
      lineFromChoice(photos),
      lineFromChoice(drone),
    ]);
    expect(patch.lineItems[0]).toMatchObject({
      id: "essentials-rush",
      catalogId: "listing-essentials",
      variantId: "essentials-rush",
      qty: 2,
      unitPrice: 299,
      price: 598,
    });
    expect(patch.catalogPackageIds).toEqual(["listing-essentials", "photos-20", "aerial-drone"]);
    expect(patch.catalogVariantIds).toEqual(["essentials-rush"]);
    expect(patch.selectedService).toBe("listing-essentials");
    expect(patch.selectedBasics).toEqual(["photos-20"]);
    expect(patch.selectedAddOns).toEqual(["aerial-drone"]);
    expect(patch.subtotal).toBe(598 + 99 + 99);
    expect(patch.processing).toBe(processingFee(patch.subtotal));
  });

  it("keeps a staff custom line off the catalog ids and still fees the manual price", () => {
    const custom = { ...customOrderLine(), name: "Extra prints", unitPrice: 40, price: 40 };
    const patch = orderServiceSavePatch([custom]);
    expect(patch.lineItems).toEqual([
      expect.objectContaining({ name: "Extra prints", price: 40, custom: true }),
    ]);
    expect(patch.lineItems[0].id).toBeUndefined();
    expect(patch.catalogPackageIds).toEqual([]);
    expect(patch.selectedService).toBeNull();
    expect(patch.processing).toBe(processingFee(40));
    expect(patch.total).toBe(41.12);
  });

  it("fees the service total after a promo and leaves travel outside the fee", () => {
    const essentials = choices.find((choice) => choice.key === "listing-essentials");
    if (!essentials) throw new Error("missing essentials");
    const quote = orderServiceQuote([lineFromChoice(essentials)], {
      promoDiscount: 35,
      travel: 50,
      tax: 0,
    });
    expect(quote.subtotal).toBe(249);
    expect(quote.promotions).toBe(35);
    expect(quote.processing).toBe(processingFee(214));
    expect(quote.total).toBe(214 + processingFee(214) + 50);
  });

  it("turns a typed name with no catalog match into a custom line and refills a $0 catalog match", () => {
    const rows = editorRowsFromStored([
      { name: "gggfgdfgd", price: 0 },
      { id: "listing-essentials", name: "The Essentials", price: 0, qty: 1 },
    ], catalog);
    expect(rows[0]).toMatchObject({ name: "gggfgdfgd", custom: true, unlisted: true, price: 0 });
    expect(rows[1]).toMatchObject({
      id: "listing-essentials",
      catalogId: "listing-essentials",
      custom: false,
      unitPrice: 249,
      durationMinutes: 30,
    });
  });

  it("copies the saved fee onto a linked invoice without inventing one for older orders", () => {
    const synced = orderServiceInvoicePatch({
      lineItems: [{ id: "listing-essentials", name: "The Essentials", catalogId: "listing-essentials", price: 249, qty: 1 }],
      processing: 6.97,
      pricing: { tax: 0 },
    }, { amountPaid: 0, processing: 1, tax: 0 });
    expect(synced.processing).toBe(6.97);
    expect(synced.lineItems?.map((item) => [item.name, item.price])).toEqual([
      ["The Essentials", 249],
      ["Processing", 6.97],
    ]);
    expect(synced.lineItems?.[0]).toMatchObject({ id: "listing-essentials", catalogId: "listing-essentials" });
    expect(synced.total).toBe(255.97);

    const kept = orderServiceInvoicePatch({
      lineItems: [{ name: "Photos", price: 200 }],
      pricing: { tax: 0 },
    }, { amountPaid: 0, processing: 6, travel: 15, tax: 0 });
    expect(kept).not.toHaveProperty("processing");
    expect(kept.total).toBe(221);
  });

  it("carries a stored order fee onto a new invoice draft", () => {
    const draft = buildLinkedInvoiceDraft(invoiceDraftFromOrder({
      id: "req1",
      lineItems: [{ id: "listing-essentials", name: "The Essentials", price: 249 }],
      total: 255.97,
      processing: 6.97,
      pricing: { subtotal: 249, tax: 0, total: 255.97 },
      email: "ada@example.com",
      clientName: "Ada",
    }));
    expect(draft.total).toBe(255.97);
    expect(draft.processing).toBe(6.97);
    expect(draft.lineItems.map((item) => [item.name, item.price])).toEqual([
      ["The Essentials", 249],
      ["Processing", 6.97],
    ]);
  });
});

describe("order request page", () => {
  it("uses the catalog picker instead of a free-text service name", () => {
    expect(orderPage).toContain("OrderServicesFields");
    expect(readFileSync(new URL("../client/components/OrderServicesFields.tsx", import.meta.url), "utf8")).toContain("OrderServiceEditor");
    expect(orderPage).not.toContain('placeholder="Service name"');
    expect(orderPage).not.toContain("+ Add Service");
  });

  it("shows a stored processing fee on its own line and does not send client mail from this page", () => {
    const shown = presentOrderCharges({
      lineItems: [
        { id: "listing-essentials", name: "The Essentials", price: 249 },
        { id: "adjustment-processing", name: "Processing", price: 6.97 },
      ],
      processing: 6.97,
      total: 255.97,
    });
    expect(shown.services.map((line) => line.name)).toEqual(["The Essentials"]);
    expect(shown.processing).toBe(6.97);
    expect(shown.total).toBe(255.97);
    expect(orderPage).not.toMatch(/sendMail|sendSms|CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE/);
  });
});

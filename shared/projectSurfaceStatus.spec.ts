import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildBillingIndex,
  projectSurfaceForListing,
  projectSurfaceStatus,
} from "./projectSurfaceStatus";

const PAGEMILL = "5PBP8HYUaADAOJRGwoeU";

const listingsPage = readFileSync(new URL("../client/pages/AdminListings.tsx", import.meta.url), "utf8");
const projectPage = readFileSync(new URL("../client/pages/AdminListingFile.tsx", import.meta.url), "utf8");
const reader = readFileSync(new URL("../client/lib/projectSurfaceRead.ts", import.meta.url), "utf8");

function labels(surface: { chips: { label: string }[] }) {
  return surface.chips.map((chip) => chip.label);
}

describe("project surface status", () => {
  it("shows Cancelled and Paid when the linked invoice is paid", () => {
    const surface = projectSurfaceStatus({
      listing: {
        id: PAGEMILL,
        status: "cancelled",
        invoiceStatus: "unpaid",
        galleryStatus: "delivered",
        deliveredAt: "2026-02-01",
      },
      invoices: [{ id: "inv_paid", status: "paid", total: 549, amountPaid: 549, listingId: PAGEMILL }],
    });
    expect(surface.cancelled).toBe(true);
    expect(surface.payment).toBe("paid");
    expect(surface.delivered).toBe(true);
    expect(labels(surface)).toEqual(["Cancelled", "Paid"]);
  });

  it("shows Cancelled and Unpaid when the linked invoice is not paid", () => {
    const surface = projectSurfaceStatus({
      listing: {
        id: PAGEMILL,
        status: "CANCELLED",
        invoiceStatus: "paid",
        paymentStatus: "paid",
        paidAt: "2026-02-01",
        amountPaid: 549,
        total: 549,
        galleryStatus: "delivered",
        deliveredAt: "2026-02-02",
      },
      invoices: [{ id: "inv_open", status: "sent", total: 549, amountPaid: 0, listingId: PAGEMILL }],
    });
    expect(surface.projectStatus).toBe("cancelled");
    expect(surface.payment).toBe("unpaid");
    expect(labels(surface)).toEqual(["Cancelled", "Unpaid"]);
    expect(labels(surface)).not.toContain("Delivered");
    expect(labels(surface)).not.toContain("Paid");
  });

  it("does not treat copied listing fields as payment when no invoice is linked", () => {
    const surface = projectSurfaceStatus({
      listing: {
        id: PAGEMILL,
        status: "cancelled",
        address: "1906 Pagemill",
        invoiceStatus: "paid",
        paymentStatus: "paid",
        paidAt: "2026-02-01",
        amountPaid: 549,
        total: 549,
        invoice: { status: "paid", total: 549, amountPaid: 549 },
        galleryStatus: "delivered",
        deliveryStatus: "delivered",
        deliveredAt: "2026-02-02",
      },
    });
    expect(surface.invoiceId).toBeNull();
    expect(surface.payment).toBe("no_invoice");
    expect(labels(surface)).toEqual(["Cancelled", "No invoice"]);
  });

  it("shows Delivered and Paid from listing status plus the invoice", () => {
    const surface = projectSurfaceStatus({
      listing: { id: "list_ok", status: "delivered", galleryStatus: "editing" },
      invoices: [{ id: "inv_ok", status: "sent", paymentStatus: "paid", total: 200, amountPaid: 200, listingId: "list_ok" }],
    });
    expect(surface.payment).toBe("paid");
    expect(labels(surface)).toEqual(["Delivered", "Paid"]);
  });

  it("uses the invoice linked on the order ahead of the listing", () => {
    const surface = projectSurfaceStatus({
      listing: { id: "list1", status: "cancelled", invoiceId: "inv_listing" },
      order: { id: "order9", invoiceId: "inv_order", status: "cancelled" },
      invoices: [
        { id: "inv_listing", status: "draft", total: 100, amountPaid: 0 },
        { id: "inv_order", status: "paid", total: 100, amountPaid: 100 },
      ],
    });
    expect(surface.invoiceId).toBe("inv_order");
    expect(surface.payment).toBe("paid");
    expect(labels(surface)).toEqual(["Cancelled", "Paid"]);
  });

  it("uses the invoice linked on the listing when the order has none", () => {
    const surface = projectSurfaceStatus({
      listing: { id: "list1", status: "delivered", invoiceId: "inv_listing" },
      order: { id: "order9", status: "delivered" },
      orderRequest: { id: "req1", status: "confirmed" },
      invoices: [{ id: "inv_listing", status: "partial", total: 400, amountPaid: 100, listingId: "list1" }],
    });
    expect(surface.invoiceId).toBe("inv_listing");
    expect(surface.payment).toBe("partial");
    expect(labels(surface)).toEqual(["Delivered", "Partial"]);
  });

  it("follows listing.invoice.id and an order linked only by listingId", () => {
    const viaEmbed = projectSurfaceStatus({
      listing: { id: "list1", status: "cancelled", invoice: { id: "inv_embed", status: "draft" } },
      invoices: [{ id: "inv_embed", status: "paid", total: 80, amountPaid: 80 }],
    });
    expect(viaEmbed.invoiceId).toBe("inv_embed");
    expect(viaEmbed.payment).toBe("paid");

    const index = buildBillingIndex({
      orders: [{ id: "order9", listingId: PAGEMILL, invoiceId: "inv_order", status: "cancelled" }],
      invoices: [{ id: "inv_order", status: "paid", total: 549, amountPaid: 549 }],
    });
    const viaOrder = projectSurfaceForListing({
      id: PAGEMILL,
      status: "cancelled",
      invoiceStatus: "paid",
      galleryStatus: "delivered",
      deliveredAt: "2026-03-01",
    }, index);
    expect(viaOrder.order?.id).toBe("order9");
    expect(viaOrder.invoiceId).toBe("inv_order");
    expect(viaOrder.payment).toBe("paid");
    expect(labels(viaOrder)).toEqual(["Cancelled", "Paid"]);
  });

  it("discovers an invoice by orderRequestId when neither side stored invoiceId", () => {
    const index = buildBillingIndex({
      orderRequests: [{ id: "req1", listingId: PAGEMILL, status: "cancelled" }],
      invoices: [{ id: "inv_req", status: "paid", total: 10, amountPaid: 10, orderRequestId: "req1" }],
    });
    const surface = projectSurfaceForListing({ id: PAGEMILL, status: "cancelled" }, index);
    expect(surface.invoiceId).toBe("inv_req");
    expect(surface.payment).toBe("paid");
    expect(labels(surface)).toEqual(["Cancelled", "Paid"]);
  });
});

describe("project card and project page share the helper", () => {
  it("reads billing on the card and the project page without writing", () => {
    expect(listingsPage).toContain("projectSurfaceForListing");
    expect(listingsPage).toContain("loadAdminListingBilling");
    expect(listingsPage).toContain("listingPriceLabel");
    expect(listingsPage).not.toContain("useProjectBillingPool");
    expect(listingsPage).not.toContain("loadAdminListingPrices");
    expect(projectPage).toContain("readProjectSurface");
    expect(projectPage).toContain("projectSurfaceStatus");
    expect(projectPage).not.toContain("resolveLinkedInvoice");
    expect(reader).not.toContain("updateDoc");
    expect(reader).not.toContain("setDoc");
    expect(reader).not.toContain("writeBatch");
    expect(reader).not.toContain("runTransaction");
    expect(reader).not.toContain("addDoc");
  });
});

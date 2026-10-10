import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLinkedInvoiceDraft,
  draftInvoiceNumber,
  isHumanInvoiceNumber,
  nextSequentialInvoiceNumber,
  presentInvoiceNumber,
  invoiceDraftFromOrder,
  invoiceDraftFromProject,
  listingLinkFields,
  orderInvoiceButtonLabel,
  orderInvoiceDocId,
  planInvoiceLink,
  projectInvoiceButtonLabel,
} from "./orderProjectInvoice";

const orderPage = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
const ordersPage = readFileSync(new URL("../client/pages/AdminOrders.tsx", import.meta.url), "utf8");
const projectPage = readFileSync(new URL("../client/pages/AdminListingFile.tsx", import.meta.url), "utf8");
const clientLib = readFileSync(new URL("../client/lib/orderProjectInvoice.ts", import.meta.url), "utf8");
const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const clientInvoice = readFileSync(new URL("../client/pages/ClientInvoice.tsx", import.meta.url), "utf8");
const paymentsRoute = readFileSync(new URL("../server/routes/payments.ts", import.meta.url), "utf8");

describe("human invoice numbers", () => {
  const when = new Date("2026-10-02T00:00:00Z");

  it("never turns a non-numeric suffix into NaN", () => {
    const next = nextSequentialInvoiceNumber(
      ["INV-2026-EQREQ1", "INV-2026-0NaN", "INV-2026-0007", "PLAY-ABC", "INV-2025-0099"],
      2026,
    );
    expect(next).toBe("INV-2026-0008");
    expect(next).not.toMatch(/nan/i);
    expect(isHumanInvoiceNumber(next)).toBe(true);
    expect(nextSequentialInvoiceNumber([], 2026)).toBe("INV-2026-0001");
    expect(String(Number.NaN).padStart(4, "0")).toBe("0NaN");
  });

  it("replaces a stored NaN number with a stable id-based number", () => {
    expect(presentInvoiceNumber("INV-2026-0NaN", "OxD4TIjwc6X6GY57XFIn", when)).toBe(
      draftInvoiceNumber("OxD4TIjwc6X6GY57XFIn", when),
    );
    expect(presentInvoiceNumber("INV-2026-0007", "OxD4TIjwc6X6GY57XFIn", when)).toBe("INV-2026-0007");
    expect(presentInvoiceNumber("INV-2026-0NaN", "OxD4TIjwc6X6GY57XFIn", when)).not.toMatch(/nan/i);
    expect(presentInvoiceNumber("TEST-DELIVERY-QA", "playtest-delivery-qa-invoice", when)).toBe("TEST-DELIVERY-QA");
    expect(presentInvoiceNumber("TEST-DELIVERY-QA", "playtest-delivery-qa-invoice", when)).not.toBe("INV-2026-NVOICE");
    expect(presentInvoiceNumber("INV-2026-0019", "playtest-delivery-qa-invoice", when)).toBe("INV-2026-0019");
  });

  it("wires booking generation and the public invoice page off the NaN path", () => {
    expect(bookings).toContain("nextSequentialInvoiceNumber");
    expect(bookings).not.toContain("parseInt(last");
    expect(paymentsRoute).toContain("invoicePageInvoiceNumber");
    expect(paymentsRoute).toContain("invoice.invoiceNumber");
    expect(paymentsRoute).toContain("invoiceDoc.id");
    expect(clientInvoice).toContain("invoicePageInvoiceNumber");
    expect(clientInvoice).toContain("invoice.invoiceNumber");
    expect(clientInvoice).toContain("id: invoiceId");
    expect(clientInvoice).toContain('href="/"');
    expect(clientInvoice).toContain("Back to Home");
    expect(clientInvoice).not.toContain('<Link to="/">');
  });
});

describe("invoice button", () => {
  it("says Create Invoice until one is attached, then View Invoice", () => {
    expect(orderInvoiceButtonLabel(false)).toBe("Create Invoice");
    expect(orderInvoiceButtonLabel(true)).toBe("View Invoice");
    expect(projectInvoiceButtonLabel(false)).toBe("Create Invoice");
    expect(projectInvoiceButtonLabel(true)).toBe("Manage Invoice");
  });
});

describe("planInvoiceLink", () => {
  it("uses one stable id for an order and the project created from it", () => {
    const fromOrder = planInvoiceLink({ orderRequestId: "req1", listingId: "list1" });
    const fromProject = planInvoiceLink({ orderRequestId: "req1", listingId: "list1" });
    expect(fromOrder.attached).toBe(false);
    expect(fromOrder.createId).toBe(orderInvoiceDocId("req1"));
    expect(fromProject.createId).toBe(fromOrder.createId);
    expect(fromOrder.orderRequestFields).toMatchObject({ invoiceId: "ordreq_req1", listingId: "list1" });
    expect(fromOrder.listingFields).toMatchObject({ invoiceId: "ordreq_req1", orderRequestId: "req1" });
    expect(fromOrder.invoiceFields).toMatchObject({ orderRequestId: "req1", listingId: "list1" });
    expect(fromOrder.invoiceFields).not.toHaveProperty("total");
    expect(fromOrder.invoiceFields).not.toHaveProperty("lineItems");
    expect(fromOrder.invoiceFields).not.toHaveProperty("amountDue");
  });

  it("reuses an invoice discovered by orderRequestId when the order field was never set", () => {
    const plan = planInvoiceLink({
      orderRequestId: "req1",
      listingId: "list1",
      foundInvoiceIds: ["auto123"],
    });
    expect(plan.attached).toBe(true);
    expect(plan.createId).toBe("auto123");
    expect(plan.orderRequestFields?.invoiceId).toBe("auto123");
    expect(plan.listingFields?.invoiceId).toBe("auto123");
  });

  it("keeps the order's invoice when the project points at a different one", () => {
    const plan = planInvoiceLink({
      orderRequestId: "req1",
      orderId: "order9",
      listingId: "list1",
      orderInvoiceId: "inv_order",
      listingInvoiceId: "listing_list1",
      foundInvoiceIds: ["other"],
    });
    expect(plan.createId).toBe("inv_order");
    expect(plan.listingFields?.invoiceId).toBe("inv_order");
    expect(plan.orderFields).toMatchObject({
      invoiceId: "inv_order",
      orderRequestId: "req1",
      listingId: "list1",
    });
  });

  it("does not mint a second id when create runs again", () => {
    const first = planInvoiceLink({ orderRequestId: "req1", listingId: "list1" });
    const second = planInvoiceLink({
      orderRequestId: "req1",
      listingId: "list1",
      orderInvoiceId: first.createId,
      foundInvoiceIds: [first.createId],
    });
    expect(second.attached).toBe(true);
    expect(second.createId).toBe(first.createId);
  });

  it("gives a project with no order its own stable invoice", () => {
    const plan = planInvoiceLink({ listingId: "listOnly" });
    expect(plan.attached).toBe(false);
    expect(plan.createId).toBe("listing_listOnly");
    expect(plan.orderRequestFields).toBeNull();
    expect(plan.orderFields).toBeNull();
    expect(plan.listingFields).toEqual({ invoiceId: "listing_listOnly" });
  });
});

describe("listing pairing", () => {
  it("writes the order and invoice ids onto the new project", () => {
    expect(listingLinkFields({
      orderRequestId: "req1",
      orderId: " order9 ",
      invoiceId: "",
    })).toEqual({ orderRequestId: "req1", orderId: "order9" });
    expect(listingLinkFields({
      orderRequestId: "req1",
      orderId: null,
      invoiceId: "inv_order",
    })).toEqual({ orderRequestId: "req1", invoiceId: "inv_order" });
  });
});

describe("admin invoice drafts copy stored totals", () => {
  it("keeps the order total even when line prices differ", () => {
    const draft = buildLinkedInvoiceDraft(invoiceDraftFromOrder({
      id: "req1",
      lineItems: [{ name: "Photos", price: 10 }],
      total: 763,
      pricing: { subtotal: 763, tax: 0, total: 763 },
      email: "Agent@Example.com",
      clientName: "Ada Lovelace",
      promoCode: "ICONICAI",
      promoDiscount: 35,
    }));
    expect(draft.total).toBe(763);
    expect(draft.amountDue).toBe(763);
    expect(draft.orderRequestId).toBe("req1");
    expect(draft.clientEmail).toBe("agent@example.com");
    expect(draft.status).toBe("draft");
    expect(draftInvoiceNumber("ordreq_req1", new Date("2026-10-01T00:00:00Z"))).toBe("INV-2026-EQREQ1");
  });

  it("uses the project total for project-only billing", () => {
    const draft = buildLinkedInvoiceDraft(invoiceDraftFromProject({
      services: ["Headshots", "Brand film"],
      total: 400,
      clientEmail: "studio@example.com",
      clientName: "Studio Client",
    }));
    expect(draft.total).toBe(400);
    expect(draft.amountDue).toBe(400);
    expect(draft.orderRequestId).toBeNull();
    expect(draft.lineItems.map((item) => item.price)).toEqual([400, 0]);
  });
});

describe("admin UI wires the shared invoice", () => {
  it("switches the order button and does not toast the empty view", () => {
    expect(orderPage).toContain("orderInvoiceButtonLabel");
    expect(orderPage).toContain("ensureLinkedInvoice");
    expect(orderPage).not.toContain("No invoice is attached to this request yet.");
    expect(orderPage).toContain("listingLinkFields");
    expect(orderPage).not.toContain("invoiceNumber: `INV-");
  });

  it("pairs bulk projects the same way and keeps project manage on that invoice", () => {
    expect(ordersPage).toContain("listingLinkFields");
    expect(ordersPage).not.toContain("invoiceNumber: `INV-");
    expect(projectPage).toContain("projectInvoiceButtonLabel");
    expect(projectPage).toContain("ensureLinkedInvoice");
    expect(projectPage).toContain("invoiceDraftFromOrder");
    expect(projectPage).toContain("View Order");
  });

  it("does not send client email or SMS from the admin link helper", () => {
    expect(clientLib).not.toContain("deliverInvoice");
    expect(clientLib).not.toContain("sendEmail");
    expect(clientLib).not.toContain("sendSMS");
    expect(clientLib).not.toContain("attachSquareInvoice");
  });

  it("stamps confirm links without changing the emailed booking total", () => {
    expect(bookings).toContain("stampDurableLinks");
    expect(bookings).toContain("total: money(total)");
    expect(bookings).toContain('template: "booking_received"');
    expect(bookings).toContain("Not creating a second invoice.");
  });
});

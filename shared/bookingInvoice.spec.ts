import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMO_DISCOUNTS } from "./bookingCatalog";
import {
  buildBookingInvoiceDraft,
  existingInvoiceId,
  invoiceDeliveryAction,
} from "./bookingInvoice";
import {
  buildSubmittedLineItems,
  orderTotalLabel,
  sumLineItemPrices,
  type BookingPriceInput,
} from "./bookingPricing";

const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const clients = readFileSync(new URL("../server/routes/clients.ts", import.meta.url), "utf8");
const notify = readFileSync(new URL("./clientNotify.ts", import.meta.url), "utf8");

const selection: BookingPriceInput = {
  selectedService: "listing-showcase",
  selectedBasics: ["photos-35"],
  selectedAddOns: ["aerial-drone"],
  promo: { code: "ICONICAI", discount: PROMO_DISCOUNTS.ICONICAI },
  lifeOfTheListingCare: true,
};

describe("booking invoice draft", () => {
  it("copies the submitted total and does not subtract promo a second time", () => {
    const lineItems = buildSubmittedLineItems(selection);
    const total = sumLineItemPrices(lineItems);
    const draft = buildBookingInvoiceDraft({
      lineItems,
      total,
      pricing: { subtotal: total },
      clientEmail: "Agent@Example.com",
      clientId: "client-1",
      clientName: "Ada Lovelace",
      orderRequestId: "req-1",
      promoCode: "ICONICAI",
      promoDiscount: 35,
    });

    expect(total).toBe(763);
    expect(draft.total).toBe(total);
    expect(draft.amountDue).toBe(total);
    expect(draft.status).toBe("draft");
    expect(draft.paymentProvider).toBe("square");
    expect(draft.clientEmail).toBe("agent@example.com");
    expect(draft.clientId).toBe("client-1");
    expect(draft.promoDiscount).toBe(35);
    expect(sumLineItemPrices(draft.lineItems)).toBe(total);
    expect(orderTotalLabel(draft.total)).toBe("$763.00");
    expect(draft.lineItems.some((item) => /life of the listing/i.test(item.name))).toBe(false);
  });

  it("treats a stored invoice id as already created", () => {
    expect(existingInvoiceId("  inv_123  ")).toBe("inv_123");
    expect(existingInvoiceId("")).toBeNull();
    expect(existingInvoiceId(null)).toBeNull();
    expect(invoiceDeliveryAction(false)).toBe("send-invoice");
    expect(invoiceDeliveryAction(true)).toBe("payment_receipt");
  });
});

describe("booking route keeps invoices off the Square hot path", () => {
  it("creates a draft invoice after the order write and still emails the request total", () => {
    const postStart = bookings.indexOf('router.post("/",');
    const postEnd = bookings.indexOf('router.get("/",');
    const post = bookings.slice(postStart, postEnd);

    expect(post).toContain("[Bookings] Invoice draft create failed");
    expect(post.indexOf("[Bookings] Invoice draft create failed")).toBeLessThan(post.indexOf("total: money(total)"));
    expect(post).toContain("total: money(total)");
    expect(post).toContain("money(total)");
    expect(post).not.toContain("connect.squareup.com");
    expect(post).not.toContain("SQUARE_ACCESS_TOKEN");
  });

  it("does not create a second invoice when the request already has one", () => {
    expect(bookings).toContain("existingInvoiceId(request.invoiceId)");
    expect(bookings).toContain("Not creating a second invoice.");
  });

  it("still finds portal invoices by client email", () => {
    expect(clients).toContain('collection("invoices").where("clientEmail", "==", identity.email)');
  });

  it("does not weaken the client notification gates", () => {
    expect(notify).toContain('return env.CLIENT_NOTIFY_LIVE === "true"');
    expect(notify).toContain('if (template === ORDER_RECEIVED_EMAIL_TEMPLATE) return true;');
    expect(notify).toContain('if (kind === ORDER_RECEIVED_SMS_KIND) return true;');
    expect(bookings).toContain('template: "booking_received"');
    expect(bookings).toContain('kind: "booking_confirmation"');
  });
});

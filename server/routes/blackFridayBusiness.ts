/**
 * Public Black Friday business checkout.
 * Creates a Square payment link for the package price. No processing fee.
 * Opening the link is the buyer's step. This route does not capture a payment,
 * and it does not send email or text.
 */

import { randomBytes } from "node:crypto";
import { Router } from "express";
import { isSquareCheckoutUrl } from "../../shared/amenityStock";
import {
  BLACK_FRIDAY_BUSINESS_SHARED,
  BLACK_FRIDAY_BUSINESS_SOURCE,
  blackFridayBusinessOpen,
  blackFridayBusinessPackage,
  formatBusinessCents,
  quoteBlackFridayBusiness,
} from "../../shared/blackFridayBusiness";
import { publicSiteUrl } from "../../shared/publicSiteUrl";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { createHolidaySquareCheckout } from "../services/holidaySquareCheckout";
import { saveFlashSaleOrder } from "../services/flashSaleOrders";

const router = Router();
const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12 });

export function resetBlackFridayBusinessRateLimit(): void {
  limiter.reset();
}

function clean(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function orderNumber(): string {
  return `BFB-${randomBytes(3).toString("hex").toUpperCase()}`;
}

router.post("/checkout", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Too many checkout attempts. Please wait and try again." });
  }
  if (!blackFridayBusinessOpen()) {
    return res.status(410).json({ error: "This Black Friday offer has ended." });
  }

  const quote = quoteBlackFridayBusiness(String(req.body?.package || ""));
  const item = quote ? blackFridayBusinessPackage(quote.id) : null;
  const name = clean(req.body?.name, 120);
  const business = clean(req.body?.business, 160);
  const email = clean(req.body?.email, 160).toLowerCase();
  const phone = clean(req.body?.phone, 40);
  if (!quote || !item) return res.status(400).json({ error: "Choose a package." });
  if (
    name.length < 2
    || business.length < 2
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || phone.replace(/\D/g, "").length < 7
  ) {
    return res.status(400).json({ error: "Name, business, email, and phone are required." });
  }

  const number = orderNumber();
  let origin = "https://iconicimagestx.vercel.app";
  try {
    origin = publicSiteUrl();
  } catch (err) {
    console.error("[Black Friday Business] Public site URL is not https. Using the Vercel app.", err);
  }
  const redirectUrl = `${origin}/black-friday-business?paid=1&order=${encodeURIComponent(number)}&package=${quote.id}`;
  const linked = await createHolidaySquareCheckout({
    invoiceId: `bfb-${quote.id}-${number}`,
    invoiceNumber: number,
    amount: quote.totalCents / 100,
    email,
    itemName: quote.name,
    leadSource: "Black Friday Business",
    orderNumber: number,
    redirectUrl,
    logLabel: "Black Friday Business",
    lineItems: [
      { name: `Black Friday · ${quote.name}`, amountCents: quote.totalCents },
    ],
  });

  if (linked.payment !== "square" || !linked.checkoutUrl || !isSquareCheckoutUrl(linked.checkoutUrl)) {
    return res.status(503).json({ error: "Square checkout is not available right now." });
  }

  const purchasedAt = new Date();
  const id = await saveFlashSaleOrder({
    clientName: name,
    clientEmail: email,
    clientPhone: phone,
    businessName: business,
    title: `Black Friday · ${quote.name}`,
    selectedService: quote.name,
    source: BLACK_FRIDAY_BUSINESS_SOURCE,
    leadSource: "Black Friday Business",
    status: "awaiting-payment",
    package: quote.id,
    lineItems: [
      { name: quote.name, price: quote.totalCents / 100, qty: 1 },
    ],
    subtotal: quote.subtotalCents / 100,
    processing: 0,
    total: quote.totalCents / 100,
    pricing: {
      subtotal: quote.subtotalCents / 100,
      processing: 0,
      tax: 0,
      total: quote.totalCents / 100,
    },
    notes: [
      `${quote.name} for ${business}.`,
      "Paid in full. No processing fee.",
      ...item.features,
      ...BLACK_FRIDAY_BUSINESS_SHARED,
    ].join(" "),
    orderNumber: number,
    squareLinkId: linked.linkId || "",
    squareOrderId: linked.squareOrderId || "",
    createdAt: purchasedAt.toISOString(),
    updatedAt: purchasedAt.toISOString(),
  });

  return res.json({
    checkoutUrl: linked.checkoutUrl,
    orderNumber: number,
    orderId: id,
    total: formatBusinessCents(quote.totalCents),
  });
});

export default router;

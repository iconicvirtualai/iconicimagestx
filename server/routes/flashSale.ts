/**
 * Public Black Friday checkout. The /api/flash-sale path stays so existing callers keep working.
 * Creates a Square payment link for the bundle plus the usual 2.8% fee.
 * Opening the link is the buyer's step. This route does not capture a payment,
 * and it does not send email or text.
 */

import { randomBytes } from "node:crypto";
import { Router } from "express";
import { isSquareCheckoutUrl } from "../../shared/amenityStock";
import {
  FLASH_SALE_SOURCE,
  flashSaleAddon,
  flashSaleOpen,
  flashSaleUseBy,
  formatFlashCents,
  quoteFlashSale,
} from "../../shared/flashSale";
import { publicSiteUrl } from "../../shared/publicSiteUrl";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { createHolidaySquareCheckout } from "../services/holidaySquareCheckout";
import { saveFlashSaleOrder } from "../services/flashSaleOrders";

const router = Router();
const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12 });

export function resetFlashSaleRateLimit(): void {
  limiter.reset();
}

function clean(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function orderNumber(): string {
  return `FS-${randomBytes(3).toString("hex").toUpperCase()}`;
}

router.post("/checkout", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Too many checkout attempts. Please wait and try again." });
  }
  if (!flashSaleOpen()) {
    return res.status(410).json({ error: "This Black Friday sale has ended." });
  }

  const shoots = Number(req.body?.bundle);
  const quote = quoteFlashSale(shoots);
  const addon = flashSaleAddon(String(req.body?.addon || ""));
  const name = clean(req.body?.name, 120);
  const email = clean(req.body?.email, 160).toLowerCase();
  const phone = clean(req.body?.phone, 40);
  if (!quote || !addon) return res.status(400).json({ error: "Choose a bundle and one add-on." });
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, "").length < 7) {
    return res.status(400).json({ error: "Name, email, and phone are required." });
  }

  const number = orderNumber();
  let origin = "https://iconicimagestx.vercel.app";
  try {
    origin = publicSiteUrl();
  } catch (err) {
    console.error("[Black Friday sale] Public site URL is not https. Using the Vercel app.", err);
  }
  const redirectUrl = `${origin}/black-friday?paid=1&order=${encodeURIComponent(number)}`;
  const linked = await createHolidaySquareCheckout({
    invoiceId: `fs-${quote.shoots}-${number}`,
    invoiceNumber: number,
    amount: quote.totalCents / 100,
    email,
    itemName: `Black Friday Sale ${quote.label}`,
    leadSource: "Black Friday Sale",
    orderNumber: number,
    redirectUrl,
    logLabel: "Black Friday Sale",
    lineItems: [
      { name: `Black Friday Sale · ${quote.label}`, amountCents: quote.subtotalCents },
      { name: quote.processingLabel, amountCents: quote.processingCents },
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
    title: `Black Friday Sale · ${quote.label}`,
    selectedService: "Black Friday Sale",
    source: FLASH_SALE_SOURCE,
    leadSource: "Black Friday Sale",
    status: "awaiting-payment",
    bundle: quote.shoots,
    addon: addon.id,
    addonLabel: addon.label,
    lineItems: [
      { name: `Prepaid ${quote.label}`, price: quote.subtotalCents / 100, qty: 1 },
      { name: quote.processingLabel, price: quote.processingCents / 100, qty: 1 },
    ],
    subtotal: quote.subtotalCents / 100,
    processing: quote.processingCents / 100,
    total: quote.totalCents / 100,
    pricing: {
      subtotal: quote.subtotalCents / 100,
      processing: quote.processingCents / 100,
      tax: 0,
      total: quote.totalCents / 100,
    },
    notes: [
      `Each shoot: 50 photos + 3 aerials + ${addon.label}.`,
      "Paid upfront. Use the shoots within 90 days.",
      `Use by ${flashSaleUseBy(purchasedAt).slice(0, 10)}.`,
    ].join(" "),
    useBy: flashSaleUseBy(purchasedAt),
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
    total: formatFlashCents(quote.totalCents),
  });
});

export default router;

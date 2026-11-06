/**
 * Pay Now for one amenity stock set.
 * Reuses the Square quick-pay link. Does not publish a Square invoice,
 * message the buyer, or open the photo set. Client notification flags
 * stay untouched. After payment, Iconic delivers the files manually.
 * An unmatched Square payment stays in the existing webhook review log.
 */

import { randomBytes } from "node:crypto";
import { Router } from "express";
import {
  amenityStockById,
  amenityStockReturnPath,
  isSquareCheckoutUrl,
} from "../../shared/amenityStock";
import { publicSiteUrl } from "../../shared/publicSiteUrl";
import { clientIp } from "../lib/clientIp";
import { createRateLimiter } from "../lib/rateLimit";
import { createHolidaySquareCheckout } from "../services/holidaySquareCheckout";

const router = Router();
const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12 });

export function resetStockFootageRateLimit() {
  limiter.reset();
}

function orderNumber(): string {
  return `STK-${randomBytes(4).toString("hex").toUpperCase()}`;
}

router.post("/checkout", async (req, res) => {
  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ error: "Too many checkout attempts. Please wait and try again." });
  }

  const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
  const card = amenityStockById(id);
  if (!card) return res.status(404).json({ error: "That amenity set is not available." });

  let origin = "https://iconicimagestx.vercel.app";
  try {
    origin = publicSiteUrl();
  } catch (err) {
    console.error("[Amenity stock] Public site URL is not https. Using the Vercel app.", err);
  }

  const number = orderNumber();
  const redirectUrl = `${origin}${amenityStockReturnPath(card.id, number)}`;
  const linked = await createHolidaySquareCheckout({
    invoiceId: `stk-${card.id}-${number}`,
    amount: card.price,
    itemName: `${card.neighborhood} amenity photos`,
    leadSource: "Stock footage",
    orderNumber: number,
    redirectUrl,
    logLabel: "Amenity stock",
  });

  if (linked.payment !== "square" || !linked.checkoutUrl || !isSquareCheckoutUrl(linked.checkoutUrl)) {
    return res.status(503).json({ error: "Square checkout is not available right now." });
  }

  return res.json({
    checkoutUrl: linked.checkoutUrl,
    orderNumber: number,
    manualDelivery: true,
  });
});

export default router;

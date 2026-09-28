/**
 * Shirt QR destination (/go).
 *
 * Sam / Cody: this is the only file you need to change when the promo updates.
 * The printed shirts stay pointed at /go. Edit the fields below and ship.
 *
 * - title, description: the headline and short blurb on the page
 * - ctaLabel, ctaHref: the button. Use a site path ("/book") or a full URL
 *   ("https://..."). Leave either one blank to hide the button.
 */
export interface GoPromo {
  /** Small label above the headline. */
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export const goPromo: GoPromo = {
  eyebrow: "Iconic Studio",
  title: "Current promo coming",
  description:
    "You’re in the right place. This page is the permanent home for our shirt QR — the latest offer, event, or announcement will land here, so the shirts never go out of date.",
  ctaLabel: "Book a shoot",
  ctaHref: "/book",
};

export function hasGoPromoCta(promo: GoPromo = goPromo): boolean {
  return promo.ctaLabel.trim().length > 0 && promo.ctaHref.trim().length > 0;
}

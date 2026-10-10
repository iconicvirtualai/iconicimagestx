/**
 * Shirt QR destination (/go).
 *
 * Sam / Cody: the printed shirts stay pointed at /go.
 * Edit the fields below when this landing page should say something new.
 *
 * - documentTitle: the browser tab title
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

export const goDocumentTitle = "Iconic Images | Book your shoot";

export const goPromo: GoPromo = {
  eyebrow: "Iconic Studio",
  title: "Real estate media that sells",
  description:
    "Listing photos, film, and brand media from Iconic Images. Book a shoot when you are ready.",
  ctaLabel: "Book a shoot",
  ctaHref: "/book",
};

export function hasGoPromoCta(promo: GoPromo = goPromo): boolean {
  return promo.ctaLabel.trim().length > 0 && promo.ctaHref.trim().length > 0;
}

import { describe, expect, it } from "vitest";
import { CLIENT_REVIEWS, FEATURED_REVIEW, reviewMonogram } from "./clientReviews";

const BANNED_NAMES = [
  "Chris Lawrence",
  "Bryce Perez",
  "Mark Shepherd",
  "James Dalton",
  "Lindsay Staloff",
  "Crystal-Mae",
  "Rip City",
  "Apollo3D",
  "Luxury Estate",
  "Wilson Reid",
];

describe("client reviews", () => {
  it("publishes the cleared set as initials only", () => {
    expect(CLIENT_REVIEWS.map((review) => review.initials)).toEqual([
      "R.J.",
      "S.Y.",
      "E.M.",
      "H.D.",
      "S.T.",
      "L.F.",
      "J.M.",
      "N.I.",
      "A.P.",
      "C.B.",
      "K.W.",
      "A.A.",
      "W.L.",
    ]);
    for (const review of CLIENT_REVIEWS) {
      expect(review.initials).toMatch(/^[A-Z]\.[A-Z]\.$/);
      expect(review.role === "Google review" || review.role === "Client").toBe(true);
      expect(review.quote.trim().length).toBeGreaterThan(0);
      expect(review.stars).toBe(5);
    }
    expect(CLIENT_REVIEWS.filter((review) => review.role === "Google review")).toHaveLength(2);
    expect(CLIENT_REVIEWS.find((review) => review.initials === "H.D.")?.quote).toBe(
      "Thank you so much, the pictures look great. Thank y'all so much for the quick turn around and wonderful service. My client had nothing but nice things to say about the photos process.",
    );
    expect(CLIENT_REVIEWS.find((review) => review.initials === "L.F.")?.quote).toBe(
      "Thank you so much. You guys always do a great job.",
    );
    expect(CLIENT_REVIEWS.find((review) => review.initials === "A.A.")?.quote).toBe("The photos look perfect!");
    expect(CLIENT_REVIEWS.find((review) => review.initials === "W.L.")?.quote).toBe(
      "The video looks absolutely FIRE! I love it SO much!",
    );
    expect(JSON.stringify(CLIENT_REVIEWS)).not.toContain("paid the invoice");
    expect(JSON.stringify(CLIENT_REVIEWS)).not.toContain("Outside of those items");
  });

  it("features the S.Y. Google review and keeps staff-facing names out of attribution", () => {
    expect(FEATURED_REVIEW.initials).toBe("S.Y.");
    expect(FEATURED_REVIEW.role).toBe("Google review");
    expect(FEATURED_REVIEW.quote).toContain("go to ever since");
    expect(reviewMonogram("S.Y.")).toBe("SY");

    const blob = JSON.stringify(CLIENT_REVIEWS);
    for (const name of BANNED_NAMES) {
      expect(blob).not.toContain(name);
    }
  });
});

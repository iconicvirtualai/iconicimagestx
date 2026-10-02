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
    ]);
    for (const review of CLIENT_REVIEWS) {
      expect(review.initials).toMatch(/^[A-Z]\.[A-Z]\.$/);
      expect(review.role === "Google review" || review.role === "Client").toBe(true);
      expect(review.quote.trim().length).toBeGreaterThan(0);
    }
    expect(CLIENT_REVIEWS.filter((review) => review.role === "Google review")).toHaveLength(2);
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

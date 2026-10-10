import { describe, expect, it } from "vitest";
import { goDocumentTitle, goPromo, hasGoPromoCta } from "./goPromo";

describe("shirt QR landing copy", () => {
  it("uses an evergreen title, heading, and book action", () => {
    expect(goDocumentTitle).toBe("Iconic Images | Book your shoot");
    expect(goPromo.title).toBe("Real estate media that sells");
    expect(goPromo.ctaLabel).toBe("Book a shoot");
    expect(goPromo.ctaHref).toBe("/book");
    expect(hasGoPromoCta()).toBe(true);
  });

  it("does not announce a promo, discount, price, or credits", () => {
    const copy = [
      goDocumentTitle,
      goPromo.eyebrow,
      goPromo.title,
      goPromo.description,
      goPromo.ctaLabel,
    ].join(" ");

    expect(copy).not.toMatch(/promo|discount|%\s*off|\$\d|coming soon|iconic credits/i);
  });
});

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Go from "./Go";

describe("Go page", () => {
  it("renders the evergreen heading and the book link", () => {
    const html = renderToString(
      <MemoryRouter>
        <Go />
      </MemoryRouter>,
    );

    expect(html).toContain("Real estate media that sells");
    expect(html).toContain("Book a shoot");
    expect(html).toContain('href="/book"');
    expect(html).not.toContain("Current promo coming");
    expect(html).not.toMatch(/iconic credits/i);
  });
});

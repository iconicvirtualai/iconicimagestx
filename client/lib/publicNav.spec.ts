import { describe, expect, it } from "vitest";
import { ensureCrewLink } from "./publicNav";

describe("ensureCrewLink", () => {
  it("inserts Crew after the neighboring public page", () => {
    expect(
      ensureCrewLink(
        [
          { label: "About", href: "/about" },
          { label: "Pricing", href: "/pricing" },
        ],
        "/about",
      ).map((link) => link.href),
    ).toEqual(["/about", "/crew", "/pricing"]);
  });

  it("leaves a published Crew link in place", () => {
    const links = [
      { label: "About", href: "/about" },
      { label: "The Crew", href: "/crew" },
    ];
    expect(ensureCrewLink(links, "/about")).toBe(links);
  });
});

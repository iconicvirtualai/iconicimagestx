import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import AboutPortrait from "@/components/about/AboutPortrait";
import About from "./About";

describe("About page team", () => {
  it("keeps Cadi as the owner and lists the rest of the crew", () => {
    const html = renderToString(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    expect(html).toContain("About the owner");
    expect(html).toContain("Cadi Torres");
    expect(html).toContain("How to make agents more money with less effort.");
    expect(html).toContain("Meet the team");
    expect(html).toContain("The people behind the lens.");
    for (const name of ["Mike Luna", "Armando Martinez", "Daniel Adaclog", "Steven Banda", "Pedro Hernandez", "David Gonzalez"]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("/holiday-2026/crew-cadi.jpg");
    expect(html).toContain("/holiday-2026/crew-mike.jpg");
    expect(html).not.toContain("cadi_1.jpg");
    expect(html).not.toContain("cadi_2.jpg");
    expect(html).not.toContain("cadi_3.jpg");
    expect(html).not.toContain("about-banner/ref");
    expect(html).not.toContain("b694584c91da4099bb13e517f9890e59");
    expect(html).not.toContain("Armando Reyes");
  });

  it("shows a monogram when a portrait is one of the banned reference photos", () => {
    const html = renderToString(
      <AboutPortrait name="Cadi Torres" photo="/about-banner/ref/cadi_1.jpg" />,
    );
    expect(html).toContain('data-about-monogram="C"');
    expect(html).not.toContain("cadi_1.jpg");
  });
});

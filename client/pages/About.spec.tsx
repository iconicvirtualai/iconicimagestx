import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import About from "./About";
import { ABOUT_TEAM, CADI_PHOTO, PLACEHOLDER_BIO } from "@/content/aboutTeam";

describe("About team", () => {
  it("shows the crew in order, with Cadi as one circular card", () => {
    const html = renderToString(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    expect(html).not.toContain("About the owner");
    expect(html).not.toContain("around 2016");
    expect(html).toContain("Founded Iconic in 2016.");
    expect(html).toContain("Meet the team");
    expect(html).not.toContain('href="/video-team"');
    expect(html).not.toMatch(/jazmin/i);
    expect(html).not.toContain("b694584c91da4099bb13e517f9890e59");
    expect(html).not.toContain("crew-cadi");
    expect(html).not.toContain("Visionary Creator");
    expect(html.split(CADI_PHOTO).length - 1).toBe(1);

    const names = [
      ...html.matchAll(
        /data-testid="about-team-card"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g,
      ),
    ].map((match) => match[1]);
    expect(names).toEqual(ABOUT_TEAM.map((person) => person.name));

    const text = html.replace(/<[^>]+>/g, "");
    for (const person of ABOUT_TEAM) {
      expect(html).toContain(`src="${person.photo}"`);
      expect(text).toContain(person.role);
    }

    const photos = [...html.matchAll(/<img\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => ABOUT_TEAM.some((person) => tag.includes(person.photo)));
    expect(photos).toHaveLength(ABOUT_TEAM.length);
    for (const tag of photos) {
      expect(tag).toContain("rounded-full");
      expect(tag).toContain("h-24 w-24");
      expect(tag).toContain("sm:h-36 sm:w-36");
      expect(tag).not.toContain("aspect-");
    }
    expect(photos[0]).toContain("object-top");

    const placeholderBios = [...html.matchAll(/data-bio="placeholder"/g)];
    expect(placeholderBios).toHaveLength(
      ABOUT_TEAM.filter((person) => person.bioIsPlaceholder).length,
    );
    expect(html).toContain(PLACEHOLDER_BIO);
    expect(html).not.toContain('data-role="placeholder"');
  });
});

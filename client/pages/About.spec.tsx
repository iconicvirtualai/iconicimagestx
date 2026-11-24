import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import About from "./About";
import { ABOUT_TEAM, PLACEHOLDER_BIO } from "@/content/aboutTeam";

describe("About team", () => {
  it("shows Cadi, then the crew in order, with circular headshots and no Jazmin photo", () => {
    const html = renderToString(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    expect(html).toContain("About the owner");
    expect(html).toContain("Cadi Torres founded Iconic around 2016.");
    expect(html).toContain("Meet the team");
    expect(html).not.toContain('href="/video-team"');
    expect(html).not.toMatch(/jazmin/i);
    expect(html).not.toContain("b694584c91da4099bb13e517f9890e59");
    expect(html).not.toContain("Visionary Creator");

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
      .filter((tag) => tag.includes("/holiday-2026/crew-"));
    expect(photos).toHaveLength(ABOUT_TEAM.length + 1);
    for (const tag of photos) {
      expect(tag).toContain("rounded-full");
      expect(tag).not.toContain("aspect-");
    }

    const placeholderBios = [...html.matchAll(/data-bio="placeholder"/g)];
    expect(placeholderBios).toHaveLength(
      ABOUT_TEAM.filter((person) => person.bioIsPlaceholder).length,
    );
    expect(html).toContain(PLACEHOLDER_BIO);
    expect(html).not.toContain('data-role="placeholder"');
  });
});

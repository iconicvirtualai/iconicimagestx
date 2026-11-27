import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CREW } from "@/data/videoTeam";
import About from "./About";
import AboutOwner from "./AboutOwner";
import {
  ABOUT_TEAM,
  CADI_PHOTO,
  OWNER_PATH,
  OWNER_STORY,
} from "@/content/aboutTeam";

function render(node: JSX.Element) {
  return renderToString(<MemoryRouter>{node}</MemoryRouter>);
}

describe("About team", () => {
  it("shows the crew as equal cards and sends the bar photo to the owner page", () => {
    const html = render(<About />);
    const text = html.replace(/<[^>]+>/g, "");

    expect(html).toContain("Meet the team");
    expect(html).toContain(`href="${OWNER_PATH}"`);
    expect(html).toContain("About the Owner");
    expect(html).not.toContain("About the owner");
    expect(html).not.toContain(CADI_PHOTO);
    expect(html).not.toContain("around 2016");
    expect(html).not.toMatch(/jazmin/i);
    expect(html).not.toContain("crew-pedro");
    expect(html).not.toContain("crew-david");
    expect(text).toContain("Founded Iconic in 2016.");
    expect(text).toContain("Joined in 2019.");
    expect(text).toContain("Joined in 2021.");
    expect(text).toContain("Joined in 2018.");
    expect(text).toContain("Joined in 2026.");
    expect(text).toContain("2023 · Part-Time");

    const names = [
      ...html.matchAll(
        /data-testid="about-team-card"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g,
      ),
    ].map((match) => match[1]);
    expect(names).toEqual(ABOUT_TEAM.map((person) => person.name));

    const photos = [...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)];
    const teamPhotos = photos.filter((match) =>
      ABOUT_TEAM.some((person) => person.photo && match[1] === person.photo),
    );
    expect(teamPhotos.map((match) => match[1])).toEqual(
      ABOUT_TEAM.flatMap((person) => (person.photo ? [person.photo] : [])),
    );
    for (const match of teamPhotos) {
      expect(match[0]).toContain("rounded-full");
      expect(match[0]).not.toContain("aspect-");
    }
    for (const name of [
      "Cadi Torres",
      "Mike Luna",
      "Armando Martinez",
      "Daniel Adaclog",
      "Steven Banda",
    ]) {
      const crew = CREW.find((person) => person.name === name);
      expect(html).toContain(`src="${crew?.image}"`);
    }
    expect(html).toContain(">PH<");
    expect(html).toContain(">DG<");
    expect(html).not.toContain('data-role="placeholder"');
    expect(html).not.toContain('data-bio="placeholder"');
  });
});

describe("About the owner", () => {
  it("uses the bar portrait in a circle and the published founder story", () => {
    const html = render(<AboutOwner />);
    expect(html).toContain(`src="${CADI_PHOTO}"`);
    expect(html).toContain("rounded-full");
    expect(html).toContain("object-top");
    expect(html).toContain("Cadi Torres");
    expect(html).toContain("Founded Iconic in 2016.");
    expect(html).toContain('href="/about"');
    expect(html).toContain("engineered a media powerhouse");
    expect(html).toContain("Celebrity Agent");
    expect(html).not.toMatch(/jazmin/i);
    expect(html).not.toContain("aspect-square");
    expect(html).not.toContain("aspect-[");
  });
});

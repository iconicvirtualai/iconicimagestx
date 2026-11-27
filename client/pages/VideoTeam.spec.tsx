import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import VideoTeam from "./VideoTeam";
import { CREW, SAMPLE_CATEGORIES, TEAM_REELS } from "@/data/videoTeam";

describe("Meet Your Video Team", () => {
  it("renders the crew, muted team reels, and poster-only samples", () => {
    const html = renderToString(
      <MemoryRouter>
        <VideoTeam />
      </MemoryRouter>,
    );

    expect(html).toContain("Meet Your Video Team");
    expect(html).toContain("We Film. We Edit. We Post.");
    expect(html).not.toContain("Meet our Video Team");
    expect(html).toContain("The crew");
    expect(html).toContain("What we film");
    expect(html).toContain("Book your video shoot");
    expect(html).toContain('data-testid="video-team-order-form"');
    expect(html).toContain("Name | Contact");
    expect(html).toContain("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
    expect(html).not.toContain("cadi@");
    expect(html).not.toMatch(/jazmin/i);
    expect(html).not.toContain("superpower-reel");

    let last = -1;
    for (const person of CREW) {
      const index = html.indexOf(person.name);
      expect(index, person.name).toBeGreaterThan(last);
      last = index;
      expect(html).toContain(person.image);
    }

    expect(SAMPLE_CATEGORIES.map((category) => category.label)).toEqual([
      "On Camera",
      "Branding",
      "Events",
      "Real Estate",
      "Commercial",
      "Product",
      "Twilight",
    ]);
    for (const category of SAMPLE_CATEGORIES) {
      expect(html).toContain(category.label);
    }
    expect(html).toContain("Emily Aguilar");
    expect(html).not.toContain("13718");
    expect(html).not.toContain("Stonecrop");
    expect(html).not.toContain("luxury listing");
    expect(html).not.toContain(">Your Video Team Is Here<");
    for (const sample of SAMPLE_CATEGORIES[0].samples) {
      expect(html).toContain(sample.title);
      expect(html).toContain(sample.poster);
      expect(html).not.toContain(sample.src);
    }

    const videos = [...html.matchAll(/<video\b[^>]*>/g)].map((match) => match[0]);
    expect(videos).toHaveLength(TEAM_REELS.length);
    for (const tag of videos) {
      expect(tag).toContain("muted");
      expect(tag).toContain("loop");
      expect(tag).toContain("playsinline");
      expect(tag).toContain("autoplay");
      expect(tag).toContain("team-reels/");
      expect(tag).not.toContain("samples/");
    }

    const source = readFileSync(new URL("./VideoTeam.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:grid-cols-7");
    expect(source).toContain('preload="none"');
    expect(source).toContain('loading="lazy"');
    expect(source).not.toMatch(/jazmin/i);
  });
});

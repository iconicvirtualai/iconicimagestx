import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import VideoTeam from "./VideoTeam";
import { CREW, SAMPLE_CATEGORIES, TEAM_REELS } from "@/data/videoTeam";

describe("Meet our Video Team", () => {
  it("renders the crew, muted team reels, and poster-only samples", () => {
    const html = renderToString(
      <MemoryRouter>
        <VideoTeam />
      </MemoryRouter>,
    );

    expect(html).toContain("Meet our Video Team");
    expect(html).toContain("The crew");
    expect(html).toContain("What we film");
    expect(html).toContain("Book your video shoot");
    expect(html).toContain('href="/book"');
    expect(html).toContain('href="/contact"');
    expect(html).not.toMatch(/jazmin/i);
    expect(html).not.toContain("superpower-reel");

    let last = -1;
    for (const person of CREW) {
      const index = html.indexOf(person.name);
      expect(index, person.name).toBeGreaterThan(last);
      last = index;
      expect(html).toContain(person.image);
    }

    for (const category of SAMPLE_CATEGORIES) {
      expect(html).toContain(category.label);
    }
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
    expect(source).toContain('preload="none"');
    expect(source).toContain('loading="lazy"');
    expect(source).not.toMatch(/jazmin/i);
  });
});

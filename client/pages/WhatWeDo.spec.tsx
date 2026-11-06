import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import WhatWeDo from "./WhatWeDo";

describe("What we do", () => {
  it("renders the training headlines, real services, and booking links", () => {
    const html = renderToString(
      <MemoryRouter>
        <WhatWeDo />
      </MemoryRouter>,
    );

    expect(html).toContain("What does");
    expect(html).toContain("Iconic do?");
    expect(html).toContain("Photography, video, and listing media.");
    expect(html).toContain("Real estate media.");
    expect(html).toContain("Spring, The Woodlands, and Houston.");
    expect(html).toContain("What we shoot.");
    expect(html).toContain("Listing photos");
    expect(html).toContain("Podcast");
    expect(html).not.toContain("Iconic Snap Reels");
    expect(html).toContain("Iconic Twilight");
    expect(html).toContain("Aerial drone");
    expect(html).toContain("Headshots");
    expect(html).toContain("AI Virtual Staging");
    expect(html).toContain("Realtors &amp; Brokers");
    expect(html).toContain("Developers &amp; Builders");
    expect(html).toContain("Literally Everyone");
    expect(html).not.toContain("Senior living");
    expect(html).toContain("How it works.");
    expect(html).toContain("Book your session");
    expect(html).toContain("Show the house.");
    expect(html).toContain("Book a Shoot");
    expect(html).toContain("Book our Studio");
    expect(html).toContain('href="/book"');
    expect(html).toContain('href="/studio-105"');
    expect(html).not.toMatch(/\$\s?\d/);
    expect(html).not.toMatch(/jazmin/i);

    const videos = [...html.matchAll(/<video\b[^>]*>/g)].map((match) => match[0]);
    expect(videos.length).toBeGreaterThanOrEqual(3);
    for (const tag of videos) {
      expect(tag).toContain("muted");
      expect(tag).toContain("loop");
      expect(tag).toContain("playsinline");
      expect(tag).toContain("autoplay");
    }

    const srcs = [...html.matchAll(/\bsrc="([^"]+)"/g)].map((match) => match[1]);
    const media = srcs.filter((src) => src.startsWith("/media/") || src.startsWith("/senior-living/"));
    expect(new Set(media).size).toBe(media.length);
  });
});
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import ThisIsOurMarket from "./ThisIsOurMarket";

const VIDEO = "/media/home-v2/services-blaze/services-blaze-v1-muted.mp4";
const POSTER = "/media/home-v2/services-blaze/services-blaze-v1-poster.jpg";
const UNDERLAY = "/media/blaze/02_US_v3.mp4";

describe("This Is OUR Market services blaze", () => {
  it("underlays the bar mashup and keeps the portrait blaze on top", () => {
    const html = renderToString(<ThisIsOurMarket />);
    const videos = html.match(/<video\b[^>]*>/gi) ?? [];
    const underlay = videos.find((video) => video.includes(UNDERLAY)) ?? "";
    const blaze = videos.find((video) => video.includes(VIDEO)) ?? "";
    expect(videos).toHaveLength(2);
    for (const video of [underlay, blaze]) {
      expect(video).toContain("muted");
      expect(video).toContain("loop");
      expect(video).toContain("playsinline");
      expect(video).toContain("autoplay");
      expect(video).toContain('preload="metadata"');
      expect(video).toContain("object-cover");
      expect(video).not.toContain("controls");
    }
    expect(underlay).toContain('data-site-field="underlay"');
    expect(underlay).toContain('aria-hidden="true"');
    expect(blaze).toContain(POSTER);
    expect(blaze).toContain('data-site-field="video"');
    expect(html.indexOf(UNDERLAY)).toBeLessThan(html.indexOf(VIDEO));
    expect(html).toContain("aspect-[3/4]");
    expect(html).toContain("This Is");
    expect(html).toContain("OUR");
    expect(html).not.toContain("lifestyle-kennedy");
    expect(html).not.toContain("drone-hero");
    expect(html).not.toContain("content-web-clip");
    expect(html).not.toContain("<img");
  });
});

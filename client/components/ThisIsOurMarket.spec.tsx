import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import ThisIsOurMarket from "./ThisIsOurMarket";

const VIDEO = "/media/home-v2/services-blaze/services-blaze-v1-muted.mp4";
const POSTER = "/media/home-v2/services-blaze/services-blaze-v1-poster.jpg";
const UNDERLAY = "/media/blaze/02_US_v3.mp4";

describe("This Is OUR Market services blaze", () => {
  it("stacks the portrait blaze over the teal-bordered card", () => {
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
    expect(underlay).not.toContain("opacity-30");
    expect(underlay).not.toContain("inset-0");
    expect(blaze).toContain(POSTER);
    expect(blaze).toContain('data-site-field="video"');
    expect(html.indexOf(UNDERLAY)).toBeLessThan(html.indexOf(VIDEO));
    expect(html).toContain("aspect-[312/413]");
    expect(html).toContain("left-[38%]");
    expect(html).toContain("h-[71%]");
    expect(html).toContain("w-[62%]");
    expect(html).toContain("top-[25%]");
    expect(html).toContain("h-[75%]");
    expect(html).toContain("w-[74%]");
    expect(html).toContain("border-[#75bed4]");
    expect(html).toContain("border-[5px]");
    expect(html).toContain("border-[#111]");
    expect(html).not.toContain("w-[min(100%,240px)]");
    expect(html).toContain("This Is");
    expect(html).toContain("OUR");
    expect(html).not.toContain("lifestyle-kennedy");
    expect(html).not.toContain("drone-hero");
    expect(html).not.toContain("content-web-clip");
    expect(html).not.toContain("<img");
  });
});

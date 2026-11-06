import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import ThisIsOurMarket from "./ThisIsOurMarket";

const VIDEO = "/media/home-v2/services-blaze/services-blaze-v1-muted.mp4";
const POSTER = "/media/home-v2/services-blaze/services-blaze-v1-poster.jpg";

describe("This Is OUR Market services blaze", () => {
  it("fills the portrait slot with a muted looping blaze and no photo stack", () => {
    const html = renderToString(<ThisIsOurMarket />);
    const video = html.match(/<video\b[^>]*>/i)?.[0] ?? "";
    expect(video).toContain(VIDEO);
    expect(video).toContain(POSTER);
    expect(video).toContain("muted");
    expect(video).toContain("loop");
    expect(video).toContain("playsinline");
    expect(video).toContain("autoplay");
    expect(video).toContain('preload="metadata"');
    expect(video).toContain("object-cover");
    expect(video).toContain('data-site-page="home"');
    expect(video).toContain('data-site-block="market"');
    expect(video).toContain('data-site-field="video"');
    expect(video).not.toContain("controls");
    expect(html).toContain("aspect-[3/4]");
    expect(html).toContain("This Is");
    expect(html).toContain("OUR");
    expect(html).not.toContain("lifestyle-kennedy");
    expect(html).not.toContain("drone-hero");
    expect(html).not.toContain("<img");
  });
});

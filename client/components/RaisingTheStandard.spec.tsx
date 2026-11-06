import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import RaisingTheStandard from "./RaisingTheStandard";

describe("We Are The Bar phone video", () => {
  it("plays the original content clip inside the phone frame", () => {
    const html = renderToString(<RaisingTheStandard />);
    const video = html.match(/<video\b[^>]*>/i)?.[0] ?? "";
    expect(video).toContain("/media/video/content-web-clip.mp4");
    expect(video).not.toContain("02_US_v3");
    expect(video).toContain("muted");
    expect(video).toContain("loop");
    expect(video).toContain("playsinline");
    expect(video).toContain("autoplay");
    expect(video).toContain("object-cover");
    expect(video).not.toContain("controls");
    expect(html).toContain("rounded-[3rem]");
    expect(html).toContain("We");
    expect(html).toContain("the Bar.");
  });
});

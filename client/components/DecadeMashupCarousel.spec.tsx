import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DECADE_MASHUPS, DECADE_PLAYBACK_RATE } from "@shared/decadeMashups";
import DecadeMashupCarousel, { armDecadeVideo } from "./DecadeMashupCarousel";

function tag(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

describe("decade mashup carousel", () => {
  it("loops six muted square cards and keeps them editable", () => {
    const html = renderToString(<DecadeMashupCarousel />);
    const videos = tag(html, "video");
    expect(DECADE_PLAYBACK_RATE).toBe(1.35);
    expect(videos).toHaveLength(DECADE_MASHUPS.length * 2);
    for (const mix of DECADE_MASHUPS) {
      const card = videos.find((video) => video.includes(mix.video));
      expect(card, mix.id).toBeTruthy();
      expect(card).toContain("muted");
      expect(card).toContain("loop");
      expect(card).toContain("playsinline");
      expect(card).toContain("autoplay");
      expect(card).toContain(mix.poster);
      expect(card).toContain('data-site-page="about"');
      expect(card).toContain('data-site-block="hero"');
      expect(card).toContain(`data-site-item="${mix.id}"`);
      expect(card).toContain('data-site-field="video"');
      expect(html).toContain(mix.label);
    }
    expect(html).toContain("h-[184px]");
    expect(html).toContain("md:h-[268px]");
    expect(html).toContain("w-[184px]");
    expect(html).toContain("md:w-[268px]");
    expect(html).not.toContain("controls");
  });

  it("plays the visible card at 1.35x with sound forced off", () => {
    const video = {
      muted: false,
      defaultMuted: false,
      playbackRate: 1,
      defaultPlaybackRate: 1,
    } as HTMLVideoElement;
    armDecadeVideo(video);
    expect(video.muted).toBe(true);
    expect(video.defaultMuted).toBe(true);
    expect(video.playbackRate).toBe(1.35);
    expect(video.defaultPlaybackRate).toBe(1.35);
  });

  it("falls back to a poster when a card has no video", () => {
    const html = renderToString(
      <DecadeMashupCarousel cards={[{ id: "still", video: "", poster: "/media/about/decade-mashups/mix-1.jpg", label: "Still" }]} />,
    );
    expect(tag(html, "video")).toHaveLength(0);
    expect(html).toContain("/media/about/decade-mashups/mix-1.jpg");
    expect(html).toContain('data-site-field="poster"');
  });
});

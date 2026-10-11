import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  VIDEO_PLACEHOLDER_HEIGHT,
  VIDEO_PLACEHOLDER_WIDTH,
  renderVideoPlaceholder,
  videoPlaceholderSvg,
} from "./videoPosterPlaceholder";

function inkRuns(bytes: Buffer, y: number): number {
  let runs = 0;
  let on = false;
  for (let x = 80; x < VIDEO_PLACEHOLDER_WIDTH - 80; x += 1) {
    const index = (y * VIDEO_PLACEHOLDER_WIDTH + x) * 3;
    const ink = bytes[index] > 80 || bytes[index + 1] > 80 || bytes[index + 2] > 80;
    if (ink && !on) runs += 1;
    on = ink;
  }
  return runs;
}

describe("video poster placeholder", () => {
  it("paints a 1600x900 sans-serif card with a play icon and readable text", async () => {
    for (const tone of ["locked", "preview"] as const) {
      const svg = videoPlaceholderSvg(tone);
      expect(svg).not.toMatch(/<text[\s>]/);
      expect(svg.toLowerCase()).not.toContain("serif");
      expect(svg.toLowerCase()).not.toContain("script");
      expect(svg.replace("http://www.w3.org/2000/svg", "")).not.toContain("http");
      expect(svg).not.toContain(".mp4");
      const jpeg = await renderVideoPlaceholder(tone);
      expect(jpeg[0]).toBe(0xff);
      expect(jpeg[1]).toBe(0xd8);
      const meta = await sharp(jpeg).metadata();
      expect(meta.width).toBe(VIDEO_PLACEHOLDER_WIDTH);
      expect(meta.height).toBe(VIDEO_PLACEHOLDER_HEIGHT);
      expect(meta.format).toBe("jpeg");
      const raw = await sharp(jpeg).raw().toBuffer();
      const background = [raw[0], raw[1], raw[2]];
      expect(background[2]).toBeGreaterThan(background[0]);
      const play = (260 * VIDEO_PLACEHOLDER_WIDTH + 800) * 3;
      expect(raw[play + 1]).toBeGreaterThan(raw[play]);
      expect(raw[play + 1]).toBeGreaterThan(80);
      const caption = inkRuns(raw, 560);
      expect(caption).toBeGreaterThan(tone === "locked" ? 12 : 6);
    }
    const locked = await renderVideoPlaceholder("locked");
    const preview = await renderVideoPlaceholder("preview");
    expect(locked.equals(preview)).toBe(false);
  });
});

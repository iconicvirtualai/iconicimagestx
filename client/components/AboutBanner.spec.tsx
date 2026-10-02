import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import AboutBanner from "./AboutBanner";
import { ABOUT_BANNER_LEAD, ABOUT_BANNER_SUB, ABOUT_MOSAIC } from "@/lib/aboutBanner";

describe("About banner", () => {
  it("shows the locked lines, blaze loop, still, mosaic, and wide cut", () => {
    const html = renderToString(<AboutBanner />);
    expect(html).toContain(ABOUT_BANNER_LEAD.replaceAll("'", "&#x27;"));
    expect(html).toContain(ABOUT_BANNER_SUB);
    expect(html).toContain("font-archivo");
    expect(html).toContain("font-montserrat");
    expect(html).toContain('data-testid="homepage-blaze-loop"');
    expect(html).toContain("/media/blaze/01_BUILT_v2.mp4");
    expect(html).toContain("/media/about/about_were_here_v1.mp4");
    expect(html).toContain("/media/about/01_cadi_smile_16x9.jpg");
    for (const item of ABOUT_MOSAIC) {
      expect(html).toContain(item.src);
      expect(html).toContain(item.alt);
    }
    expect(html.indexOf(ABOUT_MOSAIC[0].src)).toBeLessThan(html.indexOf(ABOUT_MOSAIC[1].src));
    expect(html.indexOf(ABOUT_MOSAIC[3].src)).toBeLessThan(html.indexOf(ABOUT_MOSAIC[4].src));
    expect(html).not.toMatch(/jazmin|commission|unsplash|nameplate/i);
    expect(html).not.toMatch(/\b(street|lane|avenue)\b/i);
  });
});

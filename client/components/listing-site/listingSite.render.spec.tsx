import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { LISTING_SITE_TEMPLATE_IDS, LISTING_SITE_TEMPLATES } from "@shared/listingSite";
import { buildListingSiteModel } from "@shared/listingSite";
import { demoListingInput, demoListingModel, demoListingWebsite } from "@shared/listingSiteDemo";
import { LISTING_SITE_RENDERERS, ListingSite, listingSiteRendererIds } from "./ListingSite";

const REQUIRED = ["hero", "collage", "video", "matterport", "floorplan", "lead", "agent"];

function sectionOrder(html: string): string[] {
  const found = [...html.matchAll(/data-section="(hero|collage|video|matterport|floorplan|lead|agent)"/g)].map((match) => match[1]);
  return found.filter((id, index) => found.indexOf(id) === index);
}

describe("listing site renderers", () => {
  it("registers a renderer for each built template and leaves the later seven off", () => {
    expect(LISTING_SITE_TEMPLATE_IDS).toEqual(["two-up", "golden-hour", "stories-deck"]);
    expect(listingSiteRendererIds()).toEqual(LISTING_SITE_TEMPLATES.map((template) => template.renderer));
    expect(Object.keys(LISTING_SITE_RENDERERS).sort()).toEqual(["GoldenHour", "StoriesDeck", "TwoUp"]);
    for (const template of LISTING_SITE_TEMPLATES) {
      expect(LISTING_SITE_RENDERERS[template.renderer]).toBeTypeOf("function");
    }
  });

  it("renders the required sections in order on every template", () => {
    for (const id of LISTING_SITE_TEMPLATE_IDS) {
      const html = renderToString(<ListingSite model={demoListingModel(id)} />);
      expect(html).toContain(`data-template="${id}"`);
      expect(sectionOrder(html)).toEqual(REQUIRED);
      expect(html).toContain("Photography &amp; film: Iconic Images");
      expect(html).toContain("TREC Information About Brokerage Services");
      expect(html).toContain("TREC Consumer Protection Notice");
      expect(html).toContain("https://www.trec.texas.gov/forms/information-about-brokerage-services");
      expect(html).toContain("https://www.trec.texas.gov/forms/consumer-protection-notice");
      expect(html).toContain("Equal Housing");
      expect(html).toContain("TX Lic. #000000");
      expect(html).not.toContain("<iframe");
      expect(html).toContain('loading="eager"');
      expect(html).toContain('loading="lazy"');
    }
  });

  it("drops a toggled-off media section and keeps the rest in order", () => {
    const website = demoListingWebsite("two-up");
    website.showVideo = false;
    const model = buildListingSiteModel(demoListingInput(website));
    const html = renderToString(<ListingSite model={model} />);
    expect(sectionOrder(html)).toEqual(["hero", "collage", "matterport", "floorplan", "lead", "agent"]);
    expect(html).not.toContain('data-section="video"');
  });

  it("keeps the lead form on the page and does not send email", () => {
    const source = readFileSync(new URL("./pieces.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/sendEmail|nodemailer|\/api\/contact/);
    expect(source).toContain("Nothing was emailed");
    const css = readFileSync(new URL("./listing-site.css", import.meta.url), "utf8");
    expect(css).toContain("prefers-reduced-motion");
  });
});

import { describe, expect, it } from "vitest";
import { buildPortalListingDetail, sanitizeWebsiteSettings } from "./portalListingDetail";
import {
  DEFAULT_LISTING_SITE_TEMPLATE,
  ICONIC_MEDIA_CREDIT,
  LATER_LISTING_SITE_TEMPLATE_NAMES,
  LISTING_SITE_SECTIONS,
  LISTING_SITE_TEMPLATES,
  TREC_CPN_URL,
  TREC_IABS_URL,
  buildListingSiteModel,
  defaultListingWebsite,
  licenseLabel,
  listingSiteTemplate,
  middleSectionOrder,
  moveMiddleSection,
  orderPhotos,
  resolveListingSections,
  resolvePhoto,
  templateFromLegacy,
  usableMediaUrl,
  type ListingSiteInput,
  type ListingSiteSectionId,
} from "./listingSite";

function input(patch: Partial<ListingSiteInput> = {}): ListingSiteInput {
  const website = { ...defaultListingWebsite(), ...patch.website };
  return {
    addressLine: "18 Lantern Oak Pl",
    city: "The Woodlands",
    state: "TX",
    zip: "77380",
    facts: [
      { id: "beds", value: "4" },
      { id: "baths", value: "3.5" },
      { id: "sqft", value: "3412" },
      { id: "lotSize", value: "0.31 ac" },
    ],
    photos: [
      { id: "arrival", name: "Arrival", url: "/listing-site/arrival.jpg" },
      { id: "kitchen", name: "Kitchen", url: "/listing-site/kitchen.jpg" },
      { id: "lawn", name: "Front lawn", url: "/listing-site/lawn.jpg", polishedUrl: "/listing-site/lawn-new.jpg" },
      { id: "hidden", name: "Hidden", url: "/listing-site/bath.jpg", hidden: true },
    ],
    videos: [{ id: "film", name: "Film", url: "/listing-site/film.mp4" }],
    tours: [{ id: "mp", name: "Matterport", url: "https://my.matterport.com/show/?m=sample", embedUrl: "https://my.matterport.com/show/?m=sample", provider: "Matterport" }],
    floorplans: [{ id: "level1", name: "Level 1", url: "/listing-site/plan.svg" }],
    ...patch,
    website,
  };
}

describe("listing site template registry", () => {
  it("ships the three approved templates and leaves the other seven for later", () => {
    expect(LISTING_SITE_TEMPLATES.map((template) => template.id)).toEqual(["two-up", "golden-hour", "stories-deck"]);
    expect(DEFAULT_LISTING_SITE_TEMPLATE).toBe("two-up");
    expect(LISTING_SITE_SECTIONS).toEqual(["hero", "collage", "video", "matterport", "floorplan", "lead", "agent"]);
    for (const template of LISTING_SITE_TEMPLATES) {
      expect(template.name).toBeTruthy();
      expect(template.vibe).toMatch(/·/);
      expect(template.thumbnail).toMatch(/^\/listing-templates\//);
      expect(template.renderer).toBeTruthy();
      expect(listingSiteTemplate(template.id)?.renderer).toBe(template.renderer);
    }
    expect(listingSiteTemplate("two-up")?.allowsSectionReorder).toBe(true);
    expect(listingSiteTemplate("golden-hour")?.allowsSectionReorder).toBe(false);
    expect(listingSiteTemplate("stories-deck")?.allowsSectionReorder).toBe(false);
    for (const name of LATER_LISTING_SITE_TEMPLATE_NAMES) {
      expect(LISTING_SITE_TEMPLATES.some((template) => template.name === name)).toBe(false);
    }
    expect(LATER_LISTING_SITE_TEMPLATE_NAMES).toHaveLength(7);
    expect(TREC_IABS_URL).toMatch(/^https:\/\/www\.trec\.texas\.gov\//);
    expect(TREC_CPN_URL).toMatch(/consumer-protection-notice/);
    expect(ICONIC_MEDIA_CREDIT).toBe("Photography & film: Iconic Images");
  });

  it("maps a saved font and color onto the nearest template and keeps an explicit pick", () => {
    expect(templateFromLegacy({ font: "serif", color: "warm", style: "editorial" })).toBe("golden-hour");
    expect(templateFromLegacy({ font: "serif", color: "ink", style: "classic" })).toBe("golden-hour");
    expect(templateFromLegacy({ font: "sans", color: "warm", style: "classic" })).toBe("golden-hour");
    expect(templateFromLegacy({ font: "sans", color: "ink", style: "minimal" })).toBe("stories-deck");
    expect(templateFromLegacy({ font: "modern", color: "teal", style: "classic" })).toBe("two-up");

    expect(sanitizeWebsiteSettings({
      font: "serif",
      color: "nope",
      style: "editorial",
      showPhotos: false,
    })).toMatchObject({
      font: "serif",
      color: "ink",
      style: "editorial",
      showPhotos: false,
      showVideo: true,
      templateId: "golden-hour",
    });

    expect(sanitizeWebsiteSettings({
      templateId: "stories-deck",
      font: "serif",
      color: "warm",
      style: "editorial",
    }).templateId).toBe("stories-deck");

    expect(sanitizeWebsiteSettings({ templateId: "not-a-template", style: "minimal" }).templateId).toBe("stories-deck");
    expect(sanitizeWebsiteSettings({ showVideo: false }).templateId).toBe("two-up");
    expect(sanitizeWebsiteSettings({ headline: "  Hello  ", agent: { name: "Ada", license: "123" } })).toMatchObject({
      headline: "Hello",
      agent: { name: "Ada", license: "123" },
    });
  });
});

describe("listing site media and required sections", () => {
  it("turns sections off and chooses a photo version without dropping the required order", () => {
    const full = buildListingSiteModel(input());
    expect(full.sections).toEqual(["hero", "collage", "video", "matterport", "floorplan", "lead", "agent"]);
    expect(full.heroPhoto?.id).toBe("arrival");
    expect(full.collage.map((photo) => photo.id)).toEqual(["arrival", "kitchen", "lawn"]);
    expect(full.collage.find((photo) => photo.id === "lawn")).toMatchObject({
      version: "polished",
      url: "/listing-site/lawn-new.jpg",
    });

    const chosen = buildListingSiteModel(input({
      website: {
        ...defaultListingWebsite(),
        photoVersions: { lawn: "original" },
        heroPhotoIds: ["lawn", "kitchen"],
        collagePhotoIds: ["kitchen", "arrival"],
        showVideo: false,
        showTours: false,
      },
    }));
    expect(chosen.heroPhoto).toMatchObject({ id: "lawn", version: "original", url: "/listing-site/lawn.jpg" });
    expect(chosen.collage.map((photo) => photo.id)).toEqual(["kitchen", "arrival"]);
    expect(chosen.sections).toEqual(["hero", "collage", "floorplan", "lead", "agent"]);
    expect(chosen.sections).not.toContain("video");
    expect(chosen.sections).not.toContain("matterport");

    const empty = buildListingSiteModel(input({
      photos: [],
      videos: [],
      tours: [],
      floorplans: [],
    }));
    expect(empty.sections).toEqual(["lead", "agent"]);

    const hiddenHero = buildListingSiteModel(input({
      website: { ...defaultListingWebsite(), heroPhotoIds: ["hidden"], collagePhotoIds: ["hidden"] },
    }));
    expect(hiddenHero.heroPhoto?.id).not.toBe("hidden");
    expect(hiddenHero.collage.map((photo) => photo.id)).not.toContain("hidden");
    expect(hiddenHero.sections).not.toContain("hero");
    expect(hiddenHero.sections).not.toContain("collage");
  });

  it("reorders only the middle sections, and only on a template that allows it", () => {
    const order: ListingSiteSectionId[] = ["video", "floorplan", "collage", "matterport"];
    const twoUp = {
      ...defaultListingWebsite(),
      templateId: "two-up" as const,
      sectionOrder: ["lead", "video", "floorplan", "collage", "hero"] as ListingSiteSectionId[],
    };
    expect(middleSectionOrder(twoUp)).toEqual(["video", "floorplan", "collage", "matterport"]);
    const available = {
      hero: true, collage: true, video: true, matterport: true, floorplan: true, lead: true, agent: true,
    };
    expect(resolveListingSections(twoUp, available)).toEqual([
      "hero", "video", "floorplan", "collage", "matterport", "lead", "agent",
    ]);

    const golden = { ...twoUp, templateId: "golden-hour" as const };
    expect(resolveListingSections(golden, available)).toEqual([...LISTING_SITE_SECTIONS]);
    expect(moveMiddleSection(order, "floorplan", -1)).toEqual(["floorplan", "video", "collage", "matterport"]);
    expect(moveMiddleSection(order, "hero" as ListingSiteSectionId, 1)).toEqual(order);
  });

  it("uses a returned polish file when the photo row has no polished url", () => {
    const photo = { id: "lawn", name: "lawn.jpg", url: "https://cdn.example/lawn.jpg" };
    expect(resolvePhoto(photo, undefined, "https://cdn.example/lawn-new.jpg")).toMatchObject({
      version: "polished",
      url: "https://cdn.example/lawn-new.jpg",
    });
    expect(resolvePhoto(photo, "original", "https://cdn.example/lawn-new.jpg").url).toBe("https://cdn.example/lawn.jpg");
    expect(resolvePhoto(photo, "polished").version).toBe("original");
    expect(usableMediaUrl("javascript:alert(1)")).toBe("");
    expect(orderPhotos([
      { id: "a", name: "A", url: "https://cdn.example/a.jpg" },
      { id: "b", name: "B", url: "https://cdn.example/b.jpg", hidden: true },
    ], ["b", "missing", "a"]).map((item) => item.id)).toEqual(["a"]);
    expect(licenseLabel("")).toBe("TX license number not on file");
    expect(licenseLabel("000000")).toBe("TX Lic. #000000");
  });

  it("reads the polish url onto the listing photo", () => {
    const detail = buildPortalListingDetail({
      listing: {
        id: "listing1234",
        images: [{
          id: "lawn",
          name: "lawn.jpg",
          url: "https://cdn.example/lawn.jpg",
          grassUrl: "https://cdn.example/lawn-new.jpg",
          contentType: "image/jpeg",
        }],
      },
    });
    expect(detail.photos[0].polishedUrl).toBe("https://cdn.example/lawn-new.jpg");
  });
});

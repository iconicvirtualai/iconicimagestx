import { describe, expect, it } from "vitest";
import { STUDIO_SCRATCH_PATH } from "./studioScratch";
import {
  ICONIC_STUDIO_INDEX_PATH,
  STUDIO_DELIVERY_PATH,
  STUDIO_HOME_PATH,
  STUDIO_LISTINGS_PATH,
  STUDIO_MARKETING_KITS,
  STUDIO_MARKETING_PATH,
  STUDIO_PHOTO_EDITING_ALIAS,
  STUDIO_PROJECT_PATHWAYS,
  STUDIO_PROJECTS_PATH,
  STUDIO_SECTIONS,
  studioSectionForPath,
} from "./studioSections";

describe("studio sections", () => {
  it("keeps one home and three subsections, with scratch as photo editing", () => {
    expect(STUDIO_SECTIONS.map((section) => section.label)).toEqual([
      "Photo editing",
      "Projects",
      "Marketing kits",
    ]);
    expect(STUDIO_SECTIONS.map((section) => section.id)).toEqual(["editing", "projects", "marketing"]);
    expect(STUDIO_SECTIONS[0].href).toBe(STUDIO_SCRATCH_PATH);
    expect(STUDIO_SECTIONS[0].match).toContain(STUDIO_PHOTO_EDITING_ALIAS);
    expect(STUDIO_HOME_PATH).toBe("/admin/studio");
    expect(STUDIO_PROJECTS_PATH).toBe("/admin/studio/projects");
    expect(STUDIO_MARKETING_PATH).toBe("/admin/studio/marketing");
  });

  it("points projects at the existing delivery and listings pathways", () => {
    expect(STUDIO_PROJECT_PATHWAYS.map((item) => item.href)).toEqual([
      STUDIO_DELIVERY_PATH,
      STUDIO_LISTINGS_PATH,
    ]);
    expect(STUDIO_DELIVERY_PATH).toBe("/admin/delivery");
    expect(STUDIO_LISTINGS_PATH).toBe("/admin/listings");
  });

  it("names the marketing kits without inventing a tool", () => {
    expect(STUDIO_MARKETING_KITS.map((kit) => kit.label)).toEqual([
      "Social graphics",
      "Listing-site packs",
      "Extras",
    ]);
  });

  it("does not treat the studio home or a listing editor as a subsection", () => {
    expect(studioSectionForPath("/admin/studio")).toBeNull();
    expect(studioSectionForPath("/admin/studio/scratch")).toBe("editing");
    expect(studioSectionForPath("/admin/studio/editing")).toBe("editing");
    expect(studioSectionForPath("/admin/studio/projects")).toBe("projects");
    expect(studioSectionForPath("/admin/studio/marketing")).toBe("marketing");
    expect(studioSectionForPath("/admin/iconic-studio/job_12345678")).toBeNull();
    expect(ICONIC_STUDIO_INDEX_PATH).toBe("/admin/iconic-studio");
  });
});

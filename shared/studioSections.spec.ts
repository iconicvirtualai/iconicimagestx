import { describe, expect, it } from "vitest";
import {
  ICONIC_STUDIO_INDEX_PATH,
  STUDIO_DELIVERY_PATH,
  STUDIO_HOME_PATH,
  STUDIO_LISTINGS_PATH,
  STUDIO_MARKETING_PATH,
  STUDIO_PHOTO_EDITING_ALIAS,
  STUDIO_PROJECT_PATHWAYS,
  STUDIO_PROJECTS_PATH,
  STUDIO_SECTIONS,
  studioSectionForPath,
} from "./studioSections";

describe("studio sections", () => {
  it("lands on the studio desk and keeps delivery and projects reachable", () => {
    expect(STUDIO_SECTIONS.map((section) => section.id)).toEqual(["editing"]);
    expect(STUDIO_SECTIONS[0].href).toBe("/admin/studio");
    expect(STUDIO_SECTIONS[0].match).toContain(STUDIO_PHOTO_EDITING_ALIAS);
    expect(STUDIO_HOME_PATH).toBe("/admin/studio");
    expect(STUDIO_PROJECTS_PATH).toBe("/admin/studio/projects");
    expect(STUDIO_MARKETING_PATH).toBe("/admin/studio/marketing");
    expect(STUDIO_PROJECT_PATHWAYS.map((item) => item.href)).toEqual([
      STUDIO_DELIVERY_PATH,
      STUDIO_LISTINGS_PATH,
    ]);
  });

  it("treats the studio home as the editor and retires the old subsections", () => {
    expect(studioSectionForPath("/admin/studio")).toBe("editing");
    expect(studioSectionForPath("/admin/studio/scratch")).toBe("editing");
    expect(studioSectionForPath("/admin/studio/editing")).toBe("editing");
    expect(studioSectionForPath("/admin/studio/projects")).toBeNull();
    expect(studioSectionForPath("/admin/studio/marketing")).toBeNull();
    expect(studioSectionForPath("/admin/iconic-studio/job_12345678")).toBeNull();
    expect(ICONIC_STUDIO_INDEX_PATH).toBe("/admin/iconic-studio");
  });
});

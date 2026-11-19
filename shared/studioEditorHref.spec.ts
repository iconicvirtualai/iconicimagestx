import { describe, expect, it } from "vitest";
import {
  LEGACY_ICONIC_STUDIO_PATH,
  LEGACY_STUDIO_OPERATIONS_PATH,
  STUDIO_EDITOR_PATH,
  legacyStudioRedirect,
  studioEditorHref,
  studioEditorListingId,
} from "./studioEditorHref";

describe("studio editor links", () => {
  it("opens the editor and keeps a listing id on the query", () => {
    expect(STUDIO_EDITOR_PATH).toBe("/admin/studio");
    expect(studioEditorHref()).toBe("/admin/studio");
    expect(studioEditorHref("  ")).toBe("/admin/studio");
    expect(studioEditorHref("job_12345678")).toBe("/admin/studio?listingId=job_12345678");
    expect(studioEditorHref("job 1")).toBe("/admin/studio?listingId=job%201");
  });

  it("reads listing, project, and listingId query names", () => {
    expect(studioEditorListingId("?listingId=job_12345678")).toBe("job_12345678");
    expect(studioEditorListingId("listing=listingReady001")).toBe("listingReady001");
    expect(studioEditorListingId("?project=proj-9&tab=photos")).toBe("proj-9");
    expect(studioEditorListingId("")).toBe("");
  });

  it("redirects old staff studio routes and leaves the public gallery", () => {
    expect(LEGACY_ICONIC_STUDIO_PATH).toBe("/admin/iconic-studio");
    expect(LEGACY_STUDIO_OPERATIONS_PATH).toBe("/admin/studio/operations");
    expect(legacyStudioRedirect("/admin/iconic-studio")).toBe("/admin/studio");
    expect(legacyStudioRedirect("/admin/iconic-studio/")).toBe("/admin/studio");
    expect(legacyStudioRedirect("/admin/iconic-studio/job_12345678")).toBe(
      "/admin/studio?listingId=job_12345678",
    );
    expect(legacyStudioRedirect("/admin/iconic-studio/job%201")).toBe(
      "/admin/studio?listingId=job%201",
    );
    expect(legacyStudioRedirect("/admin/studio/operations")).toBe("/admin/studio");
    expect(legacyStudioRedirect("/admin/studio/operations", "?listingId=listingReady001")).toBe(
      "/admin/studio?listingId=listingReady001",
    );
    expect(legacyStudioRedirect("/admin/studio/operations", "?project=proj-9")).toBe(
      "/admin/studio?listingId=proj-9",
    );
    expect(legacyStudioRedirect("/admin/studio/editing")).toBe("/admin/studio");
    expect(legacyStudioRedirect("/admin/studio/editing", "?listingId=job_12345678")).toBe(
      "/admin/studio?listingId=job_12345678",
    );
    expect(legacyStudioRedirect("/admin/studio/scratch")).toBe("/admin/studio");
    expect(legacyStudioRedirect("/admin/studio/projects")).toBe("/admin/studio");
    expect(legacyStudioRedirect("/admin/studio/marketing", "?listing=listingReady001")).toBe(
      "/admin/studio?listingId=listingReady001",
    );
    expect(legacyStudioRedirect("/studio/job_12345678")).toBeNull();
    expect(legacyStudioRedirect("/admin/studio")).toBeNull();
  });
});

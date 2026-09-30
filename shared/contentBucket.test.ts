import { describe, expect, it } from "vitest";
import {
  buildContentStoragePath,
  isContentBucketPath,
  isIconicUploadOrigin,
  matchesContentFilters,
  parseContentListQuery,
  parseContentWrite,
  presentContentAsset,
  type ContentAssetRecord,
} from "./contentBucket";

const staffOnly: ContentAssetRecord = {
  id: "abcdefghijklmnop",
  fileName: "reel.mp4",
  contentType: "video/mp4",
  kind: "video",
  sizeBytes: 1000,
  purpose: "go",
  tags: ["shirt"],
  folder: "campaigns",
  visibility: "staff",
  alt: "",
  url: "https://storage.example/signed",
  createdAt: null,
  updatedAt: null,
  storagePath: "content-bucket/go/abcdefghijklmnop/1_reel.mp4",
  uploadedBy: "staff-1",
  uploadedByEmail: "staff@iconicimagestx.com",
};

describe("content bucket writes", () => {
  it("accepts an image for a public portfolio folder", () => {
    const parsed = parseContentWrite({
      fileName: "Hero Shot.JPG",
      contentType: "",
      sizeBytes: 2_000_000,
      purpose: "Portfolio",
      tags: "Hero, Austin, hero",
      folder: "Home Page",
      visibility: "public",
      alt: "Twilight exterior",
    }, { requireSize: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      fileName: "Hero_Shot.JPG",
      contentType: "image/jpeg",
      kind: "image",
      purpose: "portfolio",
      tags: ["hero", "austin"],
      folder: "home-page",
      visibility: "public",
      alt: "Twilight exterior",
    });
  });

  it("rejects documents, oversized video, and missing purpose", () => {
    expect(parseContentWrite({ fileName: "notes.pdf", purpose: "marketing", sizeBytes: 10 }).ok).toBe(false);
    expect(parseContentWrite({ fileName: "clip.mp4", purpose: "go", sizeBytes: 201 * 1024 * 1024 }).ok).toBe(false);
    expect(parseContentWrite({ fileName: "a.jpg", purpose: "drive", sizeBytes: 10 }).ok).toBe(false);
    expect(parseContentWrite({ fileName: "a.jpg", purpose: "marketing" }, { requireSize: true }).ok).toBe(false);
    expect(parseContentWrite({ fileName: "a.jpg", purpose: "marketing", sizeBytes: 0 }).ok).toBe(false);
  });

  it("defaults unpublished visibility to staff", () => {
    const parsed = parseContentWrite({ fileName: "a.png", purpose: "general", sizeBytes: 10 });
    expect(parsed.ok && parsed.value.visibility).toBe("staff");
  });
});

describe("content bucket paths", () => {
  const id = "abcdefghijklmnop";

  it("keeps objects inside the content bucket for that asset", () => {
    const path = buildContentStoragePath(id, "marketing", "Logo.png", 10);
    expect(path).toBe("content-bucket/marketing/abcdefghijklmnop/10_Logo.png");
    expect(isContentBucketPath(id, "marketing", path)).toBe(true);
  });

  it("rejects listing, gallery, and traversal paths", () => {
    expect(isContentBucketPath(id, "marketing", "listings/job/photos/1.jpg")).toBe(false);
    expect(isContentBucketPath(id, "marketing", "galleries/job/1.jpg")).toBe(false);
    expect(isContentBucketPath(id, "marketing", "Uploads/1.jpg")).toBe(false);
    expect(isContentBucketPath(id, "marketing", `content-bucket/marketing/${id}/../secret.jpg`)).toBe(false);
    expect(isContentBucketPath(id, "portfolio", `content-bucket/marketing/${id}/1_a.jpg`)).toBe(false);
  });
});

describe("upload origins", () => {
  it("allows the live site, local dev, and Iconic preview hosts", () => {
    expect(isIconicUploadOrigin("https://iconicimagestx.com")).toBe(true);
    expect(isIconicUploadOrigin("http://localhost:8080")).toBe(true);
    expect(isIconicUploadOrigin("https://iconicimagestx-git-cursor-content-bucket-2c89-team.vercel.app")).toBe(true);
    expect(isIconicUploadOrigin("https://evil.vercel.app")).toBe(false);
    expect(isIconicUploadOrigin("https://iconicimagestx.com.evil.example")).toBe(false);
  });
});

describe("content bucket reads", () => {
  it("filters by purpose, tag, and folder", () => {
    const query = parseContentListQuery({ purpose: "go", tag: "Shirt", folder: "Campaigns", q: "reel" });
    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(matchesContentFilters(staffOnly, query.value)).toBe(true);
    expect(matchesContentFilters({ ...staffOnly, purpose: "portfolio" }, query.value)).toBe(false);
  });

  it("hides staff files and staff fields from public callers", () => {
    expect(presentContentAsset(staffOnly, { staff: false })).toBeNull();
    const published = presentContentAsset({ ...staffOnly, visibility: "public" }, { staff: false });
    expect(published).not.toHaveProperty("storagePath");
    expect(published).not.toHaveProperty("uploadedBy");
    expect(published).not.toHaveProperty("uploadedByEmail");
    expect(presentContentAsset(staffOnly, { staff: true })?.uploadedByEmail).toBe("staff@iconicimagestx.com");
  });
});

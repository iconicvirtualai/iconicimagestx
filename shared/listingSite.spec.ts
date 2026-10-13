import { describe, expect, it } from "vitest";
import { buildPublicListingSite, listingSitePayloadLeak, listingSiteSlug } from "./listingSite";

describe("listing site slugs", () => {
  it("builds an address slug and hides unpublished listings", () => {
    expect(listingSiteSlug({ line1: "123 Main St", city: "Spring" })).toBe("123-main-st-spring");
    expect(listingSiteSlug({ line1: "", city: "Spring" })).toBe("");
    expect(buildPublicListingSite({
      id: "listing1234",
      address: { street: "123 Main St", city: "Spring", state: "TX" },
      portalWebsite: { published: false, design: "premiere" },
    })).toBeNull();
  });

  it("keeps public photos on the display route", () => {
    const site = buildPublicListingSite({
      id: "listing1234",
      address: { street: "123 Main St", city: "Spring", state: "TX", zip: "77373" },
      listPrice: 485000,
      bedrooms: 4,
      portalWebsite: { published: true, design: "index", showPhotos: true },
      images: [
        { id: "front", name: "Front", url: "https://cdn.example/originals/front.jpg", contentType: "image/jpeg" },
        { id: "pack", name: "pack.zip", url: "https://cdn.example/files/pack.zip" },
        { id: "planpdf", name: "plan.pdf", url: "https://cdn.example/plan.pdf", contentType: "application/pdf" },
      ],
      floorplans: [
        { id: "level1", name: "Level 1", url: "https://cdn.example/plans/level1.jpg", contentType: "image/jpeg" },
      ],
      matterportUrl: "https://evil.example/show/?m=abc123",
      agentName: "Ada Agent",
      agentEmail: "agent@example.com",
    });
    expect(site?.slug).toBe("123-main-st-spring");
    expect(site?.design).toBe("index");
    expect(site?.price).toBe("$485,000");
    expect(site?.photos[0]?.url).toBe("/api/media/display/listing1234/0");
    expect(site?.floorplan?.url).toBe("/api/media/display/listing1234/1");
    expect(site?.tourEmbedUrl).toBe("");
    expect(site && listingSitePayloadLeak(site)).toBeNull();
    expect(JSON.stringify(site)).not.toContain("cdn.example");
    expect(JSON.stringify(site)).not.toMatch(/\.zip|\.pdf|originals/);
  });
});

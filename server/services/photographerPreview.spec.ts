import { describe, expect, it } from "vitest";
import { previewListing, previewStudioJob } from "./photographerPreview";

describe("photographer preview payload", () => {
  it("drops contact fields and keeps the shoot the portal renders", () => {
    const row = previewListing("job-1", {
      address: "18 Pecan Street",
      clientName: "Sample Client",
      clientEmail: "agent@example.com",
      clientPhone: "512-555-0100",
      accessInfo: "Lockbox",
      images: [{ name: "front.jpg" }],
    });
    expect(row.address).toBe("18 Pecan Street");
    expect(row.accessInfo).toBe("Lockbox");
    expect(row.clientEmail).toBeUndefined();
    expect(row.clientPhone).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain("agent@example.com");
  });

  it("keeps studio labels and drops everything else on the edit job", () => {
    expect(previewStudioJob({
      listingId: "job-1",
      status: "processing",
      origin: "order",
      type: "hdr",
      label: "HDR",
      sourcePath: "listings/job-1/photos/front.jpg",
      prompt: "secret prompt",
    })).toEqual({
      listingId: "job-1",
      status: "processing",
      origin: "order",
      sourcePath: "listings/job-1/photos/front.jpg",
      type: "hdr",
      label: "HDR",
    });
  });
});

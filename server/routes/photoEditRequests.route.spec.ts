import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("photo edit request routes stay off billing, messaging, and the other edit paths", () => {
  it("does not import the files Cody left to the other inspection", () => {
    const source = [
      "server/routes/photoEditRequests.ts",
      "server/services/photoEditRequests.ts",
      "server/routes/portalListing.ts",
      "shared/photoEditRequest.ts",
      "client/components/PhotoEditRequestStaff.tsx",
      "client/pages/PortalListingDetail.tsx",
    ].map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")).join("\n");

    expect(source).not.toMatch(/studioJobs|openaiImageEdit|listingPhotos|galleryReleaseGate/);
    expect(source).not.toMatch(/nodemailer|twilio|squareup|publishInvoice|cubicasa\.com/i);
    expect(source).toContain("photoEditRequests");
    expect(source).toContain("sent_out");
    expect(source).toContain("received_back");
  });
});

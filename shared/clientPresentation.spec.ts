import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { builtinEmailHtml } from "../server/services/email";
import {
  buildClientListingSite,
  clientPresentationLinkFor,
  deliveryEmailPreviewVars,
} from "./clientPresentation";
import { invoicePayLinkFor } from "./invoicePayLink";

const ENV = { PUBLIC_SITE_URL: "https://iconicimagestx.vercel.app" };
const PAY = invoicePayLinkFor(
  { id: "sampleInvoice01", status: "sent", payToken: "samplePayToken0123456789ab" },
  ENV,
);

function ownerProject(locked: boolean) {
  return {
    view: "owner" as const,
    downloadsUnlocked: !locked,
    address: "100 Playtest Lane, Austin, TX 78701",
    agentName: "Avery Sample",
    clientName: "Jordan Sample",
    clientEmail: "jordan.sample@example.com",
    images: [
      { url: "/api/media/display/o/token/0", name: "Living room", downloadUrl: "https://cdn.example/living-full.jpg" },
      { url: "https://cdn.example/final.jpg", name: "Original exterior", downloadUrl: "https://cdn.example/final-full.jpg" },
      { url: "/api/media/display/o/token/2", name: "Aerial overlook", downloadUrl: "https://cdn.example/aerial-full.jpg" },
    ],
    videos: [{
      url: "https://cdn.example/walkthrough.mp4",
      streamUrl: "https://stream.example/preview.m3u8",
      previewUrl: "https://stream.example/preview.m3u8",
      name: "Walkthrough",
      poster: "/api/media/display/o/token/4",
      downloadUrl: "https://cdn.example/walkthrough.mp4",
    }],
    tourUrl: "https://my.matterport.com/show/?m=SampleTour",
    floorPlans: [
      { url: "/api/media/display/o/token/3", name: "Level 1.png", downloadUrl: "https://cdn.example/level.png" },
      { url: "https://cdn.example/level.pdf", name: "Level 1.pdf" },
    ],
    files: [{ url: "https://cdn.example/delivery.zip", name: "All files.zip" }],
    payUrl: PAY,
    invoice: { id: "sampleInvoice01", status: "sent", payToken: "samplePayToken0123456789ab" },
  };
}

describe("clientPresentationLinkFor", () => {
  it("returns the listing-site URL for an order or a listing", () => {
    expect(clientPresentationLinkFor({ id: "sample-order-01", listingId: "sample-listing-site" }, ENV))
      .toBe("https://iconicimagestx.vercel.app/studio/sample-listing-site/site");
    expect(clientPresentationLinkFor({ id: "sample-listing-site" }, ENV))
      .toBe("https://iconicimagestx.vercel.app/studio/sample-listing-site/site");
    expect(clientPresentationLinkFor({ id: "playtest-delivery-qa-order", listingId: "playtest-delivery-qa-listing" }, ENV))
      .toBe("https://iconicimagestx.vercel.app/studio/playtest-delivery-qa-listing/site");
  });

  it("returns null without a usable listing id", () => {
    expect(clientPresentationLinkFor(null, ENV)).toBeNull();
    expect(clientPresentationLinkFor({}, ENV)).toBeNull();
    expect(clientPresentationLinkFor({ id: "short" }, ENV)).toBeNull();
    expect(clientPresentationLinkFor({ listingId: "../secret" }, ENV)).toBeNull();
  });
});

describe("buildClientListingSite", () => {
  it("keeps a non-owner on the public share", () => {
    expect(buildClientListingSite({ view: "public", address: "100 Playtest Lane", images: ownerProject(true).images }).access)
      .toBe("public");
  });

  it("locks originals, raw video, pdf, and zip", () => {
    const site = buildClientListingSite(ownerProject(true), { galleryId: "sample-gallery-01" });
    expect(site.access).toBe("owner");
    if (site.access !== "owner") return;
    expect(site.locked).toBe(true);
    expect(site.payUrl).toBe(PAY);
    expect(site.galleryHref).toBe("/gallery/sample-gallery-01");
    expect(site.photos.map((photo) => photo.src)).toEqual(["/api/media/display/o/token/0"]);
    expect(site.photos.every((photo) => photo.downloadUrl === "")).toBe(true);
    expect(site.aerials.map((photo) => photo.src)).toEqual(["/api/media/display/o/token/2"]);
    expect(site.videos[0]?.src).toBe("https://stream.example/preview.m3u8");
    expect(site.videos[0]?.downloadUrl).toBe("");
    expect(site.tourUrl).toContain("my.matterport.com/show");
    expect(site.floorPlans).toEqual([{
      name: "Level 1.png",
      src: "/api/media/display/o/token/3",
      pdfUrl: "",
      downloadUrl: "",
    }]);
    expect(site.zipUrl).toBe("");
    const blob = JSON.stringify(site);
    for (const hidden of ["final.jpg", "walkthrough.mp4", "level.pdf", "delivery.zip", "living-full.jpg", "jordan.sample"]) {
      expect(blob).not.toContain(hidden);
    }
  });

  it("opens downloads once the gallery is paid or released", () => {
    const site = buildClientListingSite(ownerProject(false), { galleryId: "sample-gallery-01" });
    if (site.access !== "owner") throw new Error("expected owner");
    expect(site.locked).toBe(false);
    expect(site.payUrl).toBe("");
    expect(site.photos[0]?.downloadUrl).toBe("https://cdn.example/living-full.jpg");
    expect(site.videos[0]?.downloadUrl).toBe("https://cdn.example/walkthrough.mp4");
    expect(site.floorPlans.some((plan) => plan.pdfUrl === "https://cdn.example/level.pdf")).toBe(true);
    expect(site.zipUrl).toBe("https://cdn.example/delivery.zip");
    expect(site.galleryHref).toBe("/gallery/sample-gallery-01");
  });
});

describe("delivery email preview", () => {
  it("substitutes the presentation URL into the existing template without editing it", () => {
    const template = readFileSync(new URL("../server/services/email.ts", import.meta.url), "utf8");
    expect(template).toContain('href="${vars.galleryUrl}"');
    expect(template).toContain("View Gallery");
    const vars = deliveryEmailPreviewVars(ENV);
    const html = builtinEmailHtml("gallery_delivery", vars);
    expect(html).toContain("https://iconicimagestx.vercel.app/studio/sample-listing-site/site");
    expect(html).toContain("Jordan Sample");
    expect(html).toContain("100 Playtest Lane, Austin, TX 78701");
    expect(html).toContain(PAY || "missing-pay-link");
    expect(html).not.toContain("/gallery/sample-listing-site");
  });
});

/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ClientListingSiteGate } from "./ClientListingSite";
import { invoicePayLinkFor } from "@shared/invoicePayLink";

const ENV = { PUBLIC_SITE_URL: "https://iconicimagestx.vercel.app" };
const PAY = invoicePayLinkFor(
  { id: "sampleInvoice01", status: "sent", payToken: "samplePayToken0123456789ab" },
  ENV,
);

function project(locked: boolean) {
  return {
    view: "owner" as const,
    downloadsUnlocked: !locked,
    address: "100 Playtest Lane, Austin, TX 78701",
    agentName: "Avery Sample",
    images: [
      { url: "/api/media/display/o/token/0", name: "Living room", downloadUrl: "https://cdn.example/living-full.jpg" },
      { url: "https://cdn.example/final.jpg", name: "Original exterior" },
      { url: "/api/media/display/o/token/2", name: "Aerial overlook", downloadUrl: "https://cdn.example/aerial-full.jpg" },
    ],
    videos: [{
      url: "https://cdn.example/walkthrough.mp4",
      streamUrl: "https://stream.example/preview.m3u8",
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
    invoice: { status: "sent" },
  };
}

function htmlFor(locked: boolean, view: "owner" | "public" = "owner") {
  const source = view === "public"
    ? { ...project(true), view: "public", downloadsUnlocked: false }
    : project(locked);
  return renderToString(
    <MemoryRouter>
      <ClientListingSiteGate
        project={source}
        listingId="sample-listing-site"
        galleryId="sample-gallery-01"
        signedIn={view === "owner"}
      />
    </MemoryRouter>,
  );
}

function downloadTags(html: string) {
  return [...html.matchAll(/<[a-z0-9]+\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\sdownload(\s|=|>)/i.test(tag));
}

describe("client listing site", () => {
  it("shows the pay bar and no originals while downloads are locked", () => {
    const html = htmlFor(true);
    expect(html).toContain('data-testid="client-listing-site"');
    expect(html).toContain('data-testid="pay-invoice-bar"');
    expect(html).toContain("Pay invoice to unlock downloads");
    expect(html).toContain(PAY || "");
    expect(html).toContain('href="/gallery/sample-gallery-01"');
    expect(html).toContain("Your downloads &amp; invoice");
    expect(html).toContain('controlsList="nodownload"');
    expect(html).toContain("https://stream.example/preview.m3u8");
    expect(html).toContain("my.matterport.com/show");
    expect(html).toContain("/api/media/display/o/token/3");
    expect(html).not.toContain("Cormorant");
    expect(html).not.toContain("Georgia");
    expect(downloadTags(html)).toEqual([]);
    for (const hidden of ["final.jpg", "walkthrough.mp4", "level.pdf", "delivery.zip", "living-full.jpg"]) {
      expect(html).not.toContain(hidden);
    }
  });

  it("shows per-item and zip downloads once paid", () => {
    const html = htmlFor(false);
    expect(html).not.toContain('data-testid="pay-invoice-bar"');
    expect(html).toContain('href="/gallery/sample-gallery-01"');
    expect(html).toContain("https://cdn.example/living-full.jpg");
    expect(html).toContain("https://cdn.example/walkthrough.mp4");
    expect(html).toContain("https://cdn.example/level.pdf");
    expect(html).toContain("https://cdn.example/delivery.zip");
    expect(downloadTags(html).length).toBeGreaterThan(0);
    expect(html).toContain("Download all");
  });

  it("leaves a non-owner on the public studio share", () => {
    const html = htmlFor(true, "public");
    expect(html).toContain('data-studio-view="public"');
    expect(html).not.toContain('data-testid="client-listing-site"');
    expect(html).not.toContain('data-testid="pay-invoice-bar"');
    expect(html).not.toContain("jordan.sample");
    expect(downloadTags(html)).toEqual([]);
  });
});

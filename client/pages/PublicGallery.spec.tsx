<<<<<<< HEAD
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PublicGalleryMissing, PUBLIC_GALLERY_MISSING_COPY, PublicGalleryView, type PublicGalleryModel } from "./PublicGallery";

const INTERNAL = /fotello|collection|firestore/i;

function visibleText(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("public gallery not-found state", () => {
  it("renders Iconic copy and a portal link with no internal strings", () => {
    const html = visibleText(renderToString(
      <MemoryRouter>
        <PublicGalleryMissing />
      </MemoryRouter>,
    ));

    expect(html).toContain("Iconic Images");
    expect(html).toContain("Gallery not found");
    expect(html).toContain(PUBLIC_GALLERY_MISSING_COPY);
    expect(html).toContain('href="/portal"');
    expect(html).toContain("Sign in to your portal");
    expect(html).toContain("photos@iconicimagestx.com");
    expect(html).toContain("281.356.0965");
    expect(html).toContain('data-gallery-state="missing"');
    expect(html).not.toMatch(INTERNAL);
    expect(html).not.toContain("qa-nonexistent-gallery");
  });

  it("does not render resolver or API error text on the gallery page", () => {
    const source = readFileSync(new URL("./PublicGallery.tsx", import.meta.url), "utf8");
    expect(source).toContain("<PublicGalleryMissing />");
    expect(source).toContain("GalleryDownloadLockNotice");
    expect(source).not.toContain("link.message");
    expect(source).not.toContain("data.error");
    expect(source).not.toContain("data.message");
    expect(source).not.toMatch(INTERNAL);
  });
});

vi.mock("@/hooks/useSiteSettings", () => ({
  useSiteSettings: () => ({
    global: { primaryColor: "#0d9488" },
  }),
}));

const delivered: PublicGalleryModel = {
  title: "18 Oak Hollow",
  clientName: "TEST - Delivery QA",
  status: "delivered",
  paymentRequired: false,
  mediaItems: [
    {
      id: "mls",
      type: "photo",
      fileName: "01-mls.jpg",
      url: "https://cdn.example/01-mls.jpg",
      category: "mls",
      canDownload: true,
    },
    {
      id: "full",
      type: "photo",
      fileName: "front-fullres.jpg",
      url: "https://cdn.example/front-fullres.jpg",
      width: 6000,
      height: 4000,
      canDownload: true,
    },
    {
      id: "branded",
      type: "video",
      fileName: "branded.mp4",
      url: "https://cdn.example/branded.mp4",
      poster: "https://cdn.example/branded.jpg",
      width: 1920,
      height: 1080,
    },
    {
      id: "clean",
      type: "video",
      fileName: "unbranded.mp4",
      url: "https://cdn.example/unbranded.mp4",
      width: 1920,
      height: 1080,
    },
    {
      id: "reel",
      type: "reel",
      fileName: "snap-reel.mp4",
      url: "https://cdn.example/snap-reel.mp4",
      width: 1080,
      height: 1920,
    },
    {
      id: "tour",
      type: "matterport",
      title: "3D Tour",
      url: "https://my.matterport.com/show/?m=abc",
      embedUrl: "https://my.matterport.com/show/?m=abc",
    },
    {
      id: "png",
      type: "floorplan",
      fileName: "level1.png",
      url: "https://cdn.example/level1.png",
      contentType: "image/png",
      canDownload: true,
    },
    {
      id: "pdf",
      type: "floorplan",
      fileName: "level2.pdf",
      url: "https://cdn.example/level2.pdf",
      contentType: "application/pdf",
      canDownload: true,
    },
    {
      id: "aerial",
      type: "aerial",
      fileName: "drone.jpg",
      url: "https://cdn.example/drone.jpg",
      canDownload: true,
    },
    {
      id: "orbit",
      type: "aerial",
      fileName: "drone.mp4",
      url: "https://cdn.example/drone.mp4",
      contentType: "video/mp4",
    },
    {
      id: "notes",
      type: "file",
      fileName: "notes.pdf",
      url: "https://cdn.example/notes.pdf",
      contentType: "application/pdf",
      fileSize: 4096,
      canDownload: true,
    },
    {
      id: "zip",
      type: "file",
      fileName: "extras.zip",
      url: "https://cdn.example/extras.zip",
      fileSize: 9000,
      canDownload: true,
    },
  ],
};

function page(gallery: PublicGalleryModel) {
  return renderToString(
    <MemoryRouter>
      <PublicGalleryView gallery={gallery} onCopyLink={() => undefined} />
    </MemoryRouter>,
  );
}

describe("public delivery gallery", () => {
  it("renders every delivered media type on the gallery route view", () => {
    const html = page(delivered);
    expect(html).toContain("18 Oak Hollow");
    expect(html).toContain("TEST - Delivery QA");
    for (const kind of [
      "mls-photo",
      "fullres-photo",
      "branded-video",
      "unbranded-video",
      "reel",
      "tour",
      "floorplan-image",
      "floorplan-pdf",
      "aerial-photo",
      "aerial-video",
      "file",
    ]) {
      expect(html).toContain(`data-gallery-kind="${kind}"`);
    }
    expect(html).toContain("playsinline");
    expect(html).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(html).toContain("Open 3D tour");
    expect(html).toContain("Open floor plan");
    expect(html).toContain("PDF · 4 KB");
    expect(html).toContain("ZIP · 8.8 KB");
    expect(html).not.toContain("gallery-download-lock");
  });

  it("keeps an unpaid invoice locked and does not render file urls or downloads", () => {
    const html = page({
      ...delivered,
      paymentRequired: true,
      invoiceId: "inv-unpaid",
      lockTitle: "Your Iconic files are locked",
      mediaItems: delivered.mediaItems?.map((item) => ({
        ...item,
        locked: true,
        canDownload: false,
        url: null,
        shareUrl: null,
        embedUrl: null,
      })),
    });
    expect(html).toContain("gallery-download-lock");
    expect(html).toContain("Your Iconic files are locked");
    expect(html).toContain('href="/invoice/inv-unpaid"');
    expect(html).not.toContain('download=""');
    expect(html).not.toContain("cdn.example");
    expect(html).not.toContain("matterport.com");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<iframe");
  });
});

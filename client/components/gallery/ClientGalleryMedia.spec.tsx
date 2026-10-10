import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  ClientGalleryBoard,
  ClientGalleryMediaCard,
} from "./ClientGalleryMedia";
import {
  classifyClientGalleryItem,
  type ClientGalleryItem,
} from "./clientGalleryMedia";

function render(item: ClientGalleryItem, onCopyLink?: (url: string) => void) {
  return renderToString(
    <ClientGalleryMediaCard item={item} onCopyLink={onCopyLink} />,
  );
}

function tag(html: string, name: string): string {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "i"))?.[0] || "";
}

const paid = { canDownload: true, locked: false };

describe("client gallery media classification", () => {
  it("renders a root-relative photo url instead of treating it as locked", () => {
    expect(classifyClientGalleryItem({
      type: "photo",
      fileName: "front.jpg",
      url: "/media/launch/hero_day_exterior_front.jpg",
    })).toBe("photo");
  });

  it("keeps a photo named like an angle shot out of the floor plan path", () => {
    expect(
      classifyClientGalleryItem({
        type: "photo",
        fileName: "floorplan-angle.jpg",
        url: "https://cdn.example/floorplan-angle.jpg",
      }),
    ).toBe("photo");
  });

  it("keeps a portrait branded file branded and an unlabeled portrait video a reel", () => {
    expect(classifyClientGalleryItem({
      type: "video",
      fileName: "branded.mp4",
      url: "https://cdn.example/branded.mp4",
      width: 1080,
      height: 1920,
    })).toBe("branded-video");
    expect(classifyClientGalleryItem({
      type: "video",
      fileName: "clip.mp4",
      url: "https://cdn.example/clip.mp4",
      width: 1080,
      height: 1920,
    })).toBe("reel");
  });

  it("does not treat unbranded as branded", () => {
    expect(
      classifyClientGalleryItem({
        type: "video",
        fileName: "unbranded-walkthrough.mp4",
        url: "https://cdn.example/unbranded.mp4",
      }),
    ).toBe("unbranded-video");
  });

  it("uses pixel size for a full-resolution photo and lets an MLS name win", () => {
    expect(
      classifyClientGalleryItem({
        type: "photo",
        fileName: "front.jpg",
        url: "https://cdn.example/front.jpg",
        width: 6000,
        height: 4000,
      }),
    ).toBe("fullres-photo");
    expect(
      classifyClientGalleryItem({
        type: "photo",
        fileName: "mls-web.jpg",
        url: "https://cdn.example/mls-web.jpg",
        width: 6000,
        height: 4000,
      }),
    ).toBe("mls-photo");
  });
});

describe("client gallery media render paths", () => {
  it("renders an MLS photo as an image that can download only when unlocked", () => {
    const html = render({
      id: "mls",
      type: "photo",
      category: "mls",
      fileName: "01-mls.jpg",
      url: "https://cdn.example/01-mls.jpg",
      width: 2048,
      height: 1365,
      ...paid,
    });
    expect(html).toContain('data-gallery-kind="mls-photo"');
    expect(html).toContain("MLS photo");
    expect(tag(html, "img")).toContain("https://cdn.example/01-mls.jpg");
    expect(tag(html, "img")).toContain("object-contain");
    expect(html).toContain('download=""');
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<iframe");
  });

  it("renders a full-resolution photo contained in the viewport", () => {
    const html = render({
      id: "full",
      type: "full-res",
      fileName: "front-fullres.jpg",
      url: "https://cdn.example/front-fullres.jpg",
      width: 6000,
      height: 4000,
      ...paid,
    });
    expect(html).toContain('data-gallery-kind="fullres-photo"');
    expect(html).toContain("Full resolution");
    expect(html).toContain("80dvh");
    expect(tag(html, "img")).toContain("object-contain");
    expect(tag(html, "img")).not.toContain("object-cover");
  });

  it("renders a branded mp4 in a player with controls, playsInline, metadata preload, and a poster", () => {
    const html = render({
      id: "branded",
      type: "video",
      fileName: "branded.mp4",
      url: "https://cdn.example/branded.mp4",
      poster: "https://cdn.example/branded.jpg",
      width: 1920,
      height: 1080,
      canDownload: true,
    });
    const video = tag(html, "video");
    expect(html).toContain('data-gallery-kind="branded-video"');
    expect(html).toContain("Branded video");
    expect(video).toContain('src="https://cdn.example/branded.mp4"');
    expect(video).toContain("controls");
    expect(video).toContain("playsinline");
    expect(video).toContain('preload="metadata"');
    expect(video).toContain('poster="https://cdn.example/branded.jpg"');
    expect(video).toContain("object-contain");
    expect(video).toContain("1920 / 1080");
    expect(video).not.toContain("object-cover");
    expect(html).not.toContain('download=""');
    expect(html).not.toContain("aspect-video");
  });

  it("renders an unbranded mp4 in the same player without requiring a poster", () => {
    const html = render({
      id: "open",
      type: "video",
      fileName: "unbranded.mp4",
      url: "https://cdn.example/unbranded.mp4",
      contentType: "video/mp4",
      width: 1920,
      height: 1080,
    });
    const video = tag(html, "video");
    expect(html).toContain('data-gallery-kind="unbranded-video"');
    expect(html).toContain("Unbranded video");
    expect(video).toContain("controls");
    expect(video).toContain("playsinline");
    expect(video).toContain('preload="metadata"');
    expect(video).not.toContain("poster=");
    expect(html).not.toContain('download=""');
  });

  it("renders a vertical reel at 9:16, capped to the phone viewport, without a 16:9 frame", () => {
    const html = render({
      id: "reel",
      type: "reel",
      fileName: "snap-reel.mp4",
      url: "https://cdn.example/snap-reel.mp4",
      poster: "https://cdn.example/snap-reel.jpg",
      width: 1080,
      height: 1920,
    });
    const video = tag(html, "video");
    expect(html).toContain('data-gallery-kind="reel"');
    expect(video).toContain("playsinline");
    expect(video).toContain("controls");
    expect(video).toContain('preload="metadata"');
    expect(video).toContain('poster="https://cdn.example/snap-reel.jpg"');
    expect(video).toContain("1080 / 1920");
    expect(video).toContain("78dvh");
    expect(video).toContain("9 / 16");
    expect(video).toContain("object-contain");
    expect(video).not.toContain("object-cover");
    expect(html).not.toContain("aspect-video");
    expect(html).not.toContain("16 / 9");
  });

  it("embeds a Matterport tour with fullscreen and xr tracking plus an Open 3D tour link", () => {
    const html = render({
      id: "tour",
      type: "matterport",
      title: "123 Oak",
      url: "https://my.matterport.com/show/?m=abc123",
      embedUrl: "https://my.matterport.com/show/?m=abc123",
      canDownload: true,
    });
    const frame = tag(html, "iframe");
    expect(html).toContain('data-gallery-kind="tour"');
    expect(frame).toContain('src="https://my.matterport.com/show/?m=abc123"');
    expect(frame).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(frame).toContain("allowfullscreen");
    expect(html).toContain("aspect-video");
    expect(html).toContain("Open 3D tour");
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('download=""');
    expect(html).not.toContain("<video");
  });

  it("still offers Open 3D tour when the tour has no embeddable iframe", () => {
    const html = render({
      id: "link",
      type: "tour",
      title: "Hosted tour",
      url: "https://tours.example/oak",
      provider: "Virtual tour",
    });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Open 3D tour");
    expect(html).toContain('href="https://tours.example/oak"');
  });

  it("renders a PNG floor plan as an image and a PDF floor plan as an Open floor plan link", () => {
    const png = render({
      id: "planpng",
      type: "floorplan",
      fileName: "level1.png",
      url: "https://cdn.example/level1.png",
      contentType: "image/png",
      ...paid,
    });
    expect(png).toContain('data-gallery-kind="floorplan-image"');
    expect(tag(png, "img")).toContain("https://cdn.example/level1.png");
    expect(tag(png, "img")).toContain("object-contain");
    expect(png).not.toContain("<iframe");

    const pdf = render({
      id: "planpdf",
      type: "floorplan",
      fileName: "level2.pdf",
      url: "https://cdn.example/level2.pdf",
      contentType: "application/pdf",
      thumbnailUrl: "https://cdn.example/level2-thumb.jpg",
      ...paid,
    });
    expect(pdf).toContain('data-gallery-kind="floorplan-pdf"');
    expect(pdf).toContain('src="https://cdn.example/level2-thumb.jpg"');
    expect(pdf).toContain("Open floor plan");
    expect(pdf).toContain('href="https://cdn.example/level2.pdf"');
    expect(pdf).toContain('target="_blank"');
    expect(pdf).not.toContain("<iframe");
    expect(pdf).not.toContain("<video");
    const open = [...pdf.matchAll(/<a\b[^>]*>/g)]
      .map((match) => match[0])
      .find((anchor) => anchor.includes("gallery-open-floorplan"));
    expect(open).toBeTruthy();
    expect(open).not.toContain("download");
  });

  it("does not leave a PDF floor plan as a blank box when no thumbnail was stored", () => {
    const html = render({
      id: "barepdf",
      type: "floorplan",
      fileName: "upper-floorplan.pdf",
      url: "https://cdn.example/upper-floorplan.pdf",
    });
    expect(html).toContain("Open floor plan");
    expect(html).toContain("upper-floorplan.pdf");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<img");
  });

  it("renders an aerial still as a photo and an aerial mp4 as a video player", () => {
    const photo = render({
      id: "aerialphoto",
      type: "aerial",
      fileName: "drone-overview.jpg",
      url: "https://cdn.example/drone-overview.jpg",
      contentType: "image/jpeg",
    });
    expect(photo).toContain('data-gallery-kind="aerial-photo"');
    expect(photo).toContain("Aerial");
    expect(tag(photo, "img")).toContain("drone-overview.jpg");
    expect(photo).not.toContain("<video");

    const video = render({
      id: "aerialvideo",
      type: "video",
      category: "aerial",
      fileName: "drone-orbit.mp4",
      url: "https://cdn.example/drone-orbit.mp4",
      contentType: "video/mp4",
      width: 1920,
      height: 1080,
    });
    expect(video).toContain('data-gallery-kind="aerial-video"');
    expect(tag(video, "video")).toContain("playsinline");
    expect(tag(video, "video")).toContain('preload="metadata"');
    expect(tag(video, "video")).toContain("object-contain");
  });

  it("renders other PDF and ZIP files as named tiles with type and size", () => {
    const notes = render({
      id: "notes",
      type: "document",
      fileName: "seller-notes.pdf",
      url: "https://cdn.example/seller-notes.pdf",
      contentType: "application/pdf",
      fileSize: 1258291,
      ...paid,
    });
    expect(notes).toContain('data-gallery-kind="file"');
    expect(notes).toContain("seller-notes.pdf");
    expect(notes).toContain("PDF · 1.2 MB");
    expect(notes).toContain("Open file");
    expect(notes).toContain('target="_blank"');
    expect(notes).not.toContain("<iframe");

    const zip = render({
      id: "bundle",
      type: "file",
      fileName: "documents.zip",
      url: "https://cdn.example/documents.zip",
      fileSize: 2400000,
      ...paid,
    });
    expect(zip).toContain("documents.zip");
    expect(zip).toContain("ZIP · 2.3 MB");
    expect(zip).toContain('download=""');
    expect(zip).not.toContain("<iframe");
    expect(zip).not.toContain("Open file");
  });

  it("shows a file tile when the size was not stored", () => {
    const html = render({
      id: "nosize",
      type: "file",
      fileName: "extra.zip",
      url: "https://cdn.example/extra.zip",
      mimeType: "application/zip",
    });
    expect(html).toContain("extra.zip");
    expect(html).toContain("ZIP · Size not on file");
  });

  it("keeps unpaid media locked and does not offer a download", () => {
    const html = render({
      id: "secret",
      type: "photo",
      fileName: "secret.jpg",
      url: "https://cdn.example/secret.jpg",
      locked: true,
      canDownload: false,
    });
    expect(html).toContain('data-gallery-kind="locked"');
    expect(html).not.toContain("https://cdn.example/secret.jpg");
    expect(html).not.toContain('download=""');
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<iframe");
  });

  it("does not offer downloads when the gallery is only a public share", () => {
    const html = renderToString(
      <ClientGalleryBoard
        items={[
          {
            id: "share-photo",
            type: "photo",
            fileName: "front.jpg",
            url: "https://cdn.example/front.jpg",
            canDownload: false,
          },
          {
            id: "share-video",
            type: "video",
            fileName: "branded.mp4",
            url: "https://cdn.example/branded.mp4",
            canDownload: false,
          },
        ]}
      />,
    );
    expect(html).toContain('data-gallery-kind="photo"');
    expect(html).toContain('data-gallery-kind="branded-video"');
    expect(html).not.toContain('download=""');
    expect(html).not.toContain(">Download<");
  });
});

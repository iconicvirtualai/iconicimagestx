import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StudioPropertyMedia } from "./StudioPropertyMedia";
import {
  readStudioPropertyMedia,
  type StudioMediaView,
} from "./studioPropertyMedia";

function render(project: unknown, view: StudioMediaView) {
  return renderToString(
    <StudioPropertyMedia media={readStudioPropertyMedia(project)} view={view} />,
  );
}

function tag(html: string, name: string) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "i"))?.[0] || "";
}

function anchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);
}

function anchorWith(html: string, hrefPart: string) {
  return anchors(html).find((anchor) => anchor.includes(hrefPart));
}

describe("studio property media fields", () => {
  it("reads a Matterport tour from tourUrl or from a matterport host", () => {
    const fromTour = readStudioPropertyMedia({
      tourUrl: "https://my.matterport.com/show/?m=abc",
    });
    expect(fromTour.tours).toEqual([
      {
        id: "tourUrl-1",
        title: "3D tour",
        embedUrl: "https://my.matterport.com/show/?m=abc",
        openUrl: "https://my.matterport.com/show/?m=abc",
      },
    ]);

    const fromHost = readStudioPropertyMedia({
      tours: [{ url: "https://my.matterport.com/show/?m=from-host", title: "Oak" }],
    });
    expect(fromHost.tours[0]).toMatchObject({
      title: "Oak",
      embedUrl: "https://my.matterport.com/show/?m=from-host",
    });
  });

  it("reads matterportUrl, embedUrl, and type without treating a lookalike host as Matterport", () => {
    const media = readStudioPropertyMedia({
      matterportUrl: "https://my.matterport.com/show/?m=field",
      tours: [
        {
          id: "typed",
          type: "matterport",
          title: "Typed tour",
          url: "https://tours.example/oak",
          embedUrl: "https://my.matterport.com/show/?m=embed",
        },
      ],
      virtualTourUrl: "https://matterport.com.evil.com/show/?m=nope",
    });
    expect(media.tours.map((tour) => tour.embedUrl)).toEqual([
      "https://my.matterport.com/show/?m=field",
      null,
      "https://my.matterport.com/show/?m=embed",
    ]);
    expect(media.tours[2]).toMatchObject({
      id: "typed",
      title: "Typed tour",
      openUrl: "https://tours.example/oak",
    });
    expect(media.tours[1]?.openUrl).toBe("https://matterport.com.evil.com/show/?m=nope");
  });

  it("keeps one tour when tourUrl and matterportUrl are the same address", () => {
    const media = readStudioPropertyMedia({
      tourUrl: "https://my.matterport.com/show/?m=same",
      matterportUrl: "https://my.matterport.com/show/?m=same",
    });
    expect(media.tours).toHaveLength(1);
  });

  it("reads png, jpg, and pdf floor plans, including mime and preview fields", () => {
    const media = readStudioPropertyMedia({
      floorPlans: [
        { url: "https://cdn.example/level1.png", name: "Level 1" },
        { url: "https://cdn.example/level2.JPG", fileName: "Level 2.jpg" },
        {
          url: "https://cdn.example/level3.pdf",
          name: "Level 3",
          thumbnailUrl: "https://cdn.example/level3-thumb.jpg",
        },
      ],
      floorPlanPdf: {
        url: "https://cdn.example/upper",
        contentType: "application/pdf",
        name: "Upper",
        previewUrl: "https://cdn.example/upper-preview.png",
      },
      pdfFloorPlans: [
        {
          url: "https://cdn.example/bare.pdf",
          title: "Bare",
          firstPageUrl: "https://cdn.example/bare.pdf",
        },
      ],
    });
    expect(media.floorPlans.map((plan) => [plan.kind, plan.previewUrl, plan.title])).toEqual([
      ["image", null, "Level 1"],
      ["image", null, "Level 2.jpg"],
      ["pdf", "https://cdn.example/level3-thumb.jpg", "Level 3"],
      ["pdf", "https://cdn.example/upper-preview.png", "Upper"],
      ["pdf", null, "Bare"],
    ]);
  });

  it("reads aerial photos and videos from type, category, mime, and extension", () => {
    const media = readStudioPropertyMedia({
      aerials: [
        { url: "https://cdn.example/still.jpg", category: "aerial", name: "Still" },
        { url: "https://cdn.example/orbit.mp4", type: "aerial", name: "Orbit" },
      ],
      aerialPhotos: [{ url: "https://cdn.example/north", contentType: "image/jpeg", name: "North" }],
      aerialVideo: { url: "https://cdn.example/south", mimeType: "video/mp4", title: "South" },
      droneVideos: ["https://cdn.example/east.webm"],
    });
    expect(media.aerials.map((item) => [item.kind, item.title])).toEqual([
      ["photo", "Still"],
      ["video", "Orbit"],
      ["photo", "North"],
      ["video", "South"],
      ["video", "Aerial"],
    ]);
  });

  it("ignores photos, videos, delivery files, download urls, and unsafe urls", () => {
    const media = readStudioPropertyMedia({
      images: [{ url: "https://cdn.example/front.jpg", category: "aerial" }],
      videos: [{ url: "https://cdn.example/drone.mp4", name: "Aerial video", category: "aerial" }],
      files: [{ url: "https://cdn.example/plan.pdf", type: "floorplan" }],
      downloadUrl: "https://cdn.example/secret.pdf",
      tourUrl: "javascript:alert(1)",
      floorPlans: [null, "not a url", { url: "javascript:alert(1)" }],
      aerials: [{ url: "" }],
    });
    expect(media).toEqual({ tours: [], floorPlans: [], aerials: [] });
  });
});

describe.each(["public", "owner"] as const)("%s studio tours, floor plans, and aerials", (view) => {
  it("embeds Matterport and still offers Open 3D tour", () => {
    const html = render(
      {
        tourUrl: "https://my.matterport.com/show/?m=abc123",
        tours: [{ type: "tour", title: "Hosted tour", url: "https://tours.example/oak", provider: "Virtual tour" }],
      },
      view,
    );
    const frame = tag(html, "iframe");
    expect(html).toContain('data-studio-kind="tour"');
    expect(frame).toContain('src="https://my.matterport.com/show/?m=abc123"');
    expect(frame).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(frame).toContain('loading="lazy"');
    expect(frame).toContain('title="3D tour"');
    expect(html).toContain("aspect-video");
    expect(html).toContain("Open 3D tour");
    expect(anchorWith(html, "my.matterport.com")).toContain('target="_blank"');
    expect(anchors(html).some((anchor) => anchor.includes("tours.example/oak"))).toBe(true);
    expect((html.match(/<iframe\b/gi) || []).length).toBe(1);
    expect(anchors(html).every((anchor) => !/\sdownload/i.test(anchor))).toBe(true);
  });

  it("renders PNG and JPG floor plans as contained images", () => {
    const html = render(
      {
        floorPlans: [
          { url: "https://cdn.example/level1.png", name: "Level 1", contentType: "image/png" },
          { url: "https://cdn.example/level2.jpg", name: "Level 2", mime: "image/jpeg" },
        ],
      },
      view,
    );
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    expect(html).toContain('data-studio-kind="floorplan-image"');
    expect(images).toHaveLength(2);
    expect(images[0]).toContain("https://cdn.example/level1.png");
    expect(images[1]).toContain("https://cdn.example/level2.jpg");
    for (const image of images) {
      expect(image).toContain("object-contain");
      expect(image).toContain('loading="lazy"');
    }
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("Open floor plan");
  });

  it("previews a PDF floor plan and opens it in a new tab", () => {
    const withThumb = render(
      {
        floorPlans: [{
          url: "https://cdn.example/level2.pdf",
          name: "Level 2",
          contentType: "application/pdf",
          thumbnailUrl: "https://cdn.example/level2-thumb.jpg",
        }],
      },
      view,
    );
    expect(withThumb).toContain('data-studio-kind="floorplan-pdf"');
    expect(tag(withThumb, "img")).toContain("https://cdn.example/level2-thumb.jpg");
    expect(tag(withThumb, "img")).toContain("object-contain");
    expect(withThumb).not.toContain('src="https://cdn.example/level2.pdf"');
    const open = anchorWith(withThumb, "level2.pdf");
    expect(withThumb).toContain("Open floor plan");
    expect(open).toContain('target="_blank"');
    expect(withThumb).not.toContain("<iframe");
    expect(withThumb).not.toContain("studio-floorplan-tile");

    const bare = render(
      {
        pdfFloorPlan: {
          url: "https://cdn.example/upper-floorplan.pdf",
          fileName: "upper-floorplan.pdf",
        },
      },
      view,
    );
    expect(bare).toContain("studio-floorplan-tile");
    expect(bare).toContain("upper-floorplan.pdf");
    expect(bare).toContain("PDF floor plan");
    expect(bare).not.toContain("<img");
    expect(bare).toContain("Open floor plan");

    if (view === "public") {
      expect(open).not.toMatch(/\sdownload/i);
      expect(anchorWith(bare, "upper-floorplan.pdf")).not.toMatch(/\sdownload/i);
    } else {
      expect(open).toMatch(/\sdownload/i);
      expect(anchorWith(bare, "upper-floorplan.pdf")).toMatch(/\sdownload/i);
    }
  });

  it("renders an aerial photo and an inline aerial video", () => {
    const html = render(
      {
        aerials: [
          { url: "https://cdn.example/overhead.jpg", type: "aerial", name: "Overhead" },
          {
            url: "https://cdn.example/orbit.mp4",
            category: "drone",
            name: "Orbit",
            contentType: "video/mp4",
            poster: "https://cdn.example/orbit.jpg",
          },
        ],
      },
      view,
    );
    expect(html).toContain('data-studio-kind="aerial-photo"');
    expect(tag(html, "img")).toContain("https://cdn.example/overhead.jpg");
    expect(tag(html, "img")).toContain("object-contain");
    const player = tag(html, "video");
    expect(html).toContain('data-studio-kind="aerial-video"');
    expect(player).toContain("https://cdn.example/orbit.mp4");
    expect(player.toLowerCase()).toContain("playsinline");
    expect(player).toContain("controls");
    expect(player).toContain('poster="https://cdn.example/orbit.jpg"');
    expect(html).not.toContain("<iframe");
    if (view === "public") {
      expect(player.toLowerCase()).toContain('controlslist="nodownload"');
      expect(anchors(html)).toEqual([]);
    } else {
      expect(player.toLowerCase()).not.toContain("controlslist");
    }
  });

  it("renders nothing when the fields are absent", () => {
    expect(render({}, view)).toBe("");
    expect(render({ images: [{ url: "https://cdn.example/front.jpg" }], videos: [] }, view)).toBe("");
  });
});

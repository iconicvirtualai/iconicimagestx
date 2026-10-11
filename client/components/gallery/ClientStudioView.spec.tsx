import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ClientStudioView, blockPublicVideoMenu } from "./ClientStudioView";
import type { StudioGalleryTabId } from "./StudioGalleryTabs";

const media = {
  address: "18 Oak Hollow",
  agentName: "Ada Agent",
  services: ["Photos", "Video"],
  images: [
    { url: "https://cdn.example/front.jpg", name: "Front", downloadUrl: "https://cdn.example/front-full.jpg" },
  ],
  videos: [
    { url: "https://cdn.example/branded.mp4", name: "Branded video" },
    { url: "https://cdn.example/unbranded.mp4", name: "Unbranded video" },
    { url: "https://cdn.example/snap-reel.mp4", name: "Reel" },
    { url: "https://cdn.example/drone-orbit.mp4?token=1", name: "Aerial video" },
  ],
  tourUrl: "https://my.matterport.com/show/?m=abc",
  floorPlans: [
    { url: "https://cdn.example/level1.png", name: "Level 1" },
    { url: "https://cdn.example/level2.pdf", name: "Level 2" },
    { url: "https://cdn.example/walkthrough.mp4", name: "Walkthrough" },
  ],
  files: [{ url: "https://cdn.example/delivery.zip", name: "All files" }],
  downloadsUnlocked: true,
  invoice: { status: "paid" },
};

function page(view: "public" | "owner", tab: StudioGalleryTabId, selected: number | null = null) {
  return renderToString(
    <MemoryRouter>
      <ClientStudioView
        project={{ ...media, view, clientName: "Private Client", clientEmail: "ada@example.com" }}
        listingId="listing1234"
        signedIn={view === "owner"}
        initialTab={tab}
        initialSelectedPhoto={selected}
      />
    </MemoryRouter>,
  );
}

function videoTags(html: string) {
  return html.match(/<video\b[^>]*>/gi) || [];
}

function downloadAttributes(html: string) {
  return [...html.matchAll(/<[a-z0-9]+\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\sdownload(\s|=|>)/i.test(tag));
}

function mp4Anchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"[^>]*>/gi)]
    .map((match) => match[1])
    .filter((href) => {
      const path = href.split("#")[0]?.split("?")[0] || href;
      return path.toLowerCase().endsWith(".mp4");
    });
}

function anchorWith(html: string, hrefPart: string) {
  return [...html.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => tag.includes(hrefPart));
}

describe("public studio share", () => {
  it("plays videos inline and does not offer a download or a raw mp4 link", () => {
    const videos = page("public", "videos");
    const photos = page("public", "photos", 0);
    const tours = page("public", "tours");

    const players = videoTags(videos);
    expect(players).toHaveLength(4);
    for (const player of players) {
      expect(player).toContain("controls");
      expect(player.toLowerCase()).toContain("playsinline");
      expect(player).toContain('preload="metadata"');
      expect(player.toLowerCase()).toContain("controlslist=");
      expect(player.toLowerCase()).toMatch(/controlslist="[^"]*nodownload/);
      expect(player.toLowerCase()).toContain("noplaybackrate");
    }
    expect(players.some((player) => player.includes("https://cdn.example/branded.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/unbranded.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/snap-reel.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("drone-orbit.mp4"))).toBe(true);
    expect(videos).not.toContain("Watch");
    expect(videos).not.toContain("Download All Photos");
    expect(videos).not.toContain("delivery.zip");

    for (const html of [videos, photos, tours]) {
      expect(downloadAttributes(html)).toEqual([]);
      expect(mp4Anchors(html)).toEqual([]);
      expect(html).not.toContain("delivery.zip");
      expect(html).toContain('data-studio-view="public"');
    }

    expect(photos).toContain("https://cdn.example/front.jpg");
    expect(photos).not.toContain("Download");
    expect(tours).toContain("https://cdn.example/level1.png");
    expect(tours).toContain("object-contain");
    expect(tours).toContain("Open floor plan");
    expect(tours).toContain("https://cdn.example/level2.pdf");
    expect(tours).toContain("studio-floorplan-tile");
    expect(tours).toContain("Open 3D tour");
    expect(tours).toContain("aspect-video");
    const tourFrame = (tours.match(/<iframe\b[^>]*>/i) || [""])[0];
    expect(tourFrame).toContain('src="https://my.matterport.com/show/?m=abc"');
    expect(tourFrame).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(tourFrame).toContain('loading="lazy"');
    expect(tourFrame).toContain('title="3D tour"');
    expect(anchorWith(tours, "level2.pdf")).toContain('target="_blank"');
    expect(anchorWith(tours, "level2.pdf")).not.toMatch(/\sdownload/i);
    expect(videoTags(tours)).toHaveLength(1);
    expect(videoTags(tours)[0].toLowerCase()).toMatch(/controlslist="[^"]*nodownload/);

    const beforeTabs = videos.slice(0, videos.indexOf('data-testid="studio-gallery-tabs"'));
    expect(beforeTabs).not.toContain("overflow-hidden");
    expect(beforeTabs).not.toContain("overflow-x-hidden");
    expect(videos).not.toContain("AI Tools");
  });

  it("blocks the video context menu", () => {
    const preventDefault = vi.fn();
    blockPublicVideoMenu({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("owner studio view", () => {
  it("keeps the watch link and the download control", () => {
    const videos = page("owner", "videos");
    const photos = page("owner", "photos", 0);
    const tours = page("owner", "tours");

    expect(videos).toContain('data-studio-view="owner"');
    expect(videos).toContain("Watch");
    expect(videos).toContain('href="https://cdn.example/branded.mp4"');
    expect(videos).toContain('href="https://cdn.example/unbranded.mp4"');
    expect(videos).toContain('href="https://cdn.example/snap-reel.mp4"');
    expect(videoTags(videos)).toEqual([]);
    expect(videos.toLowerCase()).not.toContain("controlslist");
    expect(videos).toContain("AI Tools");
    expect(videos).toContain("Listing file");

    expect(downloadAttributes(photos).length).toBeGreaterThan(0);
    expect(photos).toContain('download=""');
    expect(photos).toContain("Download All Photos");
    expect(photos).toContain("https://cdn.example/front-full.jpg");

    expect(videoTags(tours)).toEqual([]);
    expect(tours).toContain("Open floor plan");
    expect(tours).toContain("Open 3D tour");
    expect(tours).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(tours).toContain('href="https://cdn.example/level2.pdf"');
    expect(tours).toContain('href="https://cdn.example/walkthrough.mp4"');
    expect(anchorWith(tours, "level2.pdf")).toMatch(/\sdownload/i);
    expect(anchorWith(tours, "walkthrough.mp4")).not.toMatch(/\sdownload/i);
  });
});

describe("studio tours, floor plans, and aerials", () => {
  it("shows nothing when the payload has none of those fields", () => {
    const html = renderToString(
      <MemoryRouter>
        <ClientStudioView
          project={{ view: "public", images: [], videos: [] }}
          listingId="listing1234"
          signedIn={false}
          initialTab="tours"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("No 3D tours");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("Open floor plan");
    expect(html).not.toContain("Open 3D tour");
  });

  it.each(["public", "owner"] as const)("renders aerial photos and videos on the %s tours tab", (view) => {
    const html = renderToString(
      <MemoryRouter>
        <ClientStudioView
          project={{
            view,
            images: [],
            videos: [],
            aerialPhotos: [{ url: "https://cdn.example/overhead.jpg", name: "Overhead", contentType: "image/jpeg" }],
            aerialVideos: [{ url: "https://cdn.example/orbit.mp4", name: "Orbit", contentType: "video/mp4" }],
          }}
          listingId="listing1234"
          signedIn={view === "owner"}
          initialTab="tours"
        />
      </MemoryRouter>,
    );
    expect(html).toContain('data-studio-kind="aerial-photo"');
    expect(html).toContain("https://cdn.example/overhead.jpg");
    expect(html).toContain("object-contain");
    const player = (html.match(/<video\b[^>]*>/i) || [""])[0];
    expect(player).toContain("https://cdn.example/orbit.mp4");
    expect(player.toLowerCase()).toContain("playsinline");
    expect(player).toContain("controls");
    if (view === "public") {
      expect(player.toLowerCase()).toContain('controlslist="nodownload"');
      expect(downloadAttributes(html)).toEqual([]);
      expect(mp4Anchors(html)).toEqual([]);
    } else {
      expect(player.toLowerCase()).not.toContain("controlslist");
    }
  });
});

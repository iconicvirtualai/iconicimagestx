/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ClientStudioView, blockPublicVideoMenu, studioVideoDownloadUrl, studioVideoPlaybackUrl } from "./ClientStudioView";
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

function page(
  view: "public" | "owner",
  tab: StudioGalleryTabId,
  selected: number | null = null,
  projectOverrides: Record<string, unknown> = {},
) {
  return renderToString(
    <MemoryRouter>
      <ClientStudioView
        project={{ ...media, view, clientName: "Private Client", clientEmail: "ada@example.com", ...projectOverrides }}
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
    expect(tours).toContain("View floor plan");
    expect(tours).toContain("https://cdn.example/level2.pdf");
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
  it("plays videos inline and shows downloads when the gallery is paid or released", () => {
    const videos = page("owner", "videos");
    const released = page("owner", "videos", null, { downloadsUnlocked: true, invoice: { status: "sent" } });
    const photos = page("owner", "photos", 0);
    const tours = page("owner", "tours");

    expect(videos).toContain('data-studio-view="owner"');
    expect(videos).not.toContain("Watch");
    const players = videoTags(videos);
    expect(players).toHaveLength(4);
    for (const player of players) {
      expect(player).toContain("controls");
      expect(player.toLowerCase()).toContain("playsinline");
      expect(player).toContain('preload="metadata"');
      expect(player.toLowerCase()).toMatch(/controlslist="nodownload"/);
      expect(player.toLowerCase()).not.toContain("noplaybackrate");
    }
    expect(players.some((player) => player.includes("https://cdn.example/branded.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/unbranded.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/snap-reel.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("drone-orbit.mp4"))).toBe(true);
    expect(videos).toContain(">Download</span>");
    expect(videos).toContain('href="https://cdn.example/branded.mp4"');
    expect(videos).toContain("delivery.zip");
    expect(videos).toContain("All files");
    expect(downloadAttributes(videos).length).toBeGreaterThan(0);
    expect(downloadAttributes(released).length).toBeGreaterThan(0);
    expect(released).toContain("delivery.zip");
    expect(videos).toContain("AI Tools");
    expect(videos).toContain("Listing file");

    expect(downloadAttributes(photos).length).toBeGreaterThan(0);
    expect(photos).toContain('download=""');
    expect(photos).toContain("Download All Photos");
    expect(photos).toContain("https://cdn.example/front-full.jpg");

    expect(videoTags(tours)).toEqual([]);
    expect(tours).toContain("View floor plan");
    expect(tours).toContain('href="https://cdn.example/level2.pdf"');
    expect(tours).toContain('href="https://cdn.example/walkthrough.mp4"');
  });

  it("keeps a locked owner on inline video with no raw file link or download", () => {
    const lockedVideos = [
      { url: "https://cdn.example/branded.mp4", downloadUrl: "https://cdn.example/branded-raw.mp4", name: "Branded video" },
      { url: "https://cdn.example/unbranded.mp4", name: "Unbranded video" },
      { streamUrl: "https://cdn.example/reel/stream.m3u8", url: "https://cdn.example/snap-reel.mp4", name: "Reel" },
      { previewUrl: "https://cdn.example/drone/preview.m3u8", name: "Aerial video" },
      { name: "Missing file" },
    ];
    const overrides = {
      downloadsUnlocked: false,
      invoice: { status: "paid" },
      videos: lockedVideos,
      files: [{ url: "https://cdn.example/delivery.zip", name: "All files" }],
    };
    const videos = page("owner", "videos", null, overrides);
    const photos = page("owner", "photos", 0, overrides);

    const players = videoTags(videos);
    expect(players).toHaveLength(4);
    for (const player of players) {
      expect(player).toContain("controls");
      expect(player.toLowerCase()).toContain("playsinline");
      expect(player).toContain('preload="metadata"');
      expect(player.toLowerCase()).toMatch(/controlslist="nodownload"/);
    }
    expect(players.some((player) => player.includes("https://cdn.example/branded.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/unbranded.mp4"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/reel/stream.m3u8"))).toBe(true);
    expect(players.some((player) => player.includes("https://cdn.example/drone/preview.m3u8"))).toBe(true);
    expect(videos).not.toContain("snap-reel.mp4");
    expect(videos).not.toContain("branded-raw.mp4");
    expect(videos).toContain("Video available after payment");
    expect(videos).not.toContain("Watch");
    expect(videos).not.toContain(">Download<");
    expect(videos).not.toContain("Download All Photos");
    expect(videos).not.toContain("delivery.zip");
    expect(videos).toContain("gallery-download-lock");
    expect(mp4Anchors(videos)).toEqual([]);
    expect(downloadAttributes(videos)).toEqual([]);
    expect(downloadAttributes(photos)).toEqual([]);
    expect(photos).not.toContain("Download All Photos");
    expect(photos).toContain("gallery-download-lock");
  });

  it("cancels the context menu on a locked owner video", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClientStudioView
            project={{
              ...media,
              view: "owner",
              downloadsUnlocked: false,
              invoice: { status: "sent" },
              clientName: "Private Client",
            }}
            listingId="listing1234"
            signedIn
            initialTab="videos"
          />
        </MemoryRouter>,
      );
    });
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    video?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("studio video url fields", () => {
  it("prefers a stream or preview and falls back to the file url", () => {
    expect(studioVideoPlaybackUrl({
      streamUrl: "https://cdn.example/play.m3u8",
      previewUrl: "https://cdn.example/preview.m3u8",
      playbackUrl: "https://cdn.example/playback.mp4",
      embedUrl: "https://cdn.example/embed.mp4",
      url: "https://cdn.example/raw.mp4",
    })).toBe("https://cdn.example/play.m3u8");
    expect(studioVideoPlaybackUrl({
      previewUrl: "https://cdn.example/preview.m3u8",
      url: "https://cdn.example/raw.mp4",
    })).toBe("https://cdn.example/preview.m3u8");
    expect(studioVideoPlaybackUrl({ playbackUrl: "https://cdn.example/playback.mp4" })).toBe("https://cdn.example/playback.mp4");
    expect(studioVideoPlaybackUrl({ embedUrl: "https://cdn.example/embed.mp4" })).toBe("https://cdn.example/embed.mp4");
    expect(studioVideoPlaybackUrl({ url: "https://cdn.example/raw.mp4" })).toBe("https://cdn.example/raw.mp4");
    expect(studioVideoPlaybackUrl({ name: "Reel" })).toBe("");
    expect(studioVideoPlaybackUrl({ url: "javascript:alert(1)" })).toBe("");
  });

  it("reads the raw file for a download and ignores a preview-only item", () => {
    expect(studioVideoDownloadUrl({
      downloadUrl: "https://cdn.example/full.mp4",
      rawUrl: "https://cdn.example/raw.mp4",
      url: "https://cdn.example/display.mp4",
    })).toBe("https://cdn.example/full.mp4");
    expect(studioVideoDownloadUrl({
      rawUrl: "https://cdn.example/raw.mp4",
      url: "https://cdn.example/display.mp4",
    })).toBe("https://cdn.example/raw.mp4");
    expect(studioVideoDownloadUrl({ url: "https://cdn.example/display.mp4" })).toBe("https://cdn.example/display.mp4");
    expect(studioVideoDownloadUrl({ previewUrl: "https://cdn.example/preview.m3u8" })).toBe("");
  });
});

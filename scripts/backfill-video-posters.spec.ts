import { describe, expect, it, vi } from "vitest";
import { buildDeliveryQaSeed, DELIVERY_QA_IDS } from "../shared/deliveryQaSeed.ts";
import { posterFrameSeconds } from "../shared/videoPoster.ts";
import {
  applyVideoPosterBackfill,
  formatVideoPosterDryRun,
  parseVideoPosterArgs,
  planVideoPosterBackfill,
  type VideoPosterPlanItem,
} from "../shared/videoPosterBackfill.ts";

function playtestDocs() {
  const plan = buildDeliveryQaSeed({ origin: "https://cdn.example" });
  const listing = plan.documents.find((item) => item.id === DELIVERY_QA_IDS.listing);
  const gallery = plan.documents.find((item) => item.id === DELIVERY_QA_IDS.gallery);
  if (!listing || !gallery) throw new Error("missing playtest docs");
  return {
    listings: [{ id: listing.id, data: listing.data }],
    galleries: [{ id: gallery.id, data: gallery.data }],
  };
}

describe("video poster backfill", () => {
  it("plans the playtest videos in dry-run and skips items that already have a poster", async () => {
    const docs = playtestDocs();
    const plan = planVideoPosterBackfill(docs);
    const names = plan.map((item) => `${item.collection}/${item.name}`);
    expect(names).toEqual([
      "listings/TEST-delivery-qa-branded.mp4",
      "listings/TEST-delivery-qa-unbranded.mp4",
      "listings/TEST-delivery-qa-snap-reel.mp4",
      "galleries/TEST-delivery-qa-branded.mp4",
      "galleries/TEST-delivery-qa-unbranded.mp4",
      "galleries/TEST-delivery-qa-snap-reel.mp4",
    ]);
    expect(plan.map((item) => item.repoPath)).toEqual([
      "public/media/blaze/01_BUILT_v2.mp4",
      "public/media/video/product-photography.mp4",
      "public/media/videos/snap-reels/snap-reel-01.mp4",
      "public/media/blaze/01_BUILT_v2.mp4",
      "public/media/video/product-photography.mp4",
      "public/media/videos/snap-reels/snap-reel-01.mp4",
    ]);
    expect(plan.every((item) => item.seekSeconds === 2 && item.sourceKind === "repo")).toBe(true);
    expect(plan[0]?.storagePath).toBe(
      "video-posters/listings/playtest-delivery-qa-listing/playtest-delivery-qa-branded-mp4.jpg",
    );
    expect(plan[3]?.storagePath).toBe(
      "video-posters/galleries/playtest-delivery-qa-gallery/playtest-delivery-qa-branded-mp4.jpg",
    );
    const printed = formatVideoPosterDryRun(plan);
    expect(printed).toContain("DRY RUN");
    expect(printed).not.toContain("WRITE MODE");
    expect(printed).toContain("public/media/blaze/01_BUILT_v2.mp4");
    expect(printed).toContain("seek: 2s");

    const extractFrame = vi.fn();
    const uploadJpeg = vi.fn();
    const savePoster = vi.fn();
    const dry = await applyVideoPosterBackfill(plan, {
      write: false,
      loadRow: async () => ({}),
      readRepo: async () => Buffer.from("video"),
      downloadStorage: async () => null,
      probeDuration: async () => 30,
      extractFrame,
      uploadJpeg,
      savePoster,
    });
    expect(dry).toMatchObject({ planned: 6, written: 0, skipped: 0 });
    expect(extractFrame).not.toHaveBeenCalled();
    expect(uploadJpeg).not.toHaveBeenCalled();
    expect(savePoster).not.toHaveBeenCalled();

    const withPosters = {
      listings: [{
        id: DELIVERY_QA_IDS.listing,
        data: {
          videos: (docs.listings[0].data.videos as Array<Record<string, unknown>>).map((item) => ({
            ...item,
            poster: "https://cdn.example/posters/frame.jpg",
            posterUrl: "https://cdn.example/posters/frame.jpg",
          })),
        },
      }],
      galleries: [{
        id: DELIVERY_QA_IDS.gallery,
        data: {
          mediaItems: (docs.galleries[0].data.mediaItems as Array<Record<string, unknown>>).map((item) => (
            item.type === "video" || item.type === "reel"
              ? { ...item, poster: "https://cdn.example/posters/frame.jpg" }
              : item
          )),
        },
      }],
    };
    expect(planVideoPosterBackfill(withPosters)).toEqual([]);

    const stale = plan.slice(0, 1);
    const skipped = await applyVideoPosterBackfill(stale, {
      write: true,
      loadRow: async () => ({ id: stale[0]?.itemId, poster: "https://cdn.example/posters/frame.jpg" }),
      readRepo: vi.fn(async () => Buffer.from("video")),
      downloadStorage: vi.fn(),
      probeDuration: vi.fn(),
      extractFrame,
      uploadJpeg,
      savePoster,
    });
    expect(skipped).toMatchObject({ planned: 1, written: 0, skipped: 1 });
    expect(extractFrame).not.toHaveBeenCalled();
    expect(uploadJpeg).not.toHaveBeenCalled();
  });

  it("filters with --listing and --limit and writes one frame through mocked ffmpeg and storage", async () => {
    expect(parseVideoPosterArgs([])).toEqual({ write: false, limit: null, listingId: null, unknown: [] });
    expect(parseVideoPosterArgs(["--listing", DELIVERY_QA_IDS.listing, "--limit", "1"]).listingId).toBe(DELIVERY_QA_IDS.listing);
    expect(posterFrameSeconds(null)).toBe(2);
    expect(posterFrameSeconds(30)).toBe(2);
    expect(posterFrameSeconds(1)).toBe(0.1);

    const docs = playtestDocs();
    const limited = planVideoPosterBackfill({ ...docs, listingId: DELIVERY_QA_IDS.listing, limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.collection).toBe("listings");
    expect(limited[0]?.name).toBe("TEST-delivery-qa-branded.mp4");

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const extractFrame = vi.fn(async (_bytes: Buffer, _name: string, seek: number) => {
      expect(seek).toBe(0.1);
      return jpeg;
    });
    const uploadJpeg = vi.fn(async (storagePath: string) => `https://firebasestorage.googleapis.com/poster/${storagePath}`);
    const savePoster = vi.fn(async (item: VideoPosterPlanItem, posterUrl: string) => {
      expect(item.itemId).toBe("playtest-delivery-qa-branded-mp4");
      expect(posterUrl).toContain(item.storagePath);
    });
    const written = await applyVideoPosterBackfill(limited, {
      write: true,
      loadRow: async () => ({ id: "playtest-delivery-qa-branded-mp4", poster: null }),
      readRepo: async () => Buffer.from("video-bytes"),
      downloadStorage: async () => null,
      probeDuration: async () => 1,
      extractFrame,
      uploadJpeg,
      savePoster,
    });
    expect(written).toMatchObject({ planned: 1, written: 1, skipped: 0, seeks: [0.1] });
    expect(extractFrame).toHaveBeenCalledTimes(1);
    expect(uploadJpeg).toHaveBeenCalledTimes(1);
    expect(savePoster).toHaveBeenCalledTimes(1);
  });
});

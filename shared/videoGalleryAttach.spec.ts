import { describe, expect, it } from "vitest";
import {
  buildGalleryVideoAttachment,
  GALLERY_ATTACH_NOTIFY,
  listingFileTabFromSearch,
  orderMatchesQuery,
  resolveGalleryTarget,
  searchGalleryOrders,
  studioGalleryTabFromSearch,
} from "./videoGalleryAttach";

const ORDERS = [
  {
    id: "order_oak",
    orderNumber: "#1042",
    address: "123 Oak Lane, Houston, TX",
    galleryId: "gal_oak",
    listingId: "list_oak",
  },
  {
    id: "order_pine",
    orderNumber: "ORD - L - 10001",
    propertyAddress: { formatted: "9 Pine Street, Katy, TX" },
    listingId: "list_pine",
  },
];

describe("gallery video attach", () => {
  it("finds an order by address or order number and points at the video section", () => {
    const byAddress = searchGalleryOrders(ORDERS, "oak lane");
    expect(byAddress).toHaveLength(1);
    expect(byAddress[0]).toMatchObject({
      orderId: "order_oak",
      orderNumber: "#1042",
      videoSectionUrl: "/admin/listing/list_oak?tab=video",
      studioVideoUrl: "/studio/list_oak?tab=videos",
      galleryUrl: "/gallery/gal_oak",
    });
    expect(searchGalleryOrders(ORDERS, "10001")[0].orderId).toBe("order_pine");
    expect(orderMatchesQuery(ORDERS[1], "ORD-L-10001")).toBe(true);
    expect(searchGalleryOrders(ORDERS, "a")).toEqual([]);
  });

  it("resolves the gallery from the order, then the listing, without inventing one", () => {
    const [pine] = searchGalleryOrders(ORDERS, "pine");
    const galleries = [{ id: "gal_pine", listingId: "list_pine", status: "editing" }];
    const resolved = resolveGalleryTarget(pine, galleries, [{ id: "list_pine", galleryId: "gal_pine" }]);
    expect(resolved.gallery?.id).toBe("gal_pine");
    expect(resolved.error).toBeUndefined();

    const missing = resolveGalleryTarget(
      { ...pine, galleryId: null, listingId: null },
      [],
      [],
    );
    expect(missing.error).toMatch(/no gallery yet/);
  });

  it("builds an unbranded MLS item and never flags a client notification", () => {
    expect(GALLERY_ATTACH_NOTIFY).toBe(false);
    const item = buildGalleryVideoAttachment({
      url: "https://cdn.example/oak.mp4",
      storagePath: "studio-video/list_oak/job.mp4",
      fileName: "123-oak-mls.mp4",
      presetId: "mls",
      jobId: "job_1",
      width: 1920,
      height: 1080,
      fps: 30,
    });
    expect(item.notifyClient).toBe(false);
    expect(item.category).toBe("unbranded");
    expect(item.type).toBe("video");
    expect(item.title).toBe("Unbranded MLS video");
    const reel = buildGalleryVideoAttachment({
      url: "https://cdn.example/reel.mp4",
      storagePath: "studio-video/list_oak/reel.mp4",
      fileName: "reel.mp4",
      presetId: "instagram_reel",
      jobId: "job_2",
      width: 1080,
      height: 1920,
      fps: 30,
    });
    expect(reel.category).toBe("reel");
  });

  it("opens the listing video tab and the studio videos tab from a link", () => {
    expect(listingFileTabFromSearch("?tab=video")).toBe(1);
    expect(listingFileTabFromSearch("")).toBeNull();
    expect(studioGalleryTabFromSearch("?tab=videos")).toBe("videos");
    expect(studioGalleryTabFromSearch("?tab=video")).toBe("videos");
    expect(studioGalleryTabFromSearch("")).toBe("photos");
  });
});

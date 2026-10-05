import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyMediaDeliveryMove,
  buildMediaDeliveryQueue,
  galleryStatusForDeliveryMove,
  mediaDeliveryFromGalleryStatus,
  sampleMediaDeliveryRows,
} from "./mediaDelivery";

describe("Iconic media delivery labels", () => {
  it("maps gallery status onto Pending, Undelivered, and Delivered", () => {
    expect(mediaDeliveryFromGalleryStatus("pending_upload")).toBe("pending");
    expect(mediaDeliveryFromGalleryStatus("raw_uploaded")).toBe("pending");
    expect(mediaDeliveryFromGalleryStatus("editing")).toBe("pending");
    expect(mediaDeliveryFromGalleryStatus("")).toBe("pending");
    expect(mediaDeliveryFromGalleryStatus("ready_for_review")).toBe("undelivered");
    expect(mediaDeliveryFromGalleryStatus("approved")).toBe("delivered");
    expect(mediaDeliveryFromGalleryStatus("delivered")).toBe("delivered");
  });

  it("does not treat a listing delivered flag as client delivery", () => {
    const rows = buildMediaDeliveryQueue({
      galleries: [],
      listings: [{ id: "listingDelivered", address: "1 Paid Lane", galleryId: "" }],
      jobs: [{ listingId: "listingDelivered", status: "approved" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Pending");
    expect(rows[0].galleryId).toBeNull();
    expect(rows[0].moves).toEqual([]);
  });

  it("keeps studio jobs on the gallery row and sorts Undelivered first", () => {
    const rows = sampleMediaDeliveryRows();
    expect(rows.map((row) => row.label)).toEqual(["Undelivered", "Pending", "Pending", "Delivered"]);
    const ready = rows.find((row) => row.id === "galleryUndeliver1");
    expect(ready?.studio).toEqual({ active: 0, review: 1, approved: 1, failed: 0 });
    expect(ready?.moves).toEqual(["pending", "delivered"]);
    const open = rows.find((row) => row.id === "listing:listingNoGallery");
    expect(open?.label).toBe("Pending");
    expect(open?.moves).toEqual([]);
  });

  it("moves Pending and Undelivered without writing a released gallery status", () => {
    expect(galleryStatusForDeliveryMove("undelivered", true)).toBe("ready_for_review");
    expect(galleryStatusForDeliveryMove("pending", true)).toBe("editing");
    expect(galleryStatusForDeliveryMove("pending", false)).toBe("pending_upload");
    const ready = sampleMediaDeliveryRows().find((row) => row.id === "galleryUndeliver1");
    if (!ready) throw new Error("missing sample row");
    const pending = applyMediaDeliveryMove(ready, "pending");
    expect(pending.galleryStatus).toBe("editing");
    expect(pending.label).toBe("Pending");
    const delivered = applyMediaDeliveryMove(ready, "delivered");
    expect(delivered.galleryStatus).toBe("delivered");
    expect(delivered.label).toBe("Delivered");
    expect(delivered.moves).not.toContain("delivered");
  });

  it("still offers Mark Delivered when the gallery is approved but the notice has not been sent", () => {
    const [row] = buildMediaDeliveryQueue({
      galleries: [{ id: "galleryApproved1", status: "approved", listingId: "listingApproved", mediaCount: 2, addressLabel: "9 Elm" }],
    });
    expect(row.label).toBe("Delivered");
    expect(row.moves).toContain("delivered");
  });

  it("stays on the Iconic wording", () => {
    const queue = readFileSync(new URL("../client/components/delivery/MediaDeliveryQueue.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/pages/AdminDeliveryQueue.tsx", import.meta.url), "utf8");
    for (const source of [queue, page]) {
      expect(source.toLowerCase()).not.toContain("autohdr");
      expect(source.toLowerCase()).not.toContain("aryeo");
      expect(source.toLowerCase()).not.toContain("autoenhance");
    }
    expect(queue).toContain("MEDIA_DELIVERY_LABELS");
    expect(readFileSync(new URL("./mediaDelivery.ts", import.meta.url), "utf8")).toContain('pending: "Pending"');
    expect(readFileSync(new URL("./mediaDelivery.ts", import.meta.url), "utf8")).toContain('undelivered: "Undelivered"');
    expect(readFileSync(new URL("./mediaDelivery.ts", import.meta.url), "utf8")).toContain('delivered: "Delivered"');
  });
});

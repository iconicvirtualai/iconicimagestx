import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  applyLinkedRecordPresence,
  applyMediaDeliveryMove,
  buildMediaDeliveryQueue,
  collectLinkedRecordPresence,
  galleryStatusForDeliveryMove,
  LINKED_RECORD_BATCH,
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

  it("flags a deleted listing or gallery and leaves live rows unchanged", async () => {
    const rows = buildMediaDeliveryQueue({
      galleries: [
        {
          id: "galleryDelivered1",
          status: "delivered",
          listingId: "zT9VnzBHtPjzEY3LFKGJ",
          addressLabel: "123 Iconic Test Lane",
          clientName: "Iconic Test",
          mediaCount: 3,
        },
        {
          id: "galleryLive00001",
          status: "delivered",
          listingId: "listingLive0001",
          addressLabel: "8 Cedar Lane, Austin, TX",
          clientName: "Sample Client",
          mediaCount: 30,
        },
      ],
      listings: [
        { id: "listingLive0001", address: "8 Cedar Lane, Austin, TX" },
        { id: "listingNoGallery", address: "4 Bare Studio, Austin, TX", galleryId: "galleryGone00001" },
      ],
      jobs: [{ listingId: "listingNoGallery", status: "processing" }],
    });
    const listingCalls: string[][] = [];
    const galleryCalls: string[][] = [];
    const missing = async (calls: string[][], part: string[]) => {
      calls.push(part);
      return part.map((id) => ({ id, exists: false }));
    };
    const [listings, galleries] = await Promise.all([
      collectLinkedRecordPresence(
        rows.map((row) => row.listingId),
        new Set(["listingLive0001", "listingNoGallery"]),
        (part) => missing(listingCalls, part),
      ),
      collectLinkedRecordPresence(
        ["galleryDelivered1", "galleryLive00001", "galleryGone00001"],
        new Set(["galleryDelivered1", "galleryLive00001"]),
        (part) => missing(galleryCalls, part),
      ),
    ]);
    expect(listingCalls).toEqual([["zT9VnzBHtPjzEY3LFKGJ"]]);
    expect(galleryCalls).toEqual([["galleryGone00001"]]);
    const flagged = applyLinkedRecordPresence(rows, { listings, galleries }, new Map([
      ["listingNoGallery", "galleryGone00001"],
    ]));
    const orphan = flagged.find((row) => row.address === "123 Iconic Test Lane");
    const live = flagged.find((row) => row.id === "galleryLive00001");
    const bare = flagged.find((row) => row.id === "listing:listingNoGallery");
    expect(orphan?.projectMissing).toBe(true);
    expect(orphan?.galleryMissing).toBe(false);
    expect(orphan?.label).toBe("Delivered");
    expect(orphan?.listingId).toBe("zT9VnzBHtPjzEY3LFKGJ");
    expect(live?.projectMissing).toBe(false);
    expect(live?.galleryMissing).toBe(false);
    expect(live?.moves).toEqual(["pending", "undelivered"]);
    expect(bare?.projectMissing).toBe(false);
    expect(bare?.galleryMissing).toBe(true);
    expect(bare?.label).toBe("Pending");
  });

  it("checks linked records in batches and does not treat a failed lookup as deleted", async () => {
    const ids = Array.from({ length: LINKED_RECORD_BATCH + 2 }, (_item, index) => `listingBatch${String(index).padStart(4, "0")}`);
    const calls: string[][] = [];
    const presence = await collectLinkedRecordPresence(ids, new Set([ids[0]]), async (part) => {
      calls.push(part);
      return part.map((id) => ({ id, exists: false }));
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(LINKED_RECORD_BATCH);
    expect(calls[1]).toHaveLength(1);
    expect(presence.existing.has(ids[0])).toBe(true);
    expect(presence.existing.has(ids[1])).toBe(false);
    expect(calls.flat()).not.toContain(ids[0]);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const failedCalls: string[][] = [];
      const failed = await collectLinkedRecordPresence(
        ["zT9VnzBHtPjzEY3LFKGJ", "bad id"],
        new Set(),
        async (part) => {
          failedCalls.push(part);
          throw new Error("firestore unavailable");
        },
      );
      expect(failedCalls).toEqual([["zT9VnzBHtPjzEY3LFKGJ"]]);
      expect(failed.unverified.has("zT9VnzBHtPjzEY3LFKGJ")).toBe(true);
      expect(failed.existing.size).toBe(0);
      const [row] = buildMediaDeliveryQueue({
        galleries: [{ id: "galleryDelivered1", status: "delivered", listingId: "zT9VnzBHtPjzEY3LFKGJ", addressLabel: "123 Iconic Test Lane" }],
      });
      const unverified = applyLinkedRecordPresence([row], {
        listings: failed,
        galleries: { existing: new Set(["galleryDelivered1"]), unverified: new Set() },
      });
      expect(unverified[0].projectMissing).toBe(false);
      const kept = applyMediaDeliveryMove({ ...unverified[0], projectMissing: true }, "pending");
      expect(kept.projectMissing).toBe(true);
      expect(kept.label).toBe("Pending");
    } finally {
      error.mockRestore();
    }
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

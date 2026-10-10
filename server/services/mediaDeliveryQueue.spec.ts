import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINKED_RECORD_BATCH } from "../../shared/mediaDelivery";

const { getAll, writes, docs, found } = vi.hoisted(() => ({
  getAll: vi.fn(),
  writes: vi.fn(),
  found: new Map<string, boolean>(),
  docs: {
    listings: [] as Array<{ id: string; data: Record<string, unknown> }>,
    galleries: [] as Array<{ id: string; data: Record<string, unknown> }>,
    editJobs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  },
}));

vi.mock("firebase-admin", () => {
  function snap(name: keyof typeof docs) {
    return {
      docs: docs[name].map((item) => ({
        id: item.id,
        data: () => item.data,
      })),
    };
  }
  function query(name: keyof typeof docs) {
    const api = {
      get: async () => snap(name),
      orderBy: () => api,
      limit: () => api,
      where: () => api,
    };
    return api;
  }
  const firestore = () => ({
    collection: (name: keyof typeof docs) => ({
      ...query(name),
      doc: (id: string) => ({
        id,
        path: `${name}/${id}`,
        get: async () => {
          throw new Error(`single read ${name}/${id}`);
        },
        update: () => writes("update"),
        set: () => writes("set"),
        delete: () => writes("delete"),
      }),
    }),
    getAll: (...refs: Array<{ id: string; path: string }>) => getAll(...refs),
  });
  return { default: { firestore }, firestore };
});

import { listMediaDeliveryQueue } from "./mediaDeliveryQueue";

beforeEach(() => {
  docs.listings = [];
  docs.galleries = [];
  docs.editJobs = [];
  found.clear();
  writes.mockClear();
  getAll.mockReset();
  getAll.mockImplementation(
    async (...refs: Array<{ id: string; path: string }>) =>
      refs.map((ref) => ({ id: ref.id, exists: found.get(ref.path) === true })),
  );
});

describe("delivery queue linked records", () => {
  it("flags a deleted project in one batch and leaves the live row unchanged", async () => {
    docs.listings = [
      { id: "listingLive0001", data: { address: "8 Cedar Lane, Austin, TX" } },
    ];
    docs.galleries = [
      {
        id: "galleryLive00001",
        data: {
          status: "delivered",
          listingId: "listingLive0001",
          addressLabel: "8 Cedar Lane, Austin, TX",
          clientName: "Live Client",
          mediaItems: [],
        },
      },
      {
        id: "galleryOrphan01",
        data: {
          status: "delivered",
          listingId: "zT9VnzBHtPjzEY3LFKGJ",
          addressLabel: "123 Iconic Test Lane",
          clientName: "Iconic Test",
          mediaItems: [{}, {}, {}],
        },
      },
    ];
    const rows = await listMediaDeliveryQueue({ uid: "staff", role: "admin" });
    const orphan = rows.find((row) => row.address === "123 Iconic Test Lane");
    const live = rows.find((row) => row.id === "galleryLive00001");
    expect(orphan?.projectMissing).toBe(true);
    expect(orphan?.galleryMissing).toBe(false);
    expect(orphan?.label).toBe("Delivered");
    expect(orphan?.mediaCount).toBe(3);
    expect(live?.projectMissing).toBe(false);
    expect(live?.galleryMissing).toBe(false);
    expect(live?.listingId).toBe("listingLive0001");
    expect(live?.moves).toEqual(["pending", "undelivered"]);
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(
      getAll.mock.calls[0].map((ref: { path: string }) => ref.path),
    ).toEqual(["listings/zT9VnzBHtPjzEY3LFKGJ"]);
    expect(writes).not.toHaveBeenCalled();
  });

  it("reads missing listings in batches instead of one lookup per row", async () => {
    const count = LINKED_RECORD_BATCH + 1;
    docs.galleries = Array.from({ length: count }, (_item, index) => ({
      id: `galleryBatch${String(index).padStart(4, "0")}`,
      data: {
        status: "editing",
        listingId: `listingBatch${String(index).padStart(4, "0")}`,
        addressLabel: `Batch ${String(index).padStart(4, "0")}`,
        mediaItems: [],
      },
    }));
    const rows = await listMediaDeliveryQueue({ uid: "staff", role: "admin" });
    expect(rows).toHaveLength(count);
    expect(rows.every((row) => row.projectMissing)).toBe(true);
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(getAll.mock.calls.map((call) => call.length)).toEqual([
      LINKED_RECORD_BATCH,
      1,
    ]);
    expect(writes).not.toHaveBeenCalled();
  });

  it("keeps the Studio link when the project exists outside the loaded listing page", async () => {
    docs.galleries = [
      {
        id: "galleryOutside01",
        data: {
          status: "delivered",
          listingId: "listingOutside01",
          addressLabel: "9 Outer Road",
          mediaItems: [],
        },
      },
    ];
    found.set("listings/listingOutside01", true);
    const [row] = await listMediaDeliveryQueue({ uid: "staff", role: "admin" });
    expect(row.projectMissing).toBe(false);
    expect(row.galleryMissing).toBe(false);
    expect(row.listingId).toBe("listingOutside01");
    expect(
      getAll.mock.calls[0].map((ref: { path: string }) => ref.path),
    ).toEqual(["listings/listingOutside01"]);
    expect(writes).not.toHaveBeenCalled();
  });

  it("flags a deleted gallery without writing and still returns the listing row", async () => {
    docs.listings = [
      {
        id: "listingBare0001",
        data: {
          address: "4 Bare Studio, Austin, TX",
          galleryId: "galleryGone00001",
        },
      },
    ];
    docs.editJobs = [
      {
        id: "jobBare000001",
        data: { listingId: "listingBare0001", status: "processing" },
      },
    ];
    const [row] = await listMediaDeliveryQueue({ uid: "staff", role: "admin" });
    expect(row.projectMissing).toBe(false);
    expect(row.galleryMissing).toBe(true);
    expect(row.listingId).toBe("listingBare0001");
    expect(row.galleryId).toBeNull();
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(
      getAll.mock.calls[0].map((ref: { path: string }) => ref.path),
    ).toEqual(["galleries/galleryGone00001"]);
    expect(writes).not.toHaveBeenCalled();
  });

  it("still returns the queue when the existence check fails", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    docs.galleries = [
      {
        id: "galleryOrphan01",
        data: {
          status: "delivered",
          listingId: "zT9VnzBHtPjzEY3LFKGJ",
          addressLabel: "123 Iconic Test Lane",
          mediaItems: [],
        },
      },
    ];
    getAll.mockRejectedValue(new Error("firestore unavailable"));
    try {
      const [row] = await listMediaDeliveryQueue({
        uid: "staff",
        role: "admin",
      });
      expect(row.address).toBe("123 Iconic Test Lane");
      expect(row.projectMissing).toBe(false);
      expect(row.label).toBe("Delivered");
      expect(writes).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

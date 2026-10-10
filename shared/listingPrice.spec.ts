import { describe, expect, it, vi } from "vitest";
import { packagePriceDisplay, resolvePackageSkin } from "./packageSkins.ts";
import {
  chunkIds,
  formatAdminMoney,
  listingPriceLabel,
  listingPriceLookupKey,
  loadListingPriceIndex,
  resolveListingPriceLabel,
  type ListingPriceDoc,
  type ListingPriceReader,
} from "./listingPrice.ts";

const customListing = {
  id: "14793",
  orderCode: "ORD-L-14793",
  projectType: "real_estate",
  services: ["Custom"],
};

function docs(records: ListingPriceDoc[]): Map<string, ListingPriceDoc> {
  return new Map(records.map((record) => [record.id, record]));
}

function memoryReader(store: {
  orders?: ListingPriceDoc[];
  orderRequests?: ListingPriceDoc[];
  invoices?: ListingPriceDoc[];
}) {
  const calls: string[] = [];
  const buckets = {
    orders: docs(store.orders || []),
    orderRequests: docs(store.orderRequests || []),
    invoices: docs(store.invoices || []),
  };
  const reader: ListingPriceReader = {
    async byIds(collectionName, ids) {
      calls.push(`ids:${collectionName}:${ids.join(",")}`);
      return ids.map((id) => buckets[collectionName].get(id)).filter((doc): doc is ListingPriceDoc => Boolean(doc));
    },
    async byField(collectionName, field, values) {
      calls.push(`field:${collectionName}:${field}:${values.join(",")}`);
      const wanted = new Set(values);
      return [...buckets[collectionName].values()].filter((doc) => wanted.has(String(doc[field] || "")));
    },
  };
  return { reader, calls };
}

describe("listing price fallback", () => {
  it("keeps the listing price shown today ahead of the order total and invoice", () => {
    const label = resolveListingPriceLabel({
      listing: { id: "show", serviceIds: ["listing-showcase"], total: 100 },
      order: { id: "ord", total: 400 },
      invoice: { id: "inv", status: "draft", total: 2250 },
    });
    expect(label).toBe(packagePriceDisplay(resolvePackageSkin("listing-showcase")!));
    expect(label).not.toBe(formatAdminMoney(2250));
  });

  it("keeps a stored listing total ahead of a draft invoice", () => {
    expect(resolveListingPriceLabel({
      listing: { id: "foundation", package: "The Foundation", total: 100, projectType: "business" },
      invoice: { status: "draft", total: 2250 },
    })).toBe("$100");
  });

  it("uses the linked order price before a draft invoice", () => {
    expect(resolveListingPriceLabel({
      listing: customListing,
      order: { id: "ord", package: "The Foundation", total: 400, projectType: "business" },
      invoice: { id: "inv", status: "draft", total: 2250 },
    })).toBe("$400");
  });

  it("uses the order total before a draft invoice when the tile has no price", () => {
    expect(resolveListingPriceLabel({
      listing: customListing,
      order: { id: "ord", amount: 400 },
      invoice: { id: "inv", status: "draft", total: 2250 },
    })).toBe("$400.00");
  });

  it("shows a custom order's draft invoice when no listing or order price exists", () => {
    expect(resolveListingPriceLabel({
      listing: customListing,
      invoice: { id: "inv-draft", status: "draft", total: 2250 },
    })).toBe("$2,250.00");
  });

  it("uses a sent invoice total the same way", () => {
    expect(resolveListingPriceLabel({
      listing: customListing,
      invoice: { id: "inv-sent", status: "Sent", total: "2250" },
    })).toBe("$2,250.00");
  });

  it("reads a draft invoice already stored on the listing", () => {
    expect(resolveListingPriceLabel({
      listing: {
        ...customListing,
        invoice: { status: "draft", total: 2250 },
      },
    })).toBe("$2,250.00");
  });

  it("shows a dash when the only invoice is void or nothing is priced", () => {
    expect(resolveListingPriceLabel({
      listing: customListing,
      invoice: { id: "inv-void", status: "void", total: 2250 },
    })).toBe("—");
    expect(resolveListingPriceLabel({ listing: customListing })).toBe("—");
  });

  it("does not let a zero order total hide the draft invoice", () => {
    expect(resolveListingPriceLabel({
      listing: { ...customListing, total: 0 },
      order: { id: "ord", total: 0 },
      invoice: { status: "draft", total: 2250.5 },
    })).toBe("$2,250.50");
  });
});

describe("listing price lookup", () => {
  it("batches invoice reads by listing id instead of one query per row", async () => {
    const { reader, calls } = memoryReader({
      invoices: [
        { id: "inv-a", listingId: "a", status: "draft", total: 2250 },
        { id: "inv-b", listingId: "b", status: "draft", total: 800 },
        { id: "inv-c", listingId: "c", status: "sent", total: 150 },
      ],
    });
    const listings = ["a", "b", "c"].map((id) => ({ ...customListing, id, orderCode: `ORD-L-${id}` }));
    const index = await loadListingPriceIndex(listings, reader);

    expect(calls.filter((call) => call.startsWith("field:invoices:listingId:"))).toEqual([
      "field:invoices:listingId:a,b,c",
    ]);
    expect(calls.some((call) => call.split(",").length > 3 && call.startsWith("ids:"))).toBe(false);
    expect(listingPriceLabel(listings[0], index)).toBe("$2,250.00");
    expect(listingPriceLabel(listings[1], index)).toBe("$800.00");
    expect(listingPriceLabel(listings[2], index)).toBe("$150.00");
  });

  it("loads the order, then its draft invoice, in batched id reads", async () => {
    const { reader, calls } = memoryReader({
      orders: [{ id: "order-9", invoiceId: "inv-draft" }],
      invoices: [{ id: "inv-draft", orderId: "order-9", status: "draft", total: 2250 }],
    });
    const listing = { ...customListing, orderId: "order-9" };
    const index = await loadListingPriceIndex([listing, { id: "priced", serviceIds: ["listing-showcase"] }], reader);

    expect(calls).toContain("ids:orders:order-9");
    expect(calls).toContain("ids:invoices:inv-draft");
    expect(calls.filter((call) => call.startsWith("ids:orders:"))).toHaveLength(1);
    expect(listingPriceLabel(listing, index)).toBe("$2,250.00");
    expect(listingPriceLookupKey([{ id: "priced", serviceIds: ["listing-showcase"] }])).toBe("");
  });

  it("chunks Firestore in-queries past the 30 id limit", () => {
    const ids = Array.from({ length: 31 }, (_, index) => `id-${index}`);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(30);
    expect(chunks[1]).toEqual(["id-30"]);
  });

  it("does not call the reader when every row already has a price", async () => {
    const byIds = vi.fn(async () => []);
    const byField = vi.fn(async () => []);
    const index = await loadListingPriceIndex(
      [{ id: "priced", serviceIds: ["listing-showcase"], total: 549 }],
      { byIds, byField },
    );
    expect(byIds).not.toHaveBeenCalled();
    expect(byField).not.toHaveBeenCalled();
    expect(listingPriceLabel({ id: "priced", serviceIds: ["listing-showcase"], total: 549 }, index))
      .toBe(packagePriceDisplay(resolvePackageSkin("listing-showcase")!));
  });
});

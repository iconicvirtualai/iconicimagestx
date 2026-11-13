import { describe, expect, it } from "vitest";
import { orderServiceInvoicePatch } from "./staffInvoice.ts";
import {
  EXTRA_PHOTO_LINE_ID,
  archiveUnselectedMedia,
  filterBySelection,
  normalizePickIds,
  overAllowanceCopy,
  parseAllowance,
  parseExtraPhotoPrice,
  selectionBillingPatches,
  selectionCsv,
  selectionFileList,
  selectionPhotos,
  selectionQuote,
  settingsFromGallery,
  withExtraPhotoLine,
} from "./gallerySelections.ts";

const photos = [
  { id: "a", fileName: "001_front.jpg", type: "photo" },
  { id: "b", fileName: "002_kitchen.jpg", type: "photo" },
  { id: "c", fileName: "tour.mp4", type: "video" },
  { id: "d", fileName: "003_yard.jpg", type: "photo", archived: true },
];

describe("gallery selection settings", () => {
  it("leaves a blank extra price unset and keeps a typed zero", () => {
    expect(parseExtraPhotoPrice("")).toBeNull();
    expect(parseExtraPhotoPrice(null)).toBeNull();
    expect(parseExtraPhotoPrice("  ")).toBeNull();
    expect(parseExtraPhotoPrice(0)).toBe(0);
    expect(parseExtraPhotoPrice("25.5")).toBe(25.5);
    expect(parseExtraPhotoPrice(-1)).toBeNull();
  });

  it("does not invent an allowance", () => {
    expect(parseAllowance("")).toBeNull();
    expect(settingsFromGallery({}).allowance).toBeNull();
    expect(settingsFromGallery({}).extraPhotoPrice).toBeNull();
    expect(parseAllowance(18)).toBe(18);
    expect(parseAllowance(18.5)).toBeNull();
  });
});

describe("gallery selection quotes", () => {
  const open = { open: true, mode: "listing" as const, allowance: 18, extraPhotoPrice: null as number | null };

  it("lets a client submit inside the included count", () => {
    const quote = selectionQuote(18, open);
    expect(quote).toMatchObject({ extraCount: 0, extraTotal: 0, canSubmit: true, overAllowance: false });
  });

  it("blocks extras when staff has not set a price", () => {
    const quote = selectionQuote(20, open);
    expect(quote.canSubmit).toBe(false);
    expect(quote.extraCount).toBe(2);
    expect(quote.extraTotal).toBe(0);
    expect(quote.blockReason).toMatch(/not offered/);
    expect(overAllowanceCopy(open, quote)).toMatch(/Remove 2/);
  });

  it("prices extras only from the amount staff saved", () => {
    const settings = { ...open, extraPhotoPrice: 25 };
    const quote = selectionQuote(20, settings);
    expect(quote).toMatchObject({ canSubmit: true, extraCount: 2, extraTotal: 50, extrasAllowed: true });
    expect(overAllowanceCopy(settings, quote)).toBe("$25.00 per extra photo. 2 extra photos add $50.00.");
  });

  it("uses the same count for headshot finals", () => {
    const settings = { open: true, mode: "headshots" as const, allowance: 2, extraPhotoPrice: 40 };
    const quote = selectionQuote(3, settings);
    expect(overAllowanceCopy(settings, quote)).toBe("$40.00 per extra final. 1 extra final adds $40.00.");
  });

  it("refuses to submit before an allowance is saved", () => {
    const quote = selectionQuote(4, { open: true, mode: "listing", allowance: null, extraPhotoPrice: 10 });
    expect(quote.canSubmit).toBe(false);
    expect(quote.blockReason).toMatch(/has not set/);
  });
});

describe("gallery selection files", () => {
  it("keeps photos and drops video, culled frames, and archived frames from new picks", () => {
    expect(selectionPhotos(photos).map((photo) => photo.id)).toEqual(["a", "b", "d"]);
    expect(normalizePickIds(["b", "c", "d", "b", "missing"], selectionPhotos(photos))).toEqual(["b"]);
  });

  it("builds a file-name list and a csv", () => {
    const rows = selectionPhotos(photos);
    expect(selectionFileList(rows, ["b", "a"])).toEqual(["002_kitchen.jpg", "001_front.jpg"]);
    expect(selectionCsv(["001_front.jpg", 'kitchen, "2".jpg'])).toBe(
      'fileName\n001_front.jpg\n"kitchen, ""2"".jpg"\n',
    );
  });

  it("filters selected and unselected without dropping the source list", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterBySelection(items, ["b"], "selected").map((item) => item.id)).toEqual(["b"]);
    expect(filterBySelection(items, ["b"], "unselected").map((item) => item.id)).toEqual(["a", "c"]);
  });
});

describe("extra photo charges", () => {
  const order = {
    lineItems: [{ id: "pkg", name: "18 Photo Listing", qty: 1, unitPrice: 249, price: 249 }],
    processing: 6.97,
    tax: 0,
    clientName: "Ada Client",
  };
  const invoice = { amountPaid: 40, tax: 0, processing: 6.97 };

  it("adds one extra-photo line and recomputes with the order invoice patch", () => {
    const quote = selectionQuote(20, { open: true, mode: "listing", allowance: 18, extraPhotoPrice: 25 });
    const patches = selectionBillingPatches(order, invoice, "listing", quote);
    const lines = patches.invoice?.lineItems as Array<{ id?: string; price: number }>;
    expect(lines.find((line) => line.id === EXTRA_PHOTO_LINE_ID)).toMatchObject({ qty: 2, price: 50 });
    expect(patches.invoice).toMatchObject({ subtotal: 299, total: 305.97, amountDue: 265.97 });
    expect(patches.order).toMatchObject({ subtotal: 299, total: 305.97, selectionExtraTotal: 50 });
    expect(patches.recorded).toBe(true);
    expect(patches.invoice?.amountPaid).toBeUndefined();
  });

  it("does not zero an invoice that has no line items yet", () => {
    const quote = selectionQuote(20, { open: true, mode: "listing", allowance: 18, extraPhotoPrice: 25 });
    const patches = selectionBillingPatches({ total: 249 }, { total: 249, amountPaid: 10 }, "listing", quote);
    expect(patches.recorded).toBe(false);
    expect(patches.invoice).toBeNull();
    expect(patches.order).toEqual({ selectionExtraCount: 2, selectionExtraTotal: 50 });
  });

  it("removes the extra line when the new submit is inside the allowance", () => {
    const withExtra = withExtraPhotoLine(order.lineItems, "listing", selectionQuote(20, {
      open: true,
      mode: "listing",
      allowance: 18,
      extraPhotoPrice: 25,
    }));
    const quote = selectionQuote(18, { open: true, mode: "listing", allowance: 18, extraPhotoPrice: 25 });
    const patches = selectionBillingPatches({ ...order, lineItems: withExtra }, invoice, "listing", quote);
    const lines = patches.invoice?.lineItems as Array<{ id?: string }>;
    expect(lines.some((line) => line.id === EXTRA_PHOTO_LINE_ID)).toBe(false);
    expect(patches.invoice?.subtotal).toBe(249);
  });

  it("matches orderServiceInvoicePatch on the merged lines", () => {
    const quote = selectionQuote(1, { open: true, mode: "headshots", allowance: 1, extraPhotoPrice: 15 });
    const direct = orderServiceInvoicePatch({
      lineItems: withExtraPhotoLine([], "headshots", quote),
    }, { amountPaid: 0 });
    expect(direct.total).toBe(0);
  });
});

describe("archive unselected photos", () => {
  it("marks the photos the client did not pick and leaves the picked file in place", () => {
    const result = archiveUnselectedMedia(photos, ["a"], "2026-11-13T00:00:00.000Z");
    expect(result.archivedCount).toBe(1);
    expect(result.items).toHaveLength(photos.length);
    const kitchen = result.items[1] as { archived?: boolean; id: string };
    expect(kitchen.id).toBe("b");
    expect(kitchen.archived).toBe(true);
    expect(result.items[0]).toEqual(photos[0]);
    expect(result.items[2]).toEqual(photos[2]);
  });
});

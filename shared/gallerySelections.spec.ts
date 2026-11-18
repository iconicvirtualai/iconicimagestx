import { describe, expect, it } from "vitest";
import { catalogPackageSaveData, packagesForStaffEditor } from "./bookingCatalog.ts";
import { orderServiceInvoicePatch } from "./staffInvoice.ts";
import {
  EXTRA_PHOTO_LINE_ID,
  archiveUnselectedMedia,
  catalogExtraPriceFor,
  filterBySelection,
  normalizePickIds,
  overAllowanceCopy,
  parseAllowance,
  parseExtraPhotoPrice,
  resolvedExtraPrice,
  selectionBillingPatches,
  selectionCountLabel,
  selectionCsv,
  selectionFileList,
  selectionPhotos,
  selectionQuote,
  settingsFromGallery,
  withExtraPhotoLine,
  type SelectionSettings,
} from "./gallerySelections.ts";

function charge(partial: Partial<SelectionSettings> = {}): SelectionSettings {
  return {
    open: true,
    mode: "listing",
    billing: "charge",
    allowance: 18,
    extraPriceOverride: null,
    catalogExtraPrice: null,
    catalogPackageId: null,
    catalogPackageName: null,
    extraPhotoPrice: null,
    ...partial,
  };
}

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
  it("stays off until the gallery toggle is on", () => {
    expect(settingsFromGallery({}).open).toBe(false);
    expect(selectionCountLabel(3, 18)).toBe("3 selected of 18 included");
    expect(selectionCountLabel(3, null)).toBe("3 selected");
  });

  it("lets a client submit inside the included count", () => {
    const quote = selectionQuote(18, charge());
    expect(quote).toMatchObject({ extraCount: 0, extraTotal: 0, canSubmit: true, overAllowance: false });
  });

  it("lets a no-charge gallery submit past the allowance without a price", () => {
    const settings = charge({ billing: "selections", extraPhotoPrice: 25 });
    const quote = selectionQuote(20, settings);
    expect(quote).toMatchObject({ canSubmit: true, extraCount: 2, extraTotal: 0, extrasAllowed: false });
    expect(overAllowanceCopy(settings, quote)).toBeNull();
  });

  it("blocks a charge past the allowance when no price is saved", () => {
    const settings = charge();
    const quote = selectionQuote(20, settings);
    expect(quote.canSubmit).toBe(false);
    expect(quote.extraTotal).toBe(0);
    expect(quote.blockReason).toMatch(/not on the price list/);
    expect(overAllowanceCopy(settings, quote)).toBeNull();
  });

  it("prices extras from the list or the gallery override", () => {
    expect(resolvedExtraPrice(null, 25)).toBe(25);
    expect(resolvedExtraPrice(40, 25)).toBe(40);
    expect(resolvedExtraPrice(null, null)).toBeNull();
    const settings = charge({ extraPhotoPrice: 25, catalogExtraPrice: 25 });
    const quote = selectionQuote(20, settings);
    expect(quote).toMatchObject({ canSubmit: true, extraCount: 2, extraTotal: 50, extrasAllowed: true });
    expect(overAllowanceCopy(settings, quote)).toBe("$25.00 per extra photo. 2 extra photos add $50.00.");
    const listed = catalogExtraPriceFor(
      [{ id: "pkg", name: "18 Photo Listing", extraPhotoPrice: 25 }],
      ["pkg"],
    );
    expect(listed).toMatchObject({ price: 25, packageName: "18 Photo Listing" });
    expect(catalogExtraPriceFor([{ id: "pkg", name: "18 Photo Listing" }], ["pkg"]).price).toBeNull();
  });

  it("uses the same count for headshot finals", () => {
    const settings = charge({ mode: "headshots", allowance: 2, extraPhotoPrice: 40 });
    const quote = selectionQuote(3, settings);
    expect(overAllowanceCopy(settings, quote)).toBe("$40.00 per extra final. 1 extra final adds $40.00.");
  });

  it("leaves every package extra price blank until it is saved", () => {
    const catalog = packagesForStaffEditor([]);
    expect(catalog.some((item) => item.extraPhotoPrice != null)).toBe(false);
    const sample = catalog[0];
    const saved = catalogPackageSaveData(sample, {
      name: sample.name,
      price: sample.price,
      description: sample.description,
      isActive: true,
      sortOrder: sample.sortOrder,
      extraPhotoPrice: 25,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.extraPhotoPrice).toBe(25);
    const again = packagesForStaffEditor([{ id: sample.id, ...saved.data }]);
    expect(again.find((item) => item.id === sample.id)?.extraPhotoPrice).toBe(25);
    const cleared = catalogPackageSaveData(sample, {
      name: sample.name,
      price: sample.price,
      description: sample.description,
      isActive: true,
      sortOrder: sample.sortOrder,
      extraPhotoPrice: null,
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.data.extraPhotoPrice).toBeNull();
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
    const quote = selectionQuote(20, charge({ extraPhotoPrice: 25 }));
    const patches = selectionBillingPatches(order, invoice, "listing", quote);
    const lines = patches.invoice?.lineItems as Array<{ id?: string; price: number }>;
    expect(lines.find((line) => line.id === EXTRA_PHOTO_LINE_ID)).toMatchObject({ qty: 2, price: 50 });
    expect(patches.invoice).toMatchObject({ subtotal: 299, total: 305.97, amountDue: 265.97 });
    expect(patches.order).toMatchObject({ subtotal: 299, total: 305.97, selectionExtraTotal: 50 });
    expect(patches.recorded).toBe(true);
    expect(patches.invoice?.amountPaid).toBeUndefined();
  });

  it("does not zero an invoice that has no line items yet", () => {
    const quote = selectionQuote(20, charge({ extraPhotoPrice: 25 }));
    const patches = selectionBillingPatches({ total: 249 }, { total: 249, amountPaid: 10 }, "listing", quote);
    expect(patches.recorded).toBe(false);
    expect(patches.invoice).toBeNull();
    expect(patches.order).toEqual({ selectionExtraCount: 2, selectionExtraTotal: 50 });
  });

  it("removes the extra line when the new submit is inside the allowance", () => {
    const withExtra = withExtraPhotoLine(order.lineItems, "listing", selectionQuote(20, charge({ extraPhotoPrice: 25 })));
    const quote = selectionQuote(18, charge({ extraPhotoPrice: 25 }));
    const patches = selectionBillingPatches({ ...order, lineItems: withExtra }, invoice, "listing", quote);
    const lines = patches.invoice?.lineItems as Array<{ id?: string }>;
    expect(lines.some((line) => line.id === EXTRA_PHOTO_LINE_ID)).toBe(false);
    expect(patches.invoice?.subtotal).toBe(249);
  });

  it("matches orderServiceInvoicePatch on the merged lines", () => {
    const quote = selectionQuote(1, charge({ mode: "headshots", allowance: 1, extraPhotoPrice: 15 }));
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

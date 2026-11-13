import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTRA_PHOTO_LINE_ID } from "../../shared/gallerySelections.ts";
import {
  createGallerySelectionService,
  type GallerySelectionStore,
} from "./gallerySelections.ts";

function memoryStore(seed?: {
  gallery?: Record<string, unknown>;
  order?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
}): GallerySelectionStore & { bumps: number; gallery: Record<string, unknown>; picks: Record<string, unknown> | null; order: Record<string, unknown> | null; invoice: Record<string, unknown> | null } {
  const state = {
    bumps: 0,
    gallery: seed?.gallery || {},
    picks: null as Record<string, unknown> | null,
    order: seed?.order || null,
    invoice: seed?.invoice || null,
  };
  const store: GallerySelectionStore = {
    async getGallery() { return { ...state.gallery }; },
    async updateGallery(_id, patch) { state.gallery = { ...state.gallery, ...patch }; },
    async getPicks() { return state.picks ? { ...state.picks } : null; },
    async setPicks(_id, data) { state.picks = { ...(state.picks || {}), ...data }; },
    async getOrder() { return state.order ? { ...state.order } : null; },
    async updateOrder(_id, patch) { state.order = { ...(state.order || {}), ...patch }; },
    async getListing() { return null; },
    async getInvoice() { return state.invoice ? { id: "inv-1", data: { ...state.invoice } } : null; },
    async updateInvoice(_id, patch) { state.invoice = { ...(state.invoice || {}), ...patch }; },
    async findInvoiceByOrder() { return state.invoice ? { id: "inv-1", data: { ...state.invoice } } : null; },
    async bumpStaffOrders() { state.bumps += 1; },
  };
  return Object.defineProperties(store, {
    bumps: { get: () => state.bumps },
    gallery: { get: () => state.gallery },
    picks: {
      get: () => state.picks,
      set: (value: Record<string, unknown> | null) => { state.picks = value; },
    },
    order: { get: () => state.order },
    invoice: { get: () => state.invoice },
  }) as GallerySelectionStore & {
    bumps: number;
    gallery: Record<string, unknown>;
    picks: Record<string, unknown> | null;
    order: Record<string, unknown> | null;
    invoice: Record<string, unknown> | null;
  };
}

const media = [
  { id: "p1", fileName: "001_front.jpg", type: "photo" },
  { id: "p2", fileName: "002_kitchen.jpg", type: "photo" },
  { id: "p3", fileName: "003_yard.jpg", type: "photo" },
];

function openGallery(extra?: Record<string, unknown>) {
  return {
    clientId: "client-1",
    orderId: "order-1",
    invoiceId: "inv-1",
    selectionOpen: true,
    selectionMode: "listing",
    selectionAllowance: 2,
    selectionStatus: "open",
    mediaItems: media,
    ...extra,
  };
}

describe("gallery selection service", () => {
  it("saves picks, notifies staff once, and does not notify again on the next heart", async () => {
    const store = memoryStore({ gallery: openGallery() });
    const service = createGallerySelectionService(store);
    const first = await service.savePicks("gal-1", ["p1"]);
    expect(first.selectedIds).toEqual(["p1"]);
    expect(store.bumps).toBe(1);
    expect(store.picks?.clientId).toBe("client-1");
    await service.savePicks("gal-1", ["p1", "p2"]);
    expect(store.bumps).toBe(1);
    expect(store.picks?.mediaIds).toEqual(["p1", "p2"]);
  });

  it("blocks a submit past the allowance when the extra price is blank", async () => {
    const store = memoryStore({ gallery: openGallery({ selectionExtraPrice: null }) });
    const service = createGallerySelectionService(store);
    await expect(service.submit("gal-1", ["p1", "p2", "p3"])).rejects.toMatchObject({ status: 400 });
    expect(store.gallery.selectionStatus).toBe("open");
    expect(store.bumps).toBe(0);
  });

  it("records the extra-photo line on the order and invoice without a payment", async () => {
    const store = memoryStore({
      gallery: openGallery({ selectionExtraPrice: 25, selectionAllowance: 1 }),
      order: {
        lineItems: [{ id: "pkg", name: "Listing", qty: 1, unitPrice: 100, price: 100 }],
        processing: 0,
        clientName: "Ada Client",
        history: [],
      },
      invoice: { amountPaid: 0, tax: 0, processing: 0, clientName: "Ada Client" },
    });
    const service = createGallerySelectionService(store);
    const result = await service.submit("gal-1", ["p1", "p2"]);
    expect(result.submitted).toBe(true);
    expect(result.quote.extraTotal).toBe(25);
    const lines = store.invoice?.lineItems as Array<{ id?: string; price: number }>;
    expect(lines.find((line) => line.id === EXTRA_PHOTO_LINE_ID)).toMatchObject({ price: 25, qty: 1 });
    expect(store.invoice?.total).toBe(125);
    expect(store.invoice?.amountPaid).toBe(0);
    expect(store.order?.history).toEqual([
      expect.objectContaining({ action: "Client submitted selections", details: expect.stringMatching(/Not charged/) }),
    ]);
    expect(store.gallery.selectionReviewPending).toBe(true);
    expect(store.bumps).toBe(1);
    expect(JSON.stringify({ invoice: store.invoice, order: store.order })).not.toMatch(/squarePayment|paymentIntent/);
  });

  it("archives unselected photos and keeps every file on the gallery", async () => {
    const store = memoryStore({
      gallery: openGallery({ selectionStatus: "submitted", selectionOpen: false, selectionAllowance: 1 }),
    });
    store.picks = { mediaIds: ["p1"], status: "submitted" };
    const service = createGallerySelectionService(store);
    const staff = await service.archiveRest("gal-1");
    expect(staff.archivedCount).toBe(2);
    const items = store.gallery.mediaItems as Array<{ id: string; archived?: boolean }>;
    expect(items).toHaveLength(3);
    expect(items.find((item) => item.id === "p1")?.archived).toBeUndefined();
    expect(items.filter((item) => item.archived).map((item) => item.id)).toEqual(["p2", "p3"]);
    expect(staff.fileNames).toEqual(["001_front.jpg"]);
    expect(staff.csv).toContain("001_front.jpg");
  });

  it("does not import client mail or the live notify flags", () => {
    const source = readFileSync(new URL("./gallerySelections.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../routes/galleries.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/sendEmail|sendSMS|nodemailer|twilio|CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE|CLIENT_PORTAL_ENABLED/);
    expect(source).toContain('bumpAdminUnreadChannel("orders")');
    expect(route).toContain('"/public/:id/selections"');
    expect(route).not.toMatch(/sendEmail|sendSMS|CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE|CLIENT_PORTAL_ENABLED/);
  });
});

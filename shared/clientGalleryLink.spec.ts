import { describe, expect, it } from "vitest";
import { decideClientGalleryLink, ownerStudioProject, type GalleryLinkDoc } from "./clientGalleryLink";

function stringValues(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringValues(item, found));
  else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => stringValues(item, found));
  }
  return found;
}

const LISTING_ID = "V92oe4gWihszc95tEcVQ";

function listing(overrides: Record<string, unknown> = {}): GalleryLinkDoc {
  return {
    id: LISTING_ID,
    studioEnabled: true,
    address: "100 Main St, Austin, TX",
    agentName: "Ada Agent",
    clientName: "Private Client",
    clientEmail: "ada@example.com",
    clientPhone: "512-555-0100",
    notes: "lockbox 1234",
    studioToken: "secret-token",
    invoiceId: "inv_private_1",
    orderId: "order_private_1",
    zipUrl: "https://cdn.example/delivery.zip",
    mlsUrl: "https://cdn.example/mls-full.jpg",
    images: [
      {
        url: "https://cdn.example/final.jpg",
        name: "front.jpg",
        path: `listings/${LISTING_ID}/finals/1_front.jpg`,
        downloadUrl: "https://cdn.example/front-full.jpg",
      },
      { url: "https://cdn.example/raw.dng", name: "front.dng", path: `listings/${LISTING_ID}/raw/1_front.dng`, contentType: "image/x-adobe-dng" },
      { url: "https://cdn.example/mls.jpg", name: "mls.jpg", path: `listings/${LISTING_ID}/mls/mls.jpg` },
      { url: "javascript:alert(1)", name: "bad.jpg", path: `listings/${LISTING_ID}/photos/bad.jpg` },
    ],
    videos: [
      { url: "javascript:alert(1)", name: "bad" },
      { url: "https://cdn.example/walkthrough.mp4", name: "Walkthrough" },
    ],
    floorplans: [
      { url: "https://cdn.example/level1.jpg", name: "Level 1.jpg" },
      { url: "https://cdn.example/plans.zip", name: "plans.zip" },
    ],
    tourUrl: "javascript:alert(1)",
    matterportUrl: "https://my.matterport.com/show/?m=abc",
    revisions: [{ id: "rev-1", type: "single", photoIndex: 0, description: "Warm the kitchen", status: "pending", createdAt: "2026-04-01" }],
    paymentNote: "private-balance-8841",
    ...overrides,
  };
}

const empty = {
  gallery: null,
  listing: null,
  relatedGalleries: [],
  order: null,
  orderRequest: null,
  pointedGallery: null,
  pointedListing: null,
  galleriesByOrderId: [],
};

describe("decideClientGalleryLink", () => {
  it("opens a listing when /studio uses a project id and no gallery doc exists", () => {
    const result = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: listing() });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected the listing studio");
    expect(result.openGalleryId).toBeNull();
    expect(result.project.id).toBe(LISTING_ID);
    expect(result.project.images).toEqual([{ url: "https://cdn.example/final.jpg", name: "front.jpg" }]);
    expect(result.project.videos).toEqual([]);
    expect(result.project.tourUrl).toBe("https://my.matterport.com/show/?m=abc");
    expect(result.project.floorPlans).toEqual([{ url: "https://cdn.example/level1.jpg", name: "Level 1.jpg" }]);
    expect(result.project.view).toBe("public");
    expect(result.project.agentName).toBe("Ada Agent");
    expect(result.project).not.toHaveProperty("clientName");
    expect(result.project).not.toHaveProperty("downloadsUnlocked");
    expect(result.project).not.toHaveProperty("invoice");
    expect(result.project).not.toHaveProperty("revisions");
    expect(result.project).not.toHaveProperty("files");
    const body = JSON.stringify(result.project);
    expect(body).not.toContain("ada@example.com");
    expect(body).not.toContain("Private Client");
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("512-555-0100");
    expect(body).not.toContain("lockbox");
    expect(body).not.toContain("secret-token");
    expect(body).not.toContain("/raw/");
    expect(body).not.toContain("front-full.jpg");
    expect(body).not.toContain("delivery.zip");
    expect(body).not.toContain("mls-full.jpg");
    expect(body).not.toContain("plans.zip");
    expect(body).not.toContain("Warm the kitchen");
    expect(body).not.toContain("inv_private_1");
    expect(body).not.toContain("order_private_1");
    expect(body).not.toContain("private-balance-8841");
    expect(body).not.toContain("walkthrough.mp4");
  });

  it("keeps a display image and a stream on the public share and leaves the original file off", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({
        invoiceStatus: "paid",
        downloadsReleased: true,
        images: [
          {
            url: "https://cdn.example/luxury-exterior-full.jpg",
            name: "exterior-full.jpg",
            category: "full-res",
            downloadable: true,
            webUrl: "https://cdn.example/exterior-display.jpg",
          },
          {
            url: "https://cdn.example/only-original.jpg",
            name: "only-original.jpg",
            category: "mls",
            downloadable: true,
          },
        ],
        videos: [
          {
            url: "https://cdn.example/walkthrough-raw.mp4",
            name: "Walkthrough",
            streamUrl: "https://cdn.example/walkthrough/stream.m3u8",
            poster: "https://cdn.example/walkthrough-poster.jpg",
          },
        ],
        tours: [{ type: "matterport", url: "https://my.matterport.com/show/?m=tour1", embedUrl: "https://my.matterport.com/show/?m=tour1" }],
        floorplans: [
          { url: "https://cdn.example/level1.jpg", name: "Level 1.jpg" },
          { url: "https://cdn.example/plan.pdf", name: "plan.pdf", downloadable: true, poster: "https://cdn.example/plan.pdf" },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected the listing studio");
    expect(result.project.view).toBe("public");
    expect(result.project.images.map((image) => image.url)).toEqual(["https://cdn.example/exterior-display.jpg"]);
    expect(result.project.videos.map((video) => video.url)).toEqual(["https://cdn.example/walkthrough/stream.m3u8"]);
    expect(result.project.tourUrl).toContain("matterport.com");
    expect(result.project.floorPlans.map((plan) => plan.url)).toEqual(["https://cdn.example/level1.jpg"]);
    expect(result.project.agentName).toBe("Ada Agent");
    const body = JSON.stringify(result.project);
    for (const hidden of [
      "luxury-exterior-full.jpg",
      "only-original.jpg",
      "walkthrough-raw.mp4",
      "plan.pdf",
      "delivery.zip",
      "front-full.jpg",
    ]) {
      expect(body).not.toContain(hidden);
    }
  });

  it("sends a released linked gallery when the shared id is the project", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ galleryId: "galleryDelivered1" }),
      relatedGalleries: [
        { id: "galleryPending01", status: "pending_upload", listingId: LISTING_ID },
        { id: "galleryDelivered1", status: "delivered", listingId: LISTING_ID },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected a listing redirect");
    expect(result.openGalleryId).toBe("galleryDelivered1");
  });

  it("keeps the project studio when the linked gallery is not released", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing(),
      relatedGalleries: [{ id: "galleryPending01", status: "ready_for_review", listingId: LISTING_ID }],
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "listing") throw new Error("expected the listing studio");
    expect(result.openGalleryId).toBeNull();
    expect(result.project.notice).toMatch(/not public yet/);
  });

  it("names a real gallery that has not been delivered or approved", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: "galleryPending01",
      gallery: { id: "galleryPending01", status: "pending_upload" },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "gallery") throw new Error("expected the gallery");
    expect(result.released).toBe(false);
    expect(result.staffNote).toMatch(/pending_upload/);
    expect(result.staffNote).toMatch(/not a missing link/);
  });

  it("opens a delivered gallery document directly", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: "galleryDelivered1",
      gallery: { id: "galleryDelivered1", status: "approved" },
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "gallery") throw new Error("expected the gallery");
    expect(result.released).toBe(true);
    expect(result.galleryId).toBe("galleryDelivered1");
  });

  it("keeps download files off the public share even after the invoice is paid", () => {
    const paid = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ invoiceStatus: "paid", lockDownloads: true }),
    });
    expect(paid.ok).toBe(true);
    if (paid.ok !== true || paid.kind !== "listing") throw new Error("expected the listing studio");
    expect(paid.project.view).toBe("public");
    expect(paid.project.images).toEqual([{ url: "https://cdn.example/final.jpg", name: "front.jpg" }]);
    expect(JSON.stringify(paid.project)).not.toContain("front-full.jpg");
    expect(JSON.stringify(paid.project)).not.toContain("delivery.zip");
  });

  it("gives the owner delivery files only after the existing payment lock opens", () => {
    const source = listing({ invoiceStatus: "paid", lockDownloads: true });
    const opened = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: source });
    if (opened.ok !== true || opened.kind !== "listing") throw new Error("expected the listing studio");
    const paid = ownerStudioProject(source, opened.project.view === "public" ? opened.project : { ...opened.project, view: "public" });
    expect(paid.view).toBe("owner");
    expect(paid.downloadsUnlocked).toBe(true);
    expect(paid.clientName).toBe("Private Client");
    expect(paid.clientEmail).toBe("ada@example.com");
    expect(paid.revisions[0]?.description).toBe("Warm the kitchen");
    expect(paid.invoice).toEqual({ status: "paid" });
    expect(paid.images[0]?.downloadUrl).toBe("https://cdn.example/front-full.jpg");
    expect(paid.files.map((file) => file.url)).toEqual(expect.arrayContaining([
      "https://cdn.example/delivery.zip",
      "https://cdn.example/mls-full.jpg",
      "https://cdn.example/front-full.jpg",
    ]));

    const lockedSource = listing({ lockDownloads: true, requirePayment: false, invoiceStatus: "sent" });
    const lockedOpen = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: lockedSource });
    if (lockedOpen.ok !== true || lockedOpen.kind !== "listing" || lockedOpen.project.view !== "public") {
      throw new Error("expected the listing studio");
    }
    const locked = ownerStudioProject(lockedSource, lockedOpen.project);
    expect(locked.downloadsUnlocked).toBe(false);
    expect(locked.lockDownloads).toBe(true);
    expect(locked.files).toEqual([]);
    expect(locked.images).toEqual([{ url: "https://cdn.example/final.jpg", name: "front.jpg" }]);
    expect(JSON.stringify(locked.images)).not.toContain("front-full.jpg");
    expect(locked.clientEmail).toBe("ada@example.com");

    const releasedSource = listing({ lockDownloads: true, invoiceStatus: "sent", downloadsReleased: true });
    const releasedOpen = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: releasedSource });
    if (releasedOpen.ok !== true || releasedOpen.kind !== "listing" || releasedOpen.project.view !== "public") {
      throw new Error("expected the listing studio");
    }
    expect(ownerStudioProject(releasedSource, releasedOpen.project).downloadsUnlocked).toBe(true);

    const unsetSource = listing({ invoiceStatus: "sent" });
    const unsetOpen = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: unsetSource });
    if (unsetOpen.ok !== true || unsetOpen.kind !== "listing" || unsetOpen.project.view !== "public") {
      throw new Error("expected the listing studio");
    }
    const unset = ownerStudioProject(unsetSource, unsetOpen.project);
    expect(unset.lockDownloads).toBe(true);
    expect(unset.requirePayment).toBe(true);
    expect(unset.downloadsUnlocked).toBe(false);

    const staffRelease = listing({ invoiceStatus: "sent", lockDownloads: false });
    const staffOpen = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: staffRelease });
    if (staffOpen.ok !== true || staffOpen.kind !== "listing" || staffOpen.project.view !== "public") {
      throw new Error("expected the listing studio");
    }
    const releasedByStaff = ownerStudioProject(staffRelease, staffOpen.project);
    expect(releasedByStaff.lockDownloads).toBe(false);
    expect(releasedByStaff.downloadsUnlocked).toBe(true);
  });

  it("strips original files from the truly locked owner view", () => {
    const rawMp4 = "https://cdn.example/walkthrough-raw.mp4";
    const fullRes = "https://cdn.example/luxury-exterior-full.jpg";
    const source = listing({
      invoiceStatus: "sent",
      paymentStatus: "unpaid",
      lockDownloads: true,
      images: [
        {
          url: "https://cdn.example/final.jpg",
          name: "front.jpg",
          path: `listings/${LISTING_ID}/finals/1_front.jpg`,
          downloadUrl: "https://cdn.example/front-full.jpg",
          fileUrl: "https://cdn.example/front-file.jpg",
          originalUrl: "https://cdn.example/front-original.jpg",
          fullResUrl: fullRes,
          mlsUrl: "https://cdn.example/front-mls.jpg",
          mp4Url: rawMp4,
          src: "https://cdn.example/front-src.jpg",
          variants: { original: { url: "https://cdn.example/nested-full-res.jpg", src: "https://cdn.example/nested-src.jpg" } },
        },
      ],
      videos: [
        {
          url: rawMp4,
          name: "Walkthrough",
          fileUrl: "https://cdn.example/walkthrough-file.mp4",
          originalUrl: "https://cdn.example/walkthrough-original.mp4",
          downloadUrl: "https://cdn.example/walkthrough-download.mp4",
          mp4Url: "https://cdn.example/walkthrough-mp4.mp4",
          src: "https://cdn.example/walkthrough-src.mp4",
          poster: rawMp4,
          thumbnailUrl: "https://cdn.example/walkthrough-poster.jpg",
          streamUrl: "https://cdn.example/walkthrough/stream.m3u8",
          variants: [{ url: "https://cdn.example/walkthrough-variant.mp4" }],
        },
        {
          url: "https://cdn.example/snap-reel.mp4",
          name: "Snap reel",
          type: "reel",
          previewUrl: "https://cdn.example/reel/preview.m3u8",
        },
      ],
    });
    const opened = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: source });
    if (opened.ok !== true || opened.kind !== "listing" || opened.project.view !== "public") {
      throw new Error("expected the listing studio");
    }
    const locked = ownerStudioProject(source, opened.project, {
      invoice: { status: "unpaid", total: 1, amountPaid: 0, amountDue: 1 },
    });
    expect(locked.downloadsUnlocked).toBe(false);
    expect(locked.invoice).toEqual({ status: "unpaid" });
    expect(locked.files).toEqual([]);
    expect(locked.images.map((image) => image.url)).toEqual(["https://cdn.example/final.jpg"]);
    expect(locked.videos.map((video) => video.url)).toEqual([
      "https://cdn.example/walkthrough/stream.m3u8",
      "https://cdn.example/reel/preview.m3u8",
    ]);
    expect(locked.videos[0]?.streamUrl).toBe("https://cdn.example/walkthrough/stream.m3u8");
    expect(locked.videos[0]?.poster).toBe("https://cdn.example/walkthrough-poster.jpg");
    expect(locked.videos[0]?.thumbnailUrl).toBe("https://cdn.example/walkthrough-poster.jpg");
    const originals = [
      rawMp4,
      fullRes,
      "https://cdn.example/front-full.jpg",
      "https://cdn.example/front-file.jpg",
      "https://cdn.example/front-original.jpg",
      "https://cdn.example/front-mls.jpg",
      "https://cdn.example/front-src.jpg",
      "https://cdn.example/nested-full-res.jpg",
      "https://cdn.example/nested-src.jpg",
      "https://cdn.example/walkthrough-file.mp4",
      "https://cdn.example/walkthrough-original.mp4",
      "https://cdn.example/walkthrough-download.mp4",
      "https://cdn.example/walkthrough-mp4.mp4",
      "https://cdn.example/walkthrough-src.mp4",
      "https://cdn.example/walkthrough-variant.mp4",
      "https://cdn.example/snap-reel.mp4",
      "https://cdn.example/delivery.zip",
      "https://cdn.example/mls-full.jpg",
    ];
    const values = stringValues(locked);
    for (const piece of originals) {
      expect(values.some((value) => value === piece || value.includes(piece))).toBe(false);
    }

    const staff = ownerStudioProject(source, opened.project, {
      invoice: { status: "unpaid", total: 1, amountPaid: 0, amountDue: 1 },
      staffAccess: true,
    });
    expect(staff.downloadsUnlocked).toBe(false);
    expect(JSON.stringify(staff.videos)).toContain(rawMp4);
  });

  it("keeps full file URLs when staff marked paid or released, including a stale copied paid field", () => {
    const rawMp4 = "https://cdn.example/walkthrough-raw.mp4";
    const source = listing({
      invoiceStatus: "paid",
      paymentStatus: "unpaid",
      lockDownloads: true,
      downloadEnabled: false,
      downloadsReleased: false,
      videos: [{ url: rawMp4, name: "Walkthrough", streamUrl: "https://cdn.example/walkthrough/stream.m3u8" }],
    });
    const opened = decideClientGalleryLink({ ...empty, id: LISTING_ID, listing: source });
    if (opened.ok !== true || opened.kind !== "listing" || opened.project.view !== "public") {
      throw new Error("expected the listing studio");
    }
    const unpaidInvoice = { status: "unpaid", total: 450, amountPaid: 0, amountDue: 450 };
    const stalePaid = ownerStudioProject(source, opened.project, { invoice: unpaidInvoice });
    expect(stalePaid.downloadsUnlocked).toBe(true);
    expect(stalePaid.invoice).toEqual({ status: "unpaid" });
    expect(stalePaid.videos.map((video) => video.url)).toContain(rawMp4);
    expect(stalePaid.images[0]?.downloadUrl).toBe("https://cdn.example/front-full.jpg");
    expect(stalePaid.files.map((file) => file.url)).toEqual(expect.arrayContaining([
      "https://cdn.example/delivery.zip",
      "https://cdn.example/front-full.jpg",
    ]));

    const paymentStatus = ownerStudioProject(
      listing({ invoiceStatus: "sent", paymentStatus: "comped", lockDownloads: true, videos: source.videos }),
      opened.project,
      { invoice: unpaidInvoice },
    );
    expect(paymentStatus.downloadsUnlocked).toBe(true);
    expect(JSON.stringify(paymentStatus.videos)).toContain(rawMp4);
    expect(paymentStatus.files.map((file) => file.url)).toContain("https://cdn.example/delivery.zip");

    const released = ownerStudioProject(
      listing({ invoiceStatus: "sent", paymentStatus: "unpaid", lockDownloads: true, videos: source.videos }),
      opened.project,
      { invoice: unpaidInvoice, downloadEnabled: true, downloadsReleased: true },
    );
    expect(released.downloadsUnlocked).toBe(true);
    expect(JSON.stringify(released.files)).toContain("https://cdn.example/delivery.zip");
    expect(JSON.stringify(released.videos)).toContain(rawMp4);
  });

  it("says when the project exists but Client Studio is off or locked", () => {
    const disabled = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ studioEnabled: false }),
    });
    expect(disabled.ok).toBe(false);
    if (disabled.ok !== false) throw new Error("expected a refusal");
    expect(disabled.code).toBe("studio_disabled");
    expect(disabled.message).toMatch(/Client Studio is turned off/);
    expect(disabled.message).toMatch(LISTING_ID);

    const locked = decideClientGalleryLink({
      ...empty,
      id: LISTING_ID,
      listing: listing({ lockStudio: true }),
    });
    expect(locked.ok).toBe(false);
    if (locked.ok !== false) throw new Error("expected a refusal");
    expect(locked.code).toBe("studio_locked");
    expect(locked.message).toMatch(/Lock Studio is on/);
  });

  it("explains an id that is in neither galleries nor listings", () => {
    const result = decideClientGalleryLink({ ...empty, id: LISTING_ID });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected unknown");
    expect(result.code).toBe("unknown");
    expect(result.httpStatus).toBe(404);
    expect(result.message).toMatch(/galleries\/V92oe4gWihszc95tEcVQ/);
    expect(result.message).toMatch(/listings\/V92oe4gWihszc95tEcVQ/);
    expect(result.message).toMatch(/Fotello/);
  });

  it("follows an order id to its delivered gallery", () => {
    const result = decideClientGalleryLink({
      ...empty,
      id: "orderId1234567890",
      order: { id: "orderId1234567890" },
      galleriesByOrderId: [{ id: "galleryDelivered1", status: "delivered" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true || result.kind !== "gallery") throw new Error("expected the order gallery");
    expect(result.galleryId).toBe("galleryDelivered1");
    expect(result.released).toBe(true);
    expect(result.staffNote).toMatch(/order id/);
  });

  it("rejects a short or unsafe id before any lookup", () => {
    const result = decideClientGalleryLink({ ...empty, id: "../secret" });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected invalid");
    expect(result.code).toBe("invalid_id");
    expect(result.httpStatus).toBe(400);
  });
});

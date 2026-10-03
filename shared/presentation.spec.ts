import { describe, expect, it } from "vitest";
import {
  PRESENTATION_PREVIEW_TOKEN,
  buildPresentation,
  collectPresentationPhotos,
  createPresentationToken,
  injectPresentationMeta,
  isPresentationToken,
  presentationPath,
  seededPresentation,
} from "./presentation";

describe("listing presentation", () => {
  it("mints an unguessable token and a share path", () => {
    const token = createPresentationToken((size) => Buffer.from("iconic-presentation-token!!"));
    expect(token.length).toBeGreaterThanOrEqual(22);
    expect(isPresentationToken(token)).toBe(true);
    expect(isPresentationToken("short")).toBe(false);
    expect(isPresentationToken(PRESENTATION_PREVIEW_TOKEN)).toBe(true);
    expect(presentationPath(token)).toBe(`/present/${token}`);
  });

  it("keeps edited photos, drops raw files, and groups rooms", () => {
    const presentation = buildPresentation({
      token: "abcdefghijklmnopqrstuv",
      origin: "https://iconicimagestx.com",
      listing: {
        id: "listing1234",
        address: { street: "18 Oak Hollow", city: "Spring", state: "TX", zip: "77389" },
        agentName: "Riley Chen",
        clientName: "Northgate Group",
        listPrice: 1250000,
        bedrooms: 4,
        bathrooms: 3.5,
        mediaFolders: [{ id: "fld_kitchen", name: "Kitchen" }],
        images: [
          { id: "raw", name: "frame.CR2", path: "listings/listing1234/raw/frame.CR2", url: "https://cdn.example/raw.jpg", contentType: "image/x-canon-cr2" },
          { id: "before", name: "kitchen.jpg", path: "listings/listing1234/photos/kitchen.jpg", url: "https://cdn.example/kitchen.jpg", folderId: "fld_kitchen", sourcePath: "" },
          { id: "final", name: "kitchen-final.jpg", path: "listings/listing1234/finals/kitchen-final.jpg", url: "https://cdn.example/kitchen-final.jpg", studioApproved: true, studioRole: "final", sourcePath: "listings/listing1234/photos/kitchen.jpg", room: "Kitchen", order: 0 },
          { id: "living", name: "living.jpg", path: "listings/listing1234/photos/living.jpg", url: "https://cdn.example/living.jpg", room: "Living room", order: 1 },
          { name: "notes.pdf", path: "listings/listing1234/files/notes.pdf", url: "https://cdn.example/notes.pdf", contentType: "application/pdf" },
        ],
      },
      galleries: [{
        mediaItems: [
          { id: "living-dup", type: "photo", url: "https://cdn.example/living.jpg", fileName: "living.jpg", room: "Living room" },
          { id: "tour", type: "tour", url: "https://my.matterport.com/show", title: "Tour" },
          { id: "suite", type: "photo", url: "https://cdn.example/suite.jpg", fileName: "suite.jpg", room: "Primary suite" },
          { id: "bad", type: "photo", url: "javascript:alert(1)", fileName: "bad.jpg" },
        ],
      }],
    });

    expect(presentation).not.toBeNull();
    expect(presentation?.address).toBe("18 Oak Hollow, Spring, TX 77389");
    expect(presentation?.street).toBe("18 Oak Hollow");
    expect(presentation?.agentName).toBe("Riley Chen");
    expect(presentation?.clientName).toBe("Northgate Group");
    expect(presentation?.price).toBe("$1,250,000");
    expect(presentation?.beds).toBe("4");
    const urls = presentation?.photos.map((photo) => photo.url);
    expect(urls).toEqual([
      "https://cdn.example/kitchen-final.jpg",
      "https://cdn.example/living.jpg",
      "https://cdn.example/suite.jpg",
    ]);
    expect(presentation?.photos[0].room).toBe("Kitchen");
    expect(presentation?.rooms.map((room) => room.name)).toEqual(["Kitchen", "Living room", "Primary suite"]);
    expect(presentation?.meta.url).toBe("https://iconicimagestx.com/present/abcdefghijklmnopqrstuv");
    expect(presentation?.meta.image).toBe("https://cdn.example/kitchen-final.jpg");
    expect(JSON.stringify(presentation)).not.toContain("clientEmail");
    expect(JSON.stringify(presentation)).not.toContain("/raw/");
  });

  it("uses a media-library folder name when a photo has no room", () => {
    const photos = collectPresentationPhotos({
      token: "abcdefghijklmnopqrstuv",
      listing: {
        mediaFolders: [{ id: "fld_primary", name: "Primary suite" }],
        images: [
          { name: "bed.jpg", path: "listings/abc/photos/bed.jpg", url: "https://cdn.example/bed.jpg", contentType: "image/jpeg", folderId: "fld_primary" },
        ],
      },
    });
    expect(photos[0].room).toBe("Primary suite");
  });

  it("drops photos the client hid and keeps the file available to the portal", () => {
    const photos = collectPresentationPhotos({
      token: "abcdefghijklmnopqrstuv",
      listing: {
        portalMedia: { photos: { living: { hidden: true, order: 1 } } },
        images: [
          { id: "living", name: "living.jpg", path: "listings/abc/photos/living.jpg", url: "https://cdn.example/living.jpg", contentType: "image/jpeg" },
          { id: "kitchen", name: "kitchen.jpg", path: "listings/abc/photos/kitchen.jpg", url: "https://cdn.example/kitchen.jpg", contentType: "image/jpeg", hiddenFromPresentation: true },
          { id: "yard", name: "yard.jpg", path: "listings/abc/photos/yard.jpg", url: "https://cdn.example/yard.jpg", contentType: "image/jpeg" },
        ],
      },
    });
    expect(photos.map((photo) => photo.id)).toEqual(["yard"]);
  });

  it("hides a presentation the staff turned off", () => {
    expect(buildPresentation({
      token: "abcdefghijklmnopqrstuv",
      listing: { presentationEnabled: false, images: [] },
    })).toBeNull();
  });

  it("seeds a sample with Iconic stills and no agent or street", () => {
    const sample = seededPresentation("https://iconicimagestx.com");
    expect(sample.seeded).toBe(true);
    expect(sample.agentName).toBe("");
    expect(sample.address).toBe("");
    expect(sample.clientName).toBe("");
    expect(sample.photos.length).toBeGreaterThan(8);
    expect(sample.photos[0].url).toBe("/media/photos/luxury-exterior.jpg");
    expect(sample.rooms.some((room) => room.name === "Living room" && room.count > 1)).toBe(true);
    expect(sample.meta.title).toContain("Iconic Images");
    expect(sample.meta.image).toBe("https://iconicimagestx.com/media/photos/luxury-exterior.jpg");
  });

  it("injects share tags into the document head", () => {
    const html = injectPresentationMeta("<html><head><title>Old</title></head><body></body></html>", {
      title: `Oak & Co "Listing" · Iconic Images`,
      description: "12 photographs",
      image: "https://cdn.example/hero.jpg",
      url: "https://iconicimagestx.com/present/abcdefghijklmnopqrstuv",
    });
    expect(html).not.toContain("<title>Old</title>");
    expect(html).toContain("og:title");
    expect(html).toContain("Oak &amp; Co &quot;Listing&quot;");
    expect(html).toContain("twitter:image");
    expect(html).toContain("noindex");
  });
});

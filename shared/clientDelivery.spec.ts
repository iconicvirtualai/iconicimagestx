import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT_LINE } from "./businessContact";
import {
  clientDeliveryMessage,
  clientDeliveryPath,
  clientDeliveryPresentationUrl,
  clientDeliveryNotifyMode,
  deliveryAssetsFromRecords,
  prepareDeliveryMessage,
  presentationFromRecords,
  presentationLeaksStorage,
  sampleDeliveryDraft,
  sampleDeliveryPresentation,
} from "./clientDelivery";

const ENV = { PUBLIC_SITE_URL: "https://links.example" };

describe("client delivery presentation", () => {
  it("uses the delivery page, not the listing site or listing presentation", () => {
    expect(clientDeliveryPath("gal-1")).toBe("/deliver/gal-1");
    expect(clientDeliveryPresentationUrl("gal-1", ENV)).toBe("https://links.example/deliver/gal-1");
    expect(clientDeliveryPresentationUrl("gal-1", ENV)).not.toContain("/l/");
    expect(clientDeliveryPresentationUrl("gal-1", ENV)).not.toContain("/present/");
    expect(clientDeliveryPresentationUrl("gal-1", ENV)).not.toContain("/gallery/");
  });

  it("keeps the Iconic footer and never a personal sender", () => {
    const draft = sampleDeliveryDraft(ENV);
    expect(draft.subject).toBe("Your gallery is ready: 1842 Live Oak Lane, Spring, TX 77380");
    expect(draft.message).toContain(BUSINESS_CONTACT_LINE);
    expect(draft.message).toContain("photos@iconicimagestx.com");
    expect(draft.message).toContain("https://links.example/deliver/preview");
    expect(draft.message.toLowerCase()).not.toContain("cadi@");
    expect(draft.toName).toBe("Jordan Hale");
    expect(draft.toEmail).toBe("jordan.hale@example.com");
    expect(draft.invoice.number).toBe("INV-1042");
    expect(draft.invoice.status).toBe("unpaid");
    expect(prepareDeliveryMessage("Hi there\n\nPlease ignore cadi@iconicimagestx.com").ok).toBe(false);
  });

  it("stays in preview unless both notify flags are exactly true", () => {
    expect(clientDeliveryNotifyMode({}).mode).toBe("preview");
    expect(clientDeliveryNotifyMode({ CLIENT_NOTIFY_LIVE: "true" }).live).toBe(false);
    expect(clientDeliveryNotifyMode({ CLIENT_EMAIL_NOTIFY_LIVE: "true" }).live).toBe(false);
    expect(clientDeliveryNotifyMode({
      CLIENT_NOTIFY_LIVE: "true",
      CLIENT_EMAIL_NOTIFY_LIVE: "true",
    }).mode).toBe("live");
  });

  it("watermarks and locks downloads while the invoice is unpaid", () => {
    const page = sampleDeliveryPresentation("preview");
    expect(page?.paid).toBe(false);
    expect(page?.orderNumber).toBe("#1042");
    expect(page?.contactLine).toBe(BUSINESS_CONTACT_LINE);
    expect(page?.zipPrintUrl).toBeNull();
    expect(page?.zipWebUrl).toBeNull();
    expect(page?.media.every((item) => item.watermarked && !item.highUrl && !item.webUrl)).toBe(true);
    expect(page?.media.map((item) => item.section)).toEqual([
      "Photos", "Photos", "Photos", "Photos", "Photos", "Video", "3D Tour", "Floor plans",
    ]);
  });

  it("unlocks high-res and web downloads once the invoice is paid", () => {
    const page = sampleDeliveryPresentation("preview-paid");
    expect(page?.paid).toBe(true);
    expect(page?.invoice.status).toBe("paid");
    expect(page?.invoice.paidNote).toContain("Paid at booking");
    const photo = page?.media.find((item) => item.name === "Front elevation.jpg");
    expect(photo?.watermarked).toBe(false);
    expect(photo?.highUrl).toContain("variant=print");
    expect(photo?.webUrl).toContain("variant=web");
    expect(page?.zipPrintUrl).toContain("variant=print");
    expect(page?.zipWebUrl).toContain("variant=web");
    const video = page?.media.find((item) => item.kind === "video");
    expect(video?.highUrl).toBeNull();
  });

  it("does not publish storage URLs for an unpaid B2 or Firebase file", () => {
    const listing = {
      address: "10 Oak St, Spring, TX 77380",
      orderNumber: "#105",
      clientName: "Ada Lovelace",
      storageBackend: "b2",
      images: [{
        id: "front",
        name: "front.jpg",
        type: "photo",
        storageBackend: "b2",
        b2Key: "aryeo-test/client/front.jpg",
        url: "https://storage.googleapis.com/bucket/secret-full.jpg",
      }],
    };
    const assets = deliveryAssetsFromRecords(listing, null);
    expect(assets[0]?.b2Key).toBe("aryeo-test/client/front.jpg");
    const unpaid = presentationFromRecords({ id: "gallery1234", listing, paid: false });
    const paid = presentationFromRecords({ id: "gallery1234", listing, paid: true });
    expect(unpaid.media[0]?.highUrl).toBeNull();
    expect(unpaid.media[0]?.previewUrl).toBe("/api/deliver/gallery1234/media/0?variant=preview");
    expect(paid.media[0]?.highUrl).toContain("variant=print");
    expect(paid.media[0]?.webUrl).toContain("variant=web");
    expect(presentationLeaksStorage(unpaid)).toBe(false);
    expect(presentationLeaksStorage(paid)).toBe(false);
    expect(JSON.stringify(unpaid)).not.toContain("secret-full");
    expect(JSON.stringify(paid)).not.toContain("aryeo-test");
  });

  it("puts the contact line on the email even when the editor omits it", () => {
    const prepared = prepareDeliveryMessage(clientDeliveryMessage({
      clientName: "Ada",
      address: "10 Oak",
      presentationUrl: "https://links.example/deliver/gal-1",
      invoice: sampleDeliveryPresentation("preview")!.invoice,
    }));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.text).toContain(BUSINESS_CONTACT_LINE);
    expect(prepared.html).toContain("26410 Oakridge Dr. Ste 105 - 108");
    expect(prepared.html.toLowerCase()).not.toContain("cadi@");
  });
});

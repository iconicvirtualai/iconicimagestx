import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ClientGalleryMediaCard } from "../client/components/gallery/ClientGalleryMedia.tsx";
import { classifyClientGalleryItem } from "../client/components/gallery/clientGalleryMedia.ts";
import { buildPortalListingDetail } from "../shared/portalListingDetail.ts";
import { publicMediaItem } from "../shared/paymentAccess.ts";
import { isDeliveryQaClient } from "../shared/deliveryQaClient.ts";
import { assessGalleryRelease, releaseForPlaytestDeliveryQaGallery } from "../shared/galleryRelease.ts";
import { planOrderEdits } from "../shared/orderEditPlan.ts";
import {
  DELIVERY_QA_CLIENT_EMAIL,
  DELIVERY_QA_CLIENT_NAME,
  DELIVERY_QA_IDS,
  DELIVERY_QA_LOCK_FIELDS,
  DELIVERY_QA_MATTERPORT_URL,
  DELIVERY_QA_ROLES,
  DELIVERY_QA_UNLOCK_FIELDS,
  buildDeliveryQaSeed,
  deliveryQaClientWriteId,
  deliveryQaPublicPreview,
  deliveryQaRefusals,
  deliveryQaUnlockRefusals,
  formatDeliveryQaDryRun,
  parseDeliveryQaArgs,
} from "../shared/deliveryQaSeed.ts";

const plan = buildDeliveryQaSeed();

function doc(collection: string) {
  const found = plan.documents.find((item) => item.collection === collection);
  if (!found) throw new Error(`missing ${collection}`);
  return found;
}

describe("delivery QA seed plan", () => {
  it("uses stable ids and the ops delivery QA client", () => {
    expect(plan.clientName).toBe(DELIVERY_QA_CLIENT_NAME);
    expect(plan.clientEmail).toBe("ops+deliveryqa@iconicimagestx.com");
    expect(plan.clientEmail).not.toContain("quinn.siteqa");
    expect(plan.documents.map((item) => item.path)).toEqual([
      `clients/${DELIVERY_QA_IDS.client}`,
      `orders/${DELIVERY_QA_IDS.order}`,
      `listings/${DELIVERY_QA_IDS.listing}`,
      `galleries/${DELIVERY_QA_IDS.gallery}`,
      `invoices/${DELIVERY_QA_IDS.invoice}`,
    ]);
    expect(buildDeliveryQaSeed()).toEqual(plan);
  });

  it("marks every document as playtest and keeps spend at zero", () => {
    for (const item of plan.documents) {
      expect(item.data.playtest).toBe(true);
      expect(JSON.stringify(item.data)).toContain("TEST");
    }
    expect(doc("clients").data).toMatchObject({
      clientName: "TEST - Delivery QA",
      email: DELIVERY_QA_CLIENT_EMAIL,
      totalSpend: 0,
      tags: ["playtest", "test", "delivery-qa"],
    });
    expect(String(doc("clients").data.notes)).toContain("TEST ORDER");
    expect(String(doc("orders").data.notes)).toContain("TEST ORDER");
  });

  it("covers every delivery role once and locks the unpaid $1 invoice", () => {
    expect(plan.media.map((item) => item.role)).toEqual([...DELIVERY_QA_ROLES]);
    expect(new Set(plan.media.map((item) => item.id)).size).toBe(plan.media.length);
    expect(doc("invoices").data).toMatchObject({
      invoiceNumber: "TEST-DELIVERY-QA",
      status: "sent",
      total: 1,
      amountPaid: 0,
      amountDue: 1,
      orderId: DELIVERY_QA_IDS.order,
      galleryId: DELIVERY_QA_IDS.gallery,
    });
    expect(doc("invoices").data).not.toHaveProperty("sentAt");
    expect(doc("invoices").data).not.toHaveProperty("squarePaymentId");
    expect(doc("galleries").data).toMatchObject({
      status: "delivered",
      ...DELIVERY_QA_LOCK_FIELDS,
      invoiceId: DELIVERY_QA_IDS.invoice,
    });
    expect(doc("listings").data).toMatchObject(DELIVERY_QA_LOCK_FIELDS);

    const preview = deliveryQaPublicPreview(plan);
    expect(preview.paymentRequired).toBe(true);
    expect(preview.downloadEnabled).toBe(false);
    expect(preview.invoiceAllowsDownload).toBe(false);
    expect(preview.lockTitle).toMatch(/locked/i);
    for (const item of preview.mediaItems) {
      expect(item.url).toBeNull();
      expect(item.shareUrl).toBeNull();
      expect(item.embedUrl).toBeNull();
      expect(item.poster).toBeNull();
      expect(item.locked).toBe(true);
    }
    expect(plan.emailsSent).toBe(0);
  });

  it("points the gallery and listing at real sample media", () => {
    expect(plan.media.filter((item) => item.placeholder)).toEqual([]);
    expect(plan.media.find((item) => item.role === "floorplan-png")).toMatchObject({
      contentType: "image/png",
      width: 1800,
      height: 1270,
      coverage: "converted",
    });
    expect(plan.media.find((item) => item.role === "other")?.contentType).toBe("application/zip");
    expect(plan.media.find((item) => item.role === "matterport")).toMatchObject({
      type: "matterport",
      url: DELIVERY_QA_MATTERPORT_URL,
      embedUrl: DELIVERY_QA_MATTERPORT_URL,
      coverage: "public-demo",
    });
    expect(plan.media.find((item) => item.role === "vertical-reel")?.type).toBe("reel");
    expect(plan.media.find((item) => item.role === "aerial")?.sourcePath).toBe("public/media/photos/drone-hero.jpg");
    for (const item of plan.media) {
      if (item.placeholder) {
        expect(item.sourcePath).toMatch(/^public\/media\/playtest\/TEST-delivery-qa-/);
        expect(item.title).toContain("TEST");
      } else if (item.coverage !== "public-demo") {
        expect(item.sourcePath?.startsWith("public/")).toBe(true);
      }
      expect(item.url).not.toMatch(/client-media|customers\//i);
    }

    const listing = {
      id: DELIVERY_QA_IDS.listing,
      ...doc("listings").data,
    };
    const detail = buildPortalListingDetail({
      listing,
      galleries: [{ id: DELIVERY_QA_IDS.gallery, ...doc("galleries").data }],
      invoices: [{ id: DELIVERY_QA_IDS.invoice, ...doc("invoices").data }],
    });
    expect(detail.photos.map((item) => item.id).sort()).toEqual([
      "playtest-delivery-qa-aerial",
      "playtest-delivery-qa-full-res-photo",
      "playtest-delivery-qa-mls-photo",
    ]);
    expect(detail.videos.map((item) => item.id).sort()).toEqual([
      "playtest-delivery-qa-branded-mp4",
      "playtest-delivery-qa-unbranded-mp4",
      "playtest-delivery-qa-vertical-reel",
    ]);
    expect(detail.tours).toEqual([
      expect.objectContaining({
        provider: "Matterport",
        embedUrl: DELIVERY_QA_MATTERPORT_URL,
      }),
    ]);
    expect(detail.floorplans.map((item) => item.name)).toEqual(["TEST-delivery-qa-floorplan.png"]);
    expect(JSON.stringify(detail.floorplans)).not.toContain(".pdf");
    const galleryItems = doc("galleries").data.mediaItems as Array<{ role: string }>;
    expect(galleryItems.map((item) => item.role)).toContain("floorplan-pdf");
    expect(galleryItems.map((item) => item.role)).toContain("other");
  });

  it("refuses to overwrite a real client or a foreign email owner", () => {
    expect(deliveryQaRefusals({
      documents: plan.documents.map((item) => ({ path: item.path, exists: false, playtest: undefined })),
      emailMatches: [],
    })).toEqual([]);
    expect(deliveryQaRefusals({
      documents: [{ path: `invoices/${DELIVERY_QA_IDS.invoice}`, exists: true, playtest: true }],
      emailMatches: [{ path: `clients/${DELIVERY_QA_IDS.client}`, playtest: true }],
    })).toEqual([]);
    expect(deliveryQaRefusals({
      documents: [{ path: `clients/${DELIVERY_QA_IDS.client}`, exists: true, playtest: false }],
      emailMatches: [{ path: "clients/real-client", playtest: false }],
    })).toEqual([
      `clients/${DELIVERY_QA_IDS.client} already exists and is not marked playtest.`,
      `clients/real-client already uses ${DELIVERY_QA_CLIENT_EMAIL}.`,
    ]);
  });

  it("lets the linked portal login share the email and still blocks other clients", () => {
    const login = {
      path: "clients/QEdPnB7LGadwihiEsj9OMrUvzE93",
      playtest: undefined,
      linkedClientId: DELIVERY_QA_IDS.client,
      email: DELIVERY_QA_CLIENT_EMAIL,
    };
    expect(isDeliveryQaClient(login)).toBe(true);
    expect(deliveryQaRefusals({
      documents: plan.documents.map((item) => ({ path: item.path, exists: true, playtest: true })),
      emailMatches: [login],
    })).toEqual([]);
    expect(plan.documents.map((item) => item.id)).not.toContain("QEdPnB7LGadwihiEsj9OMrUvzE93");
    expect(deliveryQaClientWriteId(plan.documents)).toBe(DELIVERY_QA_IDS.client);
    expect(() => deliveryQaClientWriteId([
      ...plan.documents,
      { collection: "clients", id: "QEdPnB7LGadwihiEsj9OMrUvzE93", path: "clients/QEdPnB7LGadwihiEsj9OMrUvzE93", data: {} },
    ])).toThrow(/refuses to write any client/);

    expect(deliveryQaRefusals({
      documents: plan.documents.map((item) => ({ path: item.path, exists: false, playtest: undefined })),
      emailMatches: [{ path: "clients/unlinked-client", playtest: undefined, email: DELIVERY_QA_CLIENT_EMAIL }],
    })).toEqual([
      `clients/unlinked-client already uses ${DELIVERY_QA_CLIENT_EMAIL}.`,
    ]);
    expect(isDeliveryQaClient({
      playtest: false,
      linkedClientId: DELIVERY_QA_IDS.client,
      email: "ops@iconicimagestx.com",
    })).toBe(false);
    expect(isDeliveryQaClient({ playtest: false, email: DELIVERY_QA_CLIENT_EMAIL })).toBe(false);

    const order = plan.documents.find((item) => item.collection === "orders");
    const listing = plan.documents.find((item) => item.collection === "listings");
    const editPlan = planOrderEdits({
      lineItems: order?.data.lineItems || order?.data.services,
      services: listing?.data.services,
    });
    expect(editPlan.photoScope).toBe("none");
    expect(editPlan.deliverables).toEqual([]);
    expect(assessGalleryRelease(editPlan, { jobs: [], finals: [], uploads: [], media: [] }).complete).toBe(true);
    expect(releaseForPlaytestDeliveryQaGallery({ id: DELIVERY_QA_IDS.gallery, playtest: true })?.complete).toBe(true);
    expect(releaseForPlaytestDeliveryQaGallery({ id: DELIVERY_QA_IDS.gallery, playtest: false })).toBeNull();
    const gate = readFileSync(new URL("../server/services/galleryReleaseGate.ts", import.meta.url), "utf8");
    expect(gate.indexOf("releaseForPlaytestDeliveryQaGallery")).toBeLessThan(gate.indexOf("loadGalleryReleaseReport"));
  });

  it("treats a dry run as the default and keeps mail out of the script", () => {
    expect(parseDeliveryQaArgs([])).toEqual({ write: false, unlock: false, unknown: [] });
    expect(parseDeliveryQaArgs(["--"])).toEqual({ write: false, unlock: false, unknown: [] });
    expect(parseDeliveryQaArgs(["--write"])).toEqual({ write: true, unlock: false, unknown: [] });
    expect(parseDeliveryQaArgs(["--unlock"])).toEqual({ write: false, unlock: true, unknown: [] });
    expect(parseDeliveryQaArgs(["--send"])).toEqual({ write: false, unlock: false, unknown: ["--send"] });

    const source = readFileSync(new URL("./seed-delivery-qa.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["'][^"']*(email|sms|square|twilio|nodemailer)/);
    expect(source).not.toMatch(/\b(sendEmail|sendSMS|createUser)\s*\(/);
    expect(source).toContain("deliveryQaRefusals");

    const text = formatDeliveryQaDryRun(plan);
    expect(text.startsWith("DELIVERY QA SEED — DRY RUN\n")).toBe(true);
    expect(text).toContain("No email, SMS, Square invoice, or Stripe charge.");
    expect(text).toContain("ops+deliveryqa@iconicimagestx.com");
    expect(text).toContain("quinn.siteqa+");
    expect(text).toContain("$1.00");
    expect(text).toContain("There is no Owners Suite filter");
    for (const item of plan.documents) expect(text).toContain(item.path);
    for (const role of DELIVERY_QA_ROLES) expect(text).toContain(role);
  });

  it("prints the dry run without writing", () => {
    const png = readFileSync("public/media/playtest/TEST-delivery-qa-floorplan.png");
    const pdf = readFileSync("public/media/playtest/TEST-delivery-qa-floorplan.pdf");
    const zip = readFileSync("public/media/playtest/TEST-delivery-qa-other.zip");
    const jpeg = readFileSync("public/media/launch/floorplan_sample_cropped.jpg");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1800);
    expect(png.readUInt32BE(20)).toBe(1270);
    expect(png.length).toBeGreaterThan(10_000);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.includes(jpeg)).toBe(true);
    expect(pdf.toString("latin1")).not.toContain("floor plan placeholder");
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.length).toBe(plan.media.find((item) => item.role === "other")?.fileSize);
    const entry = zipEntry(zip, "floorplan_sample_cropped.jpg");
    expect(entry.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(entry.equals(jpeg)).toBe(true);

    const stdout = execFileSync(
      fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url)),
      ["scripts/seed-delivery-qa.ts"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, APP_URL: "" },
        encoding: "utf8",
      },
    );
    expect(stdout).toBe(formatDeliveryQaDryRun(plan));
  });

  it("renders each unlocked public item as the gallery kind that file is", () => {
    const kinds = [
      "mls-photo",
      "fullres-photo",
      "branded-video",
      "unbranded-video",
      "reel",
      "tour",
      "floorplan-image",
      "floorplan-pdf",
      "aerial-photo",
      "file",
    ];
    const rendered = plan.media.map((item) => {
      const publicItem = publicMediaItem(item as unknown as Record<string, unknown>, true);
      return {
        kind: classifyClientGalleryItem(publicItem),
        html: renderToString(createElement(ClientGalleryMediaCard, { item: publicItem })),
        item: publicItem,
      };
    });
    expect(rendered.map((row) => row.kind)).toEqual(kinds);
    expect(rendered[5].html).toContain(`src="${DELIVERY_QA_MATTERPORT_URL}"`);
    expect(rendered[5].html).toContain("gallery-tour-");
    expect(rendered[6].html).toContain("TEST-delivery-qa-floorplan.png");
    expect(rendered[7].html).toContain("gallery-open-floorplan-");
    expect(rendered[7].html).toContain("TEST-delivery-qa-floorplan.png");
    expect(rendered[7].item.url).toContain("TEST-delivery-qa-floorplan.pdf");
    expect(rendered[9].html).toContain("ZIP");
    expect(rendered[9].html).not.toContain("Size not on file");
    for (const row of rendered) {
      if (row.kind === "tour") continue;
      expect(String(row.item.url)).toMatch(/^https:\/\/iconicimagestx\.com\//);
    }
  });

  it("refuses unlock unless both playtest docs exist", () => {
    const qaClient = { exists: true, playtest: true, email: DELIVERY_QA_CLIENT_EMAIL };
    expect(deliveryQaUnlockRefusals({
      gallery: { exists: true, playtest: true },
      listing: { exists: true, playtest: true },
      client: qaClient,
    })).toEqual([]);
    expect(deliveryQaUnlockRefusals({
      gallery: { exists: true, playtest: true },
      listing: { exists: true, playtest: true },
      client: {
        exists: true,
        playtest: undefined,
        linkedClientId: DELIVERY_QA_IDS.client,
        email: DELIVERY_QA_CLIENT_EMAIL,
      },
    })).toEqual([]);
    expect(deliveryQaUnlockRefusals({
      gallery: { exists: true, playtest: true },
      listing: { exists: true, playtest: true },
      client: { exists: true, playtest: false, email: DELIVERY_QA_CLIENT_EMAIL },
    })).toEqual([
      `clients/${DELIVERY_QA_IDS.client} is not the delivery QA client.`,
    ]);
    expect(deliveryQaUnlockRefusals({
      gallery: { exists: false, playtest: undefined },
      listing: { exists: true, playtest: false },
      client: { exists: true, playtest: false },
    })).toEqual([
      `galleries/${DELIVERY_QA_IDS.gallery} does not exist.`,
      `listings/${DELIVERY_QA_IDS.listing} is not marked playtest.`,
      `clients/${DELIVERY_QA_IDS.client} is not the delivery QA client.`,
    ]);
    expect(DELIVERY_QA_UNLOCK_FIELDS).toEqual({
      lockDownloads: false,
      requirePayment: false,
      downloadEnabled: true,
      downloadsReleased: true,
    });
    expect(DELIVERY_QA_UNLOCK_FIELDS).not.toHaveProperty("status");
    expect(DELIVERY_QA_UNLOCK_FIELDS).not.toHaveProperty("amountPaid");
    const source = readFileSync(new URL("./seed-delivery-qa.ts", import.meta.url), "utf8");
    const unlock = source.slice(source.indexOf("async function unlockDeliveryQa"));
    expect(unlock).toContain("deliveryQaUnlockRefusals");
    expect(unlock).toContain("linkedClientId");
    expect(unlock).not.toContain('collection("invoices")');
    expect(unlock.indexOf("deliveryQaUnlockRefusals")).toBeLessThan(unlock.indexOf("batch.commit"));
    const writes = unlock.slice(unlock.indexOf("const batch"));
    expect(writes).not.toContain("clientRef");
    const write = source.slice(source.indexOf("async function writeDeliveryQa"));
    expect(write.indexOf("deliveryQaClientWriteId")).toBeLessThan(write.indexOf("batch.commit"));
    expect(write).toContain("linkedClientId");
    expect(write).not.toContain("QEdPnB7LGadwihiEsj9OMrUvzE93");
  });
});

function zipEntry(zip: Buffer, name: string): Buffer {
  let offset = 0;
  while (offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (entryName === name) {
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`unsupported zip method ${method}`);
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`missing zip entry ${name}`);
}

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPortalListingDetail } from "../shared/portalListingDetail.ts";
import {
  DELIVERY_QA_CLIENT_EMAIL,
  DELIVERY_QA_CLIENT_NAME,
  DELIVERY_QA_IDS,
  DELIVERY_QA_MATTERPORT_URL,
  DELIVERY_QA_ROLES,
  buildDeliveryQaSeed,
  deliveryQaPublicPreview,
  deliveryQaRefusals,
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
      downloadEnabled: false,
      downloadsReleased: false,
      lockDownloads: true,
      invoiceId: DELIVERY_QA_IDS.invoice,
    });

    const preview = deliveryQaPublicPreview(plan);
    expect(preview.paymentRequired).toBe(true);
    expect(preview.downloadEnabled).toBe(false);
    expect(preview.invoiceAllowsDownload).toBe(false);
    expect(preview.lockTitle).toMatch(/locked/i);
    for (const item of preview.mediaItems) {
      expect(item.url).toBeNull();
      expect(item.shareUrl).toBeNull();
      expect(item.embedUrl).toBeNull();
      expect(item.locked).toBe(true);
    }
    expect(plan.emailsSent).toBe(0);
  });

  it("points the gallery and listing at sample media or a labeled placeholder", () => {
    const placeholders = plan.media.filter((item) => item.placeholder).map((item) => item.role);
    expect(placeholders).toEqual(["floorplan-png", "floorplan-pdf", "other"]);
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

  it("treats a dry run as the default and keeps mail out of the script", () => {
    expect(parseDeliveryQaArgs([])).toEqual({ write: false, unknown: [] });
    expect(parseDeliveryQaArgs(["--"])).toEqual({ write: false, unknown: [] });
    expect(parseDeliveryQaArgs(["--write"])).toEqual({ write: true, unknown: [] });
    expect(parseDeliveryQaArgs(["--send"])).toEqual({ write: false, unknown: ["--send"] });

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
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.length).toBeLessThan(200);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("TEST - Delivery QA floor plan placeholder");
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.length).toBeLessThan(500);

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
});

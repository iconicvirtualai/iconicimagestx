import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isDeliveryQaClient } from "../shared/deliveryQaClient.ts";
import { DELIVERY_QA_CLIENT_EMAIL, DELIVERY_QA_IDS } from "../shared/deliveryQaSeed.ts";
import {
  deliveryQaSendPreview,
  deliveryQaSendRefusals,
  formatDeliveryQaSendDryRun,
  parseDeliveryQaSendArgs,
  type DeliveryQaSendRecord,
} from "../shared/deliveryQaSend.ts";

const playtest: DeliveryQaSendRecord = {
  exists: true,
  playtest: true,
  clientId: DELIVERY_QA_IDS.client,
  orderId: DELIVERY_QA_IDS.order,
  email: DELIVERY_QA_CLIENT_EMAIL,
  clientEmail: DELIVERY_QA_CLIENT_EMAIL,
  phone: "",
};

describe("delivery QA send", () => {
  it("refuses a gallery, order, or client that is not playtest", () => {
    expect(deliveryQaSendRefusals({
      gallery: playtest,
      order: playtest,
      client: playtest,
    })).toEqual([]);

    expect(deliveryQaSendRefusals({
      gallery: { ...playtest, playtest: false },
      order: { ...playtest, exists: false },
      client: { ...playtest, email: "client@example.com", phone: "2815550100" },
    })).toEqual([
      `galleries/${DELIVERY_QA_IDS.gallery} is not marked playtest.`,
      `orders/${DELIVERY_QA_IDS.order} does not exist.`,
      `clients/${DELIVERY_QA_IDS.client} email is not ${DELIVERY_QA_CLIENT_EMAIL}.`,
      `clients/${DELIVERY_QA_IDS.client} has a phone number, so deliverGalleryToClient would also send SMS.`,
    ]);

    expect(deliveryQaSendRefusals({
      gallery: { ...playtest, clientId: "real-client" },
      order: { ...playtest, playtest: true, clientEmail: "ops@iconicimagestx.com" },
      client: { ...playtest, playtest: "true" },
    })).toEqual([
      `galleries/${DELIVERY_QA_IDS.gallery} clientId is not ${DELIVERY_QA_IDS.client}.`,
      `orders/${DELIVERY_QA_IDS.order} clientEmail is not ${DELIVERY_QA_CLIENT_EMAIL}.`,
      `clients/${DELIVERY_QA_IDS.client} is not the delivery QA client.`,
    ]);
  });

  it("accepts the linked portal login and refuses an unlinked or non-playtest client", () => {
    const login = {
      ...playtest,
      playtest: undefined,
      linkedClientId: DELIVERY_QA_IDS.client,
      email: DELIVERY_QA_CLIENT_EMAIL,
    };
    expect(isDeliveryQaClient(login)).toBe(true);
    expect(deliveryQaSendRefusals({
      gallery: playtest,
      order: playtest,
      client: login,
    })).toEqual([]);

    expect(deliveryQaSendRefusals({
      gallery: playtest,
      order: playtest,
      client: { ...playtest, playtest: false, linkedClientId: undefined, email: DELIVERY_QA_CLIENT_EMAIL },
    })).toEqual([
      `clients/${DELIVERY_QA_IDS.client} is not the delivery QA client.`,
    ]);
    expect(deliveryQaSendRefusals({
      gallery: playtest,
      order: playtest,
      client: { ...playtest, playtest: false, email: "client@example.com" },
    })).toEqual([
      `clients/${DELIVERY_QA_IDS.client} is not the delivery QA client.`,
      `clients/${DELIVERY_QA_IDS.client} email is not ${DELIVERY_QA_CLIENT_EMAIL}.`,
    ]);
  });

  it("dry-runs the built-in subject, recipient, and links without sending", () => {
    expect(parseDeliveryQaSendArgs(["--playtest", "--dry-run"])).toEqual({
      playtest: true,
      dryRun: true,
      unknown: [],
    });
    expect(parseDeliveryQaSendArgs([])).toEqual({ playtest: false, dryRun: false, unknown: [] });

    const savedPublic = process.env.PUBLIC_SITE_URL;
    const savedVite = process.env.VITE_PUBLIC_SITE_URL;
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.VITE_PUBLIC_SITE_URL;
    const preview = deliveryQaSendPreview("https://iconicimagestx.vercel.app");
    if (savedPublic === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = savedPublic;
    if (savedVite === undefined) delete process.env.VITE_PUBLIC_SITE_URL;
    else process.env.VITE_PUBLIC_SITE_URL = savedVite;
    expect(preview).toMatchObject({
      template: "gallery_delivery",
      to: "ops+deliveryqa@iconicimagestx.com",
      subject: "Your gallery is ready: 100 Playtest Lane, Austin, TX 78701",
      galleryUrl: "https://iconicimagestx.vercel.app/gallery/playtest-delivery-qa-gallery",
      paymentUrl: "https://iconicimagestx.vercel.app/invoice/playtest-delivery-qa-invoice?t=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
      invoiceAmount: "$1.00",
    });

    const source = readFileSync(new URL("./qa-send-delivery.ts", import.meta.url), "utf8");
    expect(source).toContain("deliverGalleryToClient");
    expect(source).not.toMatch(/nodemailer|createTransport|sendMail\s*\(/);
    expect(source).not.toMatch(/CLIENT_NOTIFY_LIVE\s*=/);
    const call = source.indexOf('await import("../server/services/galleryDeliver.ts")');
    expect(call).toBeGreaterThan(source.indexOf("process.exit(0)"));
    expect(call).toBeGreaterThan(source.indexOf("deliveryQaSendRefusals"));

    const stdout = execFileSync(
      fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url)),
      ["scripts/qa-send-delivery.ts", "--playtest", "--dry-run"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: {
          ...process.env,
          APP_URL: "https://www.iconicimagestx.com",
          PUBLIC_SITE_URL: "",
          VITE_PUBLIC_SITE_URL: "",
        },
        encoding: "utf8",
      },
    );
    expect(stdout).toBe(formatDeliveryQaSendDryRun(preview));
    expect(stdout).toContain("No email sent.");
    expect(stdout).toContain("SMTP_PASS is a Vercel secret");
    expect(stdout).toContain("Deliver Gallery");
    expect(source).toContain("SMTP_PASS is a Vercel secret");
  });
});

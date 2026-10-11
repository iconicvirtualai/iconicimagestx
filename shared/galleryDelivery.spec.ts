import { afterEach, describe, expect, it } from "vitest";
import {
  galleryDeliveredHistoryEntry,
  galleryDeliveryPayUrl,
  galleryDeliverySubject,
  galleryDeliveryUrl,
} from "./galleryDelivery";

const ENV = { PUBLIC_SITE_URL: "https://links.example" };
const savedAppUrl = process.env.APP_URL;

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = savedAppUrl;
});

describe("gallery delivery notice", () => {
  it("leads the subject with Your gallery is ready and adds the address when it exists", () => {
    expect(galleryDeliverySubject("123 Main St")).toBe("Your gallery is ready: 123 Main St");
    expect(galleryDeliverySubject("  ")).toBe("Your gallery is ready");
    expect(galleryDeliverySubject("the property")).toBe("Your gallery is ready");
    expect(galleryDeliverySubject("123 Main St").startsWith("Your gallery is ready")).toBe(true);
  });

  it("builds the gallery link from the public site, not APP_URL", () => {
    process.env.APP_URL = "https://www.iconicimagestx.com";
    const url = galleryDeliveryUrl("gallery-1", ENV);
    expect(url).toBe("https://links.example/gallery/gallery-1");
    expect(url).not.toContain("iconicimagestx.com");
    expect(url).not.toContain("APP_URL");
  });

  it("includes a tokenized pay link only for an unpaid invoice", () => {
    expect(galleryDeliveryPayUrl({ id: "invAutoId0000000001", status: "sent", payToken: "tok" }, ENV)).toBe(
      "https://links.example/invoice/invAutoId0000000001?t=tok",
    );
    expect(galleryDeliveryPayUrl({ id: "invAutoId0000000001", status: "paid", payToken: "tok" }, ENV)).toBeNull();
    expect(galleryDeliveryPayUrl({ id: "listing_abc", status: "sent" }, ENV)).toBeNull();
    expect(galleryDeliveryPayUrl({ id: "ordreq_abc", status: "sent" }, ENV)).toBeNull();
  });

  it("records who delivered, who was addressed, and whether the gate held the email", () => {
    const entry = galleryDeliveredHistoryEntry({
      at: "2026-10-11T02:00:00.000Z",
      actor: { name: "Cadi", email: "cadi@iconicimagestx.com" },
      recipients: ["ada@example.com"],
      email: "suppressed",
    });
    expect(entry).toMatchObject({
      action: "Gallery delivered",
      by: "Cadi (cadi@iconicimagestx.com)",
      at: "2026-10-11T02:00:00.000Z",
      recipients: ["ada@example.com"],
      email: "suppressed",
    });
    expect(entry.details).toContain("ada@example.com");
    expect(entry.details).toContain("suppressed by the notify gate");
  });
});

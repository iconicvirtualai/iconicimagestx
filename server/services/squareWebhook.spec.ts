import { describe, expect, it } from "vitest";
import {
  signSquareWebhook,
  squareWebhookNotificationUrls,
  squareWebhookRawBody,
  squareWebhookSignatureValid,
  SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL,
  SQUARE_WEBHOOK_VERCEL_URL,
} from "./squareWebhook";

const KEY = "square-key";
const VERCEL_URL = SQUARE_WEBHOOK_VERCEL_URL;

describe("Square webhook signature", () => {
  it("accepts the HMAC of the notification URL plus the raw body", () => {
    const raw = "{\"type\":\"payment.updated\"}";
    const signature = signSquareWebhook(raw, KEY, VERCEL_URL);
    expect(squareWebhookSignatureValid(raw, signature, KEY, VERCEL_URL)).toBe(true);
    expect(squareWebhookSignatureValid(`${raw} `, signature, KEY, VERCEL_URL)).toBe(false);
    expect(squareWebhookSignatureValid(raw, signature, "other-key", VERCEL_URL)).toBe(false);
    expect(squareWebhookSignatureValid(raw, signature, KEY, "https://www.iconicimagestx.com/api/payments/square-webhook")).toBe(false);
    expect(squareWebhookSignatureValid(raw, undefined, KEY, VERCEL_URL)).toBe(false);
  });

  it("verifies a vercel.app signature from the production candidate list", () => {
    const raw = "{\"type\":\"payment.updated\",\"note\":\"a\\/b\"}";
    const signature = signSquareWebhook(raw, KEY, VERCEL_URL);
    const urls = squareWebhookNotificationUrls({
      APP_URL: "https://iconicimagestx.com",
      FRONTEND_URL: "https://iconicimagestx.com",
    });
    expect(urls).toContain(VERCEL_URL);
    expect(urls).toContain(SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL);
    expect(urls.some((url) => squareWebhookSignatureValid(raw, signature, KEY, url))).toBe(true);
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(reserialized).not.toBe(raw);
    expect(urls.some((url) => squareWebhookSignatureValid(reserialized, signature, KEY, url))).toBe(false);
  });

  it("keeps iconicimagestx.com and an explicit notification URL", () => {
    const raw = "{\"type\":\"payment.updated\"}";
    const custom = signSquareWebhook(raw, KEY, SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL);
    const explicitUrl = "https://hooks.example/api/payments/square-webhook";
    const explicit = signSquareWebhook(raw, KEY, explicitUrl);
    const urls = squareWebhookNotificationUrls({
      SQUARE_WEBHOOK_NOTIFICATION_URL: ` ${explicitUrl} `,
      VERCEL_PROJECT_PRODUCTION_URL: "iconicimagestx.vercel.app",
      APP_URL: "https://iconicimagestx.com/",
      FRONTEND_URL: "https://www.iconicimagestx.com",
    });
    expect(urls).toEqual([
      explicitUrl,
      VERCEL_URL,
      SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL,
      "https://www.iconicimagestx.com/api/payments/square-webhook",
    ]);
    expect(urls.some((url) => squareWebhookSignatureValid(raw, custom, KEY, url))).toBe(true);
    expect(urls.some((url) => squareWebhookSignatureValid(raw, explicit, KEY, url))).toBe(true);
  });

  it("accepts a scheme-less VERCEL_PROJECT_PRODUCTION_URL", () => {
    const raw = "{\"ok\":true}";
    const url = "https://custom.vercel.app/api/payments/square-webhook";
    const signature = signSquareWebhook(raw, KEY, url);
    const urls = squareWebhookNotificationUrls({
      VERCEL_PROJECT_PRODUCTION_URL: "custom.vercel.app",
    });
    expect(urls).toContain(url);
    expect(urls).toContain(VERCEL_URL);
    expect(urls).toContain(SQUARE_WEBHOOK_CUSTOM_DOMAIN_URL);
    expect(urls.some((candidate) => squareWebhookSignatureValid(raw, signature, KEY, candidate))).toBe(true);
  });

  it("refuses a parsed object in place of the raw body", () => {
    expect(squareWebhookRawBody(Buffer.from("{\"ok\":true}"))).toBe("{\"ok\":true}");
    expect(squareWebhookRawBody("{\"ok\":true}")).toBe("{\"ok\":true}");
    expect(squareWebhookRawBody(Uint8Array.from(Buffer.from("{\"ok\":true}")))).toBe("{\"ok\":true}");
    expect(squareWebhookRawBody({ ok: true })).toBeNull();
    expect(squareWebhookRawBody(null)).toBeNull();
  });
});

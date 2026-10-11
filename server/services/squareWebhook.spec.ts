import { describe, expect, it } from "vitest";
import {
  signSquareWebhook,
  squareWebhookRawBody,
  squareWebhookSignatureValid,
} from "./squareWebhook";

describe("Square webhook signature", () => {
  it("accepts the HMAC of the notification URL plus the raw body", () => {
    const raw = "{\"type\":\"payment.updated\"}";
    const key = "square-key";
    const url = "https://iconicimagestx.vercel.app/api/payments/square-webhook";
    const signature = signSquareWebhook(raw, key, url);
    expect(squareWebhookSignatureValid(raw, signature, key, url)).toBe(true);
    expect(squareWebhookSignatureValid(`${raw} `, signature, key, url)).toBe(false);
    expect(squareWebhookSignatureValid(raw, signature, "other-key", url)).toBe(false);
    expect(squareWebhookSignatureValid(raw, signature, key, "https://www.iconicimagestx.com/api/payments/square-webhook")).toBe(false);
    expect(squareWebhookSignatureValid(raw, undefined, key, url)).toBe(false);
  });

  it("refuses a parsed object in place of the raw body", () => {
    expect(squareWebhookRawBody(Buffer.from("{\"ok\":true}"))).toBe("{\"ok\":true}");
    expect(squareWebhookRawBody("{\"ok\":true}")).toBe("{\"ok\":true}");
    expect(squareWebhookRawBody({ ok: true })).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientNotifyLive, emailAllowed, smsAllowed } from "../clientNotify";
import { marketingPublicUrl, marketingSendLive } from "./sendGate";

describe("marketing send switch", () => {
  it("is on only when MARKETING_SEND_LIVE is exactly true", () => {
    expect(marketingSendLive({})).toBe(false);
    expect(marketingSendLive({ MARKETING_SEND_LIVE: "TRUE" })).toBe(false);
    expect(marketingSendLive({ CLIENT_NOTIFY_LIVE: "true" })).toBe(false);
    expect(marketingSendLive({ MARKETING_SEND_LIVE: "true", CLIENT_NOTIFY_LIVE: "" })).toBe(true);
    expect(marketingSendLive({ MARKETING_SEND_LIVE: "true", CLIENT_COMMS_ZONE: "RED" })).toBe(true);
  });

  it("does not let MARKETING_SEND_LIVE open client email, SMS, or the old campaign gate", () => {
    const env = { MARKETING_SEND_LIVE: "true" };
    expect(clientNotifyLive(env)).toBe(false);
    for (const template of ["gallery_delivery", "invoice", "account_password_setup", "order_confirmed", "manual_message", "marketing"]) {
      expect(emailAllowed(template, env)).toBe(false);
    }
    expect(smsAllowed("reminder", env)).toBe(false);
    expect(smsAllowed(undefined, env)).toBe(false);
    expect(emailAllowed("booking_received", env)).toBe(true);
    expect(smsAllowed("booking_confirmation", env)).toBe(true);
  });

  it("keeps the GMass routes off clientNotify and leaves the other senders on it", () => {
    const marketing = readFileSync(new URL("../../server/routes/marketingCampaigns.ts", import.meta.url), "utf8");
    expect(marketing).toContain("marketingSendLive(");
    expect(marketing).not.toContain("clientNotifyLive");
    expect(marketing).not.toContain("emailAllowed");
    expect(marketing).not.toContain("CLIENT_NOTIFY_LIVE");

    for (const file of [
      "../../server/routes/campaigns.ts",
      "../../server/routes/bookings.ts",
      "../../server/routes/payments.ts",
      "../../server/services/email.ts",
      "../../server/services/sms.ts",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).toMatch(/clientNotifyLive|emailAllowed|smsAllowed/);
      expect(source).not.toContain("MARKETING_SEND_LIVE");
      expect(source).not.toContain("marketingSendLive");
    }
  });
});

describe("marketing public links", () => {
  it("uses MARKETING_PUBLIC_URL and falls back to APP_URL", () => {
    expect(marketingPublicUrl({
      MARKETING_PUBLIC_URL: "https://iconicimagestx.vercel.app/",
      APP_URL: "https://www.iconicimagestx.com",
    })).toBe("https://iconicimagestx.vercel.app");
    expect(marketingPublicUrl({
      APP_URL: "https://www.iconicimagestx.com/",
      FRONTEND_URL: "https://ignored.example",
    })).toBe("https://www.iconicimagestx.com");
    expect(marketingPublicUrl({}, "http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
  });
});

import { describe, expect, it } from "vitest";
import { studioQueueTickRequest } from "./studioQueueKick";

describe("studio queue follow-up", () => {
  it("builds one chained tick when the app URL and cron secret are set", () => {
    const request = studioQueueTickRequest({
      APP_URL: "https://iconicimagestx.com/",
      CRON_SECRET: "cron-secret",
    }, "listing1234");
    expect(request?.url).toBe("https://iconicimagestx.com/api/studio/order-queue/tick");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.headers.Authorization).toBe("Bearer cron-secret");
    expect(JSON.parse(request?.init.body || "{}")).toEqual({ listingId: "listing1234", chain: true });
  });

  it("does not dispatch a follow-up without a secret or base URL", () => {
    expect(studioQueueTickRequest({ APP_URL: "https://iconicimagestx.com" }, "listing1234")).toBeNull();
    expect(studioQueueTickRequest({ CRON_SECRET: "cron-secret" }, "listing1234")).toBeNull();
    expect(studioQueueTickRequest({ APP_URL: "https://iconicimagestx.com", CRON_SECRET: "cron-secret" }, "  ")).toBeNull();
  });
});

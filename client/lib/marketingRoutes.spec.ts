import { describe, expect, it } from "vitest";
import { marketingPathForLegacy } from "./marketingRoutes";

describe("marketing route redirects", () => {
  const cases: [string, string][] = [
    ["/admin/communications/email", "/admin/marketing"],
    ["/admin/communications/email/contacts", "/admin/marketing/contacts"],
    ["/admin/communications/email/contacts/view", "/admin/marketing/contacts/view"],
    ["/admin/communications/email/import", "/admin/marketing/import"],
    ["/admin/communications/email/segments", "/admin/marketing/segments"],
    ["/admin/communications/email/suppression", "/admin/marketing/suppression"],
    ["/admin/communications/email/account", "/admin/marketing/account"],
    ["/admin/communications/email/campaigns", "/admin/marketing/campaigns"],
    ["/admin/communications/email/campaigns/new", "/admin/marketing/campaigns/email/new"],
    ["/admin/communications/email/campaigns/abc/report", "/admin/marketing/campaigns/email/abc/report"],
    ["/admin/communications/email/campaigns/abc", "/admin/marketing/campaigns/email/abc"],
    ["/admin/campaigns", "/admin/marketing/campaigns"],
    ["/admin/campaigns/calendar", "/admin/marketing/campaigns/calendar"],
    ["/admin/campaigns/spring-listing-refresh", "/admin/marketing/campaigns/spring-listing-refresh"],
  ];

  it.each(cases)("sends %s to %s", (from, to) => {
    expect(marketingPathForLegacy(from)).toBe(to);
  });

  it("leaves the public unsubscribe page alone", () => {
    expect(marketingPathForLegacy("/unsubscribe")).toBeNull();
    expect(marketingPathForLegacy("/admin/communications")).toBeNull();
  });
});

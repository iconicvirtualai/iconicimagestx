import { describe, expect, it } from "vitest";
import { mostSpecificNavHref, navGroups } from "./adminNav";

const hrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
const labels = navGroups.flatMap((group) => group.items.map((item) => item.label));

describe("admin nav highlight", () => {
  it("highlights the longest matching item and keeps Clients active on a client record", () => {
    expect(mostSpecificNavHref("/admin/customers/abc", hrefs)).toBe("/admin/customers");
    expect(mostSpecificNavHref("/admin/studio", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/ops", hrefs)).toBe("/admin/ops");
    expect(mostSpecificNavHref("/admin/ops/preview", hrefs)).toBe("/admin/ops");
    expect(mostSpecificNavHref("/admin/communications", hrefs)).toBe("/admin/communications");
    expect(mostSpecificNavHref("/admin/marketing/campaigns/calendar", hrefs)).toBe("/admin/marketing/campaigns");
    expect(mostSpecificNavHref("/admin/marketing/contacts/view", hrefs)).toBe("/admin/marketing/contacts");
    expect(mostSpecificNavHref("/admin/botroom", hrefs)).toBe("/admin/botroom");
    expect(mostSpecificNavHref("/admin/botroom/connect", hrefs)).toBe("/admin/botroom");
  });
});

describe("studio nav", () => {
  it("keeps one Studio entry and one shoot list, with My jobs for photographers", () => {
    expect(labels.filter((label) => label === "Studio")).toEqual(["Studio"]);
    expect(hrefs.filter((href) => href === "/admin/studio")).toEqual(["/admin/studio"]);
    expect(labels).not.toContain("Iconic Studio");
    expect(labels).not.toContain("Scratch Pad");
    expect(labels).not.toContain("Delivery");
    expect(labels).not.toContain("Photographer");
    expect(labels).not.toContain("Upload");
    expect(hrefs).not.toContain("/admin/iconic-studio");
    expect(hrefs).not.toContain("/admin/studio/scratch");
    expect(hrefs).not.toContain("/admin/delivery");
    expect(hrefs).not.toContain("/admin/upload");
    const shoots = navGroups.flatMap((group) => group.items).find((item) => item.href === "/admin/ops");
    const mine = navGroups.flatMap((group) => group.items).find((item) => item.href === "/admin/photographer");
    expect(shoots?.label).toBe("Shoots");
    expect(shoots?.roles).toEqual(["admin", "coordinator", "editor"]);
    expect(mine?.label).toBe("My jobs");
    expect(mine?.roles).toEqual(["photographer"]);
    expect(labels).toEqual(expect.arrayContaining([
      "Shoots",
      "My jobs",
      "Prices",
      "Invoice Presets",
      "Projects",
      "Events",
    ]));
    expect(labels.filter((label) => label === "Prices")).toEqual(["Prices"]);
    expect(labels).not.toContain("Booking catalog");
    expect(labels).not.toContain("Pricing");
    expect(hrefs).not.toContain("/admin/booking-catalog");
    expect(hrefs).not.toContain("/admin/current-pricing");
    expect(hrefs).toContain("/admin/pricing");
    expect(hrefs).toContain("/admin/events");
    expect(hrefs).not.toContain("/admin/holiday-rsvps");
    expect(mostSpecificNavHref("/admin/events/thankful-2026", hrefs)).toBe("/admin/events");
  });

  it("highlights Studio on photo editing, projects, and marketing kits", () => {
    expect(mostSpecificNavHref("/admin/studio/scratch", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/editing", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/projects", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/marketing", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/iconic-studio/listing1", hrefs)).toBeNull();
  });
});

describe("marketing nav", () => {
  it("keeps Insights and the social queue under Marketing", () => {
    const marketing = navGroups.find((group) => group.label === "Marketing");
    const insights = marketing?.items.find((item) => item.href === "/admin/insights");
    const queue = marketing?.items.find((item) => item.href === "/admin/insights/social");
    const operations = navGroups.find((group) => group.label === "Operations");
    expect(insights?.label).toBe("Insights");
    expect(insights?.roles).toEqual(["admin"]);
    expect(queue?.label).toBe("Social queue");
    expect(queue?.roles).toEqual(["admin"]);
    expect(operations?.items.some((item) => item.href === "/admin/insights")).toBe(false);
    expect(operations?.items.some((item) => item.href === "/admin/communications/email")).toBe(false);
    expect(marketing?.items.map((item) => item.label)).toEqual(expect.arrayContaining([
      "Campaigns",
      "Contacts",
      "Segments",
      "Do not contact",
      "Reports",
      "Account",
    ]));
    expect(mostSpecificNavHref("/admin/insights", hrefs)).toBe("/admin/insights");
    expect(mostSpecificNavHref("/admin/insights/social", hrefs)).toBe("/admin/insights/social");
  });
});

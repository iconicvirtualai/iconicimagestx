import { describe, expect, it } from "vitest";
import { mostSpecificNavHref, navGroups } from "./adminNav";

const hrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
const labels = navGroups.flatMap((group) => group.items.map((item) => item.label));

describe("admin nav highlight", () => {
  it("highlights the longest matching item and keeps Clients active on a client record", () => {
    expect(mostSpecificNavHref("/admin/customers/abc", hrefs)).toBe("/admin/customers");
    expect(mostSpecificNavHref("/admin/studio", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/delivery", hrefs)).toBe("/admin/delivery");
    expect(mostSpecificNavHref("/admin/communications", hrefs)).toBe("/admin/communications");
    expect(mostSpecificNavHref("/admin/communications/email/contacts", hrefs)).toBe("/admin/communications/email");
    expect(mostSpecificNavHref("/admin/botroom", hrefs)).toBe("/admin/botroom");
    expect(mostSpecificNavHref("/admin/botroom/connect", hrefs)).toBe("/admin/botroom");
  });
});

describe("studio nav", () => {
  it("keeps one Studio entry and leaves delivery, photographer, booking, and invoices in place", () => {
    expect(labels.filter((label) => label === "Studio")).toEqual(["Studio"]);
    expect(hrefs.filter((href) => href === "/admin/studio")).toEqual(["/admin/studio"]);
    expect(labels).not.toContain("Iconic Studio");
    expect(labels).not.toContain("Scratch Pad");
    expect(hrefs).not.toContain("/admin/iconic-studio");
    expect(hrefs).not.toContain("/admin/studio/scratch");
    expect(labels).toEqual(expect.arrayContaining([
      "Delivery",
      "Photographer",
      "Upload",
      "Booking catalog",
      "Invoice Presets",
      "Projects",
      "Holiday RSVPs",
    ]));
    expect(hrefs).toContain("/admin/holiday-rsvps");
    expect(mostSpecificNavHref("/admin/holiday-rsvps", hrefs)).toBe("/admin/holiday-rsvps");
  });

  it("highlights Studio on photo editing, projects, and marketing kits", () => {
    expect(mostSpecificNavHref("/admin/studio/scratch", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/editing", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/projects", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/marketing", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/iconic-studio/listing1", hrefs)).toBeNull();
  });
});

describe("insights nav", () => {
  it("keeps the creator and social queue under Operations for admins", () => {
    const operations = navGroups.find((group) => group.label === "Operations");
    const insights = operations?.items.find((item) => item.href === "/admin/insights");
    const queue = operations?.items.find((item) => item.href === "/admin/insights/social");
    expect(insights?.label).toBe("Insights");
    expect(insights?.roles).toEqual(["admin"]);
    expect(queue?.label).toBe("Social queue");
    expect(queue?.roles).toEqual(["admin"]);
    expect(mostSpecificNavHref("/admin/insights", hrefs)).toBe("/admin/insights");
    expect(mostSpecificNavHref("/admin/insights/social", hrefs)).toBe("/admin/insights/social");
  });
});

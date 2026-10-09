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
    ]));
  });

  it("highlights Studio on photo editing, projects, and marketing kits", () => {
    expect(mostSpecificNavHref("/admin/studio/scratch", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/editing", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/projects", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/studio/marketing", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/iconic-studio/listing1", hrefs)).toBeNull();
  });
});

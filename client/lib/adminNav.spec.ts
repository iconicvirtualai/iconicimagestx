import { describe, expect, it } from "vitest";
import { mostSpecificNavHref } from "./adminNav";

describe("admin nav highlight", () => {
  it("keeps Studio quiet on the scratch pad and still highlights Clients on a client record", () => {
    const hrefs = ["/admin/studio", "/admin/studio/scratch", "/admin/customers", "/admin/iconic-studio"];
    expect(mostSpecificNavHref("/admin/studio/scratch", hrefs)).toBe("/admin/studio/scratch");
    expect(mostSpecificNavHref("/admin/studio", hrefs)).toBe("/admin/studio");
    expect(mostSpecificNavHref("/admin/customers/abc", hrefs)).toBe("/admin/customers");
    expect(mostSpecificNavHref("/admin/iconic-studio/listing1", hrefs)).toBe("/admin/iconic-studio");
  });
});

import { describe, expect, it } from "vitest";
import { canSendMarketing, hasMarketingPermission, marketingPermissionsForRole } from "./permissions";

describe("marketing permissions", () => {
  it("gives admins view, manage, and send", () => {
    expect(marketingPermissionsForRole("admin")).toEqual(["view", "manage", "send"]);
    expect(canSendMarketing("admin")).toBe(true);
  });

  it("keeps every other role out, including coordinators", () => {
    for (const role of ["coordinator", "photographer", "editor", undefined, "marketer"]) {
      expect(marketingPermissionsForRole(role)).toEqual([]);
      expect(hasMarketingPermission(role, "view")).toBe(false);
      expect(canSendMarketing(role)).toBe(false);
    }
  });
});

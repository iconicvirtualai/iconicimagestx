import { describe, expect, it } from "vitest";
import { ownerLoginNext } from "./openOwnerSession";

describe("ownerLoginNext", () => {
  it("honors only the owner page", () => {
    expect(ownerLoginNext("?next=/admin/owners")).toBe("/admin/owners");
    expect(ownerLoginNext("?next=%2Fadmin%2Fowners%2F")).toBe("/admin/owners");
    expect(ownerLoginNext("?next=/owners")).toBe("/admin/owners");
  });

  it("ignores anything else", () => {
    expect(ownerLoginNext("")).toBeNull();
    expect(ownerLoginNext("?next=https://evil.example/admin/owners")).toBeNull();
    expect(ownerLoginNext("?next=//evil.example")).toBeNull();
    expect(ownerLoginNext("?next=/admin/dashboard")).toBeNull();
  });
});

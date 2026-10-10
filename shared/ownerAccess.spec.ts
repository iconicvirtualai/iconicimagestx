import { describe, expect, it } from "vitest";
import { INTENDED_OWNER_EMAIL, isOwnerEmail, ownerAllowlist } from "./ownerAccess";

describe("owner allowlist", () => {
  it("denies everyone when OWNER_EMAILS is missing or blank", () => {
    expect(ownerAllowlist(undefined)).toEqual([]);
    expect(ownerAllowlist(null)).toEqual([]);
    expect(ownerAllowlist("")).toEqual([]);
    expect(ownerAllowlist("   ")).toEqual([]);
    expect(isOwnerEmail(INTENDED_OWNER_EMAIL, ownerAllowlist(undefined))).toBe(false);
  });

  it("parses the intended owner and extra addresses without using role", () => {
    const allow = ownerAllowlist(` ${INTENDED_OWNER_EMAIL}, Other@Example.com `);
    expect(allow).toEqual([INTENDED_OWNER_EMAIL, "other@example.com"]);
    expect(isOwnerEmail("Cadi@IconicImagesTX.com", allow)).toBe(true);
    expect(isOwnerEmail("admin@iconicimagestx.com", allow)).toBe(false);
    expect(isOwnerEmail("", allow)).toBe(false);
  });
});

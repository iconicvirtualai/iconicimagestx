import { describe, expect, it } from "vitest";
import { contactThreadIdFromSearch } from "./contactThread";

describe("contact thread deep link", () => {
  it("accepts the staff email thread id and rejects the communications index", () => {
    const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(contactThreadIdFromSearch(`/admin/messages?tab=contact&thread=${id}`.slice("/admin/messages".length))).toBe(id);
    expect(contactThreadIdFromSearch("?tab=contact")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { isPublicApiOrigin } from "./publicCors";

describe("public API origins", () => {
  it("allows the Wix site and the HTML component iframe", () => {
    expect(isPublicApiOrigin(undefined)).toBe(true);
    expect(isPublicApiOrigin("https://www.iconicimagestx.com")).toBe(true);
    expect(isPublicApiOrigin("https://iconicimagestx.com")).toBe(true);
    expect(isPublicApiOrigin("https://www-iconicimagestx-com.filesusr.com")).toBe(true);
    expect(isPublicApiOrigin("https://iconicimagestx-com.filesusr.com")).toBe(true);
    expect(isPublicApiOrigin("https://iconicimagestx.wixsite.com")).toBe(true);
    expect(isPublicApiOrigin("https://preview.example", "https://preview.example")).toBe(true);
  });

  it("rejects other sites, including lookalike Wix hosts", () => {
    expect(isPublicApiOrigin("https://evil.example")).toBe(false);
    expect(isPublicApiOrigin("https://noticonicimagestx.filesusr.com")).toBe(false);
    expect(isPublicApiOrigin("https://www-iconicimagestx-com.filesusr.com.evil.test")).toBe(false);
    expect(isPublicApiOrigin("https://other.wixsite.com")).toBe(false);
    expect(isPublicApiOrigin("http://www-iconicimagestx-com.filesusr.com")).toBe(false);
    expect(isPublicApiOrigin("https://www.iconicimagestx.com/ordericonic")).toBe(false);
  });
});

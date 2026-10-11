import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_SITE_URL, publicClientUrl, publicSiteUrl } from "./publicSiteUrl";

const KEYS = ["PUBLIC_SITE_URL", "VITE_PUBLIC_SITE_URL", "APP_URL"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("publicSiteUrl", () => {
  it("uses PUBLIC_SITE_URL when set and trims trailing slashes", () => {
    expect(publicSiteUrl({ PUBLIC_SITE_URL: "https://preview.example/" })).toBe("https://preview.example");
    expect(publicSiteUrl({ PUBLIC_SITE_URL: "https://preview.example///" })).toBe("https://preview.example");
  });

  it("defaults to the vercel app when unset and ignores APP_URL", () => {
    process.env.APP_URL = "https://iconicimagestx.com";
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.VITE_PUBLIC_SITE_URL;
    expect(publicSiteUrl()).toBe(DEFAULT_PUBLIC_SITE_URL);
    expect(publicSiteUrl()).toBe("https://iconicimagestx.vercel.app");
    expect(publicSiteUrl()).not.toContain("iconicimagestx.com");
    expect(publicClientUrl("/gallery/abc")).toBe("https://iconicimagestx.vercel.app/gallery/abc");
  });

  it("prefers PUBLIC_SITE_URL over the vite value", () => {
    expect(publicSiteUrl({
      PUBLIC_SITE_URL: "https://from-public.example",
      VITE_PUBLIC_SITE_URL: "https://from-vite.example",
    })).toBe("https://from-public.example");
  });

  it("requires https", () => {
    expect(() => publicSiteUrl({ PUBLIC_SITE_URL: "http://iconicimagestx.vercel.app" })).toThrow(/https/);
    expect(() => publicSiteUrl({ PUBLIC_SITE_URL: "iconicimagestx.com" })).toThrow(/https/);
  });
});

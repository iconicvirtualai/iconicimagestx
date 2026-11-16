import { describe, expect, it } from "vitest";
import { isExpiringStorageUrl, isProfileMediaPath, storagePathFromUrl } from "./profileMedia";

describe("profile media urls", () => {
  it("keeps a download-token url and rejects a signed url", () => {
    const durable = "https://firebasestorage.googleapis.com/v0/b/bucket/o/client-hub%2Fada%2Fhead.png?alt=media&token=abc";
    expect(isExpiringStorageUrl(durable)).toBe(false);
    expect(storagePathFromUrl(durable)).toBe("client-hub/ada/head.png");
    const signed = "https://storage.googleapis.com/bucket/client-hub/ada/head.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=3600&X-Goog-Signature=abc";
    expect(isExpiringStorageUrl(signed)).toBe(true);
    expect(storagePathFromUrl(signed)).toBe("client-hub/ada/head.png");
  });

  it("accepts only the app media path", () => {
    expect(isProfileMediaPath("/api/clients/profile-media/" + "a".repeat(32))).toBe(true);
    expect(isProfileMediaPath("/api/clients/profile-media/short")).toBe(false);
    expect(isProfileMediaPath("https://cdn.example/head.png")).toBe(false);
  });
});

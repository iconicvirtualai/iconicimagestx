import { describe, expect, it } from "vitest";
import { readSetupSecret, secretsMatch } from "./playtestPolicy";
import {
  clientCanViewListing,
  contentTypeForUpload,
  isListingStoragePath,
  staffCanAccessListing,
} from "../../shared/listingAccess";
import { isTempAdminEnabled } from "../../shared/tempAdmin";

describe("temp admin lock", () => {
  it("stays off on hosted deploys even when the flag is set", () => {
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", VERCEL: "1" })).toBe(false);
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", VERCEL_ENV: "preview" })).toBe(false);
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", NODE_ENV: "production" })).toBe(false);
  });

  it("requires the explicit flag outside production", () => {
    expect(isTempAdminEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", NODE_ENV: "development" })).toBe(true);
  });
});

describe("staff setup secret", () => {
  it("rejects a missing or mismatched secret", () => {
    expect(secretsMatch(undefined, "expected")).toBe(false);
    expect(secretsMatch("nope", "expected")).toBe(false);
    expect(secretsMatch("", "expected")).toBe(false);
  });

  it("accepts an exact secret", () => {
    expect(secretsMatch("playtest-secret", "playtest-secret")).toBe(true);
    expect(readSetupSecret([" secret "])).toBe("secret");
  });
});

describe("listing upload access", () => {
  const listing = {
    photographerUid: "photo-1",
    photographerIds: ["photo-1"],
    clientId: "client-1",
    clientEmail: "client@example.com",
  };

  it("lets the assigned photographer upload and blocks everyone else", () => {
    expect(staffCanAccessListing("photographer", "photo-1", listing)).toBe(true);
    expect(staffCanAccessListing("photographer", "other", listing)).toBe(false);
    expect(staffCanAccessListing("admin", "admin-1", listing)).toBe(true);
  });

  it("lets the owning client open the project", () => {
    expect(clientCanViewListing(listing, { uid: "client-1", ids: ["client-1"] })).toBe(true);
    expect(clientCanViewListing(listing, { uid: "other", email: "client@example.com", ids: ["other"] })).toBe(true);
    expect(clientCanViewListing(listing, { uid: "stranger", email: "nope@example.com" })).toBe(false);
  });

  it("only accepts photo and raw paths for that listing", () => {
    expect(isListingStoragePath("job1", "listings/job1/photos/1_a.jpg")).toBe(true);
    expect(isListingStoragePath("job1", "listings/job1/raw/1_a.CR2")).toBe(true);
    expect(isListingStoragePath("job1", "listings/other/photos/1_a.jpg")).toBe(false);
    expect(isListingStoragePath("job1", "listings/job1/../staff/secret")).toBe(false);
    expect(contentTypeForUpload("frame.JPG", "")).toBe("image/jpeg");
  });
});

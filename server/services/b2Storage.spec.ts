import { describe, expect, it } from "vitest";
import { b2ClientConfig } from "./b2Storage";

describe("Backblaze client config", () => {
  it("points the S3 client at the B2 endpoint with path-style addressing and checksums off unless required", () => {
    expect(b2ClientConfig({})).toBeNull();
    expect(b2ClientConfig({
      B2_ENDPOINT: "http://s3.us-west-004.backblazeb2.com",
      B2_REGION: "us-west-004",
      B2_BUCKET: "iconic-media",
      B2_KEY_ID: "key",
      B2_APPLICATION_KEY: "secret",
    })).toBeNull();
    const config = b2ClientConfig({
      B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
      B2_REGION: "us-west-004",
      B2_BUCKET: "iconic-media",
      B2_KEY_ID: "key",
      B2_APPLICATION_KEY: "secret",
    });
    expect(config).toMatchObject({
      endpoint: "https://s3.us-west-004.backblazeb2.com",
      region: "us-west-004",
      bucket: "iconic-media",
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  });
});

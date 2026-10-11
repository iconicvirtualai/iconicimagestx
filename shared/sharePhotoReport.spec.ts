import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatSharePhotoReport, sharePhotoFixtureScan, sharePhotoReports } from "./sharePhotoReport";

describe("share photo report", () => {
  it("counts tagged photos as kept and skips playtest listings", () => {
    const report = sharePhotoReports(sharePhotoFixtureScan());
    expect(report.skippedPlaytest).toBe(1);
    const mls = report.listings.find((item) => item.id === "listing-mls-only-real");
    expect(mls?.today).toBe(0);
    expect(mls?.kept).toBe(2);
    expect(mls?.photos.map((photo) => photo.kept)).toEqual(["keep", "keep"]);
    const mixed = report.listings.find((item) => item.id === "listing-mixed-real");
    expect(mixed?.today).toBe(2);
    expect(mixed?.kept).toBe(3);
    const printed = formatSharePhotoReport(sharePhotoFixtureScan(), "fixtures");
    expect(printed).toContain("Firebase project: fixtures");
    expect(printed).toContain("No documents were written.");
    expect(printed).toContain("Listings that would have been blank under the old drop rules: 1");
    expect(printed).not.toContain("playtest-delivery-qa");
    expect(printed).not.toContain("secret.jpg");

    const source = readFileSync(new URL("../scripts/report-share-photos.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.(set|update|delete|create)\s*\(/);
    expect(source).not.toMatch(/\bbatch\s*\(/);
    expect(source).not.toMatch(/\bcommit\s*\(/);
    expect(source).not.toMatch(/writeBatch/);
    expect(source).not.toMatch(/FieldValue/);
  });

  it("runs the fixture report without reading Firebase", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/report-share-photos.ts", "--fixtures"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        env: {
          ...process.env,
          FIREBASE_SERVICE_ACCOUNT: "not-json",
          GOOGLE_APPLICATION_CREDENTIALS: "",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Firebase project: fixtures");
    expect(result.stdout).toContain("listing-mls-only-real");
    expect(result.stdout).not.toContain("playtest-delivery-qa");
  });
});

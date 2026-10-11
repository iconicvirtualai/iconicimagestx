import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGAL_BUSINESS_NAME, businessContactJsonLd } from "./businessContact.ts";
import { ICONIC_BUSINESS } from "./iconicBusiness.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["client", "server", "shared", "public", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
/** This file names the retired entity only as a split needle, and is excluded from the scan. */
const THIS_TEST = "shared/legalBusinessName.spec.ts";
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".mp4", ".webm",
  ".woff", ".woff2", ".zip", ".gz", ".mp3", ".mov",
]);
const RETIRED_LEGAL_NAME = ["Iconic Images", "Inc"].join(" ");

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (rel === THIS_TEST) continue;
      found.push(rel);
    }
  };
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir));
  return found;
}

describe("legal business name", () => {
  it("is exactly Iconic Images Photography, LLC", () => {
    expect(LEGAL_BUSINESS_NAME).toBe("Iconic Images Photography, LLC");
    expect(ICONIC_BUSINESS.entity).toBe(LEGAL_BUSINESS_NAME);
    expect(businessContactJsonLd().legalName).toBe(LEGAL_BUSINESS_NAME);
    for (const rel of [
      "client/components/Footer.tsx",
      "client/lib/legal.ts",
      "client/pages/AdminOrderDetail.tsx",
      "server/services/email.ts",
      "shared/iconicBusiness.ts",
      "shared/siteSeo.ts",
    ]) {
      expect(readFileSync(path.join(ROOT, rel), "utf8"), rel).toContain("LEGAL_BUSINESS_NAME");
    }
    expect(readFileSync(path.join(ROOT, "public/404.html"), "utf8")).toContain(LEGAL_BUSINESS_NAME);
  });

  it("fails when Iconic Images Inc appears in source", () => {
    const needle = RETIRED_LEGAL_NAME.toLowerCase();
    const hits = sourceFiles().filter((rel) =>
      readFileSync(path.join(ROOT, rel), "utf8").toLowerCase().includes(needle),
    );
    expect(hits).toEqual([]);
  });
});

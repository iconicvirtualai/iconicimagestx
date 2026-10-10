import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT, BUSINESS_CONTACT_LINE, businessContactJsonLd } from "./businessContact.ts";
import { iconicBusinessFooterLines } from "./iconicBusiness.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Built files inline the owner allowlist. Scan source, not the bundle,
 * so a public page cannot hide behind that generated file.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", ".vite"]);
const SKIP_FILES = new Set(["api/index.mjs"]);
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".html", ".md", ".json", ".css", ".txt", ".example",
]);

/**
 * Internal-only files that still name the owner login or a staff calendar id.
 * They are not public contact copy. The shooter calendar ids live on the
 * server roster, loaded by signed-in staff, not in the client bundle.
 */
const CADI_ALLOWLIST = new Set([
  "shared/ownerAccess.ts",
  ".env.example",
  "server/services/photographerRoster.ts",
  "server/services/photographerRoster.spec.ts",
  "server/routes/calendarRoster.route.spec.ts",
]);

/** Staff-inbound routing test feeds the hyphenated Google Voice form. Not a public display. */
const HYPHEN_PHONE_ALLOWLIST = new Set(["shared/clientNotify.test.ts"]);

const OLD_PHONE = ["281", "356-0965"].join("-");
const OLD_ADDRESS = ["2219", "Sawdust"].join(" ");
const CADI_NEEDLE = ["cadi", "@"].join("");

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (SKIP_FILES.has(rel)) continue;
      if (entry.name === ".env.example" || SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        found.push(rel);
      }
    }
  };
  walk(ROOT);
  return found;
}

function filesContaining(needle: string): string[] {
  return sourceFiles().filter((rel) => readFileSync(path.join(ROOT, rel), "utf8").includes(needle));
}

describe("public business contact", () => {
  it("keeps the official contact line exactly", () => {
    expect(BUSINESS_CONTACT_LINE).toBe(
      "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com",
    );
    expect(BUSINESS_CONTACT.line).toBe(BUSINESS_CONTACT_LINE);
    expect(BUSINESS_CONTACT.address).toBe("26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380");
    expect(BUSINESS_CONTACT.streetAddress).toBe("26410 Oakridge Dr. Ste 105 - 108");
    expect(BUSINESS_CONTACT.city).toBe("Spring");
    expect(BUSINESS_CONTACT.state).toBe("TX");
    expect(BUSINESS_CONTACT.postalCode).toBe("77380");
    expect(BUSINESS_CONTACT.phoneDisplay).toBe("281.356.0965");
    expect(BUSINESS_CONTACT.phoneHref).toBe("tel:+12813560965");
    expect(BUSINESS_CONTACT.email).toBe("photos@iconicimagestx.com");
  });

  it("prints that contact on invoice footers and LocalBusiness JSON-LD", () => {
    const lines = iconicBusinessFooterLines();
    expect(lines).toContain(BUSINESS_CONTACT.address);
    expect(lines).toContain(BUSINESS_CONTACT.phoneDisplay);
    expect(lines).toContain(BUSINESS_CONTACT.email);
    expect(lines.join("\n")).not.toContain(CADI_NEEDLE);

    const jsonLd = businessContactJsonLd();
    expect(jsonLd["@type"]).toBe("LocalBusiness");
    expect(jsonLd.email).toBe(BUSINESS_CONTACT.email);
    expect(jsonLd.telephone).toBe(BUSINESS_CONTACT.phoneDisplay);
    expect(jsonLd.address.streetAddress).toBe(BUSINESS_CONTACT.streetAddress);
    expect(jsonLd.address.addressLocality).toBe("Spring");
    expect(jsonLd.address.postalCode).toBe("77380");
  });

  it("fails when the owner mailbox appears outside the internal allowlist", () => {
    const hits = filesContaining(CADI_NEEDLE);
    const unexpected = hits.filter((rel) => !CADI_ALLOWLIST.has(rel));
    expect(unexpected).toEqual([]);
    expect(hits.slice().sort()).toEqual([...CADI_ALLOWLIST].sort());
  });

  it("drops the old Sawdust address and the hyphenated public phone", () => {
    expect(filesContaining(OLD_ADDRESS)).toEqual([]);
    const hyphen = filesContaining(OLD_PHONE);
    expect(hyphen.filter((rel) => !HYPHEN_PHONE_ALLOWLIST.has(rel))).toEqual([]);
  });

  it("requires client-facing pages and templates to reference the shared contact", () => {
    const mustReference = [
      "client/components/PublicContactLine.tsx",
      "client/components/LocalBusinessJsonLd.tsx",
      "client/components/LegalContact.tsx",
      "client/components/Footer.tsx",
      "client/components/SmsConsentField.tsx",
      "client/pages/Contact.tsx",
      "client/pages/Privacy.tsx",
      "client/pages/Terms.tsx",
      "client/App.tsx",
      "server/services/email.ts",
      "server/services/sms.ts",
      "seed-email-templates.cjs",
      "functions/seed-email-templates.cjs",
      "public/ordericonic.html",
    ];
    for (const rel of mustReference) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      const usesConstant = source.includes("BUSINESS_CONTACT")
        || source.includes(BUSINESS_CONTACT_LINE)
        || source.includes("PublicContactLine")
        || source.includes("LegalContact")
        || source.includes("LocalBusinessJsonLd");
      expect(usesConstant, rel).toBe(true);
    }
    expect(readFileSync(path.join(ROOT, "seed-email-templates.cjs"), "utf8")).toContain(BUSINESS_CONTACT_LINE);
    expect(readFileSync(path.join(ROOT, "functions/seed-email-templates.cjs"), "utf8")).toContain(BUSINESS_CONTACT_LINE);
    expect(readFileSync(path.join(ROOT, "public/ordericonic.html"), "utf8")).toContain(BUSINESS_CONTACT_LINE);
    expect(readFileSync(path.join(ROOT, "server/services/email.ts"), "utf8")).toContain("BUSINESS_CONTACT.line");
    expect(readFileSync(path.join(ROOT, "server/services/sms.ts"), "utf8")).toContain("BUSINESS_CONTACT.line");
  });
});

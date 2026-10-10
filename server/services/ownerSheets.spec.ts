import { afterEach, describe, expect, it } from "vitest";
import { INTENDED_OWNER_EMAIL } from "../../shared/ownerAccess";
import { clearOwnerSuiteCacheForTests, loadOwnerSuite, resolveSheetsCredentials } from "./ownerSheets";

const KEYS = [
  "OWNER_EMAILS",
  "OWNER_SUITE_FIXTURES",
  "OWNER_SESSION_SECRET",
  "OWNER_SHEETS_SA_EMAIL",
  "OWNER_SHEETS_SA_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "VERCEL",
  "VERCEL_ENV",
  "NODE_ENV",
] as const;

const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  clearOwnerSuiteCacheForTests();
});

describe("sheets credentials", () => {
  it("uses the Firebase admin service account when it is present", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      client_email: "firebase-admin@iconic-images-aicon.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    });
    process.env.OWNER_SHEETS_SA_EMAIL = "other@example.com";
    process.env.OWNER_SHEETS_SA_KEY = "other-key";
    const credentials = resolveSheetsCredentials();
    expect(credentials?.client_email).toBe("firebase-admin@iconic-images-aicon.iam.gserviceaccount.com");
    expect(credentials?.private_key).toContain("BEGIN PRIVATE KEY");
    expect(credentials?.private_key).not.toContain("\\n");
  });

  it("falls back to the dedicated sheets service account", () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    process.env.OWNER_SHEETS_SA_EMAIL = "sheets-reader@iconic-images-aicon.iam.gserviceaccount.com";
    process.env.OWNER_SHEETS_SA_KEY = "line1\\nline2";
    expect(resolveSheetsCredentials()?.client_email).toBe("sheets-reader@iconic-images-aicon.iam.gserviceaccount.com");
  });

  it("does not serve preview numbers on a hosted deploy", async () => {
    process.env.OWNER_EMAILS = INTENDED_OWNER_EMAIL;
    process.env.OWNER_SUITE_FIXTURES = "true";
    process.env.VERCEL = "1";
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const payload = await loadOwnerSuite({ fresh: true });
    expect(payload.source).toBe("empty");
    expect(payload.data.cashWeek.amount).toBeNull();
    expect(JSON.stringify(payload)).not.toContain("4280");
  });
});

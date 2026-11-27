import fs from "fs";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { INTENDED_OWNER_EMAIL } from "../../shared/ownerAccess";
import { createServer } from "../index";
import {
  OWNER_FIXTURE_BEARER,
  __setOwnerIdTokenVerifierForTests,
  ownerSessionSecret,
  signOwnerSession,
} from "../services/ownerGate";
import { clearOwnerSuiteCacheForTests } from "../services/ownerSheets";
import { OWNER_WHY } from "../services/ownerWhy";

const KEYS = ["OWNER_EMAILS", "OWNER_SUITE_FIXTURES", "OWNER_SESSION_SECRET", "VERCEL", "VERCEL_ENV", "NODE_ENV"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.OWNER_SESSION_SECRET = "owners-suite-test-secret";
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  __setOwnerIdTokenVerifierForTests(null);
  clearOwnerSuiteCacheForTests();
  for (const key of KEYS) {
    if (key === "OWNER_SESSION_SECRET") continue;
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(async () => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function allowOwnerFixtures() {
  process.env.OWNER_EMAILS = INTENDED_OWNER_EMAIL;
  process.env.OWNER_SUITE_FIXTURES = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "test";
}

async function read(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
  const text = await response.text();
  return { response, text };
}

describe("owners suite access", () => {
  it("does not serve the owners portal pages and denies the API", async () => {
    allowOwnerFixtures();
    const page = await read("/admin/owners");
    const alias = await read("/owners");
    const api = await read("/api/owners/suite");
    const apiPage = await read("/api/owners/page");
    for (const hit of [page, alias, apiPage]) {
      expect(hit.response.status).toBe(404);
      expect(hit.response.headers.get("location")).toBeNull();
      expect(hit.text).not.toContain("Owners Suite");
      expect(hit.text).not.toContain("1vHkdHRhAWKcnsv8");
      expect(hit.text).not.toContain(OWNER_WHY);
    }
    expect(api.response.status).toBe(404);
    expect(api.response.headers.get("cache-control")).toContain("private");
    expect(api.response.headers.get("cache-control")).toContain("no-store");
    expect(api.response.headers.get("x-robots-tag")).toContain("noindex");
    expect(api.text).not.toContain("4280");
    expect(api.text).not.toContain("1vHkdHRhAWKcnsv8");
    expect(api.text).not.toContain(OWNER_WHY);
    expect(api.text).not.toContain("Fall mini sessions");
    expect(api.text.toLowerCase()).not.toContain("forbidden");
    expect(api.text.toLowerCase()).not.toContain("owner");
  });

  it("denies a non-owner admin, including the temp admin token", async () => {
    allowOwnerFixtures();
    __setOwnerIdTokenVerifierForTests(async () => ({
      email: "admin@iconicimagestx.com",
      uid: "admin-uid",
    }));
    const admin = await read("/api/owners/suite", { Authorization: "Bearer admin-id-token" });
    const temp = await read("/api/owners/suite", { Authorization: "Bearer temp-admin-token" });
    const page = await read("/admin/owners", { Authorization: "Bearer admin-id-token" });
    expect(admin.response.status).toBe(404);
    expect(temp.response.status).toBe(404);
    expect(page.response.status).toBe(404);
    expect(page.response.headers.get("location")).toBeNull();
    expect(admin.text).not.toContain("4280");
    expect(admin.text).not.toContain("Northwind");
    expect(admin.text).not.toContain(OWNER_WHY);
  });

  it("allows the owner and keeps the response private", async () => {
    allowOwnerFixtures();
    __setOwnerIdTokenVerifierForTests(async () => ({
      email: "Cadi@IconicImagesTX.com",
      uid: "cadi-uid",
    }));
    const api = await read("/api/owners/suite", { Authorization: "Bearer cadi-id-token" });
    expect(api.response.status).toBe(200);
    expect(api.response.headers.get("cache-control")).toContain("no-store");
    expect(api.response.headers.get("x-robots-tag")).toContain("noindex");
    const body = JSON.parse(api.text);
    expect(body.data.cashWeek.amount).toBe(4280);
    expect(body.data.businesses).toHaveLength(6);
    expect(body.data.planBoard.columns).toHaveLength(6);
    expect(body.data.planBoard.columns[0]).toMatchObject({ business: "Iconic Images M&M", revenue: 9040, expenses: 1550 });
    expect(body.data.planBoard.columns[4].business).toBe("DOT");
    expect(body.data.planBoard.columns[4].revenue).toBeNull();
    expect(body.source).toBe("fixture");
    expect(body.why).toBe(OWNER_WHY);
    expect(api.text).not.toContain("BEGIN PRIVATE KEY");

    const session = await fetch(`${baseUrl}/api/owners/session`, {
      method: "POST",
      headers: { Authorization: "Bearer cadi-id-token" },
    });
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie") || "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const page = await read("/admin/owners", { cookie: cookie.split(";")[0] });
    expect(page.response.status).toBe(404);
    expect(page.response.headers.get("location")).toBeNull();
    expect(page.text).not.toContain("Owners Suite");
    expect(page.text).not.toContain("4280");
    expect(page.text).not.toContain(OWNER_WHY);
  });

  it("denies the owner when OWNER_EMAILS is missing", async () => {
    delete process.env.OWNER_EMAILS;
    process.env.OWNER_SUITE_FIXTURES = "true";
    __setOwnerIdTokenVerifierForTests(async () => ({
      email: INTENDED_OWNER_EMAIL,
      uid: "cadi-uid",
    }));
    const api = await read("/api/owners/suite", { Authorization: "Bearer cadi-id-token" });
    const fixture = await read("/api/owners/suite", { Authorization: `Bearer ${OWNER_FIXTURE_BEARER}` });
    expect(api.response.status).toBe(404);
    expect(fixture.response.status).toBe(404);
    expect(api.text).not.toContain(OWNER_WHY);
  });

  it("returns 404 for orders when the caller is not an owner", async () => {
    allowOwnerFixtures();
    const secret = "secret-order-text";
    const anon = await read("/api/owners/orders");
    const posted = await fetch(`${baseUrl}/api/owners/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: secret }),
    });
    const postedText = await posted.text();
    __setOwnerIdTokenVerifierForTests(async () => ({
      email: "admin@iconicimagestx.com",
      uid: "admin-uid",
    }));
    const admin = await read("/api/owners/orders", { Authorization: "Bearer admin-id-token" });
    const temp = await fetch(`${baseUrl}/api/owners/orders`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ text: secret }),
    });
    const tempText = await temp.text();
    for (const hit of [
      { status: anon.response.status, text: anon.text, cache: anon.response.headers.get("cache-control"), robots: anon.response.headers.get("x-robots-tag") },
      { status: posted.status, text: postedText, cache: posted.headers.get("cache-control"), robots: posted.headers.get("x-robots-tag") },
      { status: admin.response.status, text: admin.text, cache: admin.response.headers.get("cache-control"), robots: admin.response.headers.get("x-robots-tag") },
      { status: temp.status, text: tempText, cache: temp.headers.get("cache-control"), robots: temp.headers.get("x-robots-tag") },
    ]) {
      expect(hit.status).toBe(404);
      expect(hit.cache).toContain("private");
      expect(hit.cache).toContain("no-store");
      expect(hit.robots).toContain("noindex");
      expect(hit.text).not.toContain(secret);
      expect(hit.text).not.toContain("1vHkdHRhAWKcnsv8");
      expect(hit.text.toLowerCase()).not.toContain("forbidden");
    }
  });

  it("does not honor a session cookie for someone off the allowlist", async () => {
    allowOwnerFixtures();
    const secret = ownerSessionSecret();
    expect(secret).toBeTruthy();
    const cookie = signOwnerSession({ email: "admin@iconicimagestx.com", uid: "admin-uid" }, secret!);
    const api = await read("/api/owners/suite", { cookie: `owners_session=${cookie}` });
    expect(api.response.status).toBe(404);
  });

  it("does not rewrite owner pages to the API or send them to the owners login", async () => {
    const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as {
      functions: Record<string, unknown>;
      rewrites: Array<{ source: string; destination: string }>;
    };
    // api/index.mjs is the only API function. /api/(.*) is what invokes it.
    // /api/owners/page is not a function file, so a rewrite there never runs
    // and the SPA catch-all serves index.html.
    expect(vercel.functions["api/index.mjs"]).toBeTruthy();
    expect(fs.existsSync("api/owners/page.mjs")).toBe(false);
    expect(fs.existsSync("api/owners/page.js")).toBe(false);
    const apiEntry = vercel.rewrites.find((rule) => rule.source === "/api/(.*)");
    expect(apiEntry?.destination).toBe("/api/index");
    const spa = vercel.rewrites.findIndex((rule) => rule.destination === "/index.html");
    expect(spa).toBeGreaterThanOrEqual(0);
    const ownerRewrites = ["/owners", "/owners/", "/admin/owners", "/admin/owners/"].map((source) => {
      const index = vercel.rewrites.findIndex((rule) => rule.source === source);
      return {
        source,
        destination: index >= 0 ? vercel.rewrites[index]?.destination ?? null : null,
        beforeSpa: index >= 0 && index < spa,
      };
    });
    expect(ownerRewrites).toEqual([
      { source: "/owners", destination: null, beforeSpa: false },
      { source: "/owners/", destination: null, beforeSpa: false },
      { source: "/admin/owners", destination: null, beforeSpa: false },
      { source: "/admin/owners/", destination: null, beforeSpa: false },
    ]);
    expect(vercel.rewrites.some((rule) => rule.destination === "/api/owners/page")).toBe(false);

    allowOwnerFixtures();
    const signedOut = [];
    for (const path of ["/owners", "/admin/owners"]) {
      const hit = await read(path);
      signedOut.push({
        path,
        status: hit.response.status,
        notFound: hit.text.includes("Page not found"),
        noindex: hit.response.headers.get("x-robots-tag")?.includes("noindex") ?? false,
        leaksWhy: hit.text.includes(OWNER_WHY),
      });
    }
    expect(signedOut).toEqual([
      { path: "/owners", status: 404, notFound: false, noindex: false, leaksWhy: false },
      { path: "/admin/owners", status: 404, notFound: false, noindex: false, leaksWhy: false },
    ]);
    for (const path of ["/owners/", "/admin/owners/"]) {
      const hit = await read(path);
      expect(hit.response.status).toBe(404);
      expect(hit.response.headers.get("location")).toBeNull();
    }
    const stale = await read("/admin/owners", { cookie: "owners_session=not-a-real-session" });
    expect(stale.response.status).toBe(404);
    expect(stale.response.headers.get("location")).toBeNull();
  });

  it("keeps the owners portal out of the staff shell", () => {
    const app = fs.readFileSync("client/App.tsx", "utf8");
    const login = fs.readFileSync("client/pages/AdminLogin.tsx", "utf8");
    expect(app).not.toContain('path="/admin/owners"');
    expect(app).not.toContain('path="/owners"');
    expect(app).not.toContain("OwnersSuite");
    expect(login).not.toContain("/admin/owners");
    expect(login).not.toContain("openOwnerSession");
    const page = fs.readFileSync("client/pages/OwnersSuite.tsx", "utf8");
    expect(page).not.toContain("1vHkdHRhAWKcnsv8");
    expect(page).not.toContain("4280");
    expect(page).not.toContain(OWNER_WHY);
    expect(page).not.toContain("Cormorant");
    expect(page).not.toContain("font-serif");
    expect(page).not.toContain("italic");
    expect(page).toContain("Montserrat");
    expect(page).toContain("Inter, system-ui, sans-serif");
    expect(page).toContain("No action log yet");
    expect(page).not.toContain("Coming soon");
    const plan = fs.readFileSync("client/components/owners/PlanBoard.tsx", "utf8");
    expect(plan).not.toContain("Cormorant");
    expect(plan).not.toContain("font-serif");
    expect(plan).not.toContain("italic");
    expect(plan).toContain("No plan yet");
    expect(plan).toContain("snap-x");
    const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    expect(vercel.rewrites.some((rule) => rule.source === "/admin/owners" || rule.source === "/owners")).toBe(false);
  });
});

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

describe("content library routes", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    const app = createServer();
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("rejects an unknown purpose before touching storage", async () => {
    const res = await fetch(`${base}/api/content-assets?purpose=drive`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/purpose/);
  });

  it("requires staff auth to upload or delete", async () => {
    const upload = await fetch(`${base}/api/content-assets/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "hero.jpg", purpose: "portfolio", sizeBytes: 1200 }),
    });
    expect(upload.status).toBe(401);

    const remove = await fetch(`${base}/api/content-assets/abcdefghijklmnop`, { method: "DELETE" });
    expect(remove.status).toBe(401);
  });

  it("does not treat the temp-admin token as staff on a hosted deploy", async () => {
    const previousFlag = process.env.ENABLE_TEMP_ADMIN;
    const previousVercel = process.env.VERCEL;
    process.env.ENABLE_TEMP_ADMIN = "true";
    process.env.VERCEL = "1";
    try {
      const res = await fetch(`${base}/api/content-assets`, {
        method: "POST",
        headers: {
          Authorization: "Bearer temp-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: "hero.jpg", purpose: "portfolio", sizeBytes: 1200 }),
      });
      expect(res.status).toBe(401);
    } finally {
      if (previousFlag == null) delete process.env.ENABLE_TEMP_ADMIN;
      else process.env.ENABLE_TEMP_ADMIN = previousFlag;
      if (previousVercel == null) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    }
  });
});

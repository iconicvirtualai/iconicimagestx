import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  delete process.env.CLIENT_NOTIFY_LIVE;
  delete process.env.CLIENT_EMAIL_NOTIFY_LIVE;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("client delivery presentation", () => {
  it("serves an unpaid sample without download URLs or storage keys", async () => {
    const res = await fetch(`${baseUrl}/api/deliver/preview`);
    const body = await res.json();
    const text = JSON.stringify(body);
    expect(res.status).toBe(200);
    expect(body.paid).toBe(false);
    expect(body.orderNumber).toBe("#1042");
    expect(body.invoice.number).toBe("INV-1042");
    expect(body.invoice.status).toBe("unpaid");
    expect(body.zipPrintUrl).toBeNull();
    expect(body.media[0].highUrl).toBeNull();
    expect(body.media[0].watermarked).toBe(true);
    expect(text).not.toMatch(/b2Key|storagePath|firebasestorage|cadi@/i);
    expect(text).toContain("photos@iconicimagestx.com");
  });

  it("unlocks the paid sample", async () => {
    const res = await fetch(`${baseUrl}/api/deliver/preview-paid`);
    const body = await res.json();
    expect(body.paid).toBe(true);
    expect(body.invoice.status).toBe("paid");
    expect(body.media[0].watermarked).toBe(false);
    expect(body.media[0].highUrl).toContain("variant=print");
    expect(body.media[0].webUrl).toContain("variant=web");
    expect(body.zipWebUrl).toContain("variant=web");
  });

  it("watermarks the unpaid preview and refuses the original", async () => {
    const preview = await fetch(`${baseUrl}/api/deliver/preview/media/0?variant=preview`);
    const blocked = await fetch(`${baseUrl}/api/deliver/preview/media/0?variant=print`);
    const paid = await fetch(`${baseUrl}/api/deliver/preview-paid/media/0?variant=preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("image/jpeg");
    const marked = Buffer.from(await preview.arrayBuffer());
    const clean = Buffer.from(await paid.arrayBuffer());
    expect(marked[0]).toBe(0xff);
    expect(marked.equals(clean)).toBe(false);
    expect(blocked.status).toBe(403);
    const denied = await blocked.json();
    expect(denied.error).toContain("Pay invoice");
    expect(JSON.stringify(denied)).not.toContain("http");
  });

  it("zips paid files and keeps the unpaid zip locked", async () => {
    const locked = await fetch(`${baseUrl}/api/deliver/preview/download.zip?variant=print`);
    const web = await fetch(`${baseUrl}/api/deliver/preview-paid/download.zip?variant=web`);
    expect(locked.status).toBe(403);
    expect(web.status).toBe(200);
    expect(web.headers.get("content-type")).toContain("application/zip");
    const bytes = Buffer.from(await web.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("does not email the sample send", async () => {
    const res = await fetch(`${baseUrl}/api/deliver/preview/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        to: "jordan.hale@example.com",
        subject: "Your gallery is ready",
        message: "Hi Jordan,\n\nYour photos are ready.\n\n26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com",
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(false);
    expect(body.mode).toBe("preview");
    expect(body.note).toContain("No email");
  });
});

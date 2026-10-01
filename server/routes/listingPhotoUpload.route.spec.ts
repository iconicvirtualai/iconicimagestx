import type { Server } from "node:http";
import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import admin from "firebase-admin";
import { createServer } from "../index";
import { handleListingPhotoUpload } from "./listingPhotos";

/**
 * Photographer My Jobs and the Upload tab POST JSON to /api/listings/:id/photos.
 * The admin gallery POSTs raw image bytes to that same path. JSON must not be
 * handled by the raw-body route, which rejects a parsed object as empty-upload.
 */

const PROJECT_ID = "project1234";
const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (savedEnv.ENABLE_TEMP_ADMIN === undefined) delete process.env.ENABLE_TEMP_ADMIN;
  else process.env.ENABLE_TEMP_ADMIN = savedEnv.ENABLE_TEMP_ADMIN;
  if (savedEnv.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = savedEnv.VERCEL;
  if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

async function postPhoto(options: {
  path?: string;
  contentType: string;
  body: string | Buffer;
  authorization?: string;
}) {
  const res = await fetch(`${baseUrl}${options.path || `/api/listings/${PROJECT_ID}/photos`}`, {
    method: "POST",
    headers: {
      "Content-Type": options.contentType,
      ...(options.authorization ? { Authorization: options.authorization } : {}),
    },
    body: typeof options.body === "string" ? options.body : new Uint8Array(options.body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

describe("listing photo upload routing", () => {
  it("sends photographer JSON (file picker and drag-drop) to the JSON saver, not empty-upload", async () => {
    const dataBase64 = Buffer.from("not-a-real-photo").toString("base64");
    const result = await postPhoto({
      contentType: "application/json",
      authorization: "Bearer temp-admin-token",
      body: JSON.stringify({
        fileName: "kitchen.jpg",
        contentType: "image/jpeg",
        folder: "photos",
        dataBase64,
      }),
    });

    expect(result.data.code).not.toBe("empty-upload");
    expect(String(result.data.error || "")).not.toMatch(/no image data was received/i);
    expect(result.status).toBe(503);
    expect(result.data.error).toMatch(/Firebase Admin is not configured/);
  });

  it("treats a JSON charset as a photographer registration, not a raw image", async () => {
    const result = await postPhoto({
      contentType: "application/json; charset=utf-8",
      authorization: "Bearer temp-admin-token",
      body: JSON.stringify({
        fileName: "drop.jpg",
        contentType: "image/jpeg",
        folder: "photos",
        dataBase64: Buffer.from("drop").toString("base64"),
      }),
    });

    expect(result.data.code).not.toBe("empty-upload");
    expect(result.data.error).toMatch(/Firebase Admin is not configured/);
  });

  it("sends signed-upload registration JSON to the same JSON saver", async () => {
    const result = await postPhoto({
      contentType: "application/json",
      authorization: "Bearer temp-admin-token",
      body: JSON.stringify({
        fileName: "raw-frame.CR2",
        contentType: "image/jpeg",
        folder: "raw",
        storagePath: `listings/${PROJECT_ID}/raw/1_raw-frame.CR2`,
      }),
    });

    expect(result.data.code).not.toBe("empty-upload");
    expect(String(result.data.error || "")).not.toMatch(/no image data was received/i);
    expect(result.data.error).toMatch(/Firebase Admin is not configured/);
  });

  it("still sends admin gallery raw bytes to the staff image handler", async () => {
    const result = await postPhoto({
      contentType: "image/jpeg",
      authorization: "Bearer temp-admin-token",
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    expect(result.status).toBe(503);
    expect(result.data.code).toBe("storage/not-configured");
    expect(result.data.error).toMatch(/Gallery upload is not configured/);
  });

  it("keeps the upload-url ticket route off the raw image handler", async () => {
    const result = await postPhoto({
      path: `/api/listings/${PROJECT_ID}/photos/upload-url`,
      contentType: "application/json",
      authorization: "Bearer temp-admin-token",
      body: JSON.stringify({ fileName: "kitchen.jpg", contentType: "image/jpeg", folder: "photos" }),
    });

    expect(result.data.code).not.toBe("empty-upload");
    expect(result.data.error).toMatch(/Firebase Admin is not configured/);
  });

  it("does not report empty-upload for JSON once Firebase Admin is configured", async () => {
    const spy = vi.spyOn(admin, "apps", "get").mockReturnValue([{} as never]);
    try {
      const json = await postPhoto({
        contentType: "application/json",
        authorization: "Bearer temp-admin-token",
        body: JSON.stringify({
          fileName: "kitchen.jpg",
          contentType: "image/jpeg",
          folder: "photos",
          dataBase64: Buffer.from("configured").toString("base64"),
        }),
      });
      const raw = await postPhoto({
        contentType: "image/jpeg",
        authorization: "Bearer temp-admin-token",
        body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      });

      expect(json.data.code).not.toBe("empty-upload");
      expect(String(json.data.error || "")).not.toMatch(/no image data was received/i);
      expect(json.status).toBeGreaterThanOrEqual(400);
      expect(raw.data.code).not.toBe("empty-upload");
      expect(String(raw.data.error || "")).toMatch(/Gallery upload/);
    } finally {
      spy.mockRestore();
    }
  });

  it("still requires a staff token for JSON and raw uploads", async () => {
    const json = await postPhoto({
      contentType: "application/json",
      body: JSON.stringify({ fileName: "kitchen.jpg", dataBase64: "YQ==" }),
    });
    const raw = await postPhoto({
      contentType: "image/jpeg",
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    expect(json.status).toBe(401);
    expect(raw.status).toBe(401);
  });
});

describe("raw gallery handler", () => {
  it("returns empty-upload for a parsed JSON body when storage is configured", async () => {
    const spy = vi.spyOn(admin, "apps", "get").mockReturnValue([{} as never]);
    const req = {
      params: { id: PROJECT_ID },
      body: { fileName: "kitchen.jpg", dataBase64: "abc" },
      header: () => "application/json",
      query: {},
    } as unknown as Request;
    let statusCode = 0;
    let payload: { error?: string; code?: string } = {};
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: { error?: string; code?: string }) {
        payload = body;
        return this;
      },
    } as unknown as Response;

    try {
      await handleListingPhotoUpload(req, res, () => undefined);
    } finally {
      spy.mockRestore();
    }

    expect(statusCode).toBe(400);
    expect(payload.code).toBe("empty-upload");
    expect(payload.error).toBe("No image data was received.");
  });
});

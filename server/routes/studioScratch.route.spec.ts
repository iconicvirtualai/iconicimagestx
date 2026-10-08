import fs from "fs";
import type { Server } from "node:http";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_EDIT_MISSING_KEY_NOTE } from "../../shared/iconicStudio";
import { createServer } from "../index";

const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  STUDIO_GRASS_REFERENCE_PATH: process.env.STUDIO_GRASS_REFERENCE_PATH,
};

let server: Server;
let baseUrl = "";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(40, 2)]);

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.OPENAI_API_KEY;
  process.env.STUDIO_GRASS_REFERENCE_PATH = path.join("/tmp", "missing-scratch-grass.jpg");
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

function postJpeg(authorization?: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/studio/scratch`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      "x-scratch-action": "edit",
      "x-scratch-prompt": encodeURIComponent("Brighten the room"),
      ...(authorization ? { Authorization: authorization } : {}),
      ...headers,
    },
    body: jpeg,
  });
}

describe("coordinator scratch route", () => {
  it("stays off the public route table and reuses the image edit service", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "server/routes/studioScratch.ts"), "utf8");
    const service = fs.readFileSync(path.join(process.cwd(), "server/services/studioScratch.ts"), "utf8");
    expect(route).toMatch(/requireCoordinator/);
    expect(service).toMatch(/editListingPhotoWithOpenAI/);
    expect(`${route}\n${service}`).not.toMatch(/studioJobs|galleryReleaseGate|square|enqueueAiEdit|payments/);
    const app = fs.readFileSync(path.join(process.cwd(), "client/App.tsx"), "utf8");
    expect(app).toMatch(/path="\/admin\/studio\/scratch"/);
    expect(app).toMatch(/requiredRole="staff"><AdminStudioScratch/);
  });

  it("requires a coordinator before it edits", async () => {
    const open = await postJpeg();
    expect(open.status).toBe(401);
    const status = await fetch(`${baseUrl}/api/studio/scratch`);
    expect(status.status).toBe(401);
  });

  it("rejects a short prompt and a missing key without calling storage", async () => {
    const short = await postJpeg("Bearer temp-admin-token", {
      "x-scratch-prompt": encodeURIComponent("no"),
    });
    const shortBody = await short.json();
    expect(short.status).toBe(400);
    expect(shortBody.error).toMatch(/Describe the edit/);

    const missing = await postJpeg("Bearer temp-admin-token");
    const missingBody = await missing.json();
    expect(missing.status).toBe(503);
    expect(missingBody.error).toBe(AI_EDIT_MISSING_KEY_NOTE);
  });

  it("reports a missing grass reference to the coordinator", async () => {
    const status = await fetch(`${baseUrl}/api/studio/scratch`, {
      headers: { Authorization: "Bearer temp-admin-token" },
    });
    const body = await status.json();
    expect(status.status).toBe(200);
    expect(body.grass.ready).toBe(false);
    expect(body.grass.publicPath).toBe("/studio/grass-reference.jpg");
    expect(body.twilightPrompt).toMatch(/twilight/);

    const grass = await postJpeg("Bearer temp-admin-token", { "x-scratch-action": "grass" });
    const grassBody = await grass.json();
    expect(grass.status).toBe(503);
    expect(grassBody.error).toMatch(/public\/studio\/grass-reference.jpg/);
  });
});

import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { memoryGallery, memoryListing, resetStudioVideoMemory, seedStudioVideoMemory } from "../services/studioVideoJobs";

let server: Server;
let baseUrl = "";

const saved = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VIDEO_EDITOR_ENABLED: process.env.VIDEO_EDITOR_ENABLED,
  VIDEO_TEMPLATES_ENABLED: process.env.VIDEO_TEMPLATES_ENABLED,
  VIDEO_WORKER_URL: process.env.VIDEO_WORKER_URL,
  VIDEO_WORKER_TOKEN: process.env.VIDEO_WORKER_TOKEN,
  VIDEO_TASKS_QUEUE: process.env.VIDEO_TASKS_QUEUE,
};

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VIDEO_WORKER_URL;
  delete process.env.VIDEO_TASKS_QUEUE;
  delete process.env.VIDEO_EDITOR_ENABLED;
  delete process.env.VIDEO_TEMPLATES_ENABLED;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

beforeEach(() => {
  resetStudioVideoMemory();
  delete process.env.VERCEL_ENV;
  delete process.env.VIDEO_EDITOR_ENABLED;
  delete process.env.VIDEO_WORKER_TOKEN;
});

function staff(role = "admin") {
  return {
    Authorization: "Bearer temp-admin-token",
    "Content-Type": "application/json",
    "x-test-staff": JSON.stringify({ uid: "staff-1", role }),
  };
}

describe("studio video routes", () => {
  it("does not import mail, SMS, or gallery delivery", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "server/routes/studioVideo.ts"), "utf8");
    const jobs = fs.readFileSync(path.join(process.cwd(), "server/services/studioVideoJobs.ts"), "utf8");
    const source = `${route}\n${jobs}`;
    expect(source).not.toMatch(/nodemailer|twilio|galleryDeliver|sendEmail|CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE/);
    expect(route).toContain("notifyClient: false");
    expect(jobs).toContain("notifyClient: false");
  });

  it("requires staff and rejects a signed-in non-staff caller", async () => {
    const open = await fetch(`${baseUrl}/api/studio/video/templates`);
    expect(open.status).toBe(401);
    const client = await fetch(`${baseUrl}/api/studio/video/templates`, { headers: staff("client") });
    expect(client.status).toBe(403);
  });

  it("lists five templates and leaves a job queued when no worker is configured", async () => {
    const listed = await fetch(`${baseUrl}/api/studio/video/templates`, { headers: staff() });
    const body = await listed.json() as { templates: Array<{ id: string }>; message: string };
    expect(listed.status).toBe(200);
    expect(body.templates.map((template) => template.id)).toContain("glamping_whip_tour");
    expect(body.templates).toHaveLength(5);
    expect(body.message).toBe("Renderer not connected yet");

    const queued = await fetch(`${baseUrl}/api/studio/video/template-jobs`, {
      method: "POST",
      headers: staff(),
      body: JSON.stringify({
        templateId: "social_teaser_15",
        listingId: "list_oak",
        size: "1080x1920",
        slots: { s01: "studio-video/uploads/list_oak/arrival.mp4" },
        trims: { s01: { in: 4, out: 14 } },
        points: { s01: 8 },
        text: { hook: "Just Listed" },
      }),
    });
    const jobBody = await queued.json() as { job: { id: string; status: string; message: string; kind: string }; message: string };
    expect(queued.status).toBe(201);
    expect(jobBody.job.status).toBe("queued");
    expect(jobBody.job.kind).toBe("template");
    expect(jobBody.message).toBe("Renderer not connected yet");

    const bad = await fetch(`${baseUrl}/api/studio/video/template-jobs`, {
      method: "POST",
      headers: staff(),
      body: JSON.stringify({
        templateId: "social_teaser_15",
        listingId: "list_oak",
        size: "1080x1920",
        slots: { s01: "https://example.com/secret.mp4" },
      }),
    });
    expect(bad.status).toBe(400);

    const analyze = await fetch(`${baseUrl}/api/studio/video/analyze`, {
      method: "POST",
      headers: staff(),
      body: JSON.stringify({ storagePath: "studio-video/uploads/list_oak/arrival.mp4" }),
    });
    expect(await analyze.json()).toMatchObject({ pending: true });
  });

  it("turns the editor off in production when the flag is unset", async () => {
    process.env.VERCEL_ENV = "production";
    const hidden = await fetch(`${baseUrl}/api/studio/video/templates`, { headers: staff() });
    expect(hidden.status).toBe(403);
    delete process.env.VERCEL_ENV;
  });

  it("adds a finished video to the gallery video section without notifying", async () => {
    seedStudioVideoMemory({
      orders: [{
        id: "order_oak",
        orderNumber: "#1042",
        address: "123 Oak Lane, Houston, TX",
        galleryId: "gal_oak",
        listingId: "list_oak",
      }],
      galleries: [{ id: "gal_oak", orderId: "order_oak", listingId: "list_oak", status: "editing", videoLinks: [], mediaItems: [] }],
      listings: [{ id: "list_oak", galleryId: "gal_oak", videos: [] }],
    });
    const found = await fetch(`${baseUrl}/api/studio/video/orders/search?q=${encodeURIComponent("oak lane")}`, {
      headers: staff(),
    });
    const hits = await found.json() as { hits: Array<{ orderId: string; videoSectionUrl: string }>; notifyClient: boolean };
    expect(found.status).toBe(200);
    expect(hits.hits[0].videoSectionUrl).toBe("/admin/listing/list_oak?tab=video");
    expect(hits.notifyClient).toBe(false);

    const added = await fetch(`${baseUrl}/api/studio/video/gallery`, {
      method: "POST",
      headers: staff(),
      body: JSON.stringify({
        orderId: "order_oak",
        query: "oak lane",
        url: "https://cdn.example/oak.mp4",
        storagePath: "studio-video/list_oak/job.mp4",
        fileName: "123-oak-mls.mp4",
        presetId: "mls",
        jobId: "job_1",
        width: 1920,
        height: 1080,
        fps: 30,
        notifyClient: false,
      }),
    });
    const body = await added.json() as { notifyClient: boolean; videoSectionUrl: string; galleryId: string };
    expect(added.status).toBe(201);
    expect(body.notifyClient).toBe(false);
    expect(body.videoSectionUrl).toBe("/admin/listing/list_oak?tab=video");
    const gallery = memoryGallery("gal_oak");
    const listing = memoryListing("list_oak");
    expect(gallery?.status).toBe("editing");
    expect(Array.isArray(gallery?.videoLinks) && gallery.videoLinks).toHaveLength(1);
    expect((gallery?.videoLinks as Array<{ notifyClient: boolean; category: string }>)[0]).toMatchObject({
      notifyClient: false,
      category: "unbranded",
    });
    expect(listing?.videos).toHaveLength(1);

    const refused = await fetch(`${baseUrl}/api/studio/video/gallery`, {
      method: "POST",
      headers: staff(),
      body: JSON.stringify({
        orderId: "order_oak",
        url: "https://cdn.example/oak.mp4",
        storagePath: "studio-video/list_oak/job.mp4",
        fileName: "reel.mp4",
        notifyClient: true,
      }),
    });
    expect(refused.status).toBe(400);
  });

  it("accepts a worker progress callback only with the worker token", async () => {
    const queued = await fetch(`${baseUrl}/api/studio/video/timeline-jobs`, {
      method: "POST",
      headers: staff("editor"),
      body: JSON.stringify({
        listingId: "list_oak",
        project: { tracks: [] },
        export: { presetId: "instagram_reel", fps: 30, quality: "high", durationSec: 12 },
      }),
    });
    const created = await queued.json() as { job: { id: string; message: string } };
    expect(queued.status).toBe(201);
    expect(created.job.message).toBe("Renderer not connected yet");
    const hidden = await fetch(`${baseUrl}/api/studio/video/template-jobs/${created.job.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: 0.5, status: "rendering" }),
    });
    expect(hidden.status).toBe(404);
    process.env.VIDEO_WORKER_TOKEN = "worker-test-token";
    const updated = await fetch(`${baseUrl}/api/studio/video/template-jobs/${created.job.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-video-worker-token": "worker-test-token" },
      body: JSON.stringify({ progress: 1, status: "ready", outputUrl: "https://cdn.example/reel.mp4", message: "Ready" }),
    });
    expect(updated.status).toBe(200);
    const download = await fetch(`${baseUrl}/api/studio/video/template-jobs/${created.job.id}/download`, {
      headers: staff(),
    });
    const file = await download.json() as { url: string };
    expect(download.status).toBe(200);
    expect(file.url).toBe("https://cdn.example/reel.mp4");
  });
});

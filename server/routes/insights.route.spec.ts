import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { resetInsightMemory } from "../services/insightStore";

let server: Server;
let baseUrl = "";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.ICONIC_VITE_DEV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetInsightMemory();
  delete process.env.ICONIC_VITE_DEV;
});

function admin(role = "admin", email = "owner@example.com") {
  return {
    Authorization: "Bearer temp-admin-token",
    "Content-Type": "application/json",
    "x-test-staff": JSON.stringify({ uid: "owner-1", email, role }),
  };
}

describe("insights API", () => {
  it("publishes a draft onto the public page and the post shell", async () => {
    const created = await fetch(`${baseUrl}/api/insights/admin/posts`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ template: "journal", title: "Twilight porch", coverUrl: "/media/photos/drone-hero.jpg" }),
    });
    expect(created.status).toBe(201);
    const draft = (await created.json() as { post: { id: string; slug: string; status: string } }).post;
    expect(draft.status).toBe("draft");

    const hidden = await fetch(`${baseUrl}/api/insights`);
    expect(await hidden.json()).toEqual({ posts: [] });
    const hiddenSlug = await fetch(`${baseUrl}/api/insights/${draft.slug}`);
    expect(hiddenSlug.status).toBe(404);

    const published = await fetch(`${baseUrl}/api/insights/admin/posts/${draft.id}/publish`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ title: "Twilight porch", coverUrl: "/media/photos/drone-hero.jpg", seoDescription: "How a twilight frame changes the listing." }),
    });
    expect(published.status).toBe(200);
    const live = await (await fetch(`${baseUrl}/api/insights`)).json() as { posts: Array<{ slug: string; socialPack?: unknown; authorName: string }> };
    expect(live.posts).toHaveLength(1);
    expect(live.posts[0].slug).toBe("twilight-porch");
    expect(live.posts[0].authorName).toBe("Iconic Images");
    expect(live.posts[0].socialPack).toBeUndefined();

    const page = await fetch(`${baseUrl}/insights/twilight-porch`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Twilight porch | Iconic Insights");
    expect(html).toContain("https://iconicimagestx.vercel.app/media/photos/drone-hero.jpg");
    expect(html).toContain('property="og:image"');

    const removed = await fetch(`${baseUrl}/api/insights/admin/posts/${draft.id}/unpublish`, {
      method: "POST",
      headers: admin(),
      body: "{}",
    });
    expect(removed.status).toBe(200);
    expect(await (await fetch(`${baseUrl}/api/insights`)).json()).toEqual({ posts: [] });
  });

  it("keeps drafts and the social zip with admin and owner", async () => {
    const anonymous = await fetch(`${baseUrl}/api/insights/admin/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "stat" }),
    });
    expect(anonymous.status).toBe(401);

    const coordinator = await fetch(`${baseUrl}/api/insights/admin/posts`, {
      method: "POST",
      headers: admin("coordinator", "sasha@iconicimagestx.com"),
      body: JSON.stringify({ template: "stat" }),
    });
    expect(coordinator.status).toBe(403);

    process.env.OWNER_EMAILS = "owner@example.com";
    const owner = await fetch(`${baseUrl}/api/insights/admin/posts`, {
      method: "POST",
      headers: admin("coordinator", "owner@example.com"),
      body: JSON.stringify({ template: "social", title: "Reel for the listing" }),
    });
    delete process.env.OWNER_EMAILS;
    expect(owner.status).toBe(201);
    const post = (await owner.json() as { post: { id: string; readyForSocial: boolean } }).post;
    expect(post.readyForSocial).toBe(true);

    const uploaded = await fetch(`${baseUrl}/api/site-content/media`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: "insights", dataBase64: PNG.toString("base64") }),
    });
    expect(uploaded.status).toBe(200);
    const stored = await uploaded.json() as { url: string; kind: string };
    expect(stored.kind).toBe("image");
    expect(stored.url).toContain("/api/site-content/blob/");

    const saved = await fetch(`${baseUrl}/api/insights/admin/posts/${post.id}`, {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({
        socialPack: {
          caption: "Post this still.",
          hashtags: "#IconicImages",
          platforms: ["instagram", "facebook", "not-a-network"],
          assets: [{ url: stored.url, name: "porch.png", kind: "graphic" }],
        },
      }),
    });
    expect(saved.status).toBe(200);
    const packed = await fetch(`${baseUrl}/api/insights/admin/posts/${post.id}/social.zip`, { headers: admin() });
    expect(packed.status).toBe(200);
    expect(packed.headers.get("content-type")).toContain("application/zip");
    const bytes = Buffer.from(await packed.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(bytes.includes(Buffer.from("porch.png"))).toBe(true);

    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const start = rules.indexOf("match /insightPosts/{postId}");
    const block = rules.slice(start, rules.indexOf("match /", start + 10));
    expect(block).toContain("allow read: if resource.data.status == 'published' || isAdmin();");
    expect(block).toContain("allow create, update, delete: if isAdmin();");

    const app = readFileSync(new URL("../../client/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('path="/insights" element={<Insights />}');
    expect(app).toContain('path="/insights/prep" element={<Navigate to="/" replace />}');
    expect(app).toContain('path="/insights/:slug"');
    expect(app).toContain('path="/admin/insights"');
    const page = readFileSync(new URL("../../client/pages/Insights.tsx", import.meta.url), "utf8");
    expect(page).not.toContain("7 Tools to Turn");
  });
});

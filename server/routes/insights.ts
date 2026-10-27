/**
 * Iconic Insights API.
 * Public reads are published posts only. Drafts, publish, and the social
 * zip stay with admin or an owner email.
 */

import fs from "node:fs";
import path from "node:path";
import { Router, type RequestHandler } from "express";
import { isOwnerEmail, ownerAllowlist } from "../../shared/ownerAccess.ts";
import { injectHead, originForHost } from "../../shared/siteSeo.ts";
import {
  claimSlug,
  createInsightPost,
  insightHeadTags,
  insightReadyToPublish,
  isInsightSlug,
  socialAssetFilename,
  toPublicInsight,
  updateInsightPost,
  type InsightPost,
} from "../../shared/insights.ts";
import { zipStored } from "../../shared/zipStore.ts";
import { requireStaff, type AuthenticatedRequest } from "../middleware/auth.ts";
import { siteMediaBlob } from "../services/siteMedia.ts";
import {
  deleteInsight,
  getInsight,
  getPublishedInsightBySlug,
  listInsights,
  listPublishedInsights,
  saveInsight,
} from "../services/insightStore.ts";

const router = Router();
const BLOB_URL = /^\/api\/site-content\/blob\/([A-Za-z0-9-]+)$/;
const ALLOWED_ASSET_HOSTS = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);

function writerAllowed(req: AuthenticatedRequest): boolean {
  if (req.isAdmin || req.staffRole === "admin") return true;
  return isOwnerEmail(req.user?.email, ownerAllowlist(process.env.OWNER_EMAILS));
}

const requireInsightsWriter: RequestHandler = async (req, res, next) => {
  const editorReq = req as AuthenticatedRequest;
  if (process.env.NODE_ENV === "test" && req.header("x-test-staff")) {
    try {
      const parsed = JSON.parse(req.header("x-test-staff") || "{}") as { uid?: string; email?: string; role?: string };
      editorReq.user = { uid: parsed.uid || "test", email: parsed.email || "" } as AuthenticatedRequest["user"];
      editorReq.staffRole = parsed.role;
      editorReq.isAdmin = parsed.role === "admin";
    } catch {
      return res.status(401).json({ error: "No authentication token provided." });
    }
    if (!writerAllowed(editorReq)) return res.status(403).json({ error: "Admin access required." });
    return next();
  }
  return requireStaff(editorReq, res, () => {
    if (!writerAllowed(editorReq)) return res.status(403).json({ error: "Admin access required." });
    return next();
  });
};

function actor(req: AuthenticatedRequest) {
  const email = req.user?.email || "";
  const name = email === "temp-admin@iconicimagestx.com" ? "Temporary Admin" : (email || "Iconic Images");
  return { uid: req.user?.uid || "staff", name };
}

async function withSlug(post: InsightPost): Promise<InsightPost> {
  const posts = await listInsights();
  return { ...post, slug: claimSlug(post.slug, post.id, posts) };
}

router.get("/", async (_req, res) => {
  const posts = await listPublishedInsights();
  res.setHeader("Cache-Control", "no-store");
  return res.json({ posts: posts.map(toPublicInsight) });
});

router.get("/admin/posts", requireInsightsWriter, async (_req, res) => {
  const posts = await listInsights();
  return res.json({ posts });
});

router.post("/admin/posts", requireInsightsWriter, async (req, res) => {
  const created = await withSlug(createInsightPost(req.body, actor(req as AuthenticatedRequest)));
  await saveInsight(created);
  return res.status(201).json({ post: created });
});

router.put("/admin/posts/:id", requireInsightsWriter, async (req, res) => {
  const current = await getInsight(String(req.params.id || ""));
  if (!current) return res.status(404).json({ error: "That insight was not found." });
  const next = await withSlug(updateInsightPost(current, req.body));
  await saveInsight(next);
  return res.json({ post: next });
});

router.post("/admin/posts/:id/publish", requireInsightsWriter, async (req, res) => {
  const current = await getInsight(String(req.params.id || ""));
  if (!current) return res.status(404).json({ error: "That insight was not found." });
  const edited = req.body && Object.keys(req.body).length ? updateInsightPost(current, req.body) : current;
  const reason = insightReadyToPublish(edited);
  if (reason) return res.status(400).json({ error: reason });
  const now = new Date().toISOString();
  const next = await withSlug({ ...edited, status: "published", publishedAt: now, updatedAt: now });
  await saveInsight(next);
  return res.json({ post: next });
});

router.post("/admin/posts/:id/unpublish", requireInsightsWriter, async (req, res) => {
  const current = await getInsight(String(req.params.id || ""));
  if (!current) return res.status(404).json({ error: "That insight was not found." });
  const now = new Date().toISOString();
  const next = { ...current, status: "draft" as const, updatedAt: now };
  await saveInsight(next);
  return res.json({ post: next });
});

router.delete("/admin/posts/:id", requireInsightsWriter, async (req, res) => {
  const current = await getInsight(String(req.params.id || ""));
  if (!current) return res.status(404).json({ error: "That insight was not found." });
  await deleteInsight(current.id);
  return res.json({ ok: true });
});

router.get("/admin/posts/:id/social.zip", requireInsightsWriter, async (req, res) => {
  const current = await getInsight(String(req.params.id || ""));
  if (!current) return res.status(404).json({ error: "That insight was not found." });
  if (!current.socialPack.assets.length) {
    return res.status(404).json({ error: "Add a photo, video, or graphic before downloading the pack." });
  }
  const entries: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  for (let index = 0; index < current.socialPack.assets.length; index += 1) {
    const asset = current.socialPack.assets[index];
    const file = await readSocialAsset(asset.url);
    if (!file) continue;
    let name = socialAssetFilename(asset, index, file.type);
    if (used.has(name.toLowerCase())) name = `${index + 1}-${name}`;
    used.add(name.toLowerCase());
    entries.push({ name, data: new Uint8Array(file.body) });
  }
  if (!entries.length) return res.status(404).json({ error: "Those files could not be packed." });
  const filename = `${current.slug.replace(/[^a-z0-9-]/g, "") || "insight"}-social.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.send(Buffer.from(zipStored(entries)));
});

router.get("/:slug", async (req, res) => {
  const slug = String(req.params.slug || "");
  if (!isInsightSlug(slug)) return res.status(404).json({ error: "This insight is not published." });
  const post = await getPublishedInsightBySlug(slug);
  if (!post) return res.status(404).json({ error: "This insight is not published." });
  res.setHeader("Cache-Control", "no-store");
  return res.json({ post: toPublicInsight(post) });
});

async function readSocialAsset(url: string): Promise<{ body: Buffer; type: string } | null> {
  const blob = BLOB_URL.exec(url);
  if (blob) {
    const stored = siteMediaBlob(blob[1]);
    return stored ? { body: stored.body, type: stored.type } : null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_ASSET_HOSTS.has(parsed.hostname)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(parsed, { redirect: "manual", signal: controller.signal });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > 80 * 1024 * 1024) return null;
      chunks.push(Buffer.from(step.value));
    }
    return { body: Buffer.concat(chunks), type: response.headers.get("content-type") || "application/octet-stream" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readSpaShell(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/spa/index.html"),
    path.resolve(process.cwd(), "dist/index.html"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return "";
}

export async function renderInsightShell(slug: string, origin?: string): Promise<{ status: number; html: string }> {
  if (!isInsightSlug(slug)) {
    return { status: 404, html: "<!doctype html><title>Insight</title><p>This insight is not published.</p>" };
  }
  const post = await getPublishedInsightBySlug(slug);
  const shell = readSpaShell();
  if (!post) {
    const tags = "<title>Insight | Iconic Images</title>\n    <meta name=\"robots\" content=\"noindex, nofollow\" />";
    const html = shell
      ? injectHead(shell, tags)
      : `<!doctype html><html><head>${tags}</head><body><p>This insight is not published.</p></body></html>`;
    return { status: 404, html };
  }
  const tags = insightHeadTags(toPublicInsight(post), origin);
  const html = shell
    ? injectHead(shell, tags)
    : `<!doctype html><html><head>${tags}</head><body><div id="root"></div></body></html>`;
  return { status: 200, html };
}

export const handleInsightShell: RequestHandler = async (req, res) => {
  const rendered = await renderInsightShell(String(req.params.slug || ""), originForHost(req.get("host")));
  res.setHeader("Cache-Control", "no-store");
  res.status(rendered.status).type("html").send(rendered.html);
};

export default router;

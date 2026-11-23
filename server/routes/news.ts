/**
 * Public news pages.
 * /news is a static SEO shell. Each issue is rendered here so the first HTML
 * response carries the title, description, and hero Open Graph image.
 */

import fs from "node:fs";
import path from "node:path";
import { Router, type RequestHandler } from "express";
import { mergeNewsCards, newsHeadTags, type NewsCategory } from "../../shared/news.ts";
import { injectHead, originForHost } from "../../shared/siteSeo.ts";
import { findFolderIssue, newsCards } from "../news/loadIssues.ts";
import { findSentCampaignIssue, sentCampaignCards } from "../news/sentCampaigns.ts";

const router = Router();

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

function categoryOf(value: string): NewsCategory | null {
  if (value === "newsletter" || value === "promo") return value;
  return null;
}

router.get("/", async (_req, res) => {
  const folders = newsCards();
  const campaigns = await sentCampaignCards();
  res.json({ issues: mergeNewsCards(folders, campaigns) });
});

router.get("/issues/:category/:slug", async (req, res) => {
  const category = categoryOf(String(req.params.category || ""));
  const slug = String(req.params.slug || "");
  if (!category) return res.status(404).json({ error: "That news issue is not published." });
  const issue = findFolderIssue(category, slug) || (await findSentCampaignIssue(category, slug));
  if (!issue) return res.status(404).json({ error: "That news issue is not published." });
  return res.json({ issue });
});

export async function renderNewsShell(
  category: NewsCategory,
  slug: string,
  origin?: string,
): Promise<{ status: number; html: string }> {
  const issue = findFolderIssue(category, slug) || (await findSentCampaignIssue(category, slug));
  const shell = readSpaShell();
  if (!issue) {
    const tags = `<title>News | Iconic Images</title>\n    <meta name="robots" content="noindex, nofollow" />`;
    const html = shell
      ? injectHead(shell, tags)
      : `<!doctype html><html><head>${tags}</head><body><p>This news issue is not published.</p></body></html>`;
    return { status: 404, html };
  }
  const tags = newsHeadTags(issue, origin);
  const html = shell
    ? injectHead(shell, tags)
    : `<!doctype html><html><head>${tags}</head><body><div id="root"></div></body></html>`;
  return { status: 200, html };
}

export const handleNewsShell: RequestHandler = async (req, res, next) => {
  if (process.env.ICONIC_VITE_DEV === "1") return next();
  const slug = String(req.params.slug || "");
  const category: NewsCategory = req.path.includes("/news/promos/") ? "promo" : "newsletter";
  const rendered = await renderNewsShell(category, slug, originForHost(req.get("host")));
  res.setHeader("Cache-Control", "no-store");
  res.status(rendered.status).type("html").send(rendered.html);
};

export default router;

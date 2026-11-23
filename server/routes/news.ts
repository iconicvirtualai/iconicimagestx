/**
 * Staff-only news archive. Folders under content/news stay the source of truth.
 * The HTML is not served to anonymous visitors.
 */

import { Router } from "express";
import { mergeNewsCards, type NewsCategory } from "../../shared/news.ts";
import { requireStaff } from "../middleware/auth.ts";
import { findFolderIssue, newsCards } from "../news/loadIssues.ts";
import { findSentCampaignIssue, sentCampaignCards } from "../news/sentCampaigns.ts";

const router = Router();
router.use(requireStaff);

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

export default router;

/**
 * Read content/news/<slug>/ from disk.
 * Dropping a folder in is enough. Invalid folders are skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type NewsCard,
  type NewsCategory,
  type NewsIssue,
  newsIssuePath,
  parseNewsMeta,
  sortNewsNewestFirst,
} from "../../shared/news.ts";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function newsContentDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "content/news"),
    path.resolve(moduleRoot, "content/news"),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
}

export function loadNewsIssues(): NewsIssue[] {
  const root = newsContentDir();
  if (!fs.existsSync(root)) return [];
  const issues: NewsIssue[] = [];
  for (const name of fs.readdirSync(root)) {
    const folder = path.join(root, name);
    if (!fs.statSync(folder).isDirectory()) continue;
    const metaPath = path.join(folder, "meta.json");
    const htmlPath = path.join(folder, "email.html");
    if (!fs.existsSync(metaPath) || !fs.existsSync(htmlPath)) continue;
    try {
      const meta = parseNewsMeta(JSON.parse(fs.readFileSync(metaPath, "utf8")), name);
      issues.push({
        ...meta,
        emailHtml: fs.readFileSync(htmlPath, "utf8"),
        path: newsIssuePath(meta),
        source: "folder",
      });
    } catch (err) {
      console.error(`[news] skipped ${name}:`, err instanceof Error ? err.message : err);
    }
  }
  return sortNewsNewestFirst(issues);
}

export function newsCards(): NewsCard[] {
  return loadNewsIssues().map(({ emailHtml: _html, ...card }) => card);
}

export function findFolderIssue(category: NewsCategory, slug: string): NewsIssue | null {
  return loadNewsIssues().find((issue) => issue.slug === slug && issue.category === category) || null;
}

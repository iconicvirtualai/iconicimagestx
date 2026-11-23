import {
  type NewsCard,
  type NewsCategory,
  type NewsMeta,
  newsIssuePath,
  parseNewsMeta,
  sortNewsNewestFirst,
} from "@shared/news";

const metaFiles = import.meta.glob("/content/news/*/meta.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

function slugFromKey(key: string): string {
  return key.match(/\/content\/news\/([^/]+)\//)?.[1] || "";
}

/** Issues that shipped in this build. A new folder is picked up on the next build. */
export function bundledNewsCards(): NewsCard[] {
  const cards: NewsCard[] = [];
  for (const [key, raw] of Object.entries(metaFiles)) {
    const folder = slugFromKey(key);
    if (!folder) continue;
    try {
      const meta = parseNewsMeta(raw, folder);
      cards.push({ ...meta, path: newsIssuePath(meta), source: "folder" });
    } catch (err) {
      console.error(`[news] skipped ${folder}:`, err instanceof Error ? err.message : err);
    }
  }
  return sortNewsNewestFirst(cards);
}

export function bundledNewsMeta(category: NewsCategory, slug: string): NewsMeta | null {
  return bundledNewsCards().find((issue) => issue.slug === slug && issue.category === category) ?? null;
}

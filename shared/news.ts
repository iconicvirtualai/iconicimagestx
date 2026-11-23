/**
 * Public newsletters and promos.
 * A folder under content/news/<slug>/ is the source of truth for a page.
 * This module only shapes that content. It does not send email.
 */

import { canonicalUrl, escapeHtml, ogImageUrl, SITE_ORIGIN } from "./siteSeo.ts";

export const NEWS_ASSET_ORIGIN = "https://www.iconicimagestx.com";
export const NEWS_EMAIL_ASSET_PREFIX = `${NEWS_ASSET_ORIGIN}/marketing/email/`;

export type NewsCategory = "newsletter" | "promo";
export type NewsSource = "folder" | "campaign";

export interface NewsMeta {
  title: string;
  slug: string;
  category: NewsCategory;
  date: string;
  summary: string;
  heroImage: string;
}

export interface NewsIssue extends NewsMeta {
  emailHtml: string;
  path: string;
  source: NewsSource;
}

/** Public card. The email HTML stays off the index payload. */
export interface NewsCard extends NewsMeta {
  path: string;
  source: NewsSource;
}

export interface CampaignNewsInput {
  id: string;
  name: string;
  status: string;
  subject: string;
  preheader?: string;
  html: string;
  sentAt?: string;
  newsSlug?: string;
  newsCategory?: string;
  newsSummary?: string;
  newsHero?: string;
}

export interface NewsIssueFiles {
  directory: string;
  slug: string;
  meta: NewsMeta;
  metaJson: string;
  emailHtml: string;
}

const RESERVED_SLUGS = new Set(["promos", "sent", "admin", "api"]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function slugifyNews(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Staff list only. Issue pages themselves are unlisted public links. */
export const NEWS_INDEX_PATH = "/insights/news";

export function newsIssuePath(meta: Pick<NewsMeta, "slug" | "category">): string {
  return meta.category === "promo" ? `/news/promos/${meta.slug}` : `/news/${meta.slug}`;
}

/** /news has no public index. Staff issue URLs open the unlisted public page. */
export function legacyNewsRedirect(pathname: string): string | null {
  const path = (pathname || "/").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (path === "/news") return "/";
  const staffPromo = /^\/insights\/news\/promos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (staffPromo) return `/news/promos/${staffPromo[1]}`;
  const staffIssue = /^\/insights\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (staffIssue && staffIssue[1] !== "promos") return `/news/${staffIssue[1]}`;
  return null;
}

export function newsCategoryLabel(category: NewsCategory): string {
  return category === "promo" ? "Promo" : "Newsletter";
}

export function formatNewsDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return iso;
  return `${month} ${day}, ${match[1]}`;
}

export function sortNewsNewestFirst<T extends { date: string; slug: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.slug.localeCompare(b.slug);
  });
}

/** Folders win. A sent campaign is listed only when its slug is not already a folder. */
export function mergeNewsCards(folders: readonly NewsCard[], campaigns: readonly NewsCard[]): NewsCard[] {
  const taken = new Set(folders.map((item) => item.slug));
  return sortNewsNewestFirst([...folders, ...campaigns.filter((item) => !taken.has(item.slug))]);
}

export function absoluteNewsImage(src: string, origin = SITE_ORIGIN): string {
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, "");
  const value = String(src || "").trim();
  if (!value) return ogImageUrl(base);
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${base}${value}`;
  return `${base}/${value}`;
}

export function parseNewsMeta(raw: unknown, folderSlug: string): NewsMeta {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const slug = String(record.slug || "").trim();
  const category = record.category === "promo" ? "promo" : record.category === "newsletter" ? "newsletter" : "";
  const date = String(record.date || "").trim();
  const title = String(record.title || "").trim();
  const summary = String(record.summary || "").trim();
  const heroImage = String(record.heroImage || "").trim();
  if (!title) throw new Error("News issue needs a title.");
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) throw new Error(`News slug "${slug}" is not usable.`);
  if (slug !== folderSlug) throw new Error(`News slug "${slug}" does not match folder "${folderSlug}".`);
  if (!category) throw new Error("News category must be newsletter or promo.");
  if (!DATE_RE.test(date)) throw new Error("News date must be YYYY-MM-DD.");
  if (!summary) throw new Error("News issue needs a summary.");
  if (!heroImage || heroImage.startsWith("javascript:")) throw new Error("News issue needs a hero image.");
  return { title, slug, category, date, summary, heroImage };
}

export function newsHeadTags(issue: NewsMeta, origin = SITE_ORIGIN): string {
  const title = escapeHtml(`${issue.title} | Iconic Images`);
  const description = escapeHtml(issue.summary);
  const url = escapeHtml(canonicalUrl(newsIssuePath(issue), origin));
  const image = escapeHtml(absoluteNewsImage(issue.heroImage, origin));
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join("\n    ");
}

export function emailImageSrcs(html: string): string[] {
  return [...String(html || "").matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]);
}

const FRAME_FIT_STYLE =
  "<style>html,body{overflow:hidden!important;height:auto!important;margin:0!important;}</style>";

const FRAME_FIT_SCRIPT = `<script>
(function () {
  function height() {
    var body = document.body;
    var root = document.documentElement;
    return Math.max(body ? body.scrollHeight : 0, body ? body.offsetHeight : 0, root ? root.scrollHeight : 0, root ? root.offsetHeight : 0);
  }
  function post() {
    parent.postMessage({ type: "news-email-height", height: height() }, "*");
  }
  window.addEventListener("load", post);
  if (document.body && window.ResizeObserver) new ResizeObserver(post).observe(document.body);
  Array.prototype.forEach.call(document.images || [], function (img) {
    if (!img.complete) img.addEventListener("load", post);
  });
  post();
})();
</script>`;

/**
 * Isolate a send-ready email inside a page.
 * Script tags from the email are removed, then a height reporter is added so the
 * iframe can grow to the message and the page is the only scroller.
 * The unsubscribe merge tag becomes the site page.
 * When pageOrigin is another host (a preview), marketing images and flash-sale
 * links follow that host. The file on disk keeps the www URLs.
 */
export function prepareEmailSrcDoc(html: string, pageOrigin = ""): string {
  let next = String(html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  next = next.replace(/href=(["'])\[UNSUBSCRIBE LINK\]\1/gi, 'href="/unsubscribe"');
  const origin = String(pageOrigin || "").trim().replace(/\/$/, "");
  if (origin && origin !== NEWS_ASSET_ORIGIN) {
    next = next.replace(
      /(<img\b[^>]*\bsrc=["'])https:\/\/www\.iconicimagestx\.com\//gi,
      `$1${origin}/`,
    );
    next = next.split(`${NEWS_ASSET_ORIGIN}/flash-sale`).join(`${origin}/flash-sale`);
  }
  if (next.includes("</head>")) next = next.replace("</head>", `${FRAME_FIT_STYLE}</head>`);
  if (next.includes("</body>")) next = next.replace("</body>", `${FRAME_FIT_SCRIPT}</body>`);
  return next;
}

/**
 * Build the two files a sent Admin Campaign needs in order to become a page.
 * Returns null unless the campaign was sent and has HTML. Does not send mail
 * and does not write to disk. The caller writes `directory`.
 */
export function newsFilesFromCampaign(campaign: CampaignNewsInput): NewsIssueFiles | null {
  if (campaign.status !== "sent") return null;
  const html = String(campaign.html || "");
  if (!html.trim()) return null;
  const slug = slugifyNews(campaign.newsSlug || campaign.name || campaign.subject || campaign.id);
  if (!slug || RESERVED_SLUGS.has(slug) || !SLUG_RE.test(slug)) return null;
  const category: NewsCategory = campaign.newsCategory === "promo" ? "promo" : "newsletter";
  const date = String(campaign.sentAt || "").slice(0, 10);
  if (!DATE_RE.test(date)) return null;
  const title = String(campaign.subject || campaign.name || slug).trim();
  const summary = String(campaign.newsSummary || campaign.preheader || campaign.subject || title).trim();
  if (!title || !summary) return null;
  const meta: NewsMeta = {
    title,
    slug,
    category,
    date,
    summary: summary.slice(0, 400),
    heroImage: String(campaign.newsHero || "").trim(),
  };
  return {
    directory: `content/news/${slug}`,
    slug,
    meta,
    metaJson: `${JSON.stringify(meta, null, 2)}\n`,
    emailHtml: html,
  };
}

/** Public Firestore listing only. A campaign without newsSlug stays in the admin tool. */
export function publicCampaignCard(campaign: CampaignNewsInput): NewsCard | null {
  if (!String(campaign.newsSlug || "").trim()) return null;
  const files = newsFilesFromCampaign(campaign);
  if (!files) return null;
  if (!files.meta.heroImage) return null;
  return { ...files.meta, path: newsIssuePath(files.meta), source: "campaign" };
}

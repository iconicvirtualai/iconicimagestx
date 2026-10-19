/**
 * Iconic Insights — business posts for /insights, plus a social pack Sasha downloads.
 * The site does not publish to Instagram, Facebook, or any other network.
 */

import { canonicalUrl, escapeHtml, ogImageUrl, SITE_ORIGIN } from "./siteSeo.ts";

export const INSIGHT_COLLECTION = "insightPosts";
export const INSIGHT_BYLINE = "Iconic Images";

export const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["id"];

export const INSIGHT_CATEGORIES = [
  "FEATURES",
  "FROM THE SHOOT",
  "LISTING MEDIA",
  "REAL ESTATE MARKETING",
  "VIDEO",
  "STUDIO NOTES",
] as const;

export const INSIGHT_TEMPLATES = [
  { id: "journal", label: "Journal thought", detail: "A note from the shoot, then why it matters." },
  { id: "value", label: "Value tip", detail: "What the frame is worth to the listing." },
  { id: "stat", label: "Stat spotlight", detail: "One number, then the story behind it." },
  { id: "social", label: "Social pack", detail: "Caption, assets, and the platforms for Sasha." },
] as const;

export type InsightTemplate = (typeof INSIGHT_TEMPLATES)[number]["id"];
export type InsightStatus = "draft" | "published";
export type InsightBlockType = "text" | "heading" | "image" | "video" | "carousel" | "quote" | "embed";

export const BLOCK_TYPES: { id: InsightBlockType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "heading", label: "Heading" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "carousel", label: "Carousel" },
  { id: "quote", label: "Quote / stat" },
  { id: "embed", label: "Embed" },
];

export interface InsightBlock {
  id: string;
  type: InsightBlockType;
  text: string;
  url: string;
  alt: string;
  urls: string[];
  stat: string;
}

export interface SocialAsset {
  id: string;
  url: string;
  name: string;
  kind: "image" | "video" | "graphic";
}

export interface SocialPack {
  caption: string;
  hashtags: string;
  platforms: SocialPlatform[];
  assets: SocialAsset[];
}

export interface InsightAuthor {
  uid: string;
  name: string;
}

export interface InsightPost {
  id: string;
  title: string;
  slug: string;
  status: InsightStatus;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  coverUrl: string;
  coverAlt: string;
  categories: string[];
  blocks: InsightBlock[];
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  author: InsightAuthor;
  readyForSocial: boolean;
  socialPack: SocialPack;
  template: InsightTemplate | "";
}

export interface PublicInsight {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  coverUrl: string;
  coverAlt: string;
  categories: string[];
  blocks: InsightBlock[];
  publishedAt: string | null;
  authorName: string;
}

const BLOCK_TYPE_SET = new Set<InsightBlockType>(BLOCK_TYPES.map((item) => item.id));
const PLATFORM_SET = new Set<string>(SOCIAL_PLATFORMS.map((item) => item.id));
const RESERVED_SLUGS = new Set(["prep", "admin"]);

export function insightId(prefix: string): string {
  const rand = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "insight";
}

export function isInsightSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !RESERVED_SLUGS.has(value);
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function safeMediaUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url.slice(0, 500);
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString().slice(0, 800);
  } catch {
    return "";
  }
  return "";
}

export function emptyBlock(type: InsightBlockType = "text"): InsightBlock {
  return { id: insightId("block"), type, text: "", url: "", alt: "", urls: [], stat: "" };
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function parseBlocks(value: unknown): InsightBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: InsightBlock[] = [];
  for (const item of value.slice(0, 40)) {
    const raw = asRecord(item);
    const type = BLOCK_TYPE_SET.has(raw.type as InsightBlockType) ? (raw.type as InsightBlockType) : null;
    if (!type) continue;
    const urls = Array.isArray(raw.urls) ? raw.urls.map((url) => safeMediaUrl(clip(url, 800))).filter(Boolean).slice(0, 12) : [];
    blocks.push({
      id: clip(raw.id, 80) || insightId("block"),
      type,
      text: clip(raw.text, 8000),
      url: safeMediaUrl(clip(raw.url, 800)),
      alt: clip(raw.alt, 180),
      urls,
      stat: clip(raw.stat, 40),
    });
  }
  return blocks;
}

function parsePlatforms(value: unknown): SocialPlatform[] {
  if (!Array.isArray(value)) return [];
  const found: SocialPlatform[] = [];
  for (const item of value) {
    const id = clip(item, 20);
    if (PLATFORM_SET.has(id) && !found.includes(id as SocialPlatform)) found.push(id as SocialPlatform);
  }
  return found;
}

function parseAssets(value: unknown): SocialAsset[] {
  if (!Array.isArray(value)) return [];
  const assets: SocialAsset[] = [];
  for (const item of value.slice(0, 24)) {
    const raw = asRecord(item);
    const url = safeMediaUrl(clip(raw.url, 800));
    if (!url) continue;
    const kind = raw.kind === "video" || raw.kind === "graphic" ? raw.kind : "image";
    assets.push({
      id: clip(raw.id, 80) || insightId("asset"),
      url,
      name: clip(raw.name, 120) || "asset",
      kind,
    });
  }
  return assets;
}

function parseSocialPack(value: unknown, fallback?: SocialPack): SocialPack {
  const raw = asRecord(value);
  const base = fallback || { caption: "", hashtags: "", platforms: [], assets: [] };
  if (!value || typeof value !== "object") return base;
  return {
    caption: clip(raw.caption, 2200),
    hashtags: clip(raw.hashtags, 500),
    platforms: raw.platforms ? parsePlatforms(raw.platforms) : base.platforms,
    assets: raw.assets ? parseAssets(raw.assets) : base.assets,
  };
}

function parseCategories(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const categories: string[] = [];
  for (const item of source) {
    const label = clip(item, 40);
    if (!label || categories.some((existing) => existing.toLowerCase() === label.toLowerCase())) continue;
    categories.push(label);
    if (categories.length >= 8) break;
  }
  return categories.length ? categories : ["FEATURES"];
}

function templateSeed(template: InsightTemplate): Pick<InsightPost, "title" | "categories" | "blocks" | "readyForSocial" | "socialPack"> {
  if (template === "journal") {
    return {
      title: "From the shoot",
      categories: ["FROM THE SHOOT"],
      readyForSocial: false,
      socialPack: { caption: "", hashtags: "", platforms: [], assets: [] },
      blocks: [
        { ...emptyBlock("heading"), text: "From the shoot" },
        { ...emptyBlock("text"), text: "What stood out on this shoot, and what an agent can do with it." },
      ],
    };
  }
  if (template === "value") {
    return {
      title: "A listing tip",
      categories: ["REAL ESTATE MARKETING"],
      readyForSocial: false,
      socialPack: { caption: "", hashtags: "", platforms: [], assets: [] },
      blocks: [
        { ...emptyBlock("heading"), text: "Use this on the next listing" },
        { ...emptyBlock("text"), text: "The practical step, and who it helps." },
        { ...emptyBlock("quote"), text: "The takeaway in one line." },
      ],
    };
  }
  if (template === "stat") {
    return {
      title: "Stat spotlight",
      categories: ["FEATURES"],
      readyForSocial: false,
      socialPack: { caption: "", hashtags: "", platforms: [], assets: [] },
      blocks: [
        { ...emptyBlock("quote"), stat: "", text: "Add the number, then one sentence on what it measures." },
        { ...emptyBlock("text"), text: "Where the number comes from." },
      ],
    };
  }
  return {
    title: "Social pack",
    categories: ["VIDEO"],
    readyForSocial: true,
    socialPack: {
      caption: "",
      hashtags: "#IconicImages #RealEstateMedia",
      platforms: [],
      assets: [],
    },
    blocks: [
      { ...emptyBlock("text"), text: "Write the post for Insights here. The caption and files for Sasha live in the social pack." },
    ],
  };
}

function isTemplate(value: unknown): value is InsightTemplate {
  return INSIGHT_TEMPLATES.some((item) => item.id === value);
}

function deriveExcerpt(excerpt: string, blocks: InsightBlock[]): string {
  if (excerpt.trim()) return excerpt.trim().slice(0, 300);
  const text = blocks.find((block) => block.type === "text" && block.text.trim())?.text || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function createInsightPost(input: unknown, actor: InsightAuthor, now = new Date().toISOString()): InsightPost {
  const raw = asRecord(input);
  const template = isTemplate(raw.template) ? raw.template : "";
  const starter = template ? templateSeed(template) : null;
  const title = clip(raw.title, 140) || starter?.title || "Untitled insight";
  const blocks = Array.isArray(raw.blocks) ? parseBlocks(raw.blocks) : starter?.blocks || [emptyBlock("text")];
  const excerpt = deriveExcerpt(clip(raw.excerpt, 300), blocks);
  const slugSource = clip(raw.slug, 80) || title;
  let slug = slugify(slugSource);
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-note`;
  const categories = parseCategories(raw.categories, starter?.categories || ["FEATURES"]);
  const readyForSocial = typeof raw.readyForSocial === "boolean" ? raw.readyForSocial : Boolean(starter?.readyForSocial);
  const socialPack = parseSocialPack(raw.socialPack, starter?.socialPack);
  const seoTitle = clip(raw.seoTitle, 70) || `${title} | Iconic Insights`.slice(0, 70);
  const seoDescription = clip(raw.seoDescription, 160) || excerpt.slice(0, 160);
  return {
    id: clip(raw.id, 80) || insightId("post"),
    title,
    slug,
    status: "draft",
    excerpt,
    seoTitle,
    seoDescription,
    coverUrl: safeMediaUrl(clip(raw.coverUrl, 800)),
    coverAlt: clip(raw.coverAlt, 180) || title,
    categories,
    blocks: blocks.length ? blocks : [emptyBlock("text")],
    publishedAt: null,
    updatedAt: now,
    createdAt: clip(raw.createdAt, 40) || now,
    author: { uid: clip(actor.uid, 80) || "staff", name: clip(actor.name, 80) || INSIGHT_BYLINE },
    readyForSocial,
    socialPack,
    template,
  };
}

export function updateInsightPost(current: InsightPost, input: unknown, now = new Date().toISOString()): InsightPost {
  const raw = asRecord(input);
  const merged = createInsightPost(
    {
      ...current,
      ...raw,
      blocks: raw.blocks ?? current.blocks,
      socialPack: raw.socialPack ?? current.socialPack,
      categories: raw.categories ?? current.categories,
      template: raw.template ?? current.template,
    },
    current.author,
    current.createdAt,
  );
  return {
    ...merged,
    id: current.id,
    status: current.status,
    publishedAt: current.publishedAt,
    createdAt: current.createdAt,
    updatedAt: now,
    author: current.author,
  };
}

export function normalizeStoredInsight(id: string, data: unknown): InsightPost | null {
  const raw = asRecord(data);
  if (!raw.title && !raw.slug && !raw.blocks) return null;
  const author = asRecord(raw.author);
  const post = createInsightPost(raw, {
    uid: clip(author.uid, 80) || "staff",
    name: clip(author.name, 80) || INSIGHT_BYLINE,
  }, clip(raw.updatedAt, 40) || new Date().toISOString());
  post.id = id || post.id;
  post.status = raw.status === "published" ? "published" : "draft";
  post.publishedAt = clip(raw.publishedAt, 40) || null;
  post.createdAt = clip(raw.createdAt, 40) || post.createdAt;
  post.updatedAt = clip(raw.updatedAt, 40) || post.updatedAt;
  post.author = {
    uid: clip(author.uid, 80) || "staff",
    name: clip(author.name, 80) || INSIGHT_BYLINE,
  };
  return post;
}

export function insightReadyToPublish(post: InsightPost): string | null {
  if (post.title.trim().length < 2 || post.title.trim().toLowerCase() === "untitled insight") {
    return "Add a title before publishing.";
  }
  const hasBody = Boolean(post.coverUrl) || post.blocks.some((block) => block.text.trim() || block.url || block.urls.length || block.stat.trim());
  if (!hasBody) return "Add a cover or a block before publishing.";
  return null;
}

export function toPublicInsight(post: InsightPost): PublicInsight {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    coverUrl: post.coverUrl,
    coverAlt: post.coverAlt,
    categories: post.categories,
    blocks: post.blocks,
    publishedAt: post.publishedAt,
    authorName: INSIGHT_BYLINE,
  };
}

export function coverOf(post: Pick<PublicInsight, "coverUrl" | "blocks">): string {
  if (post.coverUrl) return post.coverUrl;
  for (const block of post.blocks) {
    if ((block.type === "image" || block.type === "video") && block.url) return block.url;
    if (block.type === "carousel" && block.urls[0]) return block.urls[0];
  }
  return "";
}

export function absoluteInsightImage(url: string, origin = SITE_ORIGIN): string {
  if (!url) return ogImageUrl(origin);
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("/")) return `${origin}${url}`;
  return ogImageUrl(origin);
}

export function readingMinutes(post: Pick<PublicInsight, "title" | "excerpt" | "blocks">): number {
  const words = [post.title, post.excerpt, ...post.blocks.map((block) => `${block.text} ${block.stat}`)]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (!words) return 1;
  return Math.max(1, Math.round(words / 200));
}

export function primaryCategory(categories: string[]): string {
  return categories[0] || "FEATURES";
}

export function embedSrc(value: string): string {
  const safe = safeMediaUrl(value);
  if (!safe.startsWith("http")) return "";
  let parsed: URL;
  try {
    parsed = new URL(safe);
  } catch {
    return "";
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : "";
  }
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (parsed.pathname.startsWith("/embed/")) {
      const id = parsed.pathname.split("/")[2] || "";
      return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : "";
    }
    const id = parsed.searchParams.get("v") || "";
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : "";
  }
  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.split("/").filter(Boolean).pop() || "";
    return /^\d{6,}$/.test(id) ? `https://player.vimeo.com/video/${id}` : "";
  }
  if (host === "www.tiktok.com" || host === "www.instagram.com") return safe;
  return "";
}

export function insightHeadTags(post: PublicInsight, origin = SITE_ORIGIN): string {
  const title = escapeHtml(post.seoTitle || `${post.title} | Iconic Insights`);
  const description = escapeHtml(post.seoDescription || post.excerpt);
  const url = escapeHtml(canonicalUrl(`/insights/${post.slug}`, origin));
  const image = escapeHtml(absoluteInsightImage(coverOf(post), origin));
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

export function socialAssetFilename(asset: SocialAsset, index: number, contentType: string): string {
  const type = contentType.toLowerCase();
  const ext = type.includes("png")
    ? "png"
    : type.includes("web")
      ? "webp"
      : type.includes("jpeg") || type.includes("jpg")
        ? "jpg"
        : type.includes("quicktime")
          ? "mov"
          : type.includes("mp4") || type.includes("video")
            ? "mp4"
            : "";
  const cleaned = (asset.name || `asset-${index + 1}`).split(/[/\\]/).pop() || "";
  const named = cleaned.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `asset-${index + 1}`;
  if (!ext || named.toLowerCase().endsWith(`.${ext}`)) return named;
  return `${named}.${ext}`;
}

export function claimSlug(desired: string, selfId: string, posts: Pick<InsightPost, "id" | "slug">[]): string {
  let slug = slugify(desired);
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-note`;
  const taken = (candidate: string) => posts.some((post) => post.slug === candidate && post.id !== selfId);
  if (!taken(slug)) return slug;
  const stem = slug.slice(0, 70).replace(/-+$/g, "");
  for (let n = 2; n < 50; n += 1) {
    const next = `${stem}-${n}`;
    if (!taken(next)) return next;
  }
  return `${stem}-${Date.now().toString(36)}`;
}

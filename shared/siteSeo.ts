/**
 * Public SEO for the Vite SPA.
 *
 * iconicimagestx.com is listed on the Vercel project but is not verified, and
 * that hostname still serves the previous site. Canonical and social URLs use
 * the live app origin until VITE_SITE_ORIGIN points at the production domain.
 */

export const DEFAULT_SITE_ORIGIN = "https://iconicimagestx.vercel.app";

/** Drone still already used on the public marketing pages. */
export const OG_IMAGE_PATH = "/media/photos/drone-hero.jpg";

export const GENERIC_TITLE = "Iconic Images - Creative Media Partners";

export type PublicPage = {
  path: string;
  file: string;
  title: string;
  description: string;
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/",
    file: "index.html",
    title: "Iconic Images | Real Estate Media in Spring, The Woodlands, and Houston",
    description:
      "Photography, video, and listing media for real estate agents in Spring, The Woodlands, and Houston.",
  },
  {
    path: "/about",
    file: "seo/about.html",
    title: "About | Iconic Images",
    description:
      "Iconic Images is a Spring, Texas studio for real estate media, serving The Woodlands, Houston, and nearby communities since 2016.",
  },
  {
    path: "/pricing",
    file: "seo/pricing.html",
    title: "Pricing | Iconic Images",
    description:
      "Listing, branding, and media packages from Iconic Images for agents in Spring, The Woodlands, and Houston.",
  },
  {
    path: "/studio-105",
    file: "seo/studio-105.html",
    title: "Studio 105 | Iconic Images",
    description:
      "Studio 105 in Spring has two portrait rooms, Studio Noir and Studio Blanc, for headshots, brand films, and product photos.",
  },
  {
    path: "/portfolio",
    file: "seo/portfolio.html",
    title: "Portfolio | Iconic Images",
    description:
      "Listing photos, aerials, portraits, and virtual staging by Iconic Images in Spring, The Woodlands, and Houston.",
  },
  {
    path: "/stock-footage",
    file: "seo/stock-footage.html",
    title: "Stock Footage | Iconic Images",
    description:
      "Neighborhood photo stills from Iconic Images for agents listing homes in Spring, The Woodlands, and Houston.",
  },
  {
    path: "/contact",
    file: "seo/contact.html",
    title: "Contact | Iconic Images",
    description:
      "Contact Iconic Images in Spring, Texas about real estate photography and video in The Woodlands and Houston.",
  },
  {
    path: "/socials",
    file: "seo/socials.html",
    title: "Socials | Iconic Images",
    description:
      "Instagram, Facebook, and TikTok from Iconic Images, a real estate media studio in Spring, The Woodlands, and Houston.",
  },
  {
    path: "/book",
    file: "seo/book.html",
    title: "Book a Shoot | Iconic Images",
    description: "Schedule listing photography or video with Iconic Images in Spring, The Woodlands, or Houston.",
  },
  {
    path: "/privacy",
    file: "seo/privacy.html",
    title: "Privacy Policy | Iconic Images",
    description: "Privacy Policy for Iconic Images Photography, LLC, a real estate media studio based in Spring, Texas.",
  },
  {
    path: "/terms",
    file: "seo/terms.html",
    title: "Terms and Conditions | Iconic Images",
    description: "Terms and Conditions for photography, video, and listing media from Iconic Images in Texas.",
  },
  {
    path: "/login",
    file: "seo/login.html",
    title: "Client Login | Iconic Images",
    description: "Client sign-in for Iconic Images. View your listings and delivered media.",
  },
];

function readConfiguredOrigin(): string {
  const viteOrigin =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_SITE_ORIGIN
      : "";
  const nodeOrigin = typeof process !== "undefined" ? process.env?.VITE_SITE_ORIGIN : "";
  return String(viteOrigin || nodeOrigin || "")
    .trim()
    .replace(/\/$/, "");
}

export const SITE_ORIGIN = readConfiguredOrigin() || DEFAULT_SITE_ORIGIN;

export function normalizePath(pathname: string): string {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function canonicalUrl(path: string, origin = SITE_ORIGIN): string {
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

export function ogImageUrl(origin = SITE_ORIGIN): string {
  return `${origin}${OG_IMAGE_PATH}`;
}

/** Private trees. /studio-105 is public and must not match /studio/. */
export function isNoIndexPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  if (path === "/portal" || path.startsWith("/portal/")) return true;
  if (path === "/owners" || path.startsWith("/owners/")) return true;
  if (path.startsWith("/studio/")) return true;
  if (path.startsWith("/gallery/")) return true;
  if (path === "/invoice" || path.startsWith("/invoice/")) return true;
  return false;
}

export type MetaPlan =
  | { kind: "public"; title: string; description: string; canonical: string; image: string }
  | { kind: "noindex"; title: string }
  | { kind: "generic"; title: string }
  | { kind: "preserve-title" }
  | { kind: "hands-off" };

export function metaPlan(pathname: string, origin = SITE_ORIGIN): MetaPlan {
  const path = normalizePath(pathname);
  if (path === "/present" || path.startsWith("/present/")) return { kind: "hands-off" };
  if (path === "/go") return { kind: "preserve-title" };
  if (isNoIndexPath(path)) return { kind: "noindex", title: GENERIC_TITLE };
  const page = PUBLIC_PAGES.find((item) => item.path === path);
  if (!page) return { kind: "generic", title: GENERIC_TITLE };
  return {
    kind: "public",
    title: page.title,
    description: page.description,
    canonical: canonicalUrl(page.path, origin),
    image: ogImageUrl(origin),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPublicMetaTag(tag: string): boolean {
  return /(?:\bname|\bproperty)\s*=\s*["'](?:description|robots|og:[^"']*|twitter:[^"']*)["']/i.test(tag);
}

/** Drop description, robots, canonical, and social tags. Leave the document title. */
export function stripPublicMeta(html: string): string {
  return html
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*\/?>\s*/gi, "")
    .replace(/<meta\b[^>]*\/?>\s*/gi, (tag) => (isPublicMetaTag(tag) ? "" : tag));
}

export function pageHeadTags(page: PublicPage, origin = SITE_ORIGIN): string {
  const image = ogImageUrl(origin);
  const url = canonicalUrl(page.path, origin);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join("\n    ");
}

export function injectHead(html: string, tags: string): string {
  let next = stripPublicMeta(html).replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, "");
  if (next.includes("</head>")) {
    return next.replace("</head>", `    ${tags}\n  </head>`);
  }
  return `${tags}\n${next}`;
}

export function injectPublicPage(html: string, page: PublicPage, origin = SITE_ORIGIN): string {
  return injectHead(html, pageHeadTags(page, origin));
}

export function injectNoIndex(html: string): string {
  const tags = `<title>${escapeHtml(GENERIC_TITLE)}</title>\n    <meta name="robots" content="noindex, nofollow" />`;
  return injectHead(html, tags);
}

export function sitemapXml(origin = DEFAULT_SITE_ORIGIN): string {
  const urls = PUBLIC_PAGES.map(
    (page) => `  <url><loc>${escapeHtml(canonicalUrl(page.path, origin))}</loc></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(origin = DEFAULT_SITE_ORIGIN): string {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /portal
Disallow: /owners
Disallow: /studio/
Disallow: /gallery/
Disallow: /api
Disallow: /invoice

Sitemap: ${origin}/sitemap.xml
`;
}

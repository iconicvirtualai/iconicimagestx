/**
 * Vercel routes for the Vite SPA.
 * Unknown paths are left unmatched so public/404.html is served with status 404.
 * Owner pages stay on the API function, ahead of the /admin prefix.
 */

import { PUBLIC_PAGES } from "./siteSeo";

export type Rewrite = { source: string; destination: string };
export type Redirect = {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
};
export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const PRIVATE_SHELL = "/seo/private.html";
const APP_SHELL = "/seo/app.html";
const NOINDEX = "noindex, nofollow";

/** SPA routes that are not public marketing pages and not a private prefix. */
const APP_SHELL_SOURCES = [
  "/pricing/ai-assistant",
  "/agents",
  "/insights",
  "/insights/prep",
  "/unsubscribe",
  "/go",
  "/listing-cards",
  "/invoice/:invoiceId",
  "/services/virtual-staging",
  "/services/virtual-staging/select",
  "/services/virtual-staging/ai-tool",
  "/services/virtual-staging/pro-order",
  "/services/virtual-staging/checkout",
];

/** Stays in APP_SHELL_SOURCES so rewrite order does not move. Served noindex. */
const PRIVATE_EXACT_SOURCES = new Set(["/invoice/:invoiceId"]);

const RESERVED: Rewrite[] = [
  { source: "/api", destination: "/api/index" },
  { source: "/api/(.*)", destination: "/api/index" },
  // Vercel does not chain rewrites. /present/:token arrives at the API
  // function on its original path, and that rule stays ahead of the SEO shells.
  { source: "/present/:token", destination: "/api/index" },
  { source: "/admin/owners", destination: "/api/index" },
  { source: "/owners", destination: "/api/index" },
  { source: "/podcast-guest-prep", destination: "/podcast-guest-prep.html" },
];

function withSlashVariants(rules: Rewrite[]): Rewrite[] {
  const out: Rewrite[] = [];
  for (const rule of rules) {
    out.push(rule);
    if (rule.source.includes("(") || rule.source.includes("*") || rule.source.endsWith("/")) continue;
    out.push({ ...rule, source: `${rule.source}/` });
  }
  return out;
}

export function buildVercelRewrites(): Rewrite[] {
  const spa: Rewrite[] = PUBLIC_PAGES.map((page) => ({
    source: page.path,
    destination: `/${page.file}`,
  }));
  for (const source of APP_SHELL_SOURCES) {
    spa.push({
      source,
      destination: PRIVATE_EXACT_SOURCES.has(source) ? PRIVATE_SHELL : APP_SHELL,
    });
  }
  spa.push(
    { source: "/studio/:listingId", destination: PRIVATE_SHELL },
    { source: "/gallery/:galleryId", destination: PRIVATE_SHELL },
    { source: "/admin", destination: PRIVATE_SHELL },
    { source: "/admin/(.*)", destination: PRIVATE_SHELL },
    { source: "/portal", destination: PRIVATE_SHELL },
    { source: "/portal/(.*)", destination: PRIVATE_SHELL },
  );
  return [...withSlashVariants(RESERVED), ...withSlashVariants(spa)];
}

export function buildVercelRedirects(): Redirect[] {
  return [
    { source: "/pricing-v1", destination: "/pricing", statusCode: 301 },
    { source: "/pricing-v1/", destination: "/pricing", statusCode: 301 },
    { source: "/studio", destination: "/studio-105", permanent: false },
    { source: "/studio/", destination: "/studio-105", permanent: false },
    { source: "/gallery", destination: "/portal", permanent: false },
    { source: "/gallery/", destination: "/portal", permanent: false },
  ];
}

export const NOINDEX_HEADER_SOURCES = [
  "/admin",
  "/admin/(.*)",
  "/portal",
  "/portal/(.*)",
  "/owners",
  "/owners/(.*)",
  "/studio/(.*)",
  "/gallery/(.*)",
  "/seo/(.*)",
  "/invoice",
  "/invoice/(.*)",
  "/podcast-guest-prep",
  "/podcast-guest-prep/",
];

export function buildVercelHeaders(): HeaderRule[] {
  return NOINDEX_HEADER_SOURCES.map((source) => ({
    source,
    headers: [{ key: "X-Robots-Tag", value: NOINDEX }],
  }));
}

export function compileVercelSource(source: string): RegExp {
  let regex = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "(") {
      const end = source.indexOf(")", i);
      if (end < 0) throw new Error(`Unclosed group in ${source}`);
      regex += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === ":") {
      const match = /^:([A-Za-z0-9_]+)([*+?])?/.exec(source.slice(i));
      if (!match) throw new Error(`Bad parameter in ${source}`);
      const mod = match[2] || "";
      i += match[0].length;
      if ((mod === "*" || mod === "?") && regex.endsWith("/")) {
        regex = regex.slice(0, -1) + (mod === "*" ? "(?:/.*)?" : "(?:/[^/]+)?");
      } else if (mod === "*") regex += ".*";
      else if (mod === "+") regex += ".+";
      else if (mod === "?") regex += "[^/]*";
      else regex += "[^/]+";
      continue;
    }
    regex += "\\^$+?.*|[]{}".includes(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  return new RegExp(`^${regex}$`);
}

export function firstMatchingRewrite(pathname: string, rules = buildVercelRewrites()): Rewrite | undefined {
  return rules.find((rule) => compileVercelSource(rule.source).test(pathname));
}

export function htmlFileForRequestPath(pathname: string, rules = buildVercelRewrites()): string | null {
  const pathOnly = pathname.split("?")[0].split("#")[0] || "/";
  const rule = firstMatchingRewrite(pathOnly, rules);
  if (!rule?.destination.endsWith(".html")) return null;
  return rule.destination.replace(/^\//, "");
}

export function routerPathsFromAppSource(source: string): string[] {
  const paths: string[] = [];
  const re = /<Route\s+[^>]*path=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) paths.push(match[1]);
  return paths;
}

export function probesForRoute(routePath: string): string[] {
  if (routePath === "*") return [];
  const fill = (token: string) => routePath.replace(/:[A-Za-z0-9_]+/g, token);
  const primary = fill("id1");
  const secondary = fill("id-2");
  return primary === secondary ? [primary] : [primary, secondary];
}

export function routeCovered(
  routePath: string,
  rewrites = buildVercelRewrites(),
  redirects = buildVercelRedirects(),
): boolean {
  const probes = probesForRoute(routePath);
  if (probes.length === 0) return false;
  return probes.every((probe) => {
    if (firstMatchingRewrite(probe, rewrites)) return true;
    return redirects.some((rule) => compileVercelSource(rule.source).test(probe));
  });
}

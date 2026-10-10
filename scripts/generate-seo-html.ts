import fs from "node:fs";
import path from "node:path";
import { PUBLIC_PAGES, injectNoIndex, injectPublicPage, robotsTxt, sitemapXml, SITE_ORIGIN } from "../shared/siteSeo";

const dist = path.resolve("dist/spa");
const shellPath = path.join(dist, "index.html");

if (!fs.existsSync(shellPath)) {
  console.error("dist/spa/index.html is missing. Run vite build first.");
  process.exit(1);
}

const shell = fs.readFileSync(shellPath, "utf8");
fs.mkdirSync(path.join(dist, "seo"), { recursive: true });
fs.writeFileSync(path.join(dist, "seo/app.html"), shell);
fs.writeFileSync(path.join(dist, "seo/private.html"), injectNoIndex(shell));

for (const page of PUBLIC_PAGES) {
  const html = injectPublicPage(shell, page, SITE_ORIGIN);
  const target = path.join(dist, page.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}

fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemapXml(SITE_ORIGIN));
fs.writeFileSync(path.join(dist, "robots.txt"), robotsTxt(SITE_ORIGIN));

const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (!home.includes('property="og:title"') || !home.includes('rel="canonical"')) {
  console.error("Home index.html is missing canonical or Open Graph tags.");
  process.exit(1);
}

console.log(`Wrote SEO shells for ${PUBLIC_PAGES.length} public pages at ${SITE_ORIGIN}`);

import fs from "node:fs";
import path from "node:path";
import {
  CANONICAL_WWW_ORIGIN,
  PUBLIC_PAGES,
  injectNoIndex,
  injectPublicPage,
  stampCanonical,
  stampOgUrl,
  wwwShellFile,
} from "../shared/siteSeo";

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
  const html = injectPublicPage(shell, page, CANONICAL_WWW_ORIGIN);
  const target = path.join(dist, page.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  const wwwTarget = path.join(dist, wwwShellFile(page.file));
  fs.mkdirSync(path.dirname(wwwTarget), { recursive: true });
  fs.writeFileSync(wwwTarget, html);
}

// Holiday pages are static HTML. Both the file Vercel serves and the www copy
// carry the same www canonical and og:url. Body links are left alone.
for (const name of ["thankful.html", "tis-the-season.html"]) {
  const source = path.join(dist, name);
  if (!fs.existsSync(source)) continue;
  const href = `${CANONICAL_WWW_ORIGIN}/${name.replace(/\.html$/, "")}`;
  const html = stampOgUrl(stampCanonical(fs.readFileSync(source, "utf8"), href), href);
  fs.writeFileSync(source, html);
  const wwwTarget = path.join(dist, "seo/www", name);
  fs.mkdirSync(path.dirname(wwwTarget), { recursive: true });
  fs.writeFileSync(wwwTarget, html);
}

// public/sitemap.xml and robots.txt are copied into dist by Vite and are the
// vercel.app copies. Leaving them here would beat the host-aware API route.
for (const name of ["sitemap.xml", "robots.txt"]) {
  fs.rmSync(path.join(dist, name), { force: true });
}

const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (!home.includes('property="og:title"') || !home.includes('rel="canonical"')) {
  console.error("Home index.html is missing canonical or Open Graph tags.");
  process.exit(1);
}
if (
  !home.includes('rel="canonical" href="https://www.iconicimagestx.com/"') ||
  !home.includes('property="og:url" content="https://www.iconicimagestx.com/"') ||
  !home.includes('property="og:image" content="https://www.iconicimagestx.com/')
) {
  console.error("Home index.html canonical, og:url, or og:image is not https://www.iconicimagestx.com.");
  process.exit(1);
}

const shells = [
  ...PUBLIC_PAGES.flatMap((page) => [page.file, wwwShellFile(page.file)]),
  "thankful.html",
  "tis-the-season.html",
  "seo/www/thankful.html",
  "seo/www/tis-the-season.html",
];
for (const file of shells) {
  const full = path.join(dist, file);
  if (!fs.existsSync(full)) continue;
  const tags = fs.readFileSync(full, "utf8").match(
    /<(?:link|meta)\b[^>]*(?:rel="canonical"|property="og:url"|property="og:image"|name="twitter:image")[^>]*>/gi,
  ) || [];
  for (const tag of tags) {
    if (tag.includes("vercel.app")) {
      console.error(`${file} still points a public SEO URL at vercel.app: ${tag}`);
      process.exit(1);
    }
  }
}

console.log(`Wrote SEO shells for ${PUBLIC_PAGES.length} public pages at ${CANONICAL_WWW_ORIGIN}`);

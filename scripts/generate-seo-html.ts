import fs from "node:fs";
import path from "node:path";
import {
  CANONICAL_WWW_ORIGIN,
  PUBLIC_PAGES,
  injectNoIndex,
  injectPublicPage,
  stampCanonical,
  wwwShellFile,
  SITE_ORIGIN,
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
  const html = injectPublicPage(shell, page, SITE_ORIGIN);
  const target = path.join(dist, page.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  const wwwHtml = injectPublicPage(shell, page, CANONICAL_WWW_ORIGIN);
  const wwwTarget = path.join(dist, wwwShellFile(page.file));
  fs.mkdirSync(path.dirname(wwwTarget), { recursive: true });
  fs.writeFileSync(wwwTarget, wwwHtml);
}

// Holiday pages keep their vercel.app HTML. The www copy only adds a canonical
// link so the custom domain does not inherit the app origin.
for (const name of ["thankful.html", "tis-the-season.html"]) {
  const source = path.join(dist, name);
  if (!fs.existsSync(source)) continue;
  const href = `${CANONICAL_WWW_ORIGIN}/${name.replace(/\.html$/, "")}`;
  const wwwTarget = path.join(dist, "seo/www", name);
  fs.mkdirSync(path.dirname(wwwTarget), { recursive: true });
  fs.writeFileSync(wwwTarget, stampCanonical(fs.readFileSync(source, "utf8"), href));
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

console.log(`Wrote SEO shells for ${PUBLIC_PAGES.length} public pages at ${SITE_ORIGIN}`);

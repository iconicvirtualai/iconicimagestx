/**
 * HTML for a real 404 on bare /studio and /gallery.
 * When the built SPA shell is present, the client route replaces this preview
 * with the public header, footer, and the same message.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  BARE_CLIENT_ROUTE_LINKS,
  BARE_CLIENT_ROUTE_TITLE,
  bareClientRouteKind,
  bareClientRouteMessage,
  type BareClientRouteKind,
} from "../../shared/bareClientRoute";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const linkStyle =
  "display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 22px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;text-decoration:none";

export function bareNotFoundFragment(kind: BareClientRouteKind): string {
  const links = BARE_CLIENT_ROUTE_LINKS.map((link, index) => {
    const paint =
      index === 0
        ? "background:#fff;color:#000"
        : link.href === "/login"
          ? "background:#2dd4bf;color:#000"
          : "border:1px solid rgba(255,255,255,.28);color:#fff";
    return `<a href="${link.href}" style="${linkStyle};${paint}">${escapeHtml(link.label)}</a>`;
  }).join("");
  const studioNote =
    kind === "studio"
      ? `<p style="margin:28px 0 0;color:#9ca3af;font-size:14px">Looking for the physical studio? <a href="/studio-105" style="color:#fff;font-weight:700">Studio 105</a></p>`
      : "";
  return `<main data-bare-not-found="page" style="min-height:100vh;box-sizing:border-box;margin:0;background:#000;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column">
  <header style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:28px 24px">
    <a href="/" style="color:#fff;text-decoration:none;font-weight:800;letter-spacing:.12em;font-size:13px">ICONIC IMAGES</a>
    <a href="/login" style="color:rgba(255,255,255,.75);text-decoration:none;font-size:12px;font-weight:700">Log in</a>
  </header>
  <section style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:720px;text-align:center">
      <p style="color:#2dd4bf;font-size:11px;font-weight:800;letter-spacing:.45em;text-transform:uppercase;margin:0 0 16px">404</p>
      <h1 style="font-size:clamp(40px,8vw,72px);line-height:.95;letter-spacing:-.04em;text-transform:uppercase;margin:0">${BARE_CLIENT_ROUTE_TITLE}</h1>
      <p style="color:#d1d5db;font-size:18px;line-height:1.6;margin:24px auto 0;max-width:36rem">${escapeHtml(bareClientRouteMessage(kind))}</p>
      <nav aria-label="Helpful pages" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:36px">${links}</nav>
      ${studioNote}
    </div>
  </section>
</main>`;
}

export function bareNotFoundDocument(kind: BareClientRouteKind): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${BARE_CLIENT_ROUTE_TITLE} | Iconic Images</title>
</head>
<body style="margin:0;background:#000;color:#fff">
${bareNotFoundFragment(kind)}
</body>
</html>`;
}

export function applyBareNotFound(shell: string, pathname: string): string {
  const kind = bareClientRouteKind(pathname) ?? "studio";
  if (!shell.includes('id="root"')) return bareNotFoundDocument(kind);
  let html = shell;
  if (!/name=["']robots["']/i.test(html)) {
    html = html.replace("</head>", `    <meta name="robots" content="noindex" />\n  </head>`);
  }
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${BARE_CLIENT_ROUTE_TITLE} | Iconic Images</title>`);
  if (!html.includes('data-bare-not-found="style"')) {
    html = html.replace(
      "</head>",
      `    <style data-bare-not-found="style">html,body{background:#000;color:#fff}</style>\n  </head>`,
    );
  }
  const fragment = bareNotFoundFragment(kind);
  if (/<div id="root">\s*<\/div>/.test(html)) {
    html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${fragment}</div>`);
  } else if (!html.includes('data-bare-not-found="page"')) {
    html = html.replace("</body>", `${fragment}\n  </body>`);
  }
  return html;
}

export async function renderBareClientNotFound(pathname: string): Promise<string> {
  const shellPath = path.join(process.cwd(), "dist/spa/index.html");
  try {
    const shell = await fs.readFile(shellPath, "utf8");
    if (shell.includes('id="root"')) return applyBareNotFound(shell, pathname);
  } catch {
    // Dev and unit tests have no production shell. The standalone document is the 404.
  }
  return bareNotFoundDocument(bareClientRouteKind(pathname) ?? "studio");
}

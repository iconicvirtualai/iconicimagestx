/**
 * Owners Suite routes.
 * Missing auth, a non-owner, and a staff admin all receive 404.
 * Responses are private and uncacheable. Financial cells are not logged.
 */

import fs from "fs/promises";
import path from "path";
import type { Express, Request, Response } from "express";
import {
  resolveOwnerIdentity,
  sessionCookieHeader,
  signOwnerSession,
  ownerRuntimeEnv,
  ownerSessionSecret,
} from "../services/ownerGate";
import { loadOwnerSuite } from "../services/ownerSheets";
import { OWNER_WHY } from "../services/ownerWhy";

const NOT_FOUND = { error: "Not found" };

export function mountOwners(app: Express) {
  const page = ["/admin/owners", "/admin/owners/", "/owners", "/owners/", "/api/owners/page"];
  app.get(page, (req, res) => {
    void handleOwnersPage(req, res);
  });
  app.get("/api/owners/suite", (req, res) => {
    void handleSuite(req, res);
  });
  app.post("/api/owners/session", (req, res) => {
    void handleSession(req, res);
  });
  app.post("/api/owners/logout", (_req, res) => {
    setPrivate(res);
    res.setHeader("Set-Cookie", sessionCookieHeader("", ownerRuntimeEnv(), 0));
    res.status(204).end();
  });
}

async function handleSuite(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  const fresh = req.query.fresh === "1";
  const payload = await loadOwnerSuite({ fresh });
  return res.status(200).json({ ...payload, why: OWNER_WHY });
}

async function handleSession(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  const secret = ownerSessionSecret();
  if (!owner || !secret) return res.status(404).json(NOT_FOUND);
  const token = signOwnerSession(owner, secret);
  res.setHeader("Set-Cookie", sessionCookieHeader(token));
  return res.status(200).json({ ok: true });
}

async function handleOwnersPage(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).type("html").send(NOT_FOUND_HTML);
  const html = injectDevPreamble(injectRobots((await readSpaShell()) || FALLBACK_SHELL));
  return res.status(200).type("html").send(html);
}

function setPrivate(res: Response) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Vary", "Cookie, Authorization");
}

function injectDevPreamble(html: string): string {
  if (process.env.ICONIC_VITE_DEV !== "1" || html.includes("/@react-refresh")) return html;
  const preamble = `<script type="module">
import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
</script>`;
  return html.includes("</head>") ? html.replace("</head>", `${preamble}\n  </head>`) : `${preamble}${html}`;
}

function injectRobots(html: string): string {
  if (html.includes('name="robots"')) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", '    <meta name="robots" content="noindex, nofollow" />\n  </head>');
  }
  return `<!doctype html><meta name="robots" content="noindex, nofollow" />${html}`;
}

async function readSpaShell(): Promise<string | null> {
  const source = path.join(process.cwd(), "index.html");
  const dist = path.join(process.cwd(), "dist/spa/index.html");
  const preferred = process.env.ICONIC_VITE_DEV === "1" ? [source, dist] : [dist, source];
  for (const file of preferred) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
  }
  return null;
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Page not found</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:Inter,system-ui,sans-serif;color:#111827">
    <div style="text-align:center">
      <h1 style="font-size:2.25rem;margin:0 0 .75rem">404</h1>
      <p style="margin:0 0 1rem;color:#4b5563">Page not found</p>
      <a href="/" style="color:#3b82f6">Return to Home</a>
    </div>
  </body>
</html>`;

const FALLBACK_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Iconic Images</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/main.tsx"></script>
  </body>
</html>`;

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
import { listOwnerEditorJobs, readOwnerEditorJob, startOwnerEditorJob, stepOwnerEditorJob } from "../services/ownerEditorJobs";
import { listOwnerOrders, submitOwnerOrder } from "../services/ownerOrders";
import { OWNER_WHY } from "../services/ownerWhy";
import { GENERIC_TITLE, stripPublicMeta } from "../../shared/siteSeo";

const NOT_FOUND = { error: "Not found" };
/** Where a signed-out visit to an owner page is sent. The login page is the generic staff login. */
export const OWNER_LOGIN_REDIRECT = "/admin/login?next=/admin/owners";
const OWNER_PAGE_PATHS = new Set(["/admin/owners", "/admin/owners/", "/owners", "/owners/"]);

export function mountOwners(app: Express) {
  const page = ["/admin/owners", "/admin/owners/", "/owners", "/owners/", "/api/owners/page"];
  app.get(page, (req, res) => {
    void handleOwnersPage(req, res);
  });
  app.get("/api/owners/suite", (req, res) => {
    void handleSuite(req, res);
  });
  app.get("/api/owners/orders", (req, res) => {
    void handleOrdersGet(req, res);
  });
  app.post("/api/owners/orders", (req, res) => {
    void handleOrdersPost(req, res);
  });
  app.get("/api/owners/editor/jobs", (req, res) => {
    void handleEditorJobsGet(req, res);
  });
  app.post("/api/owners/editor/jobs", (req, res) => {
    void handleEditorJobsPost(req, res);
  });
  app.get("/api/owners/editor/jobs/:id", (req, res) => {
    void handleEditorJobGet(req, res);
  });
  app.post("/api/owners/editor/jobs/:id/tick", (req, res) => {
    void handleEditorJobTick(req, res);
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

async function handleOrdersGet(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  try {
    const payload = await listOwnerOrders();
    return res.status(200).json(payload);
  } catch (error) {
    console.error(`[Owners] Orders read failed (${errorStatus(error)})`);
    return res.status(500).json({ error: "Orders could not be read." });
  }
}

async function handleOrdersPost(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  try {
    const result = await submitOwnerOrder({ raw: req.body?.text, ownerEmail: owner.email });
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ order: result.order });
  } catch (error) {
    console.error(`[Owners] Orders write failed (${errorStatus(error)})`);
    return res.status(500).json({ error: "The order could not be saved." });
  }
}

async function handleEditorJobsGet(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  return res.status(200).json({ jobs: listOwnerEditorJobs(owner.email) });
}

async function handleEditorJobsPost(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  const result = startOwnerEditorJob(req.body, owner.email);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  return res.status(201).json({ job: result.job });
}

async function handleEditorJobTick(req: Request, res: Response) {
  setPrivate(res);
  const id = String(req.params.id || "");
  if (!/^ed_[a-f0-9]{16}$/.test(id)) return res.status(404).json(NOT_FOUND);
  const owner = cronAuthorized(req) ? null : await resolveOwnerIdentity(req.headers);
  if (!cronAuthorized(req) && !owner) return res.status(404).json(NOT_FOUND);
  if (owner && !readOwnerEditorJob(owner.email, id)) return res.status(404).json(NOT_FOUND);
  const job = await stepOwnerEditorJob(id);
  if (!job) return res.status(404).json(NOT_FOUND);
  return res.status(200).json({ job });
}

function cronAuthorized(req: Request): boolean {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return Boolean(secret) && value === `Bearer ${secret}`;
}

async function handleEditorJobGet(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  const id = String(req.params.id || "");
  if (!/^ed_[a-f0-9]{16}$/.test(id)) return res.status(404).json(NOT_FOUND);
  const job = readOwnerEditorJob(owner.email, id);
  if (!job) return res.status(404).json(NOT_FOUND);
  return res.status(200).json({ job });
}

function errorStatus(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code);
  return "error";
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
  if (!owner) {
    // A browser visit carries no bearer token, so with no owner session it is
    // sent to the generic login. A failed bearer and /api/owners/page stay 404.
    if (OWNER_PAGE_PATHS.has(req.path) && !hasBearer(req)) {
      res.setHeader("Location", OWNER_LOGIN_REDIRECT);
      return res.status(302).end();
    }
    return res.status(404).type("html").send(NOT_FOUND_HTML);
  }
  const html = injectDevPreamble(injectRobots((await readSpaShell()) || FALLBACK_SHELL));
  return res.status(200).type("html").send(html);
}

function hasBearer(req: Request): boolean {
  const value = req.headers.authorization;
  const header = Array.isArray(value) ? value[0] : value;
  return typeof header === "string" && header.trim().length > 0;
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
  let next = stripPublicMeta(html).replace(/<title>[\s\S]*?<\/title>/i, `<title>${GENERIC_TITLE}</title>`);
  const robots = '<meta name="robots" content="noindex, nofollow" />';
  if (!next.includes("<title>")) {
    next = next.includes("</head>")
      ? next.replace("</head>", `    <title>${GENERIC_TITLE}</title>\n  </head>`)
      : `<title>${GENERIC_TITLE}</title>${next}`;
  }
  if (next.includes("</head>")) {
    return next.replace("</head>", `    ${robots}\n  </head>`);
  }
  return `<!doctype html>${robots}${next}`;
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
  <body style="margin:0;min-height:clamp(560px,50vw,820px);display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:Inter,system-ui,sans-serif;color:#111827">
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

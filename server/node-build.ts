import fs from "fs";
import path from "path";
import { createServer } from "./index";
import { handleMediaDisplay } from "./routes/mediaDisplay";
import * as express from "express";
import { htmlFileForRequestPath, matchingRedirect, redirectLocation } from "@shared/spaRouting";
import { renderPresentationShell } from "./routes/presentations";
import { renderListingSiteShell } from "./routes/listingSite";

const app = createServer();
app.get("/api/media/display/p/:token/:index", handleMediaDisplay);
app.get("/api/media/display/o/:signedToken/:index", handleMediaDisplay);
app.get("/api/media/display/:listingId/:index", handleMediaDisplay);
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// Apex custom domain → www, before static files and page routes.
// Path redirects for retired Wix URLs stay in the catch-all below.
app.use((req, res, next) => {
  const rule = matchingRedirect(req.path, req.get("host"));
  if (!rule?.has) return next();
  res.redirect(rule.statusCode ?? 301, redirectLocation(rule, req.path, req.originalUrl));
});

// Serve static files
app.use(express.static(distPath));

// Standalone guest-prep sheet. The SPA catch-all below would otherwise
// return the marketing app for this clean URL.
const podcastGuestPrep = path.join(distPath, "podcast-guest-prep.html");
app.get(["/podcast-guest-prep", "/podcast-guest-prep/"], (_req, res) => {
  res.sendFile(podcastGuestPrep);
});

/** Prefer the host-matched shell (www canonical on the custom domain). */
function shellFor(req: express.Request, fallback: string): string {
  const rel = htmlFileForRequestPath(req.path, undefined, req.get("host"));
  if (!rel) return fallback;
  const file = path.join(distPath, rel);
  return fs.existsSync(file) ? file : fallback;
}

const thankfulPage = path.join(distPath, "thankful.html");
app.get(["/thankful", "/thankful/"], (req, res) => {
  res.sendFile(shellFor(req, thankfulPage));
});

const tisTheSeasonPage = path.join(distPath, "tis-the-season.html");
app.get(["/tis-the-season", "/tis-the-season/"], (req, res) => {
  res.sendFile(shellFor(req, tisTheSeasonPage));
});

// Retired pricing page. Must stay ahead of the SPA catch-all so crawlers get a real 301.
app.get(["/pricing-v1", "/pricing-v1/"], (_req, res) => {
  res.redirect(301, "/pricing");
});

// Bare /studio has no project id. Studio 105 is the public studio page.
app.get(["/studio", "/studio/"], (_req, res) => {
  res.redirect(302, "/studio-105");
});

// Bare /gallery has no project id. The client portal is the door.
app.get(["/gallery", "/gallery/"], (_req, res) => {
  res.redirect(302, "/portal");
});

// Known SPA routes serve their shell. Anything else is a real 404.
app.get("/{*splat}", async (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  const presentation = req.path.match(/^\/present\/([^/]+)\/?$/);
  if (presentation) {
    const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const rendered = await renderPresentationShell(decodeURIComponent(presentation[1]), origin);
    res.setHeader("Cache-Control", "no-store");
    return res.status(rendered.status).type("html").send(rendered.html);
  }

  const listingSite = req.path.match(/^\/l\/([^/]+)\/?$/);
  if (listingSite) {
    const rendered = await renderListingSiteShell(decodeURIComponent(listingSite[1]));
    res.setHeader("Cache-Control", "no-store");
    return res.status(rendered.status).type("html").send(rendered.html);
  }

  const launchRedirect = matchingRedirect(req.path, req.get("host"));
  if (launchRedirect && launchRedirect.statusCode === 301) {
    return res.redirect(301, redirectLocation(launchRedirect, req.path, req.originalUrl));
  }

  const rel = htmlFileForRequestPath(req.path, undefined, req.get("host"));
  if (rel) {
    const file = path.join(distPath, rel);
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.sendFile(path.join(distPath, "index.html"));
  }

  const missing = path.join(distPath, "404.html");
  if (fs.existsSync(missing)) {
    return res.status(404).type("html").send(fs.readFileSync(missing));
  }
  return res.status(404).type("html").send("Page not found");
});

app.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});

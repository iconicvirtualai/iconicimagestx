import path from "path";
import { createServer } from "./index";
import * as express from "express";
import { renderPresentationShell } from "./routes/presentations";
import { isBareClientRoute } from "../shared/bareClientRoute";
import { renderBareClientNotFound } from "./lib/bareClientNotFound";

const app = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// Serve static files
app.use(express.static(distPath));

// Standalone guest-prep sheet. The SPA catch-all below would otherwise
// return the marketing app for this clean URL.
const podcastGuestPrep = path.join(distPath, "podcast-guest-prep.html");
app.get(["/podcast-guest-prep", "/podcast-guest-prep/"], (_req, res) => {
  res.sendFile(podcastGuestPrep);
});

// Handle React Router - serve index.html for all non-API routes
app.get("/{*splat}", async (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  if (isBareClientRoute(req.path)) {
    const html = await renderBareClientNotFound(req.path);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    return res.status(404).type("html").send(html);
  }

  const presentation = req.path.match(/^\/present\/([^/]+)\/?$/);
  if (presentation) {
    const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const rendered = await renderPresentationShell(decodeURIComponent(presentation[1]), origin);
    if (rendered.status === 200) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).type("html").send(rendered.html);
    }
  }

  res.sendFile(path.join(distPath, "index.html"));
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

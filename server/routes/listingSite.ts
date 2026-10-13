/**
 * GET /l/:slug and GET /api/listing-sites/:slug
 * Unpublished and missing listings are a 404. The page is advertising only.
 */

import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import { isListingSiteSlug } from "../../shared/listingSite";
import { readPublishedListingSite, saveListingSiteInquiry } from "../services/listingSiteStore";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function renderListingSiteShell(slug: string): Promise<{ status: number; html: string }> {
  if (!SLUG.test(slug)) {
    return { status: 404, html: "<!doctype html><title>Listing</title><p>This listing site is not published.</p>" };
  }
  try {
    const site = await readPublishedListingSite(slug);
    if (!site) {
      return { status: 404, html: "<!doctype html><title>Listing</title><p>This listing site is not published.</p>" };
    }
    const shell = readSpaShell();
    if (shell) return { status: 200, html: shell };
    return {
      status: 200,
      html: `<!doctype html><title>${escapeHtml(site.address)}</title><p>${escapeHtml(site.address)}</p>`,
    };
  } catch (err) {
    console.error("[Listing site] Shell failed.", err);
    return { status: 500, html: "<!doctype html><title>Listing</title><p>This listing site could not be opened.</p>" };
  }
}

export const handleListingSiteShell: RequestHandler = async (req, res) => {
  const rendered = await renderListingSiteShell(String(req.params.slug || ""));
  res.setHeader("Cache-Control", "no-store");
  res.status(rendered.status).type("html").send(rendered.html);
};

export const handleGetListingSite: RequestHandler = async (req, res) => {
  const slug = String(req.params.slug || "");
  if (!isListingSiteSlug(slug)) return res.status(404).json({ error: "This listing site is not published." });
  try {
    const site = await readPublishedListingSite(slug);
    if (!site) return res.status(404).json({ error: "This listing site is not published." });
    res.setHeader("Cache-Control", "no-store");
    return res.json(site);
  } catch (err) {
    console.error("[Listing site] Read failed.", err);
    return res.status(500).json({ error: "This listing site could not be opened." });
  }
};

export const handleListingSiteInquiry: RequestHandler = async (req, res) => {
  const slug = String(req.params.slug || "");
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const name = text(body.name, 80);
  const contact = text(body.contact, 120);
  const when = text(body.when, 80);
  if (body.consent !== true) return res.status(400).json({ error: "Consent is required." });
  if (!name || !contact) return res.status(400).json({ error: "Add a name and a way to reach you." });
  try {
    const saved = await saveListingSiteInquiry(slug, { name, contact, when, at: new Date().toISOString() });
    if (!saved) return res.status(404).json({ error: "This listing site is not published." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[Listing site] Inquiry failed.", err);
    return res.status(500).json({ error: "The request could not be saved." });
  }
};

function readSpaShell(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/spa/index.html"),
    path.resolve(process.cwd(), "dist/index.html"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch] || ch));
}

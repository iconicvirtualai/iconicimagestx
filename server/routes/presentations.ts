/**
 * Private presentation links.
 * GET is public for anyone who has the token.
 * POST only stores the token on the listing. It does not email or text the client.
 */

import { Router } from "express";
import { randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import admin from "firebase-admin";
import { requireStaff } from "../middleware/auth";
import {
  PRESENTATION_PREVIEW_TOKEN,
  buildPresentation,
  createPresentationToken,
  injectPresentationMeta,
  isPresentationToken,
  presentationPath,
  seededPresentation,
  type PublicPresentation,
} from "../../shared/presentation";

const router = Router();
const db = () => admin.firestore();

function originOf(req: { protocol: string; get: (name: string) => string | undefined }): string {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : "";
}

function firebaseReady(): boolean {
  return admin.apps.length > 0;
}

async function galleriesForListing(listingId: string, listing: Record<string, unknown>) {
  const ids = new Set<string>();
  if (typeof listing.galleryId === "string" && listing.galleryId) ids.add(listing.galleryId);
  if (typeof listing.playtestGalleryId === "string" && listing.playtestGalleryId) ids.add(listing.playtestGalleryId);
  const docs: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    const snap = await db().collection("galleries").doc(id).get();
    if (snap.exists) docs.push({ id: snap.id, ...snap.data() });
  }
  try {
    const linked = await db().collection("galleries").where("listingId", "==", listingId).limit(5).get();
    linked.docs.forEach((doc) => {
      if (!docs.some((item) => item.id === doc.id)) docs.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.warn("[Presentation] Gallery lookup skipped.", err);
  }
  return docs;
}

async function listingByToken(token: string) {
  const snap = await db().collection("listings").where("presentationToken", "==", token).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string };
}

async function loadPresentation(token: string, origin: string): Promise<PublicPresentation | null> {
  if (token === PRESENTATION_PREVIEW_TOKEN) return seededPresentation(origin);
  if (!firebaseReady()) return null;
  const listing = await listingByToken(token);
  if (!listing) return null;
  const galleries = await galleriesForListing(listing.id, listing);
  return buildPresentation({ token, listing, galleries, origin });
}

router.get("/presentations/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!isPresentationToken(token)) {
    return res.status(400).json({ error: "That presentation link is not valid." });
  }
  try {
    const presentation = await loadPresentation(token, originOf(req));
    if (!presentation) {
      return res.status(404).json({ error: "This presentation link is not active." });
    }
    return res.json(presentation);
  } catch (err) {
    console.error("[Presentation] Public read failed.", err);
    return res.status(500).json({ error: "This presentation could not be opened." });
  }
});

router.get("/presentations/shell/:token", async (req, res) => {
  const rendered = await renderPresentationShell(String(req.params.token || ""), originOf(req));
  res.status(rendered.status).type("html").send(rendered.html);
});

export async function renderPresentationShell(token: string, origin: string): Promise<{ status: number; html: string }> {
  if (!isPresentationToken(token)) {
    return { status: 400, html: "<!doctype html><title>Presentation</title><p>That presentation link is not valid.</p>" };
  }
  try {
    const presentation = await loadPresentation(token, origin);
    if (!presentation) {
      return { status: 404, html: "<!doctype html><title>Presentation</title><p>This presentation link is not active.</p>" };
    }
    const shell = await readSpaShell();
    const html = shell ? injectPresentationMeta(shell, presentation.meta) : standalonePresentation(presentation);
    return { status: 200, html };
  } catch (err) {
    console.error("[Presentation] Shell failed.", err);
    return { status: 500, html: "<!doctype html><title>Presentation</title><p>This presentation could not be opened.</p>" };
  }
}

router.post("/listings/:id/presentation", requireStaff, async (req, res) => {
  const listingId = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(listingId)) {
    return res.status(400).json({ error: "A valid listing id is required." });
  }
  if (!firebaseReady()) {
    return res.status(503).json({
      error: "Firebase Admin is not configured, so a client link cannot be saved.",
      previewPath: presentationPath(PRESENTATION_PREVIEW_TOKEN),
      notified: false,
    });
  }

  try {
    const ref = db().collection("listings").doc(listingId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Listing not found." });
    const data = snap.data() || {};
    const rotate = req.body?.rotate === true;
    const existing = typeof data.presentationToken === "string" ? data.presentationToken : "";
    const token = !rotate && isPresentationToken(existing) && existing !== PRESENTATION_PREVIEW_TOKEN
      ? existing
      : createPresentationToken(randomBytes);
    const created = token !== existing;
    await ref.update({
      presentationToken: token,
      presentationEnabled: true,
      presentationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(created ? { presentationCreatedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    });
    const listing = { id: listingId, ...data, presentationToken: token, presentationEnabled: true };
    const galleries = await galleriesForListing(listingId, listing);
    const presentation = buildPresentation({
      token,
      listing,
      galleries,
      origin: originOf(req),
    });
    const path = presentationPath(token);
    return res.json({
      token,
      path,
      url: `${originOf(req)}${path}`,
      photoCount: presentation?.photos.length || 0,
      created,
      notified: false,
    });
  } catch (err) {
    console.error("[Presentation] Share link save failed.", err);
    return res.status(500).json({ error: "The presentation link could not be saved." });
  }
});

async function readSpaShell(): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), "dist/spa/index.html"),
  ];
  for (const file of candidates) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
  }
  return null;
}

function standalonePresentation(presentation: PublicPresentation): string {
  const hero = presentation.photos[0];
  const title = presentation.address || (presentation.seeded ? "Sample presentation" : "Private presentation");
  const figures = presentation.photos.map((photo, index) => `
    <figure style="margin:0;min-height:100svh;position:relative;background:#070708">
      <img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.alt)}" style="width:100%;height:100svh;object-fit:cover;display:block" />
      <figcaption style="position:absolute;left:1.25rem;bottom:1.5rem;color:#fff;font-family:Georgia,serif;font-size:2rem">${escapeHtml(photo.room || String(index + 1))}</figcaption>
    </figure>`).join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(presentation.meta.title)}</title>
  </head>
  <body style="margin:0;background:#070708;color:#fff">
    <header style="min-height:100svh;display:flex;align-items:flex-end;padding:2rem;background:#111 url('${escapeAttr(hero?.url || "")}') center/cover">
      <div>
        <p style="letter-spacing:.28em;text-transform:uppercase;font:600 11px/1 sans-serif">Iconic Images</p>
        <h1 style="font:500 4rem/0.95 Georgia,serif;margin:.4rem 0">${escapeHtml(title)}</h1>
      </div>
    </header>
    ${figures}
  </body>
</html>`;
  return injectPresentationMeta(html, presentation.meta);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

export default router;

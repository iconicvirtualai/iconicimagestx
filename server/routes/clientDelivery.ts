/**
 * Client delivery presentation.
 * GET reads a sample or an existing gallery/project. It does not write Firestore.
 * POST /:id/send emails only through sendClientDelivery, which stays quiet
 * while the notify flags are off and never emails a sample id.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { recordAddressText } from "../../shared/addressText";
import {
  clientDeliveryDraft,
  clientDeliveryNotifyMode,
  deliveryAssetsFromRecords,
  deliveryInvoiceFromStored,
  isClientDeliveryPreview,
  presentationFromRecords,
  sampleDeliveryAssets,
  sampleDeliveryDraft,
  sampleDeliveryInvoice,
  sampleDeliveryPresentation,
  type DeliveryAsset,
} from "../../shared/clientDelivery";
import { clientGalleryDownloadsUnlocked as downloadsUnlocked } from "../../shared/paymentAccess";
import { zipStored } from "../../shared/zipStore";
import { readInvoiceDoc } from "../lib/invoiceDoc";
import { readDeliveryAsset } from "../lib/deliveryMediaBytes";
import { deliveryCard, previewEdge, renderDeliveryJpeg, webEdge } from "../lib/deliveryWatermark";
import { requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { sendClientDelivery } from "../services/clientDeliverySend";

const router = Router();

function textId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function malformed(id: string): boolean {
  if (!id || id.length > 200) return true;
  if (id === "." || id === "..") return true;
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return true;
  return /[\u0000-\u001F\u007F]/.test(id);
}

function assetsFor(id: string, listing: Record<string, unknown> | null, gallery: Record<string, unknown> | null): DeliveryAsset[] {
  if (isClientDeliveryPreview(id)) return sampleDeliveryAssets();
  return deliveryAssetsFromRecords(listing, gallery);
}

async function invoiceFor(
  gallery: Record<string, unknown> | null,
  listing: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  if (!admin.apps.length) return null;
  const db = admin.firestore();
  const load = async (id: string) => db.collection("invoices").doc(id).get();
  const direct = textId(gallery?.invoiceId) || textId(listing?.invoiceId);
  if (direct) {
    const doc = await readInvoiceDoc(load, direct);
    if (doc) return { id: doc.id, ...doc.data };
  }
  const orderId = textId(gallery?.orderId) || textId(listing?.orderId);
  if (!orderId) return null;
  const snap = await db.collection("invoices").where("orderId", "==", orderId).limit(1).get();
  if (snap.empty) return null;
  const doc = await readInvoiceDoc(load, snap.docs[0].id);
  return doc ? { id: doc.id, ...doc.data } : null;
}

async function loadContext(id: string): Promise<{
  listing: Record<string, unknown> | null;
  gallery: Record<string, unknown> | null;
  invoice: Record<string, unknown> | null;
} | null> {
  if (!admin.apps.length) return null;
  const db = admin.firestore();
  const gallerySnap = await db.collection("galleries").doc(id).get();
  let gallery: Record<string, unknown> | null = gallerySnap.exists
    ? { id: gallerySnap.id, ...(gallerySnap.data() || {}) }
    : null;
  let listing: Record<string, unknown> | null = null;
  const listingId = textId(gallery?.listingId);
  if (listingId) {
    const listingSnap = await db.collection("listings").doc(listingId).get();
    if (listingSnap.exists) listing = { id: listingSnap.id, ...(listingSnap.data() || {}) };
  }
  if (!gallery) {
    const listingSnap = await db.collection("listings").doc(id).get();
    if (!listingSnap.exists) return null;
    listing = { id: listingSnap.id, ...(listingSnap.data() || {}) };
    const found = await db.collection("galleries").where("listingId", "==", id).limit(1).get();
    if (!found.empty) gallery = { id: found.docs[0].id, ...(found.docs[0].data() || {}) };
  }
  const invoice = await invoiceFor(gallery, listing);
  return { listing, gallery, invoice };
}

function paidFor(gallery: Record<string, unknown> | null, listing: Record<string, unknown> | null, invoice: Record<string, unknown> | null): boolean {
  return downloadsUnlocked({
    invoice,
    downloadEnabled: gallery?.downloadEnabled,
    downloadsReleased: gallery?.downloadsReleased === true || listing?.downloadsReleased === true,
    lockDownloads: listing?.lockDownloads,
  });
}

async function storageDownload(storagePath: string): Promise<Buffer | null> {
  if (!admin.apps.length) return null;
  try {
    const [bytes] = await admin.storage().bucket().file(storagePath).download();
    if (!bytes.length || bytes.length > 25_000_000) return null;
    return bytes;
  } catch {
    return null;
  }
}

router.get("/notify-mode", (_req, res) => {
  res.json(clientDeliveryNotifyMode());
});

router.get("/draft", requireStaff, async (req, res) => {
  const listingId = textId(req.query.listingId);
  const galleryId = textId(req.query.galleryId);
  const id = galleryId || listingId;
  if (!id || malformed(id)) return res.status(400).json({ error: "That project link is not valid." });
  if (isClientDeliveryPreview(id)) return res.json(sampleDeliveryDraft());
  try {
    const context = await loadContext(id);
    if (!context) return res.status(404).json({ error: "This project is not ready to send." });
    const record = context.listing || context.gallery || {};
    const paid = paidFor(context.gallery, context.listing, context.invoice);
    const invoice = context.invoice
      ? deliveryInvoiceFromStored(context.invoice)
      : sampleDeliveryInvoice(paid);
    if (!context.invoice) {
      invoice.number = textId(record.invoiceNumber) || "Invoice";
      invoice.total = Number(record.total) || 0;
      invoice.amountDue = paid ? 0 : invoice.total;
      invoice.status = paid ? "paid" : "unpaid";
    }
    return res.json(clientDeliveryDraft({
      listingId: textId(context.listing?.id) || listingId,
      galleryId: textId(context.gallery?.id) || galleryId,
      clientName: textId(record.clientName),
      clientEmail: textId(record.clientEmail),
      address: recordAddressText(record),
      invoice,
      notify: clientDeliveryNotifyMode(),
    }));
  } catch (err) {
    console.error("[delivery] draft read failed", err instanceof Error ? err.message : "read failed");
    return res.status(500).json({ error: "The delivery draft could not be opened." });
  }
});

router.get("/:id", async (req, res) => {
  const id = textId(req.params.id);
  if (malformed(id)) return res.status(404).json({ error: "This delivery link is not active." });
  const sample = sampleDeliveryPresentation(id);
  if (sample) return res.json(sample);
  try {
    const context = await loadContext(id);
    if (!context) return res.status(404).json({ error: "This delivery link is not active." });
    const paid = paidFor(context.gallery, context.listing, context.invoice);
    return res.json(presentationFromRecords({
      id,
      listing: context.listing,
      gallery: context.gallery,
      invoice: context.invoice,
      paid,
    }));
  } catch (err) {
    console.error("[delivery] presentation read failed", err instanceof Error ? err.message : "read failed");
    return res.status(500).json({ error: "This delivery could not be opened." });
  }
});

function variantOf(value: unknown): "preview" | "web" | "print" | null {
  if (value === "preview" || value === undefined) return "preview";
  if (value === "web" || value === "print") return value;
  return null;
}

async function contextAssets(id: string): Promise<{ paid: boolean; assets: DeliveryAsset[] } | null> {
  if (isClientDeliveryPreview(id)) {
    return { paid: id === "preview-paid", assets: sampleDeliveryAssets() };
  }
  const context = await loadContext(id);
  if (!context) return null;
  return {
    paid: paidFor(context.gallery, context.listing, context.invoice),
    assets: assetsFor(id, context.listing, context.gallery),
  };
}

router.get("/:id/media/:index", async (req, res) => {
  const id = textId(req.params.id);
  const index = Number(req.params.index);
  const variant = variantOf(req.query.variant);
  if (malformed(id) || !Number.isInteger(index) || index < 0 || index > 80 || !variant) {
    return res.status(404).json({ error: "Not found." });
  }
  try {
    const loaded = await contextAssets(id);
    const asset = loaded?.assets[index];
    if (!loaded || !asset) return res.status(404).json({ error: "Not found." });
    if (!loaded.paid && variant !== "preview") {
      return res.status(403).json({ error: "Pay invoice to unlock watermark-free downloads." });
    }
    const source = await readDeliveryAsset(asset, storageDownload);
    if (variant === "print") {
      if (!source) return res.status(404).json({ error: "That file is not ready." });
      const filename = asset.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "download";
      res.setHeader("Content-Type", filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(source);
    }
    const edge = variant === "web" ? webEdge() : previewEdge();
    const watermark = variant === "preview" && !loaded.paid;
    const jpeg = source
      ? await renderDeliveryJpeg(source, { edge, watermark, quality: variant === "web" ? 82 : 80 })
      : await deliveryCard(asset.name, watermark);
    if (!jpeg) return res.status(404).json({ error: "That preview is not ready." });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", loaded.paid ? "private, max-age=300" : "private, no-store");
    if (variant === "web") {
      const filename = asset.name.replace(/\.\w+$/, "").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "photo";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}-web.jpg"`);
    }
    return res.status(200).send(jpeg);
  } catch (err) {
    console.error("[delivery] media failed", err instanceof Error ? err.message : "media failed");
    return res.status(500).json({ error: "That file could not be opened." });
  }
});

router.get("/:id/download.zip", async (req, res) => {
  const id = textId(req.params.id);
  const variant = req.query.variant === "web" ? "web" : req.query.variant === "print" ? "print" : null;
  if (malformed(id) || !variant) return res.status(404).json({ error: "Not found." });
  try {
    const loaded = await contextAssets(id);
    if (!loaded) return res.status(404).json({ error: "This delivery link is not active." });
    if (!loaded.paid) return res.status(403).json({ error: "Pay invoice to unlock watermark-free downloads." });
    const chosen = loaded.assets.filter((asset) => asset.downloadable).slice(0, 40);
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    for (const asset of chosen) {
      const source = await readDeliveryAsset(asset, storageDownload);
      if (!source) continue;
      if (variant === "web") {
        if (!asset.raster) continue;
        const jpeg = await renderDeliveryJpeg(source, { edge: webEdge(), watermark: false, quality: 82 });
        if (!jpeg) continue;
        entries.push({ name: asset.name.replace(/\.\w+$/, "") + "-web.jpg", data: new Uint8Array(jpeg) });
      } else {
        entries.push({ name: asset.name, data: new Uint8Array(source) });
      }
    }
    if (!entries.length) return res.status(404).json({ error: "No files are ready to download." });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${variant === "web" ? "web-mls" : "high-res"}.zip"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(Buffer.from(zipStored(entries)));
  } catch (err) {
    console.error("[delivery] zip failed", err instanceof Error ? err.message : "zip failed");
    return res.status(500).json({ error: "That download could not be built." });
  }
});

router.post("/:id/send", (req, res, next) => {
  const id = textId(req.params.id);
  if (isClientDeliveryPreview(id)) return next();
  return requireCoordinator(req, res, next);
}, async (req: AuthenticatedRequest, res) => {
  const id = textId(req.params.id);
  if (malformed(id)) return res.status(400).json({ error: "That delivery link is not valid." });
  const action = req.body?.action === "test" ? "test" : "send";
  const result = await sendClientDelivery({
    id,
    action,
    to: typeof req.body?.to === "string" ? req.body.to : "",
    cc: typeof req.body?.cc === "string" ? req.body.cc : "",
    subject: typeof req.body?.subject === "string" ? req.body.subject : "",
    message: typeof req.body?.message === "string" ? req.body.message : "",
    actor: {
      email: req.user?.email || null,
      name: typeof req.user?.name === "string" ? req.user.name : null,
      uid: req.user?.uid || null,
    },
  });
  return res.status(result.ok ? 200 : 400).json(result);
});

export default router;

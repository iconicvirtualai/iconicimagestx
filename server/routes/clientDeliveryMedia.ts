/**
 * Watermark, resize, and zip for a client delivery.
 * Imported only by api/media-display.mjs (and the local dev server).
 * api/index must not import this file: it pulls in sharp.
 */

import { Router } from "express";
import { zipStored } from "../../shared/zipStore";
import { deliveryCard, previewEdge, renderDeliveryJpeg, webEdge } from "../lib/deliveryWatermark";
import { readDeliveryAsset } from "../lib/deliveryMediaBytes";
import { deliveryContextAssets, deliveryTextId, malformedDeliveryId, storageDownload } from "../lib/clientDeliveryContext";

const router = Router();

function variantOf(value: unknown): "preview" | "web" | "print" | null {
  if (value === "preview" || value === undefined) return "preview";
  if (value === "web" || value === "print") return value;
  return null;
}

router.get("/:id/media/:index", async (req, res) => {
  const id = deliveryTextId(req.params.id);
  const index = Number(req.params.index);
  const variant = variantOf(req.query.variant);
  if (malformedDeliveryId(id) || !Number.isInteger(index) || index < 0 || index > 80 || !variant) {
    return res.status(404).json({ error: "Not found." });
  }
  try {
    const loaded = await deliveryContextAssets(id);
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
  const id = deliveryTextId(req.params.id);
  const variant = req.query.variant === "web" ? "web" : req.query.variant === "print" ? "print" : null;
  if (malformedDeliveryId(id) || !variant) return res.status(404).json({ error: "Not found." });
  try {
    const loaded = await deliveryContextAssets(id);
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

export default router;

/**
 * Client delivery presentation JSON and send.
 * Image bytes stay on the media display function. This file does not load that renderer.
 * GET reads a sample or an existing gallery/project. It does not write Firestore.
 * POST /:id/send emails only through sendClientDelivery, which stays quiet
 * while the notify flags are off and never emails a sample id.
 */

import { Router } from "express";
import { recordAddressText } from "../../shared/addressText";
import {
  clientDeliveryDraft,
  clientDeliveryNotifyMode,
  deliveryInvoiceFromStored,
  isClientDeliveryPreview,
  presentationFromRecords,
  sampleDeliveryDraft,
  sampleDeliveryInvoice,
  sampleDeliveryPresentation,
} from "../../shared/clientDelivery";
import { requireCoordinator, requireStaff, type AuthenticatedRequest } from "../middleware/auth";
import { sendClientDelivery } from "../services/clientDeliverySend";
import {
  deliveryPaid,
  deliveryTextId,
  loadDeliveryContext,
  malformedDeliveryId,
} from "../lib/clientDeliveryContext";

const router = Router();

router.get("/notify-mode", (_req, res) => {
  res.json(clientDeliveryNotifyMode());
});

router.get("/draft", requireStaff, async (req, res) => {
  const listingId = deliveryTextId(req.query.listingId);
  const galleryId = deliveryTextId(req.query.galleryId);
  const id = galleryId || listingId;
  if (!id || malformedDeliveryId(id)) return res.status(400).json({ error: "That project link is not valid." });
  if (isClientDeliveryPreview(id)) return res.json(sampleDeliveryDraft());
  try {
    const context = await loadDeliveryContext(id);
    if (!context) return res.status(404).json({ error: "This project is not ready to send." });
    const record = context.listing || context.gallery || {};
    const paid = deliveryPaid(context.gallery, context.listing, context.invoice);
    const invoice = context.invoice
      ? deliveryInvoiceFromStored(context.invoice)
      : sampleDeliveryInvoice(paid);
    if (!context.invoice) {
      invoice.number = deliveryTextId(record.invoiceNumber) || "Invoice";
      invoice.total = Number(record.total) || 0;
      invoice.amountDue = paid ? 0 : invoice.total;
      invoice.status = paid ? "paid" : "unpaid";
    }
    return res.json(clientDeliveryDraft({
      listingId: deliveryTextId(context.listing?.id) || listingId,
      galleryId: deliveryTextId(context.gallery?.id) || galleryId,
      clientName: deliveryTextId(record.clientName),
      clientEmail: deliveryTextId(record.clientEmail),
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
  const id = deliveryTextId(req.params.id);
  if (malformedDeliveryId(id)) return res.status(404).json({ error: "This delivery link is not active." });
  const sample = sampleDeliveryPresentation(id);
  if (sample) return res.json(sample);
  try {
    const context = await loadDeliveryContext(id);
    if (!context) return res.status(404).json({ error: "This delivery link is not active." });
    const paid = deliveryPaid(context.gallery, context.listing, context.invoice);
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

router.post("/:id/send", (req, res, next) => {
  const id = deliveryTextId(req.params.id);
  if (isClientDeliveryPreview(id)) return next();
  return requireCoordinator(req, res, next);
}, async (req: AuthenticatedRequest, res) => {
  const id = deliveryTextId(req.params.id);
  if (malformedDeliveryId(id)) return res.status(400).json({ error: "That delivery link is not valid." });
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

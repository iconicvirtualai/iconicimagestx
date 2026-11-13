/**
 * Save client photo picks and record extra-photo totals.
 * Staff notifications are the existing admin unread counter.
 * This service does not send email, SMS, or charge a card.
 */

import admin from "firebase-admin";
import { readInvoiceDoc } from "../lib/invoiceDoc";
import { bumpAdminUnreadChannel } from "./adminUnread";
import {
  GALLERY_PICKS_COLLECTION,
  GALLERY_PICKS_DOC,
  activeSelectionPhotos,
  archiveUnselectedMedia,
  normalizePickIds,
  overAllowanceCopy,
  parseAllowance,
  parseExtraPhotoPrice,
  pickIdsFromDoc,
  selectionBillingPatches,
  selectionCsv,
  selectionFileList,
  selectionMode,
  selectionPhotos,
  selectionQuote,
  settingsFromGallery,
  type SelectionMode,
  type SelectionSettings,
  type SelectionStatus,
} from "../../shared/gallerySelections";

export class SelectionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface GallerySelectionStore {
  getGallery(id: string): Promise<Record<string, unknown> | null>;
  updateGallery(id: string, patch: Record<string, unknown>): Promise<void>;
  getPicks(galleryId: string): Promise<Record<string, unknown> | null>;
  setPicks(galleryId: string, data: Record<string, unknown>): Promise<void>;
  getOrder(id: string): Promise<Record<string, unknown> | null>;
  updateOrder(id: string, patch: Record<string, unknown>): Promise<void>;
  getListing(id: string): Promise<Record<string, unknown> | null>;
  getInvoice(id: string): Promise<{ id: string; data: Record<string, unknown> } | null>;
  updateInvoice(id: string, patch: Record<string, unknown>): Promise<void>;
  findInvoiceByOrder(orderId: string): Promise<{ id: string; data: Record<string, unknown> } | null>;
  bumpStaffOrders(): Promise<void>;
}

export interface GallerySelectionService {
  publicState(galleryId: string): Promise<PublicSelectionState | null>;
  staffState(galleryId: string): Promise<StaffSelectionState>;
  savePicks(galleryId: string, mediaIds: unknown, now?: Date): Promise<PublicSelectionState>;
  submit(galleryId: string, mediaIds: unknown, now?: Date): Promise<PublicSelectionState>;
  saveSettings(galleryId: string, body: Record<string, unknown>): Promise<StaffSelectionState>;
  archiveRest(galleryId: string, now?: Date): Promise<StaffSelectionState>;
  markSeen(galleryId: string): Promise<StaffSelectionState>;
}

export interface PublicSelectionState {
  open: boolean;
  mode: SelectionMode;
  status: SelectionStatus;
  allowance: number | null;
  extraPhotoPrice: number | null;
  selectedIds: string[];
  quote: ReturnType<typeof selectionQuote>;
  overCopy: string | null;
  submitted: boolean;
}

export interface StaffSelectionPhoto {
  id: string;
  fileName: string;
  selected: boolean;
  archived: boolean;
}

export interface StaffSelectionState {
  settings: SelectionSettings;
  status: SelectionStatus | "closed";
  reviewPending: boolean;
  submittedAt: string | null;
  selectedIds: string[];
  fileNames: string[];
  csv: string;
  quote: ReturnType<typeof selectionQuote>;
  overCopy: string | null;
  photos: StaffSelectionPhoto[];
  recordedOnOrder: boolean;
  archivedCount: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusOf(gallery: Record<string, unknown>): SelectionStatus | "closed" {
  if (gallery.selectionStatus === "submitted") return "submitted";
  if (gallery.selectionOpen === true) return "open";
  return "closed";
}

function clientIdOf(gallery: Record<string, unknown>): string {
  return text(gallery.clientId);
}

async function invoiceFor(store: GallerySelectionStore, gallery: Record<string, unknown>) {
  const invoiceId = text(gallery.invoiceId);
  if (invoiceId) {
    const doc = await store.getInvoice(invoiceId);
    if (doc) return doc;
  }
  const orderId = text(gallery.orderId);
  if (orderId) {
    const doc = await store.findInvoiceByOrder(orderId);
    if (doc) return doc;
  }
  const listingId = text(gallery.listingId);
  if (!listingId) return null;
  const listing = await store.getListing(listingId);
  const linked = text(listing?.invoiceId);
  return linked ? store.getInvoice(linked) : null;
}

function publicState(
  gallery: Record<string, unknown>,
  picks: Record<string, unknown> | null,
): PublicSelectionState | null {
  const settings = settingsFromGallery(gallery);
  if (!settings.open && gallery.selectionStatus !== "submitted") return null;
  const photos = activeSelectionPhotos(gallery.mediaItems);
  const selectedIds = normalizePickIds(pickIdsFromDoc(picks), photos);
  const quote = selectionQuote(selectedIds.length, settings);
  const status: SelectionStatus = gallery.selectionStatus === "submitted" ? "submitted" : "open";
  return {
    open: settings.open && status !== "submitted",
    mode: settings.mode,
    status,
    allowance: settings.allowance,
    extraPhotoPrice: settings.extraPhotoPrice,
    selectedIds,
    quote,
    overCopy: overAllowanceCopy(settings, quote),
    submitted: status === "submitted",
  };
}

async function staffState(store: GallerySelectionStore, galleryId: string): Promise<StaffSelectionState> {
  const gallery = await store.getGallery(galleryId);
  if (!gallery) throw new SelectionError(404, "Gallery not found.");
  const picks = await store.getPicks(galleryId);
  const settings = settingsFromGallery(gallery);
  const photos = selectionPhotos(gallery.mediaItems);
  const active = photos.filter((photo) => !photo.archived);
  const selectedIds = normalizePickIds(pickIdsFromDoc(picks), active);
  const selected = new Set(selectedIds);
  const quoting = { ...settings, open: true };
  const quote = selectionQuote(selectedIds.length, quoting);
  const fileNames = selectionFileList(photos, selectedIds);
  return {
    settings,
    status: statusOf(gallery),
    reviewPending: gallery.selectionReviewPending === true,
    submittedAt: text(gallery.selectionSubmittedAt) || null,
    selectedIds,
    fileNames,
    csv: selectionCsv(fileNames),
    quote,
    overCopy: overAllowanceCopy(quoting, quote),
    photos: photos.map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      selected: selected.has(photo.id),
      archived: photo.archived,
    })),
    recordedOnOrder: gallery.selectionRecordedOnOrder === true,
    archivedCount: photos.filter((photo) => photo.archived).length,
  };
}

function settingsPatch(current: SelectionSettings, body: Record<string, unknown>, gallery: Record<string, unknown>) {
  const next: SelectionSettings = { ...current };
  if ("mode" in body) {
    if (body.mode !== "listing" && body.mode !== "headshots") {
      throw new SelectionError(400, "Choose listing photos or headshot proofs.");
    }
    next.mode = selectionMode(body.mode);
  }
  if ("allowance" in body) {
    const blank = body.allowance == null || (typeof body.allowance === "string" && body.allowance.trim() === "");
    const allowance = parseAllowance(body.allowance);
    if (!blank && allowance == null) throw new SelectionError(400, "Allowance has to be a whole number.");
    next.allowance = allowance;
  }
  if ("extraPhotoPrice" in body) {
    const blank = body.extraPhotoPrice == null || (typeof body.extraPhotoPrice === "string" && body.extraPhotoPrice.trim() === "");
    const price = parseExtraPhotoPrice(body.extraPhotoPrice);
    if (!blank && price == null) throw new SelectionError(400, "Enter a dollar amount, or leave the extra price blank.");
    next.extraPhotoPrice = price;
  }
  if (body.open === true || body.open === false) next.open = body.open === true;

  const patch: Record<string, unknown> = {
    selectionOpen: next.open,
    selectionMode: next.mode,
    selectionAllowance: next.allowance,
    selectionExtraPrice: next.extraPhotoPrice,
  };
  if (body.reopen === true) {
    patch.selectionOpen = true;
    patch.selectionStatus = "open";
    patch.selectionReviewPending = false;
    next.open = true;
  } else if (next.open && gallery.selectionStatus !== "submitted") {
    patch.selectionStatus = "open";
  }
  return patch;
}

async function requireOpenGallery(store: GallerySelectionStore, galleryId: string) {
  const gallery = await store.getGallery(galleryId);
  if (!gallery) throw new SelectionError(404, "Gallery not found.");
  const settings = settingsFromGallery(gallery);
  if (!settings.open || gallery.selectionStatus === "submitted") {
    throw new SelectionError(409, "These selections are closed.");
  }
  return { gallery, settings };
}

export function createGallerySelectionService(store: GallerySelectionStore): GallerySelectionService {
  return {
    async publicState(galleryId) {
      const gallery = await store.getGallery(galleryId);
      if (!gallery) return null;
      return publicState(gallery, await store.getPicks(galleryId));
    },

    staffState(galleryId) {
      return staffState(store, galleryId);
    },

    async savePicks(galleryId, mediaIds, now = new Date()) {
      const { gallery, settings } = await requireOpenGallery(store, galleryId);
      const photos = activeSelectionPhotos(gallery.mediaItems);
      const selectedIds = normalizePickIds(mediaIds, photos);
      await store.setPicks(galleryId, {
        clientId: clientIdOf(gallery),
        mediaIds: selectedIds,
        status: "draft",
        updatedAt: now.toISOString(),
      });
      if (selectedIds.length > 0 && gallery.selectionActivityNotified !== true) {
        await store.updateGallery(galleryId, { selectionActivityNotified: true });
        await store.bumpStaffOrders();
      }
      return publicState({ ...gallery, selectionOpen: true, selectionStatus: "open" }, { mediaIds: selectedIds })
        || emptyPublic(settings, selectedIds);
    },

    async submit(galleryId, mediaIds, now = new Date()) {
      const { gallery, settings } = await requireOpenGallery(store, galleryId);
      const photos = activeSelectionPhotos(gallery.mediaItems);
      const selectedIds = normalizePickIds(mediaIds, photos);
      const quote = selectionQuote(selectedIds.length, settings);
      if (!quote.canSubmit) throw new SelectionError(400, quote.blockReason || "These selections cannot be submitted.");

      const orderId = text(gallery.orderId);
      const order = orderId ? await store.getOrder(orderId) : null;
      const invoice = await invoiceFor(store, gallery);
      const billing = selectionBillingPatches(order || {}, invoice?.data || null, settings.mode, quote);
      const at = now.toISOString();
      const details = historyDetails(settings.mode, quote);

      if (order && orderId) {
        const history = Array.isArray(order.history) ? order.history : [];
        await store.updateOrder(orderId, {
          ...billing.order,
          history: [...history, {
            action: "Client submitted selections",
            by: "Client",
            at,
            details,
          }],
        });
      }
      if (invoice && billing.invoice) await store.updateInvoice(invoice.id, billing.invoice);

      await store.setPicks(galleryId, {
        clientId: clientIdOf(gallery),
        mediaIds: selectedIds,
        status: "submitted",
        updatedAt: at,
      });
      await store.updateGallery(galleryId, {
        selectionStatus: "submitted",
        selectionOpen: false,
        selectionSubmittedAt: at,
        selectionSelectedCount: quote.selectedCount,
        selectionExtraCount: quote.extraCount,
        selectionExtraTotal: quote.extraTotal,
        selectionReviewPending: true,
        selectionRecordedOnOrder: Boolean(order && billing.recorded),
      });
      await store.bumpStaffOrders();

      return publicState({
        ...gallery,
        selectionOpen: false,
        selectionStatus: "submitted",
      }, { mediaIds: selectedIds }) || emptyPublic(settings, selectedIds);
    },

    async saveSettings(galleryId, body) {
      const gallery = await store.getGallery(galleryId);
      if (!gallery) throw new SelectionError(404, "Gallery not found.");
      const patch = settingsPatch(settingsFromGallery(gallery), body, gallery);
      await store.updateGallery(galleryId, patch);
      return staffState(store, galleryId);
    },

    async archiveRest(galleryId, now = new Date()) {
      const gallery = await store.getGallery(galleryId);
      if (!gallery) throw new SelectionError(404, "Gallery not found.");
      if (gallery.selectionStatus !== "submitted") {
        throw new SelectionError(409, "Archive the rest after the client submits.");
      }
      const picks = await store.getPicks(galleryId);
      const selectedIds = pickIdsFromDoc(picks);
      const items = Array.isArray(gallery.mediaItems) ? gallery.mediaItems : [];
      const archived = archiveUnselectedMedia(items, selectedIds, now.toISOString());
      await store.updateGallery(galleryId, { mediaItems: archived.items });
      return staffState(store, galleryId);
    },

    async markSeen(galleryId) {
      const gallery = await store.getGallery(galleryId);
      if (!gallery) throw new SelectionError(404, "Gallery not found.");
      if (gallery.selectionReviewPending === true) {
        await store.updateGallery(galleryId, { selectionReviewPending: false });
      }
      return staffState(store, galleryId);
    },
  };
}

function historyDetails(mode: SelectionMode, quote: ReturnType<typeof selectionQuote>): string {
  const included = quote.allowance == null ? "no allowance saved" : `${quote.allowance} included`;
  if (quote.extraCount > 0) {
    const label = mode === "headshots" ? "extra finals" : "extra photos";
    return `${quote.selectedCount} selected. ${included}. ${quote.extraCount} ${label} add $${quote.extraTotal.toFixed(2)}. Recorded on the order. Not charged.`;
  }
  return `${quote.selectedCount} selected. ${included}. No extra charge. Not charged.`;
}

function emptyPublic(settings: SelectionSettings, selectedIds: string[]): PublicSelectionState {
  const quote = selectionQuote(selectedIds.length, settings);
  return {
    open: settings.open,
    mode: settings.mode,
    status: "open",
    allowance: settings.allowance,
    extraPhotoPrice: settings.extraPhotoPrice,
    selectedIds,
    quote,
    overCopy: overAllowanceCopy(settings, quote),
    submitted: false,
  };
}

export function liveGallerySelectionService(): GallerySelectionService | null {
  if (!admin.apps.length) return null;
  return createGallerySelectionService(firestoreSelectionStore());
}

function firestoreSelectionStore(): GallerySelectionStore {
  const db = () => admin.firestore();
  return {
    async getGallery(id) {
      const snap = await db().collection("galleries").doc(id).get();
      return snap.exists ? { ...(snap.data() || {}) } : null;
    },
    async updateGallery(id, patch) {
      await db().collection("galleries").doc(id).update({
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    },
    async getPicks(galleryId) {
      const snap = await db().collection("galleries").doc(galleryId).collection(GALLERY_PICKS_COLLECTION).doc(GALLERY_PICKS_DOC).get();
      return snap.exists ? { ...(snap.data() || {}) } : null;
    },
    async setPicks(galleryId, data) {
      await db().collection("galleries").doc(galleryId).collection(GALLERY_PICKS_COLLECTION).doc(GALLERY_PICKS_DOC).set(data, { merge: true });
    },
    async getOrder(id) {
      const snap = await db().collection("orders").doc(id).get();
      return snap.exists ? { ...(snap.data() || {}) } : null;
    },
    async updateOrder(id, patch) {
      await db().collection("orders").doc(id).update({
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    },
    async getListing(id) {
      const snap = await db().collection("listings").doc(id).get();
      return snap.exists ? { ...(snap.data() || {}) } : null;
    },
    async getInvoice(id) {
      const load = async (invoiceId: string) => {
        const snap = await db().collection("invoices").doc(invoiceId).get();
        return { exists: snap.exists, id: snap.id, data: () => snap.data() };
      };
      return readInvoiceDoc(load, id);
    },
    async updateInvoice(id, patch) {
      await db().collection("invoices").doc(id).update({
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    },
    async findInvoiceByOrder(orderId) {
      const snap = await db().collection("invoices").where("orderId", "==", orderId).limit(1).get();
      if (snap.empty) return null;
      return this.getInvoice(snap.docs[0].id);
    },
    async bumpStaffOrders() {
      await bumpAdminUnreadChannel("orders");
    },
  };
}

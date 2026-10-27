/**
 * Signed client-portal uploads. Bytes go to Firebase Storage.
 * The API only issues the ticket and records the saved object.
 */

import { randomUUID } from "crypto";
import admin from "firebase-admin";
import {
  isPortalUploadKind,
  isPortalUploadStoragePath,
  portalUploadDecision,
  portalUploadStoragePath,
  type PortalUploadKind,
} from "../../shared/portalClientUpload";
import { ensureBucketCors, firebaseDownloadUrl } from "./listingMedia";

const bucket = () => admin.storage().bucket();

export class PortalUploadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function createPortalClientUploadUrl(input: {
  listingId: string;
  kind: unknown;
  fileName: unknown;
  contentType: unknown;
  byteSize: unknown;
}) {
  const decision = portalUploadDecision(input.kind, input.fileName, input.contentType, input.byteSize);
  if (decision.ok === false) throw new PortalUploadError(400, decision.error);
  await ensureBucketCors();
  const storagePath = portalUploadStoragePath(input.listingId, decision.kind, decision.fileName);
  const file = bucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 30 * 60 * 1000,
    contentType: decision.contentType,
  });
  return { uploadUrl, storagePath, contentType: decision.contentType, kind: decision.kind };
}

export async function registerPortalClientUpload(input: {
  listingId: string;
  kind: unknown;
  fileName: unknown;
  contentType: unknown;
  storagePath: unknown;
  uploadedBy: string;
}) {
  if (!isPortalUploadKind(input.kind)) throw new PortalUploadError(400, "Choose video, social, or a document.");
  const kind = input.kind;
  if (!isPortalUploadStoragePath(input.listingId, kind, input.storagePath)) {
    throw new PortalUploadError(400, "That file is not in this listing's upload folder.");
  }
  const storagePath = input.storagePath as string;
  const file = bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new PortalUploadError(400, "The upload did not finish. Try that file again.");
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  const decision = portalUploadDecision(kind, input.fileName, input.contentType || metadata.contentType, size);
  if (decision.ok === false) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw new PortalUploadError(400, decision.error);
  }

  const token = randomUUID();
  await file.setMetadata({
    contentType: decision.contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  });
  const url = firebaseDownloadUrl(bucket().name, storagePath, token);
  const uploadedAt = new Date().toISOString();
  const record = {
    id: randomUUID(),
    kind,
    name: decision.fileName,
    url,
    path: storagePath,
    contentType: decision.contentType,
    byteSize: size,
    uploadedAt,
    uploadedBy: input.uploadedBy,
  };

  const ref = admin.firestore().collection("listings").doc(input.listingId);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const existing = Array.isArray(data.clientPortalUploads) ? data.clientPortalUploads : [];
    const activity = Array.isArray(data.portalActivity) ? data.portalActivity : [];
    const update: Record<string, unknown> = {
      clientPortalUploads: [...existing, record].slice(-200),
      portalActivity: [...activity, {
        id: `portal-upload-${record.id}`,
        at: uploadedAt,
        kind,
        summary: uploadSummary(kind, decision.fileName),
      }].slice(-200),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (kind === "video") {
      const videos = Array.isArray(data.videos) ? data.videos : [];
      update.videos = [...videos, {
        id: record.id,
        name: record.name,
        url: record.url,
        path: record.path,
        contentType: record.contentType,
        type: "video",
        uploadedAt,
      }];
    }
    tx.update(ref, update);
  });

  return record;
}

function uploadSummary(kind: PortalUploadKind, fileName: string): string {
  if (kind === "video") return `Client uploaded video ${fileName}`;
  if (kind === "social") return `Client uploaded social file ${fileName}`;
  return `Client uploaded file ${fileName}`;
}

/**
 * Files shared between a client and staff.
 * Bytes stay on the existing Firebase Storage bucket at client-files/{firebaseUid}/.
 * That is the same bucket portal uploads already use. This does not add Vercel Blob.
 * When Backblaze is configured later, the key shape stays client-files/{firebaseUid}/{id}/{name}.
 */

import { randomBytes } from "node:crypto";
import admin from "firebase-admin";
import { clientLinkStamp } from "../../shared/clientLink";
import { profileId } from "../../shared/peopleProfiles";
import { HubError } from "./clientHubStore";

export interface ClientFileRecord {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  storagePath: string;
  firebaseUid: string;
  clientId: string;
  clientProfileId: string;
  direction: "admin" | "client";
  uploadedByUid: string;
  createdAt: string;
}

interface StoredFile extends ClientFileRecord {
  bytes?: Buffer;
  downloadUrl?: string;
}

const memory = new Map<string, StoredFile>();
const MAX_BYTES = 5_000_000;
const ALLOWED = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["text/plain", "txt"],
  ["text/csv", "csv"],
]);

export function resetClientFilesMemory() {
  memory.clear();
}

function useMemory(): boolean {
  return !admin.apps.length || process.env.CLIENT_HUB_STORE === "memory";
}

function safeName(fileName: string, contentType: string): string {
  const ext = ALLOWED.get(contentType) || "bin";
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return `${base}.${ext}`;
}

function parsePayload(fileName: unknown, contentType: unknown, dataUrl: unknown): { name: string; contentType: string; bytes: Buffer } {
  const name = typeof fileName === "string" ? fileName.trim().slice(0, 120) : "";
  const type = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  if (!name) throw new HubError(400, "Choose a file name.");
  if (!ALLOWED.has(type)) throw new HubError(400, "Upload a PDF, JPEG, PNG, WebP, text, or CSV file.");
  const raw = typeof dataUrl === "string" ? dataUrl.trim() : "";
  const match = new RegExp(`^data:${type.replace("+", "\\+")};base64,([a-z0-9+/=\s]+)$`, "i").exec(raw);
  if (!match) throw new HubError(400, "That file did not upload. Try it again.");
  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (!bytes.length) throw new HubError(400, "That file was empty.");
  if (bytes.length > MAX_BYTES) throw new HubError(400, "Files shared in the portal must be 5 MB or smaller.");
  return { name: safeName(name, type), contentType: type, bytes };
}

function visible(file: ClientFileRecord, scope: { firebaseUids: string[]; clientIds: string[] }): boolean {
  const uids = new Set(scope.firebaseUids);
  const ids = new Set(scope.clientIds);
  return uids.has(file.firebaseUid) || ids.has(file.clientId) || ids.has(file.firebaseUid);
}

export async function listClientFiles(scope: { firebaseUids: string[]; clientIds: string[] }): Promise<ClientFileRecord[]> {
  const rows = useMemory() ? [...memory.values()] : await listedFromFirestore(scope);
  return rows
    .filter((file) => visible(file, scope))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(publicFile);
}

async function listedFromFirestore(scope: { firebaseUids: string[]; clientIds: string[] }): Promise<ClientFileRecord[]> {
  const db = admin.firestore();
  const found = new Map<string, ClientFileRecord>();
  const keys = [...new Set([...scope.firebaseUids, ...scope.clientIds])].filter(Boolean).slice(0, 10);
  for (const key of keys) {
    const [byUid, byClient, byProfile] = await Promise.all([
      db.collection("clientFiles").where("firebaseUid", "==", key).limit(50).get(),
      db.collection("clientFiles").where("clientId", "==", key).limit(50).get(),
      db.collection("clientFiles").where("clientProfileId", "==", profileId("client", key)).limit(50).get(),
    ]);
    for (const snap of [...byUid.docs, ...byClient.docs, ...byProfile.docs]) {
      found.set(snap.id, { id: snap.id, ...(snap.data() as Omit<ClientFileRecord, "id">) });
    }
  }
  return [...found.values()];
}

export async function addClientFile(input: {
  firebaseUid: string;
  clientId: string;
  uploadedByUid: string;
  direction: "admin" | "client";
  fileName: unknown;
  contentType: unknown;
  dataUrl: unknown;
}): Promise<ClientFileRecord> {
  const parsed = parsePayload(input.fileName, input.contentType, input.dataUrl);
  const stamp = clientLinkStamp(input.firebaseUid, input.clientId);
  const id = randomBytes(9).toString("hex");
  const storagePath = `client-files/${stamp.firebaseUid}/${id}/${parsed.name}`;
  const createdAt = new Date().toISOString();
  const record: StoredFile = {
    id,
    name: parsed.name,
    contentType: parsed.contentType,
    byteSize: parsed.bytes.length,
    storagePath,
    firebaseUid: stamp.firebaseUid,
    clientId: stamp.clientId,
    clientProfileId: stamp.clientProfileId,
    direction: input.direction,
    uploadedByUid: input.uploadedByUid,
    createdAt,
  };
  if (useMemory()) {
    memory.set(id, { ...record, bytes: parsed.bytes });
    return publicFile(record);
  }
  const token = randomBytes(16).toString("hex");
  const file = admin.storage().bucket().file(storagePath);
  await file.save(parsed.bytes, {
    contentType: parsed.contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const bucket = admin.storage().bucket().name;
  record.downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  await admin.firestore().collection("clientFiles").doc(id).set(record);
  return publicFile(record);
}

export async function readClientFile(
  fileId: string,
  scope: { firebaseUids: string[]; clientIds: string[] },
): Promise<{ file: ClientFileRecord; bytes: Buffer } | null> {
  if (useMemory()) {
    const stored = memory.get(fileId);
    if (!stored || !visible(stored, scope) || !stored.bytes) return null;
    return { file: publicFile(stored), bytes: stored.bytes };
  }
  const snap = await admin.firestore().collection("clientFiles").doc(fileId).get();
  if (!snap.exists) return null;
  const file = { id: snap.id, ...(snap.data() as Omit<ClientFileRecord, "id">) };
  if (!visible(file, scope)) return null;
  const [bytes] = await admin.storage().bucket().file(file.storagePath).download();
  return { file: publicFile(file), bytes };
}

function publicFile(file: ClientFileRecord): ClientFileRecord {
  return {
    id: file.id,
    name: file.name,
    contentType: file.contentType,
    byteSize: file.byteSize,
    storagePath: file.storagePath,
    firebaseUid: file.firebaseUid,
    clientId: file.clientId,
    clientProfileId: file.clientProfileId,
    direction: file.direction,
    uploadedByUid: file.uploadedByUid,
    createdAt: file.createdAt,
  };
}

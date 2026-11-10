/**
 * Firestore metadata for the media library.
 * Queries stay on one field so they use automatic indexes.
 * A future Dropbox import writes these same documents through MediaLibrary.
 */

import { createHash, randomUUID } from "node:crypto";
import admin from "firebase-admin";
import { recordAddressText } from "../../shared/addressText";
import type { FolderAccessLevel, LibrarySource, OrderTarget } from "../../shared/mediaLibrary";

const FILES = "files";
const FOLDERS = "folders";
const UPLOADS = "fileUploads";
const ACCESS = "fileFolderAccess";

export interface LibraryFileRecord {
  id: string;
  path: string;
  name: string;
  folder: string;
  activeFolder: string;
  size: number;
  contentType: string;
  b2Key: string;
  liveKey: string;
  tags: string[];
  notes: string;
  orderId: string;
  clientId: string;
  clientName: string;
  orderNumber: string;
  listingAddress: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  purgeAfter: number | null;
  trashed: boolean;
  searchTokens: string[];
  ancestorPaths: string[];
  source: LibrarySource;
  importSource: string;
}

export interface LibraryFolderRecord {
  id: string;
  path: string;
  name: string;
  parent: string;
  activeParent: string;
  createdAt: number;
  createdBy: string;
  trashed: boolean;
  deletedAt: number | null;
  purgeAfter: number | null;
  system: boolean;
  ancestorPaths: string[];
  searchTokens: string[];
}

export interface PendingUpload {
  id: string;
  key: string;
  folder: string;
  name: string;
  contentType: string;
  size: number;
  uploadId: string | null;
  mode: "single" | "multipart";
  actorUid: string;
  actorName: string;
  createdAt: number;
  tags: string[];
  notes: string;
  orderId: string;
  clientId: string;
  clientName: string;
  orderNumber: string;
  listingAddress: string;
}

export interface LibraryRepo {
  getFile(id: string): Promise<LibraryFileRecord | null>;
  findFileByLiveKey(key: string): Promise<LibraryFileRecord | null>;
  saveFile(file: LibraryFileRecord): Promise<void>;
  deleteFile(id: string): Promise<void>;
  listFilesInFolder(folder: string, limit: number): Promise<LibraryFileRecord[]>;
  listFilesUnder(prefix: string, limit: number): Promise<LibraryFileRecord[]>;
  listTrashedFiles(limit: number): Promise<LibraryFileRecord[]>;
  searchFiles(token: string, limit: number): Promise<LibraryFileRecord[]>;
  getFolder(id: string): Promise<LibraryFolderRecord | null>;
  findFolderByPath(path: string): Promise<LibraryFolderRecord | null>;
  saveFolder(folder: LibraryFolderRecord): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  listChildFolders(parent: string): Promise<LibraryFolderRecord[]>;
  listLiveFolders(limit: number): Promise<LibraryFolderRecord[]>;
  listFoldersUnder(prefix: string, limit: number): Promise<LibraryFolderRecord[]>;
  listTrashedFolders(limit: number): Promise<LibraryFolderRecord[]>;
  searchFolders(token: string, limit: number): Promise<LibraryFolderRecord[]>;
  getPending(id: string): Promise<PendingUpload | null>;
  savePending(pending: PendingUpload): Promise<void>;
  deletePending(id: string): Promise<void>;
  getAccess(root: string): Promise<FolderAccessLevel | null>;
  saveAccess(root: string, access: FolderAccessLevel, updatedAt: number): Promise<void>;
  listAccess(): Promise<Array<{ root: string; access: FolderAccessLevel }>>;
  listRecentOrders(limit: number): Promise<OrderTarget[]>;
  getOrder(id: string): Promise<OrderTarget | null>;
}

export function newLibraryId(kind: "m" | "f"): string {
  return `${kind}_${createHash("sha256").update(`${kind}:${randomUUID()}`).digest("hex").slice(0, 32)}`;
}

export function pendingIdForKey(key: string): string {
  return `u_${createHash("sha256").update(`pending:${key}`).digest("hex").slice(0, 32)}`;
}

export class FirestoreLibraryRepo implements LibraryRepo {
  private db() {
    return admin.firestore();
  }

  async getFile(id: string) { return this.one(FILES, id, asFile); }
  async findFileByLiveKey(key: string) { return this.first(FILES, "liveKey", key, asFile); }
  async saveFile(file: LibraryFileRecord) { await this.db().collection(FILES).doc(file.id).set(file); }
  async deleteFile(id: string) { await this.db().collection(FILES).doc(id).delete(); }
  async listFilesInFolder(folder: string, limit: number) { return this.where(FILES, "activeFolder", folder, limit, asFile); }
  async listFilesUnder(prefix: string, limit: number) { return this.contains(FILES, "ancestorPaths", prefix, limit, asFile); }
  async listTrashedFiles(limit: number) { return this.where(FILES, "trashed", true, limit, asFile); }
  async searchFiles(token: string, limit: number) { return this.contains(FILES, "searchTokens", token, limit, asFile); }

  async getFolder(id: string) { return this.one(FOLDERS, id, asFolder); }
  async findFolderByPath(path: string) { return this.first(FOLDERS, "path", path, asFolder); }
  async saveFolder(folder: LibraryFolderRecord) { await this.db().collection(FOLDERS).doc(folder.id).set(folder); }
  async deleteFolder(id: string) { await this.db().collection(FOLDERS).doc(id).delete(); }
  async listChildFolders(parent: string) { return this.where(FOLDERS, "activeParent", parent, 500, asFolder); }
  async listLiveFolders(limit: number) { return this.where(FOLDERS, "trashed", false, limit, asFolder); }
  async listFoldersUnder(prefix: string, limit: number) { return this.contains(FOLDERS, "ancestorPaths", prefix, limit, asFolder); }
  async listTrashedFolders(limit: number) { return this.where(FOLDERS, "trashed", true, limit, asFolder); }
  async searchFolders(token: string, limit: number) { return this.contains(FOLDERS, "searchTokens", token, limit, asFolder); }

  async getPending(id: string) { return this.one(UPLOADS, id, asPending); }
  async savePending(pending: PendingUpload) { await this.db().collection(UPLOADS).doc(pending.id).set(pending); }
  async deletePending(id: string) { await this.db().collection(UPLOADS).doc(id).delete(); }

  async getAccess(root: string): Promise<FolderAccessLevel | null> {
    const snap = await this.db().collection(ACCESS).doc(root).get();
    const access = snap.data()?.access;
    return access === "all_staff" || access === "owners_coordinators" ? access : null;
  }

  async saveAccess(root: string, access: FolderAccessLevel, updatedAt: number) {
    await this.db().collection(ACCESS).doc(root).set({ access, updatedAt });
  }

  async listAccess() {
    const snap = await this.db().collection(ACCESS).limit(100).get();
    return snap.docs.flatMap((doc) => {
      const access = doc.data().access;
      return access === "all_staff" || access === "owners_coordinators" ? [{ root: doc.id, access }] : [];
    });
  }

  async listRecentOrders(limit: number): Promise<OrderTarget[]> {
    const collection = this.db().collection("orderRequests");
    try {
      const snap = await collection.orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((doc) => orderTarget(doc.id, doc.data()));
    } catch (err) {
      console.error("[Files] Recent orders query used an unordered read.", err instanceof Error ? err.name : "error");
      const snap = await collection.limit(limit).get();
      return snap.docs.map((doc) => orderTarget(doc.id, doc.data()));
    }
  }

  async getOrder(id: string): Promise<OrderTarget | null> {
    for (const name of ["orderRequests", "orders"]) {
      const snap = await this.db().collection(name).doc(id).get();
      if (snap.exists) return orderTarget(snap.id, snap.data() || {});
    }
    return null;
  }

  private async one<T>(collection: string, id: string, parse: (id: string, data: Record<string, unknown>) => T | null): Promise<T | null> {
    const snap = await this.db().collection(collection).doc(id).get();
    if (!snap.exists) return null;
    return parse(snap.id, snap.data() || {});
  }

  private async first<T>(collection: string, field: string, value: string, parse: (id: string, data: Record<string, unknown>) => T | null): Promise<T | null> {
    const rows = await this.where(collection, field, value, 1, parse);
    return rows[0] ?? null;
  }

  private async where<T>(
    collection: string,
    field: string,
    value: unknown,
    limit: number,
    parse: (id: string, data: Record<string, unknown>) => T | null,
  ): Promise<T[]> {
    const snap = await this.db().collection(collection).where(field, "==", value).limit(limit).get();
    return snap.docs.flatMap((doc) => {
      const row = parse(doc.id, doc.data());
      return row ? [row] : [];
    });
  }

  private async contains<T>(
    collection: string,
    field: string,
    value: string,
    limit: number,
    parse: (id: string, data: Record<string, unknown>) => T | null,
  ): Promise<T[]> {
    const snap = await this.db().collection(collection).where(field, "array-contains", value).limit(limit).get();
    return snap.docs.flatMap((doc) => {
      const row = parse(doc.id, doc.data());
      return row ? [row] : [];
    });
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asFile(id: string, data: Record<string, unknown>): LibraryFileRecord | null {
  if (typeof data.path !== "string" || typeof data.name !== "string" || typeof data.liveKey !== "string") return null;
  return {
    id,
    path: data.path,
    name: data.name,
    folder: text(data.folder),
    activeFolder: text(data.activeFolder),
    size: typeof data.size === "number" ? data.size : 0,
    contentType: text(data.contentType) || "application/octet-stream",
    b2Key: text(data.b2Key) || text(data.liveKey),
    liveKey: data.liveKey,
    tags: stringList(data.tags),
    notes: text(data.notes),
    orderId: text(data.orderId),
    clientId: text(data.clientId),
    clientName: text(data.clientName),
    orderNumber: text(data.orderNumber),
    listingAddress: text(data.listingAddress),
    uploadedBy: text(data.uploadedBy),
    uploadedByName: text(data.uploadedByName),
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    deletedAt: numberOrNull(data.deletedAt),
    purgeAfter: numberOrNull(data.purgeAfter),
    trashed: data.trashed === true,
    searchTokens: stringList(data.searchTokens),
    ancestorPaths: stringList(data.ancestorPaths),
    source: data.source === "import" ? "import" : "upload",
    importSource: text(data.importSource),
  };
}

function asFolder(id: string, data: Record<string, unknown>): LibraryFolderRecord | null {
  if (typeof data.path !== "string" || typeof data.name !== "string") return null;
  return {
    id,
    path: data.path,
    name: data.name,
    parent: text(data.parent),
    activeParent: text(data.activeParent),
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    createdBy: text(data.createdBy),
    trashed: data.trashed === true,
    deletedAt: numberOrNull(data.deletedAt),
    purgeAfter: numberOrNull(data.purgeAfter),
    system: data.system === true,
    ancestorPaths: stringList(data.ancestorPaths),
    searchTokens: stringList(data.searchTokens),
  };
}

function asPending(id: string, data: Record<string, unknown>): PendingUpload | null {
  if (typeof data.key !== "string" || typeof data.name !== "string") return null;
  return {
    id,
    key: data.key,
    folder: text(data.folder),
    name: data.name,
    contentType: text(data.contentType) || "application/octet-stream",
    size: typeof data.size === "number" ? data.size : 0,
    uploadId: text(data.uploadId) || null,
    mode: data.mode === "multipart" ? "multipart" : "single",
    actorUid: text(data.actorUid),
    actorName: text(data.actorName),
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    tags: stringList(data.tags),
    notes: text(data.notes),
    orderId: text(data.orderId),
    clientId: text(data.clientId),
    clientName: text(data.clientName),
    orderNumber: text(data.orderNumber),
    listingAddress: text(data.listingAddress),
  };
}

function orderTarget(id: string, data: Record<string, unknown>): OrderTarget {
  const clientName = text(data.clientName) || text(data.customerName) || [text(data.firstName), text(data.lastName)].filter(Boolean).join(" ");
  const orderNumber = text(data.orderNumber) || text(data.number) || text(data.invoiceNumber) || id.slice(0, 8);
  return {
    id,
    clientName,
    address: recordAddressText(data),
    orderNumber,
    clientId: text(data.clientId),
  };
}

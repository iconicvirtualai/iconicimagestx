/**
 * In-memory library metadata for tests. Production uses FirestoreLibraryRepo.
 */

import type { FolderAccessLevel, OrderTarget } from "../../shared/mediaLibrary";
import type {
  LibraryFileRecord,
  LibraryFolderRecord,
  LibraryRepo,
  PendingUpload,
} from "./libraryRepo";

export class MemoryLibraryRepo implements LibraryRepo {
  files = new Map<string, LibraryFileRecord>();
  folders = new Map<string, LibraryFolderRecord>();
  pending = new Map<string, PendingUpload>();
  access = new Map<string, FolderAccessLevel>();
  orders: OrderTarget[] = [];

  async getFile(id: string) { return clone(this.files.get(id)); }
  async findFileByLiveKey(key: string) { return clone([...this.files.values()].find((file) => file.liveKey === key)); }
  async saveFile(file: LibraryFileRecord) { this.files.set(file.id, clone(file)!); }
  async deleteFile(id: string) { this.files.delete(id); }
  async listFilesInFolder(folder: string, limit: number) {
    return [...this.files.values()].filter((file) => file.activeFolder === folder).slice(0, limit).map((file) => clone(file)!);
  }
  async listFilesUnder(prefix: string, limit: number) {
    return [...this.files.values()].filter((file) => file.ancestorPaths.includes(prefix)).slice(0, limit).map((file) => clone(file)!);
  }
  async listTrashedFiles(limit: number) {
    return [...this.files.values()].filter((file) => file.trashed).slice(0, limit).map((file) => clone(file)!);
  }
  async searchFiles(token: string, limit: number) {
    return [...this.files.values()].filter((file) => file.searchTokens.includes(token)).slice(0, limit).map((file) => clone(file)!);
  }
  async getFolder(id: string) { return clone(this.folders.get(id)); }
  async findFolderByPath(path: string) { return clone([...this.folders.values()].find((folder) => folder.path === path)); }
  async saveFolder(folder: LibraryFolderRecord) { this.folders.set(folder.id, clone(folder)!); }
  async deleteFolder(id: string) { this.folders.delete(id); }
  async listChildFolders(parent: string) {
    return [...this.folders.values()].filter((folder) => folder.activeParent === parent).map((folder) => clone(folder)!);
  }
  async listLiveFolders(limit: number) {
    return [...this.folders.values()].filter((folder) => !folder.trashed).slice(0, limit).map((folder) => clone(folder)!);
  }
  async listFoldersUnder(prefix: string, limit: number) {
    return [...this.folders.values()].filter((folder) => folder.ancestorPaths.includes(prefix)).slice(0, limit).map((folder) => clone(folder)!);
  }
  async listTrashedFolders(limit: number) {
    return [...this.folders.values()].filter((folder) => folder.trashed).slice(0, limit).map((folder) => clone(folder)!);
  }
  async searchFolders(token: string, limit: number) {
    return [...this.folders.values()].filter((folder) => folder.searchTokens.includes(token)).slice(0, limit).map((folder) => clone(folder)!);
  }
  async getPending(id: string) { return clone(this.pending.get(id)); }
  async savePending(pending: PendingUpload) { this.pending.set(pending.id, clone(pending)!); }
  async deletePending(id: string) { this.pending.delete(id); }
  async getAccess(root: string) { return this.access.get(root) ?? null; }
  async saveAccess(root: string, access: FolderAccessLevel) { this.access.set(root, access); }
  async listAccess() { return [...this.access.entries()].map(([root, access]) => ({ root, access })); }
  async listRecentOrders(limit: number) { return this.orders.slice(0, limit).map((order) => ({ ...order })); }
  async getOrder(id: string) {
    const order = this.orders.find((item) => item.id === id);
    return order ? { ...order } : null;
  }
}

function clone<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}

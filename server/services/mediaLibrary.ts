/**
 * Staff media library.
 *
 * Uploads and downloads are presigned. This service writes metadata and asks
 * Backblaze to copy or delete keys. It does not stream file bytes.
 *
 * Dropbox import, later: copy each object into B2, then call importObject
 * with the same record shape commit() writes. Do not invent a second collection.
 */

import { StorageError, type B2Storage, storageFromEnv } from "./b2Storage";
import {
  FirestoreLibraryRepo,
  newLibraryId,
  pendingIdForKey,
  type LibraryFileRecord,
  type LibraryFolderRecord,
  type LibraryRepo,
  type PendingUpload,
} from "./libraryRepo";
import {
  LIBRARY_ROOTS,
  LIST_LIMIT,
  MAX_BULK,
  MULTIPART_PART_BYTES,
  ORDER_MEDIA_KINDS,
  PENDING_UPLOAD_MS,
  PREVIEW_LIMIT,
  SEARCH_LIMIT,
  TRASH_RETENTION_MS,
  ancestorPaths,
  breadcrumbsFor,
  defaultAccessFor,
  folderAccessAllows,
  isPreviewable,
  isSystemRoot,
  isTrashKey,
  matchesAllTokens,
  mediaKindFor,
  normalizeContentType,
  normalizeLibraryPath,
  normalizeNotes,
  normalizeTags,
  orderClientFolder,
  orderLibraryPath,
  parseAccess,
  parseByteSize,
  parseMediaKind,
  partCountFor,
  queryTokens,
  replacePathPrefix,
  searchTokens,
  shouldZipDownloads,
  topLevelFolder,
  trashIsRestorable,
  trashObjectKey,
  uniquifyName,
  uploadDestination,
  useMultipart,
  type FolderAccessLevel,
  type LibraryFileView,
  type LibraryFolderView,
  type LibrarySource,
  type OrderMediaKind,
} from "../../shared/mediaLibrary";

const TRASH_SLOT = "~trash";
const FOLDER_BATCH = 40;

export class LibraryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LibraryError";
    this.status = status;
  }
}

export interface LibraryActor {
  uid: string;
  name: string;
  email: string;
  role: string;
}

interface UploadRequest {
  folder?: unknown;
  relativePath?: unknown;
  name?: unknown;
  contentType?: unknown;
  size?: unknown;
  tags?: unknown;
  notes?: unknown;
  orderId?: unknown;
  clientId?: unknown;
  clientName?: unknown;
  orderNumber?: unknown;
  listingAddress?: unknown;
}

export class MediaLibrary {
  private accessCache = new Map<string, FolderAccessLevel>();

  constructor(
    private repo: LibraryRepo,
    private storage: B2Storage,
    private now: () => number = Date.now,
  ) {}

  async list(actor: LibraryActor, folderInput: unknown, trash: boolean) {
    await this.ensureDefaults(actor);
    if (trash) {
      await this.purgeExpired();
      const [files, folders] = await Promise.all([
        this.repo.listTrashedFiles(LIST_LIMIT),
        this.repo.listTrashedFolders(LIST_LIMIT),
      ]);
      const visibleFiles = [];
      for (const file of files) {
        if (trashIsRestorable(file.deletedAt, this.now()) && await this.canSeeAsync(actor.role, file.path)) visibleFiles.push(file);
      }
      const visibleFolders = [];
      for (const folder of folders) {
        if (trashIsRestorable(folder.deletedAt, this.now()) && await this.canSeeAsync(actor.role, folder.path)) visibleFolders.push(folder);
      }
      return {
        folder: "",
        trash: true,
        breadcrumbs: [{ name: "Trash", path: "" }],
        folders: visibleFolders.map(folderView),
        files: visibleFiles.map((file) => fileView(file)),
        truncated: files.length >= LIST_LIMIT || folders.length >= LIST_LIMIT,
        canManageAccess: this.isCoordinator(actor.role),
        access: null,
      };
    }
    const folder = this.path(folderInput, true);
    if (folder) await this.assertAccess(actor.role, folder);
    const [folders, files] = await Promise.all([
      this.repo.listChildFolders(folder),
      this.repo.listFilesInFolder(folder, LIST_LIMIT),
    ]);
    const visibleFolders = [];
    for (const item of folders) {
      if (item.trashed) continue;
      if (await this.canSeeAsync(actor.role, item.path)) visibleFolders.push(item);
    }
    const visibleFiles = [];
    for (const file of files) {
      if (!file.trashed && await this.canSeeAsync(actor.role, file.path)) visibleFiles.push(file);
    }
    return {
      folder,
      trash: false,
      breadcrumbs: breadcrumbsFor(folder),
      folders: visibleFolders.map(folderView),
      files: await this.withPreviews(visibleFiles),
      truncated: files.length >= LIST_LIMIT,
      canManageAccess: this.isCoordinator(actor.role),
      access: folder ? await this.accessFor(topLevelFolder(folder)) : null,
    };
  }

  async tree(actor: LibraryActor) {
    await this.ensureDefaults(actor);
    const folders = await this.repo.listLiveFolders(1000);
    const visible = [];
    for (const folder of folders) {
      if (await this.canSeeAsync(actor.role, folder.path)) visible.push(folderView(folder));
    }
    return { folders: visible };
  }

  async search(actor: LibraryActor, query: unknown, includeTrash: boolean) {
    const text = typeof query === "string" ? query.trim() : "";
    const required = queryTokens(text);
    if (required.length === 0) throw new LibraryError(400, "Type at least two letters to search.");
    const [files, folders] = await Promise.all([
      this.repo.searchFiles(required[0], SEARCH_LIMIT),
      this.repo.searchFolders(required[0], SEARCH_LIMIT),
    ]);
    const visibleFiles = [];
    for (const file of files) {
      if (!matchesAllTokens(file.searchTokens, required)) continue;
      if (!includeTrash && file.trashed) continue;
      if (file.trashed && !trashIsRestorable(file.deletedAt, this.now())) continue;
      if (!(await this.canSeeAsync(actor.role, file.path))) continue;
      visibleFiles.push(file);
    }
    const visibleFolders = [];
    for (const folder of folders) {
      if (!matchesAllTokens(folder.searchTokens, required)) continue;
      if (!includeTrash && folder.trashed) continue;
      if (!(await this.canSeeAsync(actor.role, folder.path))) continue;
      visibleFolders.push(folder);
    }
    return {
      query: text,
      files: await this.withPreviews(visibleFiles.slice(0, SEARCH_LIMIT)),
      folders: visibleFolders.slice(0, SEARCH_LIMIT).map(folderView),
    };
  }

  async createFolder(actor: LibraryActor, parentInput: unknown, nameInput: unknown) {
    const parent = this.path(parentInput, true);
    const rawName = typeof nameInput === "string" ? nameInput : "";
    if (/[/\\]/.test(rawName) || rawName.includes("..")) throw new LibraryError(400, "Use a folder name without slashes or ..");
    const name = cleanFolderName(rawName);
    const destination = normalizeLibraryPath(parent ? `${parent}/${name}` : name);
    if (!destination) throw new LibraryError(400, "Use a folder name without slashes or ..");
    await this.assertAccess(actor.role, destination);
    if (parent) await this.ensureFolderPath(actor, parent, false);
    const taken = await this.namesIn(parent);
    if (taken.has(name)) throw new LibraryError(409, "That name is already in this folder.");
    await this.writeFolder(actor, destination, false);
    const saved = await this.repo.findFolderByPath(destination);
    if (!saved) throw new LibraryError(500, "The folder could not be saved.");
    return { folder: folderView(saved) };
  }

  async signUpload(actor: LibraryActor, body: UploadRequest) {
    const prepared = await this.prepare(actor, body);
    if (useMultipart(prepared.size, prepared.contentType)) {
      throw new LibraryError(400, "This file is large enough for a multipart upload.");
    }
    const signed = await this.storageCall(() => this.storage.presignPut(prepared.key, prepared.contentType));
    await this.repo.savePending(prepared.pending);
    return { mode: "single" as const, key: prepared.key, url: signed.url, headers: signed.headers };
  }

  async createMultipart(actor: LibraryActor, body: UploadRequest) {
    const prepared = await this.prepare(actor, body);
    if (!useMultipart(prepared.size, prepared.contentType)) {
      throw new LibraryError(400, "This file can upload in one request.");
    }
    const created = await this.storageCall(() => this.storage.createMultipart(prepared.key, prepared.contentType));
    prepared.pending.uploadId = created.uploadId;
    prepared.pending.mode = "multipart";
    await this.repo.savePending(prepared.pending);
    return {
      mode: "multipart" as const,
      key: prepared.key,
      uploadId: created.uploadId,
      partSize: MULTIPART_PART_BYTES,
      partCount: partCountFor(prepared.size),
    };
  }

  async signPart(actor: LibraryActor, body: { key?: unknown; uploadId?: unknown; partNumber?: unknown }) {
    const pending = await this.pendingFor(actor, body.key, body.uploadId);
    const partNumber = typeof body.partNumber === "number" ? body.partNumber : Number(body.partNumber);
    const parts = partCountFor(pending.size);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > parts || partNumber > 10000) {
      throw new LibraryError(400, "That upload part is out of range.");
    }
    const signed = await this.storageCall(() => this.storage.presignPart(pending.key, pending.uploadId || "", partNumber));
    return { url: signed.url, headers: signed.headers, partNumber };
  }

  async completeMultipart(actor: LibraryActor, body: { key?: unknown; uploadId?: unknown; parts?: unknown }) {
    const pending = await this.pendingFor(actor, body.key, body.uploadId);
    const parts = parseParts(body.parts, partCountFor(pending.size));
    await this.storageCall(() => this.storage.completeMultipart(pending.key, pending.uploadId || "", parts));
    return { key: pending.key, ready: true };
  }

  async abortMultipart(actor: LibraryActor, body: { key?: unknown; uploadId?: unknown }) {
    const pending = await this.pendingFor(actor, body.key, body.uploadId);
    await this.storageCall(() => this.storage.abortMultipart(pending.key, pending.uploadId || ""));
    await this.repo.deletePending(pending.id);
    return { aborted: true };
  }

  async commit(actor: LibraryActor, keyInput: unknown) {
    const key = this.objectKey(keyInput);
    const pending = await this.repo.getPending(pendingIdForKey(key));
    if (!pending || pending.key !== key) throw new LibraryError(404, "That upload is not waiting to be saved.");
    await this.assertAccess(actor.role, pending.folder);
    if (this.now() - pending.createdAt > PENDING_UPLOAD_MS) {
      await this.repo.deletePending(pending.id);
      throw new LibraryError(410, "That upload expired. Start it again.");
    }
    const stored = await this.storageCall(() => this.storage.head(key));
    if (!stored) throw new LibraryError(409, "The file has not arrived in storage yet.");
    const file = this.fileFromPending(pending, stored.size || pending.size, actor);
    await this.repo.saveFile(file);
    await this.repo.deletePending(pending.id);
    return { file: fileView(file) };
  }

  /**
   * Register an object that is already in B2. A Dropbox import job should
   * copy bytes into the bucket, then call this with the library key.
   */
  async importObject(actor: LibraryActor, body: UploadRequest & { key?: unknown; importSource?: unknown }) {
    this.assertCoordinator(actor.role);
    const key = this.objectKey(body.key);
    const folder = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "Inbox";
    const name = key.split("/").pop() || "";
    await this.assertAccess(actor.role, folder);
    await this.ensureFolderPath(actor, folder, false);
    if (await this.repo.findFileByLiveKey(key)) throw new LibraryError(409, "That file is already in the library.");
    const stored = await this.storageCall(() => this.storage.head(key));
    if (!stored) throw new LibraryError(409, "That object is not in Backblaze yet.");
    const importSource = typeof body.importSource === "string" ? body.importSource.trim().slice(0, 500) : "";
    const now = this.now();
    const file = this.buildFile({
      key,
      folder,
      name,
      size: stored.size,
      contentType: stored.contentType || normalizeContentType(body.contentType, name),
      actor,
      now,
      source: "import",
      importSource,
      tags: normalizeTags(body.tags),
      notes: normalizeNotes(body.notes),
      orderId: shortText(body.orderId, 80),
      clientId: shortText(body.clientId, 80),
      clientName: shortText(body.clientName, 160),
      orderNumber: shortText(body.orderNumber, 80),
      listingAddress: shortText(body.listingAddress, 240),
    });
    await this.repo.saveFile(file);
    return { file: fileView(file) };
  }

  async signDownloads(actor: LibraryActor, idsInput: unknown) {
    const ids = idList(idsInput, "m");
    const files = [];
    for (const id of ids) {
      const file = await this.requireFile(id);
      await this.assertAccess(actor.role, file.path);
      if (file.trashed && !trashIsRestorable(file.deletedAt, this.now())) {
        throw new LibraryError(410, `${file.name} is past the 30-day trash window.`);
      }
      const url = await this.storageCall(() => this.storage.presignGet(file.b2Key, file.name, false));
      files.push({ id: file.id, name: file.name, url, size: file.size, contentType: file.contentType });
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    return { files, zip: shouldZipDownloads(files.length, total) };
  }

  async move(actor: LibraryActor, fileIdsInput: unknown, folderIdsInput: unknown, destinationInput: unknown) {
    const destination = this.path(destinationInput, true);
    if (destination) {
      await this.assertAccess(actor.role, destination);
      await this.ensureFolderPath(actor, destination, false);
    } else {
      throw new LibraryError(400, "Choose a folder. The library root only holds drawers.");
    }
    const fileIds = idList(fileIdsInput, "m", true);
    const folderIds = idList(folderIdsInput, "f", true);
    if (fileIds.length + folderIds.length === 0) throw new LibraryError(400, "Choose something to move.");
    let moved = 0;
    for (const id of fileIds) {
      const file = await this.requireFile(id);
      await this.moveFile(actor, file, destination);
      moved += 1;
    }
    for (const id of folderIds) {
      const folder = await this.requireFolder(id);
      await this.moveFolder(actor, folder, destination);
      moved += 1;
    }
    return { moved };
  }

  async rename(actor: LibraryActor, kind: unknown, id: unknown, nameInput: unknown) {
    const name = cleanFolderName(typeof nameInput === "string" ? nameInput : "");
    if (!name || name.includes("/")) throw new LibraryError(400, "Use a name without slashes or ..");
    if (kind === "file") {
      const file = await this.requireFile(typeof id === "string" ? id : "");
      if (file.trashed) throw new LibraryError(400, "Restore the file before renaming it.");
      await this.assertAccess(actor.role, file.path);
      const taken = await this.namesIn(file.folder);
      if (taken.has(name) && name !== file.name) throw new LibraryError(409, "That name is already in this folder.");
      const nextKey = file.folder ? `${file.folder}/${name}` : name;
      await this.relocateFile(file, nextKey);
      return { file: fileView((await this.repo.getFile(file.id))!) };
    }
    if (kind === "folder") {
      const folder = await this.requireFolder(typeof id === "string" ? id : "");
      if (folder.system || isSystemRoot(folder.path)) throw new LibraryError(400, "That drawer stays where it is.");
      const parent = folder.parent;
      const next = parent ? `${parent}/${name}` : name;
      if (normalizeLibraryPath(next) === null) throw new LibraryError(400, "That name is not allowed.");
      await this.relocateFolder(actor, folder, next);
      return { folder: folderView((await this.repo.getFolder(folder.id))!) };
    }
    throw new LibraryError(400, "Rename a file or a folder.");
  }

  async trash(actor: LibraryActor, fileIdsInput: unknown, folderIdsInput: unknown) {
    const fileIds = idList(fileIdsInput, "m", true);
    const folderIds = idList(folderIdsInput, "f", true);
    if (fileIds.length + folderIds.length === 0) throw new LibraryError(400, "Choose something to delete.");
    for (const id of fileIds) await this.trashFile(actor, await this.requireFile(id));
    for (const id of folderIds) await this.trashFolder(actor, await this.requireFolder(id));
    return { trashed: fileIds.length + folderIds.length, retentionDays: 30 };
  }

  async restore(actor: LibraryActor, fileIdsInput: unknown, folderIdsInput: unknown) {
    const fileIds = idList(fileIdsInput, "m", true);
    const folderIds = idList(folderIdsInput, "f", true);
    if (fileIds.length + folderIds.length === 0) throw new LibraryError(400, "Choose something to restore.");
    for (const id of folderIds) await this.restoreFolder(actor, await this.requireFolder(id));
    for (const id of fileIds) await this.restoreFile(actor, await this.requireFile(id));
    return { restored: fileIds.length + folderIds.length };
  }

  async destroy(actor: LibraryActor, fileIdsInput: unknown, folderIdsInput: unknown) {
    const fileIds = idList(fileIdsInput, "m", true);
    const folderIds = idList(folderIdsInput, "f", true);
    if (fileIds.length + folderIds.length === 0) throw new LibraryError(400, "Choose something in the trash.");
    for (const id of fileIds) await this.destroyFile(actor, await this.requireFile(id));
    for (const id of folderIds) await this.destroyFolder(actor, await this.requireFolder(id));
    return { deleted: fileIds.length + folderIds.length };
  }

  async updateFile(actor: LibraryActor, idInput: unknown, patch: { tags?: unknown; notes?: unknown }) {
    const file = await this.requireFile(typeof idInput === "string" ? idInput : "");
    await this.assertAccess(actor.role, file.path);
    if (file.trashed) throw new LibraryError(400, "Restore the file before editing its details.");
    if ("tags" in patch) file.tags = normalizeTags(patch.tags);
    if ("notes" in patch) file.notes = normalizeNotes(patch.notes);
    file.updatedAt = this.now();
    file.searchTokens = tokensFor(file);
    await this.repo.saveFile(file);
    return { file: fileView(file) };
  }

  async accessSettings(actor: LibraryActor) {
    await this.ensureDefaults(actor);
    const stored = new Map((await this.repo.listAccess()).map((item) => [item.root, item.access]));
    const folders = await this.repo.listChildFolders("");
    const roots = new Map<string, { path: string; access: FolderAccessLevel; system: boolean }>();
    for (const root of LIBRARY_ROOTS) {
      roots.set(root.name, { path: root.name, access: stored.get(root.name) ?? root.access, system: true });
    }
    for (const folder of folders) {
      if (folder.parent) continue;
      roots.set(folder.name, {
        path: folder.path,
        access: stored.get(folder.name) ?? defaultAccessFor(folder.name),
        system: folder.system,
      });
    }
    const visible = [];
    for (const item of roots.values()) {
      if (await this.canSeeAsync(actor.role, item.path)) visible.push(item);
    }
    return {
      canManage: this.isCoordinator(actor.role),
      folders: visible,
    };
  }

  async setAccess(actor: LibraryActor, rootInput: unknown, accessInput: unknown) {
    this.assertCoordinator(actor.role);
    const root = normalizeLibraryPath(rootInput);
    const access = parseAccess(accessInput);
    if (!root || root.includes("/")) throw new LibraryError(400, "Access is set on a top-level folder.");
    if (!access) throw new LibraryError(400, "Choose all staff, or owners and coordinators.");
    await this.ensureFolderPath(actor, root, isSystemRoot(root));
    await this.repo.saveAccess(root, access, this.now());
    this.accessCache.delete(root);
    return { path: root, access };
  }

  async orderTargets(actor: LibraryActor, query: unknown) {
    const text = typeof query === "string" ? query.trim().toLowerCase() : "";
    const orders = await this.repo.listRecentOrders(80);
    const matched = text
      ? orders.filter((order) => [order.clientName, order.address, order.orderNumber, order.id].join(" ").toLowerCase().includes(text))
      : orders;
    return { orders: matched.slice(0, 20) };
  }

  async orderFolder(actor: LibraryActor, orderId: unknown, kindInput: unknown) {
    if (typeof orderId !== "string" || !orderId.trim() || orderId.includes("/") || orderId.includes("\\")) {
      throw new LibraryError(400, "Choose an order.");
    }
    const order = await this.repo.getOrder(orderId.trim());
    if (!order) throw new LibraryError(404, "That order was not found.");
    const kind = parseMediaKind(kindInput) ?? "Photos";
    const base = orderClientFolder(order);
    await this.assertAccess(actor.role, base);
    for (const media of ORDER_MEDIA_KINDS) {
      await this.ensureFolderPath(actor, `${base}/${media}`, false);
    }
    return {
      folder: orderLibraryPath({ ...order, kind }),
      kind,
      order,
      kinds: ORDER_MEDIA_KINDS,
    };
  }

  private async prepare(actor: LibraryActor, body: UploadRequest) {
    const size = parseByteSize(body.size);
    if (size === null) throw new LibraryError(400, "That file is empty or larger than 20 GB.");
    const relative = typeof body.relativePath === "string" && body.relativePath.trim()
      ? body.relativePath
      : body.name;
    const placed = uploadDestination(body.folder ?? "", relative);
    if (!placed) throw new LibraryError(400, "That file path is not allowed.");
    await this.assertAccess(actor.role, placed.folder);
    await this.ensureFolderPath(actor, placed.folder, false);
    const taken = await this.namesIn(placed.folder);
    const name = uniquifyName(placed.name, taken);
    const key = `${placed.folder}/${name}`;
    if (isTrashKey(key) || normalizeLibraryPath(key) === null) throw new LibraryError(400, "That file path is not allowed.");
    const contentType = normalizeContentType(body.contentType, name);
    const now = this.now();
    const pending: PendingUpload = {
      id: pendingIdForKey(key),
      key,
      folder: placed.folder,
      name,
      contentType,
      size,
      uploadId: null,
      mode: "single",
      actorUid: actor.uid,
      actorName: actor.name,
      createdAt: now,
      tags: normalizeTags(body.tags),
      notes: normalizeNotes(body.notes),
      orderId: shortText(body.orderId, 80),
      clientId: shortText(body.clientId, 80),
      clientName: shortText(body.clientName, 160),
      orderNumber: shortText(body.orderNumber, 80),
      listingAddress: shortText(body.listingAddress, 240),
    };
    return { key, size, contentType, pending };
  }

  private fileFromPending(pending: PendingUpload, size: number, actor: LibraryActor): LibraryFileRecord {
    return this.buildFile({
      key: pending.key,
      folder: pending.folder,
      name: pending.name,
      size,
      contentType: pending.contentType,
      actor: { ...actor, name: pending.actorName || actor.name, uid: pending.actorUid || actor.uid },
      now: pending.createdAt,
      source: "upload",
      importSource: "",
      tags: pending.tags,
      notes: pending.notes,
      orderId: pending.orderId,
      clientId: pending.clientId,
      clientName: pending.clientName,
      orderNumber: pending.orderNumber,
      listingAddress: pending.listingAddress,
    });
  }

  private buildFile(input: {
    key: string;
    folder: string;
    name: string;
    size: number;
    contentType: string;
    actor: LibraryActor;
    now: number;
    source: LibrarySource;
    importSource: string;
    tags: string[];
    notes: string;
    orderId: string;
    clientId: string;
    clientName: string;
    orderNumber: string;
    listingAddress: string;
  }): LibraryFileRecord {
    const file: LibraryFileRecord = {
      id: newLibraryId("m"),
      path: input.key,
      name: input.name,
      folder: input.folder,
      activeFolder: input.folder,
      size: input.size,
      contentType: input.contentType,
      b2Key: input.key,
      liveKey: input.key,
      tags: input.tags,
      notes: input.notes,
      orderId: input.orderId,
      clientId: input.clientId,
      clientName: input.clientName,
      orderNumber: input.orderNumber,
      listingAddress: input.listingAddress,
      uploadedBy: input.actor.uid,
      uploadedByName: input.actor.name || input.actor.email || "Staff",
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      purgeAfter: null,
      trashed: false,
      searchTokens: [],
      ancestorPaths: ancestorPaths(input.folder),
      source: input.source,
      importSource: input.importSource,
    };
    file.searchTokens = tokensFor(file);
    return file;
  }

  private async moveFile(actor: LibraryActor, file: LibraryFileRecord, destination: string) {
    if (file.trashed) throw new LibraryError(400, "Restore the file before moving it.");
    await this.assertAccess(actor.role, file.path);
    const taken = await this.namesIn(destination);
    taken.delete(file.name);
    const name = uniquifyName(file.name, taken);
    await this.relocateFile(file, `${destination}/${name}`);
  }

  private async relocateFile(file: LibraryFileRecord, nextKey: string) {
    if (normalizeLibraryPath(nextKey) === null || isTrashKey(nextKey)) throw new LibraryError(400, "That file path is not allowed.");
    if (nextKey === file.liveKey) return;
    if (await this.repo.findFileByLiveKey(nextKey)) throw new LibraryError(409, "A file with that name is already there.");
    await this.storageCall(() => this.storage.move(file.b2Key, nextKey));
    const folder = nextKey.includes("/") ? nextKey.slice(0, nextKey.lastIndexOf("/")) : "";
    file.path = nextKey;
    file.liveKey = nextKey;
    file.b2Key = nextKey;
    file.folder = folder;
    file.activeFolder = folder;
    file.name = nextKey.split("/").pop() || file.name;
    file.ancestorPaths = ancestorPaths(folder);
    file.updatedAt = this.now();
    file.searchTokens = tokensFor(file);
    await this.repo.saveFile(file);
  }

  private async moveFolder(actor: LibraryActor, folder: LibraryFolderRecord, destination: string) {
    if (folder.system || isSystemRoot(folder.path)) throw new LibraryError(400, "That drawer stays where it is.");
    const next = `${destination}/${folder.name}`;
    if (next === folder.path) return;
    if (destination === folder.path || destination.startsWith(`${folder.path}/`)) {
      throw new LibraryError(400, "Choose a folder that is not inside this one.");
    }
    await this.relocateFolder(actor, folder, next);
  }

  private async relocateFolder(actor: LibraryActor, folder: LibraryFolderRecord, nextPath: string) {
    if (folder.trashed) throw new LibraryError(400, "Restore the folder before moving it.");
    await this.assertAccess(actor.role, folder.path);
    await this.assertAccess(actor.role, nextPath);
    if (await this.repo.findFolderByPath(nextPath)) throw new LibraryError(409, "A folder with that name is already there.");
    const folders = await this.underFolders(folder.path);
    const files = await this.underFiles(folder.path);
    const moves: { file: LibraryFileRecord; from: string; to: string }[] = [];
    for (const file of files) {
      if (file.trashed) continue;
      const to = replacePathPrefix(file.liveKey, folder.path, nextPath);
      moves.push({ file, from: file.b2Key, to });
    }
    const done: { from: string; to: string }[] = [];
    try {
      for (const move of moves) {
        await this.storageCall(() => this.storage.move(move.from, move.to));
        done.push({ from: move.from, to: move.to });
      }
      for (const item of folders) {
        const path = replacePathPrefix(item.path, folder.path, nextPath);
        const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        item.path = path;
        item.name = path.split("/").pop() || item.name;
        item.parent = parent;
        item.activeParent = parent;
        item.ancestorPaths = ancestorPaths(path);
        item.searchTokens = searchTokens(item.name, item.path);
        await this.repo.saveFolder(item);
      }
      for (const move of moves) {
        const file = move.file;
        const folderPath = move.to.includes("/") ? move.to.slice(0, move.to.lastIndexOf("/")) : "";
        file.path = move.to;
        file.liveKey = move.to;
        file.b2Key = move.to;
        file.folder = folderPath;
        file.activeFolder = folderPath;
        file.name = move.to.split("/").pop() || file.name;
        file.ancestorPaths = ancestorPaths(folderPath);
        file.updatedAt = this.now();
        file.searchTokens = tokensFor(file);
        await this.repo.saveFile(file);
      }
    } catch (err) {
      for (const move of done.reverse()) {
        try { await this.storage.move(move.to, move.from); } catch (undo) {
          console.error("[Files] Could not undo a folder move.", undo instanceof Error ? undo.name : "error");
        }
      }
      throw err;
    }
  }

  private async trashFile(actor: LibraryActor, file: LibraryFileRecord) {
    if (file.trashed) return;
    await this.assertAccess(actor.role, file.path);
    const deletedAt = this.now();
    const trashKey = trashObjectKey(file.liveKey, deletedAt, file.id);
    await this.storageCall(() => this.storage.move(file.b2Key, trashKey));
    file.b2Key = trashKey;
    file.trashed = true;
    file.activeFolder = TRASH_SLOT;
    file.deletedAt = deletedAt;
    file.purgeAfter = deletedAt + TRASH_RETENTION_MS;
    file.updatedAt = deletedAt;
    await this.repo.saveFile(file);
  }

  private async trashFolder(actor: LibraryActor, folder: LibraryFolderRecord) {
    if (folder.trashed) return;
    if (folder.system || isSystemRoot(folder.path)) throw new LibraryError(400, "Library drawers stay in the list. Delete what is inside them.");
    await this.assertAccess(actor.role, folder.path);
    const files = (await this.underFiles(folder.path)).filter((file) => !file.trashed);
    const folders = (await this.underFolders(folder.path)).filter((item) => !item.trashed);
    const deletedAt = this.now();
    const done: { file: LibraryFileRecord; from: string }[] = [];
    try {
      for (const file of files) {
        const from = file.b2Key;
        const trashKey = trashObjectKey(file.liveKey, deletedAt, file.id);
        await this.storageCall(() => this.storage.move(from, trashKey));
        file.b2Key = trashKey;
        done.push({ file, from });
      }
      for (const file of files) {
        file.trashed = true;
        file.activeFolder = TRASH_SLOT;
        file.deletedAt = deletedAt;
        file.purgeAfter = deletedAt + TRASH_RETENTION_MS;
        file.updatedAt = deletedAt;
        await this.repo.saveFile(file);
      }
      for (const item of folders) {
        item.trashed = true;
        item.activeParent = TRASH_SLOT;
        item.deletedAt = deletedAt;
        item.purgeAfter = deletedAt + TRASH_RETENTION_MS;
        await this.repo.saveFolder(item);
      }
    } catch (err) {
      for (const item of done.reverse()) {
        try { await this.storage.move(item.file.b2Key, item.from); } catch (undo) {
          console.error("[Files] Could not undo a trash move.", undo instanceof Error ? undo.name : "error");
        }
      }
      throw err;
    }
  }

  private async restoreFile(actor: LibraryActor, file: LibraryFileRecord) {
    if (!file.trashed) return;
    if (!trashIsRestorable(file.deletedAt, this.now())) throw new LibraryError(410, `${file.name} is past the 30-day trash window.`);
    await this.assertAccess(actor.role, file.path);
    await this.ensureFolderPath(actor, file.folder, false);
    const taken = await this.namesIn(file.folder);
    if (taken.has(file.name)) throw new LibraryError(409, `${file.name} was replaced. Rename the new file first.`);
    await this.storageCall(() => this.storage.move(file.b2Key, file.liveKey));
    file.b2Key = file.liveKey;
    file.trashed = false;
    file.activeFolder = file.folder;
    file.deletedAt = null;
    file.purgeAfter = null;
    file.updatedAt = this.now();
    await this.repo.saveFile(file);
  }

  private async restoreFolder(actor: LibraryActor, folder: LibraryFolderRecord) {
    if (!folder.trashed) return;
    if (!trashIsRestorable(folder.deletedAt, this.now())) throw new LibraryError(410, `${folder.name} is past the 30-day trash window.`);
    await this.assertAccess(actor.role, folder.path);
    if (folder.parent) await this.ensureFolderPath(actor, folder.parent, false);
    const siblings = await this.repo.listChildFolders(folder.parent);
    if (siblings.some((item) => item.id !== folder.id && item.name === folder.name && !item.trashed)) {
      throw new LibraryError(409, `${folder.name} was replaced. Rename the new folder first.`);
    }
    const folders = (await this.underFolders(folder.path)).filter((item) => item.trashed && item.deletedAt === folder.deletedAt);
    const files = (await this.underFiles(folder.path)).filter((file) => file.trashed && file.deletedAt === folder.deletedAt);
    const done: { file: LibraryFileRecord; from: string }[] = [];
    try {
      for (const file of files) {
        const from = file.b2Key;
        await this.storageCall(() => this.storage.move(from, file.liveKey));
        file.b2Key = file.liveKey;
        done.push({ file, from });
      }
      for (const file of files) {
        file.trashed = false;
        file.activeFolder = file.folder;
        file.deletedAt = null;
        file.purgeAfter = null;
        file.updatedAt = this.now();
        await this.repo.saveFile(file);
      }
      for (const item of folders) {
        if (!item.trashed) continue;
        item.trashed = false;
        item.activeParent = item.parent;
        item.deletedAt = null;
        item.purgeAfter = null;
        await this.repo.saveFolder(item);
      }
    } catch (err) {
      for (const item of done.reverse()) {
        try { await this.storage.move(item.file.b2Key, item.from); } catch (undo) {
          console.error("[Files] Could not undo a restore.", undo instanceof Error ? undo.name : "error");
        }
      }
      throw err;
    }
  }

  private async destroyFile(actor: LibraryActor, file: LibraryFileRecord) {
    if (!file.trashed) throw new LibraryError(400, "Delete the file first. Forever is only available in Trash.");
    await this.assertAccess(actor.role, file.path);
    await this.storageCall(() => this.storage.remove(file.b2Key));
    await this.repo.deleteFile(file.id);
  }

  private async destroyFolder(actor: LibraryActor, folder: LibraryFolderRecord) {
    if (!folder.trashed) throw new LibraryError(400, "Delete the folder first. Forever is only available in Trash.");
    await this.assertAccess(actor.role, folder.path);
    const files = (await this.underFiles(folder.path)).filter((file) => file.trashed);
    for (const file of files) {
      if (file.b2Key) await this.storageCall(() => this.storage.remove(file.b2Key));
      await this.repo.deleteFile(file.id);
    }
    const folders = (await this.underFolders(folder.path)).filter((item) => item.trashed);
    for (const item of folders) await this.repo.deleteFolder(item.id);
  }

  private async purgeExpired() {
    const now = this.now();
    const files = await this.repo.listTrashedFiles(FOLDER_BATCH);
    for (const file of files) {
      if (file.purgeAfter !== null && file.purgeAfter <= now) {
        try { await this.storage.remove(file.b2Key); } catch (err) {
          console.error("[Files] Expired trash object stayed in storage.", err instanceof Error ? err.name : "error");
          continue;
        }
        await this.repo.deleteFile(file.id);
      }
    }
    const folders = await this.repo.listTrashedFolders(FOLDER_BATCH);
    for (const folder of folders) {
      if (folder.purgeAfter !== null && folder.purgeAfter <= now) {
        const children = await this.repo.listFilesUnder(folder.path, 5);
        if (children.length === 0) await this.repo.deleteFolder(folder.id);
      }
    }
  }

  private async withPreviews(files: LibraryFileRecord[]): Promise<LibraryFileView[]> {
    const views = files.map((file) => fileView(file));
    const targets = files
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => !file.trashed && isPreviewable(file.contentType))
      .slice(0, PREVIEW_LIMIT);
    await Promise.all(targets.map(async ({ file, index }) => {
      try {
        views[index].previewUrl = await this.storage.presignGet(file.b2Key, file.name, true);
      } catch (err) {
        if (err instanceof StorageError && err.status === 503) return;
        console.error("[Files] Preview link was skipped.", err instanceof Error ? err.name : "error");
      }
    }));
    return views;
  }

  private async ensureDefaults(actor: LibraryActor) {
    for (const root of LIBRARY_ROOTS) {
      const existing = await this.repo.findFolderByPath(root.name);
      if (!existing) await this.writeFolder(actor, root.name, true);
      else if (existing.trashed) {
        existing.trashed = false;
        existing.activeParent = "";
        existing.deletedAt = null;
        existing.purgeAfter = null;
        existing.system = true;
        await this.repo.saveFolder(existing);
      }
      if (!(await this.repo.getAccess(root.name))) await this.repo.saveAccess(root.name, root.access, this.now());
    }
  }

  private async ensureFolderPath(actor: LibraryActor, path: string, system: boolean) {
    const parts = path.split("/");
    let parent = "";
    for (let index = 0; index < parts.length; index += 1) {
      const current = parent ? `${parent}/${parts[index]}` : parts[index];
      const existing = await this.repo.findFolderByPath(current);
      if (existing?.trashed) throw new LibraryError(409, `${current} is in the trash. Restore it first.`);
      if (!existing) await this.writeFolder(actor, current, system && index === 0);
      parent = current;
    }
  }

  private async writeFolder(actor: LibraryActor, path: string, system: boolean) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const now = this.now();
    const folder: LibraryFolderRecord = {
      id: newLibraryId("f"),
      path,
      name: path.split("/").pop() || path,
      parent,
      activeParent: parent,
      createdAt: now,
      createdBy: actor.uid,
      trashed: false,
      deletedAt: null,
      purgeAfter: null,
      system,
      ancestorPaths: ancestorPaths(path),
      searchTokens: searchTokens(path.split("/").pop() || path, path),
    };
    await this.repo.saveFolder(folder);
    if (!parent && !(await this.repo.getAccess(path))) {
      await this.repo.saveAccess(path, defaultAccessFor(path), now);
    }
  }

  private async namesIn(folder: string): Promise<Set<string>> {
    const [files, folders] = await Promise.all([
      this.repo.listFilesInFolder(folder, LIST_LIMIT),
      this.repo.listChildFolders(folder),
    ]);
    return new Set([
      ...files.filter((file) => !file.trashed).map((file) => file.name),
      ...folders.filter((item) => !item.trashed).map((item) => item.name),
    ]);
  }

  private async underFiles(prefix: string) {
    const files = await this.repo.listFilesUnder(prefix, FOLDER_BATCH + 1);
    if (files.length > FOLDER_BATCH) {
      throw new LibraryError(400, "That folder has too many files to change at once. Move or delete them in smaller groups.");
    }
    return files;
  }

  private async underFolders(prefix: string) {
    const folders = await this.repo.listFoldersUnder(prefix, FOLDER_BATCH + 1);
    if (folders.length > FOLDER_BATCH) {
      throw new LibraryError(400, "That folder has too many folders inside it. Move them in smaller groups.");
    }
    return folders;
  }

  private async pendingFor(actor: LibraryActor, keyInput: unknown, uploadId: unknown) {
    const key = this.objectKey(keyInput);
    const pending = await this.repo.getPending(pendingIdForKey(key));
    if (!pending || pending.mode !== "multipart" || !pending.uploadId) {
      throw new LibraryError(404, "That multipart upload is not open.");
    }
    if (typeof uploadId !== "string" || uploadId !== pending.uploadId) {
      throw new LibraryError(400, "That upload id does not match.");
    }
    await this.assertAccess(actor.role, pending.folder);
    return pending;
  }

  private async requireFile(id: string) {
    if (!/^m_[a-f0-9]{32}$/.test(id)) throw new LibraryError(400, "That file was not found.");
    const file = await this.repo.getFile(id);
    if (!file) throw new LibraryError(404, "That file was not found.");
    return file;
  }

  private async requireFolder(id: string) {
    if (!/^f_[a-f0-9]{32}$/.test(id)) throw new LibraryError(400, "That folder was not found.");
    const folder = await this.repo.getFolder(id);
    if (!folder) throw new LibraryError(404, "That folder was not found.");
    return folder;
  }

  private path(input: unknown, allowRoot: boolean): string {
    const path = normalizeLibraryPath(input);
    if (path === null) throw new LibraryError(400, "That path is not allowed.");
    if (!allowRoot && !path) throw new LibraryError(400, "Choose a folder.");
    return path;
  }

  private objectKey(input: unknown): string {
    const key = normalizeLibraryPath(input);
    if (!key || isTrashKey(key)) throw new LibraryError(400, "That file path is not allowed.");
    return key;
  }

  private async assertAccess(role: string, path: string) {
    const root = topLevelFolder(path);
    if (!root) return;
    const access = await this.accessFor(root);
    if (!folderAccessAllows(role, access)) {
      throw new LibraryError(403, "That folder is limited to owners and coordinators.");
    }
  }

  private async canSeeAsync(role: string, path: string): Promise<boolean> {
    const root = topLevelFolder(path);
    if (!root) return true;
    return folderAccessAllows(role, await this.accessFor(root));
  }

  private async accessFor(root: string): Promise<FolderAccessLevel> {
    const cached = this.accessCache.get(root);
    if (cached) return cached;
    const access = (await this.repo.getAccess(root)) ?? defaultAccessFor(root);
    this.accessCache.set(root, access);
    return access;
  }

  private isCoordinator(role: string) {
    return role === "admin" || role === "coordinator";
  }

  private assertCoordinator(role: string) {
    if (!this.isCoordinator(role)) throw new LibraryError(403, "Owners and coordinators can change this.");
  }

  private async storageCall<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (err instanceof StorageError || err instanceof LibraryError) throw err;
      console.error("[Files] Storage request failed.", err instanceof Error ? err.name : "error");
      throw new LibraryError(502, "Backblaze could not finish that storage change.");
    }
  }
}

function fileView(file: LibraryFileRecord): LibraryFileView {
  return {
    id: file.id,
    path: file.path,
    name: file.name,
    folder: file.folder,
    size: file.size,
    contentType: file.contentType,
    tags: file.tags,
    notes: file.notes,
    orderId: file.orderId,
    clientId: file.clientId,
    clientName: file.clientName,
    orderNumber: file.orderNumber,
    listingAddress: file.listingAddress,
    uploadedBy: file.uploadedBy,
    uploadedByName: file.uploadedByName,
    createdAt: file.createdAt,
    deletedAt: file.deletedAt,
    trashed: file.trashed,
    source: file.source,
  };
}

function folderView(folder: LibraryFolderRecord): LibraryFolderView {
  return {
    id: folder.id,
    path: folder.path,
    name: folder.name,
    parent: folder.parent,
    createdAt: folder.createdAt,
    createdBy: folder.createdBy,
    trashed: folder.trashed,
    deletedAt: folder.deletedAt,
    system: folder.system,
  };
}

function tokensFor(file: LibraryFileRecord): string[] {
  return searchTokens(
    file.name,
    file.path,
    file.folder,
    file.tags,
    file.notes,
    file.clientName,
    file.orderNumber,
    file.orderId,
    file.listingAddress,
    file.importSource,
  );
}

function shortText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function cleanFolderName(input: string): string {
  const placed = uploadDestination("Inbox", input);
  return placed?.name || "";
}

function idList(input: unknown, kind: "m" | "f", allowEmpty = false): string[] {
  if (input === undefined && allowEmpty) return [];
  if (!Array.isArray(input)) throw new LibraryError(400, "Choose the items first.");
  if (input.length > MAX_BULK) throw new LibraryError(400, `Choose up to ${MAX_BULK} items at a time.`);
  const ids = input.filter((item): item is string => typeof item === "string");
  if (ids.length !== input.length || ids.some((id) => !new RegExp(`^${kind}_[a-f0-9]{32}$`).test(id))) {
    throw new LibraryError(400, "One of those items was not found.");
  }
  return [...new Set(ids)];
}

function parseParts(input: unknown, expected: number): { partNumber: number; eTag: string }[] {
  if (!Array.isArray(input) || input.length !== expected) {
    throw new LibraryError(400, "Every upload part has to be included.");
  }
  const parts = input.map((part) => {
    if (!part || typeof part !== "object") return null;
    const row = part as { partNumber?: unknown; eTag?: unknown };
    const partNumber = typeof row.partNumber === "number" ? row.partNumber : Number(row.partNumber);
    const eTag = typeof row.eTag === "string" ? row.eTag.trim() : "";
    if (!Number.isInteger(partNumber) || partNumber < 1 || !eTag || eTag.length > 200 || /[\r\n]/.test(eTag)) return null;
    return { partNumber, eTag };
  });
  if (parts.some((part) => !part)) throw new LibraryError(400, "An upload part was missing its ETag.");
  const typed = parts as { partNumber: number; eTag: string }[];
  const numbers = new Set(typed.map((part) => part.partNumber));
  for (let index = 1; index <= expected; index += 1) {
    if (!numbers.has(index)) throw new LibraryError(400, "An upload part is missing.");
  }
  return typed;
}

let libraryOverride: MediaLibrary | null = null;

export function setLibraryForTests(library: MediaLibrary | null) {
  libraryOverride = library;
}

export function libraryForRequest(): MediaLibrary {
  return libraryOverride ?? new MediaLibrary(new FirestoreLibraryRepo(), storageFromEnv());
}

export function suggestedKind(name: string, contentType: string): OrderMediaKind {
  return mediaKindFor(name, contentType);
}

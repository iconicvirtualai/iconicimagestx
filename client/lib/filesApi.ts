import {
  MULTIPART_PART_BYTES,
  normalizeContentType,
  shouldZipDownloads,
  uploadDestination,
  useMultipart,
  type LibraryFileView,
  type LibraryFolderView,
  type OrderTarget,
} from "@shared/mediaLibrary";

export interface LibraryList {
  folder: string;
  trash: boolean;
  breadcrumbs: { name: string; path: string }[];
  folders: LibraryFolderView[];
  files: LibraryFileView[];
  truncated: boolean;
  canManageAccess: boolean;
  access: "all_staff" | "owners_coordinators" | null;
}

export interface UploadInput {
  file: File;
  relativePath: string;
}

export async function filesRequest<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : "The file library could not complete that request.";
    throw new Error(message);
  }
  return data as T;
}

export async function filesSend<T>(token: string, path: string, method: "PUT" | "PATCH" | "POST", body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The file library could not complete that request.");
  return data as T;
}

export function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      if (value) xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag"));
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed before it reached storage."));
    xhr.onabort = () => reject(new Error("Upload canceled."));
    xhr.send(body);
  });
}

export async function uploadOne(
  token: string,
  item: UploadInput,
  folder: string,
  meta: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const placed = uploadDestination(folder, item.relativePath);
  if (!placed) throw new Error(`${item.file.name} has a path that cannot be stored.`);
  const contentType = normalizeContentType(item.file.type, placed.name);
  const payload = {
    folder: placed.folder,
    name: placed.name,
    relativePath: placed.name,
    contentType,
    size: item.file.size,
    ...meta,
  };
  if (useMultipart(item.file.size, contentType)) {
    const created = await filesRequest<{ key: string; uploadId: string; partSize: number; partCount: number }>(
      token,
      "/api/files/multipart/create",
      payload,
    );
    const partSize = created.partSize || MULTIPART_PART_BYTES;
    const parts: { partNumber: number; eTag: string }[] = [];
    for (let partNumber = 1; partNumber <= created.partCount; partNumber += 1) {
      const start = (partNumber - 1) * partSize;
      const blob = item.file.slice(start, Math.min(start + partSize, item.file.size));
      const signed = await filesRequest<{ url: string; headers: Record<string, string> }>(token, "/api/files/multipart/sign-part", {
        key: created.key,
        uploadId: created.uploadId,
        partNumber,
      });
      const etag = await putWithProgress(signed.url, blob, signed.headers || {}, (fraction) => {
        onProgress(((partNumber - 1) + fraction) / created.partCount);
      });
      if (!etag) throw new Error("Backblaze did not return an ETag. Bucket CORS has to expose ETag for video uploads.");
      parts.push({ partNumber, eTag: etag });
    }
    await filesRequest(token, "/api/files/multipart/complete", { key: created.key, uploadId: created.uploadId, parts });
    await filesRequest(token, "/api/files/commit", { key: created.key });
    onProgress(1);
    return;
  }
  const signed = await filesRequest<{ key: string; url: string; headers: Record<string, string> }>(token, "/api/files/sign-upload", payload);
  await putWithProgress(signed.url, item.file, signed.headers || {}, onProgress);
  await filesRequest(token, "/api/files/commit", { key: signed.key });
  onProgress(1);
}

export async function downloadLibraryFiles(token: string, ids: string[]): Promise<"zip" | "each"> {
  const signed = await filesRequest<{ files: { name: string; url: string; size: number }[]; zip: boolean }>(
    token,
    "/api/files/sign-download",
    { ids },
  );
  if (!signed.zip || !shouldZipDownloads(signed.files.length, signed.files.reduce((sum, file) => sum + file.size, 0))) {
    signed.files.forEach((file) => saveUrl(file.url, file.name));
    return "each";
  }
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const file of signed.files) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Could not download ${file.name}.`);
    const name = uniqueZipName(file.name, used);
    entries[name] = new Uint8Array(await response.arrayBuffer());
  }
  const zipped = zipSync(entries, { level: 0 });
  const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
  saveUrl(url, "Iconic files.zip");
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "zip";
}

export async function filesFromDataTransfer(data: DataTransfer): Promise<UploadInput[]> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.() || null)
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length === 0) return filesFromList(data.files);
  const out: UploadInput[] = [];
  for (const entry of entries) await walkEntry(entry, "", out);
  return out;
}

export function filesFromList(list: FileList | File[]): UploadInput[] {
  return [...list].map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

function walkEntry(entry: FileSystemEntry, prefix: string, out: UploadInput[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      (entry as FileSystemFileEntry).file((file) => {
        out.push({ file, relativePath: path });
        resolve();
      }, () => reject(new Error(`Could not read ${entry.name}.`)));
    });
  }
  if (!entry.isDirectory) return Promise.resolve();
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return readEntries(reader).then(async (children) => {
    for (const child of children) await walkEntry(child, path, out);
  });
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const read = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          read();
        }
      }, () => reject(new Error("Could not read that folder.")));
    };
    read();
  });
}

function saveUrl(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function uniqueZipName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  let next = `${stem} (${index})${ext}`;
  while (used.has(next)) {
    index += 1;
    next = `${stem} (${index})${ext}`;
  }
  used.add(next);
  return next;
}

export type { LibraryFileView, LibraryFolderView, OrderTarget };

/**
 * Content library client.
 * Public pages can call listContentAssets() with no token.
 * Admin upload passes getToken from AuthContext (real Firebase or local temp admin).
 */

import {
  CONTENT_DIRECT_UPLOAD_LIMIT,
  parseContentWrite,
  type ContentAssetRecord,
  type ContentListQuery,
  type ContentPurpose,
  type ContentVisibility,
} from "@shared/contentBucket";

export interface ContentUploadInput {
  file: File;
  purpose: ContentPurpose;
  tags?: string;
  folder?: string;
  visibility: ContentVisibility;
  alt?: string;
  getToken: () => Promise<string>;
  onProgress?: (pct: number) => void;
}

async function authHeaders(getToken: () => Promise<string>) {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function queryString(query: ContentListQuery) {
  const params = new URLSearchParams();
  if (query.purpose) params.set("purpose", query.purpose);
  if (query.tag) params.set("tag", query.tag);
  if (query.folder) params.set("folder", query.folder);
  if (query.search) params.set("q", query.search);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function listContentAssets(query: ContentListQuery = {}, getToken?: () => Promise<string>) {
  const headers: Record<string, string> = {};
  if (getToken) headers.Authorization = `Bearer ${await getToken()}`;
  const res = await fetch(`/api/content-assets${queryString(query)}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load content.");
  return (data.assets || []) as ContentAssetRecord[];
}

export async function updateContentAsset(
  id: string,
  patch: { purpose?: ContentPurpose; tags?: string; folder?: string; visibility?: ContentVisibility; alt?: string },
  getToken: () => Promise<string>,
) {
  const res = await fetch(`/api/content-assets/${id}`, {
    method: "PATCH",
    headers: await authHeaders(getToken),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not update that file.");
  return data.asset as ContentAssetRecord;
}

export async function deleteContentAsset(id: string, getToken: () => Promise<string>) {
  const res = await fetch(`/api/content-assets/${id}`, {
    method: "DELETE",
    headers: await authHeaders(getToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not delete that file.");
}

export async function uploadContentFile(input: ContentUploadInput) {
  const parsed = parseContentWrite({
    fileName: input.file.name,
    contentType: input.file.type,
    sizeBytes: input.file.size,
    purpose: input.purpose,
    tags: input.tags,
    folder: input.folder,
    visibility: input.visibility,
    alt: input.alt,
  }, { requireSize: true });
  if (parsed.ok === false) throw new Error(parsed.error);

  const headers = await authHeaders(input.getToken);
  const body = {
    fileName: input.file.name,
    contentType: parsed.value.contentType,
    sizeBytes: input.file.size,
    purpose: parsed.value.purpose,
    tags: parsed.value.tags,
    folder: parsed.value.folder,
    visibility: parsed.value.visibility,
    alt: parsed.value.alt,
  };

  const saveDirect = async () => {
    const dataBase64 = await fileToBase64(input.file);
    const res = await fetch("/api/content-assets", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, dataBase64 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    input.onProgress?.(100);
    return data.asset as ContentAssetRecord;
  };

  const saveSigned = async () => {
    const ticketRes = await fetch("/api/content-assets/upload-url", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const ticket = await ticketRes.json().catch(() => ({}));
    if (!ticketRes.ok) throw new Error(ticket.error || "Could not start the upload.");
    await putFile(ticket.uploadUrl, input.file, ticket.contentType || body.contentType, input.onProgress);
    const saveRes = await fetch("/api/content-assets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        assetId: ticket.assetId,
        storagePath: ticket.storagePath,
        contentType: ticket.contentType || body.contentType,
      }),
    });
    const saved = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) throw new Error(saved.error || "The file uploaded, but saving it to the library failed.");
    return saved.asset as ContentAssetRecord;
  };

  if (input.file.size > CONTENT_DIRECT_UPLOAD_LIMIT) return saveSigned();
  try {
    return await saveSigned();
  } catch (err) {
    console.warn("[Content] Signed upload failed, retrying through the API.", err);
    return saveDirect();
  }
}

function putFile(url: string, file: File, contentType: string, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The browser could not reach storage."));
    xhr.send(file);
  });
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

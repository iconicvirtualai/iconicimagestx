import { contentTypeForUpload } from "@shared/listingAccess";
import { auth } from "./firebase";

const DIRECT_UPLOAD_LIMIT = 3_000_000;

async function authorizedJsonHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again before uploading.");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchAssignedListings() {
  const headers = await authorizedJsonHeaders();
  const res = await fetch("/api/listings/assigned", { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load assigned jobs.");
  return (data.listings || []) as Array<Record<string, unknown>>;
}

export async function fetchListing(listingId: string) {
  const headers = await authorizedJsonHeaders();
  const res = await fetch(`/api/listings/${listingId}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not open this project.");
  return data as Record<string, unknown>;
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

export async function uploadListingFile(options: {
  listingId: string;
  file: File;
  folder?: "photos" | "raw";
  onProgress?: (pct: number) => void;
}) {
  const { listingId, file, folder = "photos", onProgress } = options;
  const contentType = contentTypeForUpload(file.name, file.type);
  const headers = await authorizedJsonHeaders();

  const saveDirect = async () => {
    const dataBase64 = await fileToBase64(file);
    const res = await fetch(`/api/listings/${listingId}/photos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fileName: file.name, contentType, folder, dataBase64 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    onProgress?.(100);
    return data;
  };

  const saveSigned = async () => {
    const ticketRes = await fetch(`/api/listings/${listingId}/photos/upload-url`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fileName: file.name, contentType, folder }),
    });
    const ticket = await ticketRes.json().catch(() => ({}));
    if (!ticketRes.ok) throw new Error(ticket.error || "Could not start the upload.");
    await putFile(ticket.uploadUrl, file, ticket.contentType || contentType, onProgress);
    const saveRes = await fetch(`/api/listings/${listingId}/photos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fileName: file.name,
        contentType: ticket.contentType || contentType,
        folder,
        storagePath: ticket.storagePath,
      }),
    });
    const saved = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) throw new Error(saved.error || "The file uploaded, but saving it to the job failed.");
    return saved;
  };

  if (file.size > DIRECT_UPLOAD_LIMIT) return saveSigned();

  try {
    return await saveSigned();
  } catch (err) {
    console.warn("[Upload] Signed upload failed, retrying through the API.", err);
    return saveDirect();
  }
}

import { portalUploadDecision, type PortalUploadKind } from "@shared/portalClientUpload";

export async function uploadPortalClientFile(options: {
  listingId: string;
  kind: PortalUploadKind;
  file: File;
  token: string;
  onProgress?: (pct: number) => void;
}) {
  const decision = portalUploadDecision(options.kind, options.file.name, options.file.type, options.file.size);
  if (decision.ok === false) throw new Error(decision.error);
  const headers = {
    Authorization: `Bearer ${options.token}`,
    "Content-Type": "application/json",
  };
  const ticketRes = await fetch(`/api/clients/me/listings/${encodeURIComponent(options.listingId)}/uploads/url`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: options.kind,
      fileName: options.file.name,
      contentType: decision.contentType,
      byteSize: options.file.size,
    }),
  });
  const ticket = await ticketRes.json().catch(() => ({}));
  if (!ticketRes.ok) throw new Error(ticket.error || "Could not start the upload.");
  await putFile(ticket.uploadUrl, options.file, ticket.contentType || decision.contentType, options.onProgress);
  const saveRes = await fetch(`/api/clients/me/listings/${encodeURIComponent(options.listingId)}/uploads`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: options.kind,
      fileName: options.file.name,
      contentType: ticket.contentType || decision.contentType,
      storagePath: ticket.storagePath,
    }),
  });
  const saved = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok) throw new Error(saved.error || "The file uploaded, but saving it to the listing failed.");
  return saved;
}

function putFile(url: string, file: File, contentType: string, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The browser could not reach storage."));
    xhr.send(file);
  });
}

import { useState } from "react";
import { toast } from "sonner";
import {
  photoEditStatusLabel,
  readPhotoEditRequests,
  type PhotoEditRequest,
} from "@shared/photoEditRequest";

const REPLACEMENT_LIMIT = 4_000_000;
const REPLACEMENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function PhotoEditRequestStaffView({
  requests,
  busyId,
  onSent,
  onReceived,
  onReplacement,
}: {
  requests: PhotoEditRequest[];
  busyId: string | null;
  onSent: (requestId: string) => void;
  onReceived: (requestId: string) => void;
  onReplacement: (requestId: string, file: File) => void;
}) {
  return (
    <section className="mt-8 border-t border-gray-100 pt-6" data-testid="staff-photo-edit-requests">
      <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Photo edit requests</h3>
      <p className="text-xs text-gray-500 mt-1 mb-4">Mark a request sent out, then received back. Attach the returned file here. This does not message the client.</p>
      {requests.length === 0 ? (
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No photo edit requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const busy = busyId === request.id;
            return (
              <article key={request.id} data-testid={`staff-photo-edit-${request.id}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black">
                    {request.photoUrl ? (
                      <a href={request.photoUrl} target="_blank" rel="noopener noreferrer">{request.photoName}</a>
                    ) : request.photoName}
                  </p>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]" data-testid={`staff-photo-edit-state-${request.id}`}>
                    {photoEditStatusLabel(request.status)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-2">{request.note}</p>
                <ol className="mt-3 space-y-1">
                  {request.timeline.map((entry) => (
                    <li key={`${entry.status}-${entry.at}`} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {photoEditStatusLabel(entry.status)} · {when(entry.at)}
                    </li>
                  ))}
                </ol>
                {request.replacement && (
                  <a href={request.replacement.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-xs font-bold text-[#0d9488]">
                    {request.replacement.name}
                  </a>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid={`staff-photo-edit-sent-${request.id}`}
                    data-enabled={request.status === "requested" ? "true" : "false"}
                    disabled={busy || request.status !== "requested"}
                    onClick={() => onSent(request.id)}
                    className="px-3 py-2 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    Mark sent out
                  </button>
                  <button
                    type="button"
                    data-testid={`staff-photo-edit-received-${request.id}`}
                    data-enabled={request.status === "sent_out" ? "true" : "false"}
                    disabled={busy || request.status !== "sent_out"}
                    onClick={() => onReceived(request.id)}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    Mark received back
                  </button>
                  <label className="px-3 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest cursor-pointer">
                    Attach replacement
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      data-testid={`staff-photo-edit-file-${request.id}`}
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) onReplacement(request.id, file);
                      }}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PhotoEditRequestStaff({
  listingId,
  requests,
  getToken,
}: {
  listingId: string;
  requests: unknown;
  getToken: () => Promise<string | undefined>;
}) {
  const parsed = readPhotoEditRequests(requests);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function post(requestId: string, action: "sent" | "received" | "replacement", body: unknown) {
    const token = await getToken();
    if (!token) {
      toast.error("Sign in again before updating this request.");
      return;
    }
    setBusyId(requestId);
    try {
      const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/photo-edit-requests/${encodeURIComponent(requestId)}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update the edit request.");
      toast.success(action === "sent" ? "Marked sent out." : action === "received" ? "Marked received back." : "Replacement attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the edit request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PhotoEditRequestStaffView
      requests={parsed}
      busyId={busyId}
      onSent={(requestId) => { void post(requestId, "sent", {}); }}
      onReceived={(requestId) => { void post(requestId, "received", {}); }}
      onReplacement={(requestId, file) => {
        if (!REPLACEMENT_TYPES.includes(file.type)) {
          toast.error("Attach a JPG, PNG, or WebP file.");
          return;
        }
        if (file.size > REPLACEMENT_LIMIT) {
          toast.error("That replacement is over 4 MB.");
          return;
        }
        void (async () => {
          const dataBase64 = await fileToBase64(file);
          await post(requestId, "replacement", { fileName: file.name, contentType: file.type, dataBase64 });
        })();
      }}
    />
  );
}

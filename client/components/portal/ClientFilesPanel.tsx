import { useEffect, useState } from "react";

interface SharedFile {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  direction: "admin" | "client";
  createdAt: string;
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv";

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function ClientFilesPanel({
  listUrl,
  uploadUrl,
  rawUrl,
  getToken,
}: {
  listUrl: string;
  uploadUrl: string;
  rawUrl: (fileId: string) => string;
  getToken: () => Promise<string>;
}) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const token = await getToken();
    const response = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not load files.");
    setFiles(Array.isArray(body.files) ? body.files : []);
  }

  useEffect(() => {
    let cancelled = false;
    void load().catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
    // listUrl identifies the folder. getToken changes identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await readFile(file);
      const token = await getToken();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", dataUrl }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not upload that file.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="shared-files" className="space-y-3">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white">
        {busy ? "Uploading" : "Upload file"}
        <input
          type="file"
          accept={ACCEPT}
          aria-label="Upload a shared file"
          className="sr-only"
          disabled={busy}
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
      </label>
      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
      {files.length === 0 ? <p className="text-sm text-gray-500">No shared files yet.</p> : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3" data-testid="shared-file">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{file.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {file.direction === "admin" ? "From Iconic" : "From client"} · {Math.max(1, Math.round(file.byteSize / 1024))} KB
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-black uppercase tracking-widest text-[#0d9488]"
                onClick={() => {
                  void (async () => {
                    const token = await getToken();
                    const response = await fetch(rawUrl(file.id), { headers: { Authorization: `Bearer ${token}` } });
                    if (!response.ok) {
                      setError("Could not open that file.");
                      return;
                    }
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank", "noopener");
                  })();
                }}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

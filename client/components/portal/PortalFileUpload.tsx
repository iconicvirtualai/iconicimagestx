import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { PORTAL_UPLOAD_ACCEPT, type PortalUploadKind } from "@shared/portalClientUpload";

export function PortalFileUpload({
  kind,
  title,
  hint,
  disabled,
  onFile,
}: {
  kind: PortalUploadKind;
  title: string;
  hint: string;
  disabled?: boolean;
  onFile: (file: File, onProgress: (pct: number) => void) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function take(list: FileList | null) {
    const file = list?.[0];
    if (!file || disabled) return;
    setError("");
    setProgress(0);
    try {
      await onFile(file, setProgress);
      setProgress(null);
    } catch (err: unknown) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mb-4" data-testid={`portal-upload-${kind}`}>
      <input
        ref={inputRef}
        type="file"
        accept={PORTAL_UPLOAD_ACCEPT[kind]}
        className="sr-only"
        data-testid={`portal-upload-input-${kind}`}
        disabled={disabled || progress != null}
        onChange={(event) => void take(event.target.files)}
      />
      <button
        type="button"
        disabled={disabled || progress != null}
        onClick={() => inputRef.current?.click()}
        className="flex w-full min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gray-200 bg-white px-4 py-4 text-center disabled:opacity-60"
      >
        <Upload className="h-5 w-5 text-[#0d9488]" />
        <span className="text-xs font-black uppercase tracking-widest text-black">{progress != null ? `Uploading ${progress}%` : title}</span>
        <span className="max-w-md text-xs text-gray-500">{hint}</span>
      </button>
      {progress != null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div className="h-full bg-[#0d9488]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="mt-2 text-sm font-bold text-red-700">{error}</p>}
    </div>
  );
}

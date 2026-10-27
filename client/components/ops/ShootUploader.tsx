import * as React from "react";
import { CheckCircle2, Image as ImageIcon, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadListingFile } from "@/lib/listingUpload";
import { drainOrderEditQueue, postIconicPolish } from "@/lib/studioApi";
import { ICONIC_POLISH_TREATMENTS } from "@shared/orderEditPlan";
import {
  PHOTOGRAPHER_UPLOAD_ACCEPT,
  photographerAcceptsFile,
  photographerUploadFolder,
} from "@shared/photographerPortal";
import { toast } from "sonner";

/**
 * Drop zone for one shoot. The job list stays on the page that renders this.
 * Same save path as the old upload tab: listing photo, Iconic Polish, then the order queue.
 */
export function ShootUploader({
  listingId,
  address,
  iconicPolish,
  onIconicPolish,
  getToken,
  onUploaded,
  disabled = false,
}: {
  listingId: string;
  address: string;
  iconicPolish: boolean;
  onIconicPolish: (value: boolean) => void;
  getToken?: () => Promise<string | undefined> | undefined;
  onUploaded?: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploads, setUploads] = React.useState<Record<string, number>>({});
  const [uploading, setUploading] = React.useState(false);
  const [queueNote, setQueueNote] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (list: File[]) => {
    if (disabled) return;
    const accepted = list.filter((file) => photographerAcceptsFile(file.name, file.type));
    if (accepted.length !== list.length) toast.error("Only photos and RAW frames can be uploaded.");
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const handleUpload = async () => {
    if (disabled || !listingId || files.length === 0) return;
    setUploading(true);
    const authToken = async () => {
      const value = await getToken?.();
      if (!value) throw new Error("Sign in again before uploading.");
      return value;
    };
    try {
      if (getToken) {
        await postIconicPolish(authToken, { listingId, iconicPolish });
      }
      for (const file of files) {
        await uploadListingFile({
          listingId,
          file,
          folder: photographerUploadFolder(file.name, file.type),
          onProgress: (pct) => setUploads((prev) => ({ ...prev, [file.name]: pct })),
        });
      }
      toast.success(`${files.length} file${files.length === 1 ? "" : "s"} uploaded.`);
      setFiles([]);
      setUploads({});
      if (fileRef.current) fileRef.current.value = "";
      setQueueNote("Studio is editing the order, one photo at a time.");
      await onUploaded?.();
      if (getToken) {
        try {
          await drainOrderEditQueue(authToken, listingId, (step) => {
            if (step.ran?.status === "failed") setQueueNote(step.ran.note);
            else if (step.shouldFollowUp) setQueueNote(`Auto-queue running. ${step.remaining} still queued.`);
            else if (step.waiting) setQueueNote("Waiting on an exterior filename before twilight can run.");
            else setQueueNote(step.ran ? "Order edits are ready for review in Studio." : "No photo is waiting to edit.");
          });
          await onUploaded?.();
        } catch (err: unknown) {
          setQueueNote(err instanceof Error ? err.message : "Auto-queue did not start.");
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Some uploads failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div data-testid="shoot-uploader">
      <div
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files));
        }}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => {
          if (!disabled) fileRef.current?.click();
        }}
        className={`mb-4 rounded-[2rem] border-2 border-dashed border-gray-200 p-8 text-center transition-all ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#0d9488] hover:bg-[#0d9488]/5"}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept={PHOTOGRAPHER_UPLOAD_ACCEPT}
          multiple
          className="hidden"
          aria-label="Upload shoot files"
          disabled={disabled}
          onChange={(event) => {
            if (!event.target.files) return;
            addFiles(Array.from(event.target.files));
          }}
        />
        <Upload className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="mb-1 text-sm font-black uppercase tracking-widest text-gray-500">
          {address ? `Drop the shoot for ${address}` : "Drop photos here or click to browse"}
        </p>
        <p className="text-xs text-gray-400">JPEG, PNG, WebP, and RAW. RAW stays in the raw folder until a preview exists.</p>
      </div>

      {files.length > 0 && (
        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </p>
            <button
              type="button"
              onClick={() => setFiles([])}
              className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-600"
            >
              Clear all
            </button>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                <ImageIcon className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="flex-1 truncate text-xs font-bold text-gray-700">{file.name}</p>
                <span className="text-[10px] font-bold text-gray-400">{photographerUploadFolder(file.name, file.type)}</span>
                {uploads[file.name] !== undefined ? (
                  uploads[file.name] === 100 ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-500" />
                  ) : (
                    <span className="text-[10px] font-black text-[#0d9488]">{uploads[file.name]}%</span>
                  )
                ) : (
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, item) => item !== index))}>
                    <XCircle className="h-4 w-4 text-gray-300 hover:text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="mb-4 flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4">
        <input
          type="checkbox"
          className="mt-1"
          checked={iconicPolish}
          disabled={disabled}
          onChange={(event) => onIconicPolish(event.target.checked)}
        />
        <span>
          <span className="block text-xs font-black uppercase tracking-widest">Iconic Polish</span>
          <span className="mt-1 block text-xs text-gray-500">
            Turn this on before you submit. It adds the full Iconic Polish on top of the order: {ICONIC_POLISH_TREATMENTS.join("; ")}. It does not add people. Standalone grass replacement is a separate edit.
          </span>
        </span>
      </label>

      <Button
        type="button"
        onClick={handleUpload}
        disabled={disabled || uploading || files.length === 0 || !listingId}
        className="w-full rounded-xl bg-[#0d9488] py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-40"
      >
        {uploading ? "Uploading..." : `Upload the shoot${files.length ? ` (${files.length})` : ""}`}
      </Button>
      {queueNote && <p className="mt-3 text-xs font-bold text-gray-500">{queueNote}</p>}
    </div>
  );
}

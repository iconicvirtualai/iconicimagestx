import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { PhotographerJobBanner } from "@/components/photographer/PhotographerPortal";
import { fetchAssignedListings, uploadListingFile } from "@/lib/listingUpload";
import { drainOrderEditQueue, fetchStudioWorkspace, postIconicPolish } from "@/lib/studioApi";
import { addressText } from "@shared/addressText";
import {
  PHOTOGRAPHER_UPLOAD_ACCEPT,
  buildPhotographerPortal,
  chicagoDateKey,
  photographerAcceptsFile,
  photographerUploadFolder,
  type PhotographerStudioJob,
} from "@shared/photographerPortal";
import { Upload, CheckCircle2, XCircle, Image as ImageIcon, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PresentationSharePanel } from "@/components/PresentationSharePanel";
import { ICONIC_POLISH_TREATMENTS } from "@shared/orderEditPlan";

export default function AdminUpload() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = React.useState<Array<Record<string, unknown>>>([]);
  const [studioJobs, setStudioJobs] = React.useState<PhotographerStudioJob[]>([]);
  const [selectedJob, setSelectedJob] = React.useState(params.get("job") || "");
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploads, setUploads] = React.useState<Record<string, number>>({});
  const [uploading, setUploading] = React.useState(false);
  const [iconicPolish, setIconicPolish] = React.useState(params.get("polish") === "1");
  const [queueNote, setQueueNote] = React.useState("");
  const [jobsError, setJobsError] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const loadJobs = React.useCallback(async () => {
    if (!user) return;
    const [assigned, studio] = await Promise.allSettled([
      fetchAssignedListings(),
      fetchStudioWorkspace(undefined, () => user.getIdToken()),
    ]);
    if (assigned.status === "fulfilled") {
      setListings(assigned.value);
      setJobsError("");
    } else {
      const message = assigned.reason instanceof Error ? assigned.reason.message : "Failed to load your assigned jobs.";
      setJobsError(message);
      toast.error(message);
    }
    if (studio.status === "fulfilled") setStudioJobs((studio.value.jobs || []) as PhotographerStudioJob[]);
  }, [user]);

  React.useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const jobs = React.useMemo(
    () => buildPhotographerPortal({ listings, studioJobs, today: chicagoDateKey(new Date()) }),
    [listings, studioJobs],
  );

  React.useEffect(() => {
    if (!jobs.length) return;
    setSelectedJob((current) => {
      if (current && jobs.some((job) => job.id === current)) return current;
      const requested = params.get("job") || "";
      if (requested && jobs.some((job) => job.id === requested)) return requested;
      const needsUpload = jobs.find((job) => job.action.kind === "upload");
      return needsUpload?.id || jobs[0].id;
    });
  }, [jobs, params]);

  const chooseJob = (id: string) => {
    setSelectedJob(id);
    const next = new URLSearchParams(params);
    next.set("job", id);
    if (iconicPolish) next.set("polish", "1");
    else next.delete("polish");
    setParams(next, { replace: true });
  };

  const addFiles = (list: File[]) => {
    const accepted = list.filter((file) => photographerAcceptsFile(file.name, file.type));
    if (accepted.length !== list.length) toast.error("Only photos and RAW frames can be uploaded.");
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    addFiles(Array.from(event.target.files));
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleUpload = async () => {
    if (!selectedJob || files.length === 0) return;
    setUploading(true);
    try {
      if (user) {
        await postIconicPolish(() => user.getIdToken(), { listingId: selectedJob, iconicPolish });
      }
      for (const file of files) {
        await uploadListingFile({
          listingId: selectedJob,
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
      await loadJobs();
      if (user) {
        try {
          await drainOrderEditQueue(() => user.getIdToken(), selectedJob, (step) => {
            if (step.ran?.status === "failed") setQueueNote(step.ran.note);
            else if (step.shouldFollowUp) setQueueNote(`Auto-queue running. ${step.remaining} still queued.`);
            else if (step.waiting) setQueueNote("Waiting on an exterior filename before twilight can run.");
            else setQueueNote(step.ran ? "Order edits are ready for review in Studio." : "No photo is waiting to edit.");
          });
          await loadJobs();
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

  const selected = jobs.find((job) => job.id === selectedJob);

  return (
    <AdminLayout title="Upload Photos">
      <div className="w-full min-w-0" data-testid="photographer-upload">
        <p className="mb-4 text-sm text-gray-500">
          Pick the job, then drop the shoot. Status for every assigned job stays on the{" "}
          <Link to="/admin/photographer" className="font-bold text-[#0d9488]">photographer portal</Link>.
        </p>

        <div className="mb-6 rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm">
          <label htmlFor="photographer-job" className="mb-3 block text-[10px] font-black uppercase tracking-widest text-gray-500">
            Select job
          </label>
          {jobs.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
              <FolderOpen className="h-5 w-5 text-gray-300" />
              <div>
                <p className="text-sm font-bold text-gray-500">
                  {jobsError ? "Assigned jobs did not load." : "No jobs are assigned to this login."}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {jobsError
                    ? "Refresh this page. The uploader needs the job list before a shoot can be saved."
                    : "Assigned shoots show up here after the office puts you on the job."}
                </p>
                {jobsError && <p className="mt-1 text-xs text-red-500">{jobsError}</p>}
              </div>
            </div>
          ) : (
            <select
              id="photographer-job"
              value={selectedJob}
              onChange={(event) => chooseJob(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {addressText(job.address) || "No address"} — {job.action.statusLabel}
                </option>
              ))}
            </select>
          )}
        </div>

        {selected && (
          <div className="mb-6">
            <PhotographerJobBanner job={selected} />
          </div>
        )}

        {selectedJob && (
          <div className="mb-6 max-w-md">
            <PresentationSharePanel listingId={selectedJob} getToken={() => user?.getIdToken()} />
          </div>
        )}

        <div
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="mb-6 cursor-pointer rounded-[2rem] border-2 border-dashed border-gray-200 p-12 text-center transition-all hover:border-[#0d9488] hover:bg-[#0d9488]/5"
        >
          <input
            ref={fileRef}
            type="file"
            accept={PHOTOGRAPHER_UPLOAD_ACCEPT}
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <Upload className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <p className="mb-1 text-sm font-black uppercase tracking-widest text-gray-500">
            {selected ? `Drop the shoot for ${addressText(selected.address) || "this shoot"}` : "Drop photos here or click to browse"}
          </p>
          <p className="text-xs text-gray-400">JPEG, PNG, WebP, and RAW. RAW stays in the raw folder until a preview exists.</p>
        </div>

        {files.length > 0 && (
          <div className="mb-6 rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                {files.length} file{files.length === 1 ? "" : "s"} selected
              </p>
              <button type="button" onClick={() => setFiles([])} className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-600">
                Clear all
              </button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <ImageIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  <p className="flex-1 truncate text-xs font-bold text-gray-700">{file.name}</p>
                  <span className="text-[10px] font-bold text-gray-400">{photographerUploadFolder(file.name, file.type)}</span>
                  <span className="text-[10px] font-bold text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  {uploads[file.name] !== undefined ? (
                    uploads[file.name] === 100 ? (
                      <CheckCircle2 className="h-4 w-4 text-teal-500" />
                    ) : (
                      <span className="text-[10px] font-black text-[#0d9488]">{uploads[file.name]}%</span>
                    )
                  ) : (
                    <button type="button" onClick={(event) => { event.stopPropagation(); removeFile(index); }}>
                      <XCircle className="h-4 w-4 text-gray-300 transition-colors hover:text-red-400" />
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
            onChange={(event) => setIconicPolish(event.target.checked)}
          />
          <span>
            <span className="block text-xs font-black uppercase tracking-widest">Iconic Polish</span>
            <span className="mt-1 block text-xs text-gray-500">
              Turn this on before you submit. It adds the full Iconic Polish on top of the order: {ICONIC_POLISH_TREATMENTS.join("; ")}. It does not add people. Standalone grass replacement is a separate edit.
            </span>
          </span>
        </label>

        <Button
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || !selectedJob}
          className="w-full rounded-xl bg-[#0d9488] py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-40"
        >
          {uploading
            ? "Uploading..."
            : selected?.action.kind === "upload"
              ? `Upload the shoot${files.length ? ` (${files.length})` : ""}`
              : `Add ${files.length > 0 ? `${files.length} ` : ""}photo${files.length === 1 ? "" : "s"}`}
        </Button>
        {queueNote && <p className="mt-3 text-xs font-bold text-gray-500">{queueNote}</p>}
      </div>
    </AdminLayout>
  );
}

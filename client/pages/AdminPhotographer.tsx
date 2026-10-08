import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { PhotographerPortal } from "@/components/photographer/PhotographerPortal";
import { PresentationShareButton } from "@/components/PresentationSharePanel";
import { fetchAssignedListings, uploadListingFile } from "@/lib/listingUpload";
import { drainOrderEditQueue, fetchStudioWorkspace, postIconicPolish } from "@/lib/studioApi";
import {
  PHOTOGRAPHER_UPLOAD_ACCEPT,
  buildPhotographerPortal,
  chicagoDateKey,
  photographerUploadFolder,
  type PhotographerStudioJob,
  type PhotographerTab,
} from "@shared/photographerPortal";
import { toast } from "sonner";

export default function AdminPhotographer() {
  const { user, staffProfile } = useAuth();
  const [listings, setListings] = React.useState<Array<Record<string, unknown>>>([]);
  const [studioJobs, setStudioJobs] = React.useState<PhotographerStudioJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [studioNote, setStudioNote] = React.useState("");
  const [tab, setTab] = React.useState<PhotographerTab>("next");
  const [uploading, setUploading] = React.useState(false);
  const [iconicPolish, setIconicPolish] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [queueNote, setQueueNote] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedProject, setSelectedProject] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [assigned, studio] = await Promise.allSettled([
        fetchAssignedListings(),
        fetchStudioWorkspace(undefined, () => user.getIdToken()),
      ]);
      if (assigned.status === "fulfilled") {
        setListings(assigned.value);
        setError("");
      } else {
        setListings([]);
        setError(assigned.reason instanceof Error ? assigned.reason.message : "Failed to load jobs.");
      }
      if (studio.status === "fulfilled") {
        setStudioJobs((studio.value.jobs || []) as PhotographerStudioJob[]);
        setStudioNote("");
      } else {
        setStudioJobs([]);
        setStudioNote("Studio status did not load. Uploads still save on the job.");
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  const jobs = React.useMemo(
    () => buildPhotographerPortal({
      listings,
      studioJobs,
      today: chicagoDateKey(new Date()),
    }),
    [listings, studioJobs],
  );

  const handleUpload = async (projectId: string, files: FileList) => {
    setUploading(true);
    const fileArray = Array.from(files);
    let completed = 0;
    try {
      if (user) {
        await postIconicPolish(() => user.getIdToken(), { listingId: projectId, iconicPolish });
      }
      for (const file of fileArray) {
        await uploadListingFile({
          listingId: projectId,
          file,
          folder: photographerUploadFolder(file.name, file.type),
          onProgress: (pct) => {
            setUploadProgress(Math.round(((completed + pct / 100) / fileArray.length) * 100));
          },
        });
        completed += 1;
      }
      toast.success(`${fileArray.length} file${fileArray.length === 1 ? "" : "s"} uploaded.`);
      setQueueNote("Studio is editing the order, one photo at a time.");
      await load();
      if (user) {
        try {
          await drainOrderEditQueue(() => user.getIdToken(), projectId, (step) => {
            if (step.ran?.status === "failed") setQueueNote(step.ran.note);
            else if (step.shouldFollowUp) setQueueNote(`Auto-queue running. ${step.remaining} still queued.`);
            else if (step.waiting) setQueueNote("Waiting on an exterior filename before twilight can run.");
            else setQueueNote(step.ran ? "Order edits are ready for review in Studio." : "No photo is waiting to edit.");
          });
          await load();
        } catch (err: unknown) {
          setQueueNote(err instanceof Error ? err.message : "Auto-queue did not start.");
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const payRate = typeof (staffProfile as { payRate?: unknown } | null)?.payRate === "number"
    ? (staffProfile as { payRate: number }).payRate
    : 75;

  return (
    <AdminLayout title="Photographer">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={PHOTOGRAPHER_UPLOAD_ACCEPT}
        className="hidden"
        aria-label="Upload shoot files"
        onChange={(event) => {
          if (event.target.files && selectedProject) handleUpload(selectedProject, event.target.files);
        }}
      />
      <PhotographerPortal
        firstName={staffProfile?.firstName || ""}
        jobs={jobs}
        tab={tab}
        onTab={setTab}
        loading={loading}
        error={error}
        studioNote={studioNote}
        iconicPolish={iconicPolish}
        onIconicPolish={setIconicPolish}
        uploading={uploading}
        uploadProgress={uploadProgress}
        queueNote={queueNote}
        payRate={payRate}
        onUpload={(jobId) => {
          setSelectedProject(jobId);
          fileInputRef.current?.click();
        }}
        shareSlot={(job) => (
          <PresentationShareButton
            listingId={job.id}
            getToken={() => user?.getIdToken()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black hover:bg-gray-50"
          />
        )}
      />
    </AdminLayout>
  );
}

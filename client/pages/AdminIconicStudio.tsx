import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import IconicStudioWorkspace, { type StudioJobView } from "@/components/iconic-studio/IconicStudioWorkspace";
import {
  fetchStudioWorkspace,
  postStudioAdjust,
  postStudioAiEdit,
  postStudioApprove,
} from "@/lib/studioApi";
import {
  AI_EDIT_STUB_NOTE,
  iconicStudioHref,
  presetPrompt,
  sampleStudioFrames,
  STUDIO_FLAGS,
  type StudioAdjustments,
  type StudioFrame,
} from "@shared/iconicStudio";
import { toast } from "sonner";
import { PresentationSharePanel } from "@/components/PresentationSharePanel";

function asFrame(raw: Record<string, unknown>, index: number): StudioFrame | null {
  const name = String(raw.name || "");
  const path = String(raw.path || "");
  const url = String(raw.url || "");
  if (!name && !path && !url) return null;
  return {
    id: String(raw.id || path || index),
    name: name || path.split("/").pop() || `photo-${index + 1}`,
    path,
    url,
    contentType: String(raw.contentType || ""),
    raw: Boolean(raw.raw),
    previewable: raw.previewable !== false,
    studioApproved: Boolean(raw.studioApproved),
    studioRole: typeof raw.studioRole === "string" ? raw.studioRole : undefined,
  };
}

function sampleWorkspace() {
  const frames = sampleStudioFrames();
  return {
    listings: [{ id: "sampledemo", address: "100 Sample Lane, Austin, TX", status: "uploaded", imageCount: frames.length }],
    jobs: [{
      id: "sample-review",
      listingId: "sampledemo",
      kind: "ai_edit",
      type: "virtual_stage",
      status: "review",
      prompt: presetPrompt("virtual_stage"),
      beforeUrl: "",
      afterUrl: "",
      placeholder: true,
      sourcePath: frames[0].path,
      note: AI_EDIT_STUB_NOTE,
    }] as StudioJobView[],
    frames,
    address: "100 Sample Lane, Austin, TX",
  };
}

export default function AdminIconicStudio() {
  const { listingId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const getToken = useCallback(() => {
    if (!user) return Promise.reject(new Error("Sign in again before opening Iconic Studio."));
    return user.getIdToken();
  }, [user]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [listings, setListings] = useState<Array<{ id: string; address: string; status?: string; imageCount?: number }>>([]);
  const [jobs, setJobs] = useState<StudioJobView[]>([]);
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [address, setAddress] = useState("Iconic Studio");

  const applySample = useCallback(() => {
    const sample = sampleWorkspace();
    setDemo(true);
    setListings(sample.listings);
    setJobs(sample.jobs);
    setFrames(sample.frames);
    setAddress(sample.address);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStudioWorkspace(listingId || undefined, getToken);
      const nextFrames = (data.listing?.images || [])
        .map((item, index) => asFrame(item, index))
        .filter((item): item is StudioFrame => Boolean(item));
      setDemo(false);
      setListings(data.listings || []);
      setJobs((data.jobs || []) as unknown as StudioJobView[]);
      setFrames(nextFrames);
      setAddress(data.listing?.address || "Choose a listing");
      if (!listingId && data.listings?.[0]?.id) {
        navigate(iconicStudioHref(data.listings[0].id), { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load Iconic Studio.";
      const missingAdmin = /not configured|failed to fetch|503/i.test(message);
      if (missingAdmin) {
        applySample();
        if (!listingId) navigate(iconicStudioHref("sampledemo"), { replace: true });
      } else {
        toast.error(message);
        setListings([]);
        setJobs([]);
        setFrames([]);
      }
    } finally {
      setLoading(false);
    }
  }, [applySample, getToken, listingId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const onSelectListing = (id: string) => {
    if (!id) {
      navigate(iconicStudioHref());
      return;
    }
    navigate(iconicStudioHref(id));
  };

  const shareListingId = listingId || (demo ? "sampledemo" : "");

  return (
    <AdminLayout title="Iconic Studio">
      {shareListingId && (
        <div className="mb-4 max-w-md">
          <PresentationSharePanel listingId={shareListingId} getToken={getToken} demo={demo || shareListingId === "sampledemo"} />
        </div>
      )}
      {loading ? (
        <p className="text-sm font-bold text-gray-500">Loading Iconic Studio...</p>
      ) : (
        <IconicStudioWorkspace
          listings={listings}
          jobs={jobs}
          listingId={listingId || (demo ? "sampledemo" : null)}
          address={address}
          frames={frames}
          demo={demo}
          onSelectListing={onSelectListing}
          onAiEdit={async ({ type, prompt, frame }) => {
            if (demo || !frame.url) {
              const job: StudioJobView = {
                id: `local-${Date.now()}`,
                listingId: listingId || "sampledemo",
                kind: "ai_edit",
                type,
                status: "review",
                prompt,
                beforeUrl: frame.url,
                afterUrl: frame.url,
                placeholder: true,
                sourcePath: frame.path,
                note: AI_EDIT_STUB_NOTE,
              };
              setJobs((current) => [job, ...current]);
              toast.message("Needs review", { description: "Stub queue. The after image is a placeholder of the source." });
              return;
            }
            const job = await postStudioAiEdit(getToken, {
              listingId: listingId,
              type,
              prompt,
              imageUrl: frame.url,
              sourcePath: frame.path,
            });
            toast.success(job.provider === "stub" ? "Edit queued for review" : "Edit sent to the provider");
            await load();
          }}
          onSaveAdjust={async ({ frame, adjustments, dataBase64 }) => {
            if (demo) {
              toast.message("Sample preview", { description: "Save writes a JPEG when this listing is in Storage." });
              return;
            }
            await postStudioAdjust(getToken, {
              listingId,
              sourcePath: frame.path,
              fileName: frame.name,
              adjustments: adjustments as StudioAdjustments,
              dataBase64,
            });
            toast.success("Adjusted JPEG saved to the listing.");
            await load();
          }}
          onApprove={async ({ frame, job }) => {
            if (demo) {
              if (job) {
                setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: "approved" } : item));
              }
              const approved = frame;
              if (approved) {
                setFrames((current) => current.map((item) => item.id === approved.id ? { ...item, studioApproved: true, studioRole: "final" } : item));
              }
              toast.message("Sample approve", { description: "A real listing copies the file to finals and updates the gallery. No client email is sent." });
              return;
            }
            const result = await postStudioApprove(getToken, {
              listingId,
              jobId: job?.id,
              sourcePath: job?.resultPath || job?.sourcePath || frame?.path,
              fileName: frame?.name,
            });
            toast.success(result.note || "Final added to the gallery.");
            await load();
          }}
        />
      )}
      {!STUDIO_FLAGS.outsidePhotographerSaas && <span className="sr-only">Outside photographer SaaS is off</span>}
    </AdminLayout>
  );
}

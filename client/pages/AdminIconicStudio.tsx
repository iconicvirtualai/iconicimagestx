import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import IconicStudioWorkspace, { type StudioDeliveryView, type StudioJobView } from "@/components/iconic-studio/IconicStudioWorkspace";
import {
  fetchStudioWorkspace,
  postStudioAdjust,
  postStudioAiEdit,
  postStudioApprove,
  postStudioOrderEdits,
  postStudioReject,
  drainOrderEditQueue,
} from "@/lib/studioApi";
import {
  iconicStudioHref,
  sampleStudioFrames,
  STUDIO_FLAGS,
  type StudioAdjustments,
  type StudioFrame,
} from "@shared/iconicStudio";
import { assessGalleryRelease, type GalleryReleaseReport } from "@shared/galleryRelease";
import { planOrderEdits, type OrderEditPlan } from "@shared/orderEditPlan";
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
    jobs: [] as StudioJobView[],
    frames,
    address: "100 Sample Lane, Austin, TX",
    editPlan: planOrderEdits({ serviceIds: ["listing-showcase"] }),
  };
}

export default function AdminIconicStudio() {
  const { listingId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const getToken = useCallback(() => {
    if (!user) return Promise.reject(new Error("Sign in again before opening Studio."));
    return user.getIdToken();
  }, [user]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [listings, setListings] = useState<Array<{ id: string; address: string; status?: string; imageCount?: number }>>([]);
  const [jobs, setJobs] = useState<StudioJobView[]>([]);
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [address, setAddress] = useState("Studio");
  const [editPlan, setEditPlan] = useState<OrderEditPlan | null>(null);
  const [release, setRelease] = useState<GalleryReleaseReport | null>(null);
  const [delivery, setDelivery] = useState<StudioDeliveryView | null>(null);
  const draining = useRef(false);
  const drainFailed = useRef(false);

  const applySample = useCallback(() => {
    const sample = sampleWorkspace();
    setDemo(true);
    setListings(sample.listings);
    setJobs(sample.jobs);
    setFrames(sample.frames);
    setAddress(sample.address);
    setEditPlan(sample.editPlan);
    setRelease(assessGalleryRelease(sample.editPlan, { jobs: [], finals: [], uploads: [], media: [] }));
    setDelivery({
      galleryId: "samplegallery",
      galleryStatus: "ready_for_review",
      deliveryStatus: "undelivered",
      label: "Undelivered",
    });
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
      setEditPlan(data.listing?.editPlan || null);
      setRelease(data.listing?.release || null);
      setDelivery(data.listing?.delivery || null);
      if (!listingId && data.listings?.[0]?.id) {
        navigate(iconicStudioHref(data.listings[0].id), { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load Studio.";
      const missingAdmin = /not configured|failed to fetch|503/i.test(message);
      if (missingAdmin) {
        applySample();
        if (!listingId) navigate(iconicStudioHref("sampledemo"), { replace: true });
      } else {
        toast.error(message);
        setListings([]);
        setJobs([]);
        setFrames([]);
        setEditPlan(null);
        setRelease(null);
        setDelivery(null);
      }
    } finally {
      setLoading(false);
    }
  }, [applySample, getToken, listingId, navigate]);

  useEffect(() => {
    drainFailed.current = false;
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading || demo || !listingId || draining.current || drainFailed.current) return;
    const pending = jobs.some((job) => (
      job.listingId === listingId
      && job.origin === "order"
      && job.status === "pending"
      && Boolean(job.sourcePath)
    ));
    if (!pending) return;
    draining.current = true;
    let cancelled = false;
    void drainOrderEditQueue(
      getToken,
      listingId,
      (step) => {
        if (!cancelled && step.ran?.status === "failed") toast.error(step.ran.note);
      },
      () => cancelled,
    ).catch((err) => {
      drainFailed.current = true;
      if (!cancelled) toast.error(err instanceof Error ? err.message : "Auto-queue stopped.");
    }).finally(() => {
      draining.current = false;
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [demo, getToken, jobs, listingId, load, loading]);

  const onSelectListing = (id: string) => {
    if (!id) {
      navigate(iconicStudioHref());
      return;
    }
    navigate(iconicStudioHref(id));
  };

  const shareListingId = listingId || (demo ? "sampledemo" : "");

  return (
    <AdminLayout title="Studio">
      {shareListingId && (
        <div className="mb-4 max-w-md">
          <PresentationSharePanel listingId={shareListingId} getToken={getToken} demo={demo || shareListingId === "sampledemo"} />
        </div>
      )}
      {loading ? (
        <p className="text-sm font-bold text-gray-500">Loading Studio...</p>
      ) : (
        <IconicStudioWorkspace
          listings={listings}
          jobs={jobs}
          listingId={listingId || (demo ? "sampledemo" : null)}
          address={address}
          frames={frames}
          demo={demo}
          editPlan={editPlan}
          release={release}
          delivery={delivery}
          onSelectListing={onSelectListing}
          onRunOrder={async () => {
            if (demo) {
              toast.message("Sample order", { description: "A live listing runs the next order edit through OpenAI. The gallery is not sent." });
              return;
            }
            const result = await postStudioOrderEdits(getToken, listingId);
            if (!result.ran) {
              toast.message("Order queue", { description: result.waiting ? "Waiting for an exterior filename before twilight can run." : "No photo is waiting to edit." });
            } else if (result.ran.status === "failed") {
              toast.error(result.ran.note);
            } else {
              toast.success("Order edit is ready for review.");
            }
            await load();
          }}
          onAiEdit={async ({ type, prompt, frame }) => {
            if (demo || !frame.url) {
              toast.message("Sample override", { description: "Staff overrides call OpenAI when this listing is loaded from the studio." });
              return;
            }
            const job = await postStudioAiEdit(getToken, {
              listingId: listingId,
              type,
              prompt,
              imageUrl: frame.url,
              sourcePath: frame.path,
            });
            if (job.status === "failed") toast.error(job.note);
            else toast.success("Edit ready for review.");
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
          onReject={async (job) => {
            if (demo) {
              setJobs((current) => current.filter((item) => item.id !== job.id));
              toast.message("Sample reject", { description: "The edited image is not added to the gallery." });
              return;
            }
            const result = await postStudioReject(getToken, { listingId, jobId: job.id });
            toast.success(result.note || "Edit rejected.");
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

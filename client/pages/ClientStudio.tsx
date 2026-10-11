import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { doc, serverTimestamp } from "firebase/firestore";
import { fetchListing } from "@/lib/listingUpload";
import { Lock } from "lucide-react";
import { ClientStudioView } from "@/components/gallery/ClientStudioView";

function failureCopy(status: number, data: { code?: string; message?: string; error?: string }, id: string) {
  const message = data.message || data.error || "";
  if (data.code === "studio_disabled") return { title: "Studio link is off", message };
  if (data.code === "studio_locked") return { title: "Studio link is locked", message };
  if (data.code === "dangling_pointer") return { title: "Linked record is missing", message };
  if (data.code === "unknown") return { title: "No gallery or project found", message };
  if (data.code === "invalid_id") return { title: "This is not a gallery link", message };
  if (status === 503 || status === 500 || data.code === "lookup_unavailable" || data.code === "lookup_failed") {
    return {
      title: "Gallery link could not be checked",
      message: message || "The gallery lookup did not finish. This is not a missing gallery id.",
    };
  }
  return {
    title: "Gallery link not found",
    message: message || `No gallery or project uses ${id}.`,
  };
}

export default function ClientStudio() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = React.useState<any>(null);
  const [failure, setFailure] = React.useState<{ title: string; message: string; galleryId?: string } | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!listingId || authLoading) return;
    let cancelled = false;
    setLoading(true);
    setLeaving(false);
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (user) {
          try {
            const token = await user.getIdToken();
            if (token) headers.Authorization = `Bearer ${token}`;
          } catch (err) {
            console.warn("[ClientStudio] Could not attach the session.", err);
          }
        }
        const res = await fetch(`/api/galleries/link/${encodeURIComponent(listingId)}`, { headers });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && data.kind === "gallery" && data.released && data.galleryId) {
          setLeaving(true);
          navigate(`/gallery/${data.galleryId}`, { replace: true });
          return;
        }
        if (res.ok && data.kind === "gallery") {
          setProject(null);
          setFailure({
            title: "Gallery is not released",
            message: data.staffNote || "This gallery exists, but photos have not been released.",
            galleryId: data.galleryId,
          });
          return;
        }
        if (res.ok && data.kind === "listing" && data.project) {
          if (!cancelled) {
            setFailure(null);
            setProject(data.project);
          }
          return;
        }

        if (res.status === 503 && user) {
          try {
            const signedInProject = await fetchListing(listingId);
            if (!cancelled) {
              setFailure(null);
              setProject({ ...signedInProject, view: signedInProject.view || "owner" });
            }
            return;
          } catch (err) {
            console.warn("[ClientStudio] Signed-in listing read failed.", err);
          }
        }

        setProject(null);
        setFailure(failureCopy(res.status, data, listingId));
      } catch (err) {
        console.warn("[ClientStudio] Gallery link lookup failed.", err);
        if (!cancelled) {
          setProject(null);
          setFailure({
            title: "Gallery link could not be checked",
            message: `The lookup for ${listingId} did not finish. This is not a missing gallery id. Check galleries/${listingId} and listings/${listingId}.`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, navigate, user, authLoading]);

  if (loading || leaving) return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-black mb-2">{failure?.title || "Gallery link not found"}</h2>
        <p className="text-sm text-gray-600">{failure?.message || "This gallery link could not be opened."}</p>
        {listingId && <p className="mt-3 text-xs font-mono text-gray-400 break-all">{listingId}</p>}
        {failure?.galleryId && (
          <p className="mt-4 text-sm">
            <Link to={`/gallery/${failure.galleryId}`} className="underline">Open the delivery page</Link>
          </p>
        )}
        <p className="mt-4 text-sm">
          <Link to="/privacy" className="underline">Privacy Policy</Link>
          {" · "}
          <Link to="/terms" className="underline">Terms and Conditions</Link>
        </p>
      </div>
    </div>
  );

  return (
    <ClientStudioView
      project={project}
      listingId={listingId}
      signedIn={Boolean(user)}
      onPersistRevision={async (revisions) => {
        if (!listingId) throw new Error("Missing listing");
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "listings", listingId), {
          revisions,
          updatedAt: serverTimestamp(),
        });
        setProject((prev: any) => (prev ? { ...prev, revisions } : prev));
      }}
    />
  );
}

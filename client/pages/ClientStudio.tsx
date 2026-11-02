import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { doc, serverTimestamp } from "firebase/firestore";
import { fetchListing } from "@/lib/listingUpload";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { ClientStudioView } from "@/components/gallery/ClientStudioView";
import { createPresentationLink } from "@/lib/presentationShare";
import { activePresentationPath, copiedPresentationUrl, presentationClipboardUrl } from "@shared/presentation";

export function studioAccessCopy(status: number, data: { code?: string }): { title: string; message: string; portal: true; state: "sign-in" | "other-client" } | null {
  if (status === 401 || data.code === "auth_required") {
    return {
      state: "sign-in",
      title: "Sign in",
      message: "Sign in to open this studio.",
      portal: true,
    };
  }
  if (data.code === "studio_forbidden") {
    return {
      state: "other-client",
      title: "This studio belongs to another client",
      message: "This studio belongs to another client.",
      portal: true,
    };
  }
  return null;
}

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
  const [sharePath, setSharePath] = React.useState("");
  const [failure, setFailure] = React.useState<{ title: string; message: string; galleryId?: string; portal?: boolean; state?: string } | null>(null);
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

        const access = studioAccessCopy(res.status, data);
        if (access) {
          setProject(null);
          setSharePath("");
          setFailure(access);
          return;
        }

        if (res.ok && data.kind === "gallery" && data.released && data.galleryId) {
          setLeaving(true);
          navigate(`/gallery/${data.galleryId}`, { replace: true });
          return;
        }
        if (res.ok && data.kind === "gallery") {
          setProject(null);
          setSharePath("");
          setFailure({
            title: "Gallery is not released",
            message: data.staffNote || "This gallery exists, but photos have not been released.",
            galleryId: data.galleryId,
          });
          return;
        }
        if (res.ok && data.kind === "listing" && data.project?.view === "owner") {
          if (!cancelled) {
            setFailure(null);
            setSharePath(typeof data.sharePath === "string" ? data.sharePath : "");
            setProject(data.project);
          }
          return;
        }
        if (res.ok && data.kind === "listing") {
          setProject(null);
          setSharePath("");
          setFailure(studioAccessCopy(401, { code: "auth_required" }));
          return;
        }

        if (res.status === 503 && user) {
          try {
            const signedInProject = await fetchListing(listingId);
            if (!cancelled) {
              setFailure(null);
              setSharePath(activePresentationPath(signedInProject) || "");
              setProject({ ...signedInProject, view: signedInProject.view || "owner" });
            }
            return;
          } catch (err) {
            console.warn("[ClientStudio] Signed-in listing read failed.", err);
          }
        }

        setProject(null);
        setSharePath("");
        setFailure(failureCopy(res.status, data, listingId));
      } catch (err) {
        console.warn("[ClientStudio] Gallery link lookup failed.", err);
        if (!cancelled) {
          setProject(null);
          setSharePath("");
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
    <div className="iframe-safe-page bg-[#fafafa] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return (
    <div className="iframe-safe-page bg-[#fafafa] flex items-center justify-center px-4">
      <div className="max-w-lg text-center" data-studio-access={failure?.state || "closed"}>
        <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-black mb-2">{failure?.title || "Gallery link not found"}</h2>
        <p className="text-sm text-gray-600">{failure?.message || "This gallery link could not be opened."}</p>
        {listingId && <p className="mt-3 text-xs font-mono text-gray-400 break-all">{listingId}</p>}
        {failure?.portal && (
          <p className="mt-4 text-sm">
            <Link to="/portal" className="underline">Go to your portal</Link>
          </p>
        )}
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
      onCopyShare={async () => {
        const ready = presentationClipboardUrl(window.location.origin, sharePath);
        if (ready) {
          await navigator.clipboard.writeText(ready);
          toast.success("Share link copied.");
          return;
        }
        try {
          const token = user ? await user.getIdToken() : "";
          if (!token || !listingId) throw new Error("Sign in again before creating a presentation link.");
          const link = await createPresentationLink(listingId, token);
          const url = copiedPresentationUrl(window.location.origin, link);
          if (!url) throw new Error("This presentation link is not active.");
          await navigator.clipboard.writeText(url);
          toast.success("Presentation link copied. No email or text was sent.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "The presentation link could not be created.");
        }
      }}
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

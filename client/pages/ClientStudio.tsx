import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { fetchListing } from "@/lib/listingUpload";
import { toast } from "sonner";
import {
  Download, Lock, Image, Video, MessageSquare, Send,
  ChevronLeft, ChevronRight, X, Edit3, Share2, ExternalLink,
  Star, Check, Layers, Zap,
} from "lucide-react";

function fmtAddr(a: any): string {
  if (!a) return "";
  if (typeof a === "string") return a;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "";
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
  const [failure, setFailure] = React.useState<{ title: string; message: string; galleryId?: string } | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [selectedPhoto, setSelectedPhoto] = React.useState<number | null>(null);
  const [showRevision, setShowRevision] = React.useState(false);
  const [revisionNote, setRevisionNote] = React.useState("");
  const [revisionType, setRevisionType] = React.useState<"single" | "gallery">("single");
  const [submittingRevision, setSubmittingRevision] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"photos" | "videos" | "tours" | "revisions" | "ai_studio">("photos");

  React.useEffect(() => {
    if (!listingId || authLoading) return;
    let cancelled = false;
    setLoading(true);
    setLeaving(false);
    (async () => {
      try {
        const res = await fetch(`/api/galleries/link/${encodeURIComponent(listingId)}`);
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
        if (res.ok && data.kind === "listing" && data.openGalleryId) {
          setLeaving(true);
          navigate(`/gallery/${data.openGalleryId}`, { replace: true });
          return;
        }
        if (res.ok && data.kind === "listing" && data.project) {
          let next = data.project;
          if (user) {
            try {
              const snap = await getDoc(doc(db, "listings", listingId));
              if (snap.exists()) {
                next = { id: snap.id, ...snap.data() };
                if (data.project.notice && !next.notice) next.notice = data.project.notice;
              }
            } catch (err) {
              console.warn("[ClientStudio] Signed-in listing read failed.", err);
            }
          }
          if (!cancelled) {
            setFailure(null);
            setProject(next);
          }
          return;
        }

        if (res.status === 503 && user) {
          try {
            const signedInProject = await fetchListing(listingId);
            if (!cancelled) {
              setFailure(null);
              setProject(signedInProject);
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

  const canRevise = Boolean(user) && project?.view !== "public";

  const handleRevisionSubmit = async () => {
    if (!revisionNote.trim() || !listingId) return;
    if (!canRevise) {
      toast.error("This shared view can't save a revision. Open the project while signed in with edit access.");
      return;
    }
    setSubmittingRevision(true);
    try {
      // Add revision to the project
      const revisions = project?.revisions || [];
      const newRevision = {
        id: crypto.randomUUID(),
        requestedBy: "client",
        type: revisionType,
        photoIndex: revisionType === "single" ? selectedPhoto : null,
        description: revisionNote,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "listings", listingId), {
        revisions: [...revisions, newRevision],
        updatedAt: serverTimestamp(),
      });
      toast.success("Revision request submitted! We'll review it shortly.");
      setShowRevision(false);
      setRevisionNote("");
      setProject((prev: any) => ({ ...prev, revisions: [...revisions, newRevision] }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit revision request.");
    } finally {
      setSubmittingRevision(false);
    }
  };

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

  const images: any[] = project.images || [];
  const videos: any[] = project.videos || [];
  const tours: any[] = project.tourUrl ? [{ url: project.tourUrl }] : [];
  const locked = project.lockDownloads && project.requirePayment && !(project.invoice?.status === "paid");
  const address = fmtAddr(project.address || project.shootLocation);
  const revisions: any[] = project.revisions || [];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0d9488] flex items-center justify-center flex-shrink-0">
              <span className="font-black text-white text-sm">I</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Iconic Images</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{address || "Your Gallery"}</h1>
          {listingId && (
            <Link to={`/portal/listings/${listingId}`} className="inline-block mt-3 text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
              Listing file
            </Link>
          )}
          {project.clientName && <p className="text-gray-400 mt-1">{project.clientName}</p>}
          {project.services && Array.isArray(project.services) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {project.services.map((s: string, i: number) => (
                <span key={i} className="px-2.5 py-0.5 bg-white/10 rounded-full text-[9px] font-bold text-gray-300">{s}</span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="max-w-6xl mx-auto px-4 flex gap-6">
          {[
            { id: "photos", label: "Photos", count: images.length },
            { id: "videos", label: "Videos", count: videos.length },
            { id: "tours", label: "3D Tours", count: tours.length },
            { id: "revisions", label: "Revisions", count: revisions.filter(r => r.status === "pending").length },
            { id: "ai_studio", label: "AI Tools", count: 0 },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${activeTab === t.id ? "border-[#0d9488] text-[#0d9488]" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
              {t.label} {t.count > 0 && <span className="ml-1 text-gray-300">({t.count})</span>}
              {t.id === 'ai_studio' && <Zap className="w-2.5 h-2.5 ml-1 inline text-teal-500" />}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Locked notice */}
        {project.notice && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6">
            <p className="text-sm font-bold text-gray-800">{project.notice}</p>
          </div>
        )}

        {locked && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-yellow-800">Downloads are locked</p>
              <p className="text-xs text-yellow-600">Please complete payment to download your photos. Contact us if you have questions.</p>
            </div>
          </div>
        )}

        {/* PHOTOS */}
        {activeTab === "photos" && (
          images.length === 0 ? (
            <div className="text-center py-20"><Image className="w-16 h-16 text-gray-200 mx-auto mb-4" /><p className="text-gray-400 font-bold">Photos are being prepared. Check back soon!</p></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map((img: any, i: number) => (
                <div key={i} className="aspect-[4/3] rounded-xl overflow-hidden relative group cursor-pointer bg-gray-100"
                  onClick={() => setSelectedPhoto(i)}>
                  <img src={img.url} alt={img.name || `Photo ${i+1}`} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    {!locked && <button className="p-2 bg-white rounded-lg"><Download className="w-4 h-4 text-black" /></button>}
                    {canRevise && (
                      <button onClick={e => { e.stopPropagation(); setSelectedPhoto(i); setRevisionType("single"); setShowRevision(true); }}
                        className="p-2 bg-white rounded-lg"><Edit3 className="w-4 h-4 text-black" /></button>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">{i+1}</div>
                </div>
              ))}
            </div>
          )
        )}

        {/* VIDEOS */}
        {activeTab === "videos" && (
          videos.length === 0 ? (
            <div className="text-center py-20"><Video className="w-16 h-16 text-gray-200 mx-auto mb-4" /><p className="text-gray-400 font-bold">No videos yet</p></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {videos.map((v: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-4">
                  <p className="font-bold text-sm mb-2">{v.name || `Video ${i+1}`}</p>
                  {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[#0d9488] text-xs font-bold flex items-center gap-1">Watch <ExternalLink className="w-3 h-3" /></a>}
                </div>
              ))}
            </div>
          )
        )}

        {/* TOURS */}
        {activeTab === "tours" && (
          tours.length === 0 ? (
            <div className="text-center py-20"><Layers className="w-16 h-16 text-gray-200 mx-auto mb-4" /><p className="text-gray-400 font-bold">No 3D tours</p></div>
          ) : (
            <div className="space-y-4">
              {tours.map((t: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-6">
                  <p className="font-bold mb-2">3D Virtual Tour</p>
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[#0d9488] font-bold flex items-center gap-2">
                    Open Tour <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )
        )}

        {/* REVISIONS */}
        {activeTab === "revisions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest">Revision Requests</h3>
              {canRevise ? (
                <button onClick={() => { setRevisionType("gallery"); setShowRevision(true); }}
                  className="px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e]">
                  + Request Revision
                </button>
              ) : user ? (
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Revision saves need project edit access</p>
              ) : (
                <Link to="/login" state={{ from: { pathname: `/studio/${listingId}` } }}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-600">
                  Sign in to request a revision
                </Link>
              )}
            </div>
            {revisions.length === 0 ? (
              <div className="text-center py-16"><MessageSquare className="w-12 h-12 text-gray-200 mx-auto mb-4" /><p className="text-gray-400 font-bold">No revision requests</p><p className="text-xs text-gray-300 mt-1">Click on a photo or use the button above to request changes</p></div>
            ) : (
              revisions.map((r: any, i: number) => (
                <div key={r.id || i} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.status === "pending" ? "bg-yellow-100 text-yellow-700" : r.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {r.status}
                      </span>
                      <span className="text-[10px] text-gray-400">{r.type === "single" ? `Photo #${(r.photoIndex || 0) + 1}` : "Full Gallery"}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</span>
                  </div>
                  <p className="text-sm text-gray-700">{r.description}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* AI STUDIO (Placeholder) */}
        {activeTab === "ai_studio" && (
          <div className="bg-black rounded-3xl p-12 text-center text-white">
            <Zap className="w-12 h-12 text-[#0d9488] mx-auto mb-4" />
            <h3 className="text-xl font-black uppercase tracking-tight mb-2">AI Creative Studio</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-8">Unlock AI-powered virtual staging, decluttering, and sky replacement tools directly in your gallery.</p>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 max-w-md mx-auto">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 text-left">Your Plan</span>
                <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-full text-[9px] font-black uppercase">Standard</span>
              </div>
              <p className="text-xs text-gray-400 text-left mb-6">Upgrade to **Pro** or **Elite** to unlock real-time AI staging and high-res downloads.</p>
              <button className="w-full py-3 bg-[#0d9488] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#0f766e]">Upgrade Plan</button>
            </div>
          </div>
        )}

        {/* Gallery-wide actions */}
        {activeTab === "photos" && images.length > 0 && !locked && (
          <div className="mt-8 flex justify-center gap-3">
            <button className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-800">
              <Download className="w-4 h-4" /> Download All Photos
            </button>
            {canRevise && (
              <button onClick={() => { setRevisionType("gallery"); setShowRevision(true); }}
                className="flex items-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50">
                <Edit3 className="w-4 h-4" /> Request Revision
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedPhoto !== null && !showRevision && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <button onClick={() => setSelectedPhoto(null)} className="absolute top-4 right-4 p-2 text-white hover:text-gray-300"><X className="w-6 h-6" /></button>
          {selectedPhoto > 0 && <button onClick={() => setSelectedPhoto(selectedPhoto - 1)} className="absolute left-4 p-2 text-white hover:text-gray-300"><ChevronLeft className="w-8 h-8" /></button>}
          {selectedPhoto < images.length - 1 && <button onClick={() => setSelectedPhoto(selectedPhoto + 1)} className="absolute right-4 p-2 text-white hover:text-gray-300"><ChevronRight className="w-8 h-8" /></button>}
          <img src={images[selectedPhoto]?.url} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <span className="text-white text-xs font-bold">{selectedPhoto + 1} / {images.length}</span>
            {!locked && <a href={images[selectedPhoto]?.url} download className="px-3 py-1.5 bg-white text-black rounded-lg text-[10px] font-bold">Download</a>}
            {canRevise && (
              <button onClick={() => { setRevisionType("single"); setShowRevision(true); }} className="px-3 py-1.5 bg-white/20 text-white rounded-lg text-[10px] font-bold">Request Edit</button>
            )}
          </div>
        </div>
      )}

      {/* Revision modal */}
      {showRevision && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-black mb-2">Request Revision</h3>
            <p className="text-xs text-gray-500 mb-4">
              {revisionType === "single" && selectedPhoto !== null ? `Revision for Photo #${selectedPhoto + 1}` : "Revision for the entire gallery"}
            </p>
            <textarea
              value={revisionNote}
              onChange={e => setRevisionNote(e.target.value)}
              rows={4}
              placeholder="Describe what changes you'd like... (e.g., 'warmer tones', 'remove power lines', 'add virtual staging to bedroom')"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowRevision(false); setRevisionNote(""); }} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600">Cancel</button>
              <button onClick={handleRevisionSubmit} disabled={submittingRevision || !revisionNote.trim()}
                className="flex-1 px-4 py-3 bg-[#0d9488] text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {submittingRevision ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">Powered by Iconic Images Photography</p>
          <p className="text-[10px] text-gray-300 mt-1">iconicimagestx.com</p>
          <div className="mt-3 flex justify-center gap-4 text-xs">
            <Link to="/privacy" className="underline text-gray-500">Privacy Policy</Link>
            <Link to="/terms" className="underline text-gray-500">Terms and Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

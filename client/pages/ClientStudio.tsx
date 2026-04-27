import * as React from "react";
import { useParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import {
  Download, Lock, Image, Video, MessageSquare, Send,
  ChevronLeft, ChevronRight, X, Edit3, Share2, ExternalLink,
  Star, Check, Layers,
} from "lucide-react";

function fmtAddr(a: any): string {
  if (!a) return "";
  if (typeof a === "string") return a;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "";
}

export default function ClientStudio() {
  const { listingId } = useParams<{ listingId: string }>();
  const [project, setProject] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedPhoto, setSelectedPhoto] = React.useState<number | null>(null);
  const [showRevision, setShowRevision] = React.useState(false);
  const [revisionNote, setRevisionNote] = React.useState("");
  const [revisionType, setRevisionType] = React.useState<"single" | "gallery">("single");
  const [submittingRevision, setSubmittingRevision] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"photos" | "videos" | "tours" | "revisions">("photos");

  React.useEffect(() => {
    if (!listingId) return;
    getDoc(doc(db, "listings", listingId)).then(snap => {
      if (snap.exists()) setProject({ id: snap.id, ...snap.data() });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [listingId]);

  const handleRevisionSubmit = async () => {
    if (!revisionNote.trim() || !listingId) return;
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

  if (loading) return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <div className="text-center">
        <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-black mb-2">Gallery Not Found</h2>
        <p className="text-sm text-gray-500">This gallery may have expired or the link is incorrect.</p>
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
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${activeTab === t.id ? "border-[#0d9488] text-[#0d9488]" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
              {t.label} {t.count > 0 && <span className="ml-1 text-gray-300">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Locked notice */}
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
                    <button onClick={e => { e.stopPropagation(); setSelectedPhoto(i); setRevisionType("single"); setShowRevision(true); }}
                      className="p-2 bg-white rounded-lg"><Edit3 className="w-4 h-4 text-black" /></button>
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
              <button onClick={() => { setRevisionType("gallery"); setShowRevision(true); }}
                className="px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e]">
                + Request Revision
              </button>
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

        {/* Gallery-wide actions */}
        {activeTab === "photos" && images.length > 0 && !locked && (
          <div className="mt-8 flex justify-center gap-3">
            <button className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-800">
              <Download className="w-4 h-4" /> Download All Photos
            </button>
            <button onClick={() => { setRevisionType("gallery"); setShowRevision(true); }}
              className="flex items-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50">
              <Edit3 className="w-4 h-4" /> Request Revision
            </button>
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
            <button onClick={() => { setRevisionType("single"); setShowRevision(true); }} className="px-3 py-1.5 bg-white/20 text-white rounded-lg text-[10px] font-bold">Request Edit</button>
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
        </div>
      </footer>
    </div>
  );
}

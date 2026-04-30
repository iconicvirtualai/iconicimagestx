import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import {
  ImagePlay,
  CheckCircle2,
  Clock,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = ["needs_editing", "in_progress", "ready_for_review", "delivered"];

const statusLabel: Record<string, string> = {
  needs_editing:    "Needs Editing",
  in_progress:      "In Progress",
  ready_for_review: "Ready for Review",
  delivered:        "Delivered",
};

const statusColor: Record<string, string> = {
  needs_editing:    "bg-red-500/10 text-red-600",
  in_progress:      "bg-yellow-500/10 text-yellow-600",
  ready_for_review: "bg-blue-500/10 text-blue-600",
  delivered:        "bg-teal-500/10 text-teal-600",
};

export default function AdminEditor() {
  const [listings, setListings] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<string>("needs_editing");

  React.useEffect(() => {
    const q = query(
      collection(db, "listings"),
      where("editStatus", "in", STATUS_OPTIONS),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => {
      const q2 = query(collection(db, "listings"), orderBy("updatedAt", "desc"));
      onSnapshot(q2, (snap) => {
        setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    });
    return () => unsub();
  }, []);

  const updateStatus = async (listingId: string, status: string) => {
    try {
      await updateDoc(doc(db, "listings", listingId), { editStatus: status, updatedAt: new Date() });
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  const filtered = filter === "all"
    ? listings
    : listings.filter((l) => (l.editStatus || "needs_editing") === filter);

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = listings.filter((l) => (l.editStatus || "needs_editing") === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AdminLayout title="Photo Queue">
      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-8">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === s
                ? "bg-[#0d9488] text-white shadow"
                : "bg-white text-gray-400 border border-gray-100 hover:border-[#0d9488]/30 hover:text-[#0d9488]"
            }`}
          >
            {statusLabel[s]}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${filter === s ? "bg-white/20" : "bg-gray-100"}`}>
              {counts[s] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Queue */}
      {loading ? (
        <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
          <div className="w-8 h-8 rounded-full bg-[#0d9488]/20 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Loading queue...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-teal-200 mx-auto mb-4" />
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Queue is clear</p>
          <p className="text-xs text-gray-300 mt-1">No listings in this category.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((listing) => {
            const editStatus = listing.editStatus || "needs_editing";
            const photoCount = listing.photos?.length ?? 0;
            return (
              <div key={listing.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {listing.photos?.[0] ? (
                      <img src={listing.photos[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlay className="w-6 h-6 text-gray-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <p className="font-black text-sm text-black truncate">
                        {listing.propertyAddress || "Unnamed Listing"}
                      </p>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full flex-shrink-0 ${statusColor[editStatus]}`}>
                        {statusLabel[editStatus]}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        <ImagePlay className="w-3 h-3" /> {photoCount} photo{photoCount !== 1 ? "s" : ""}
                      </span>
                      {listing.updatedAt && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          <Clock className="w-3 h-3" />
                          {new Date(listing.updatedAt.seconds * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {STATUS_OPTIONS.filter((s) => s !== editStatus).map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(listing.id, s)}
                          className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-gray-200 text-gray-400 hover:border-[#0d9488] hover:text-[#0d9488] transition-colors"
                        >
                          → {statusLabel[s]}
                        </button>
                      ))}
                      <a
                        href={`/admin/listing/${listing.id}`}
                        className="ml-auto flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-[#0d9488] transition-colors"
                      >
                        <Eye className="w-3 h-3" /> View
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  Calendar, Clock, MapPin, Camera, Upload, CheckCircle,
  AlertCircle, DollarSign, MessageSquare, ChevronRight, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";

function fmtAddr(a: any): string {
  if (!a) return "—";
  if (typeof a === "string") return a;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (typeof ts === "string" && ts.includes(",")) return ts;
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch { return "—"; }
}
function fmtTime(t: any): string { return t || "TBD"; }
function safe(v: any): string { if (!v) return "—"; if (typeof v === "string") return v; return String(v); }

const STATUS_COLORS: Record<string, string> = {
  assigned: "bg-yellow-100 text-yellow-700",
  scheduled: "bg-green-100 text-green-700",
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-teal-100 text-teal-700",
  uploaded: "bg-purple-100 text-purple-700",
};

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";

export default function AdminPhotographer() {
  const { user, staffProfile } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"today" | "upcoming" | "past" | "uploads" | "revenue">("today");
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedProject, setSelectedProject] = React.useState<string | null>(null);

  // Load assignments from listings where this photographer is assigned
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "listings"), snap => {
      const myId = user?.uid || "";
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter to assignments for this photographer (or show all if admin)
      const mine = staffProfile?.role === "admin"
        ? all
        : all.filter((p: any) => (p.photographerIds || []).includes(myId) || (p.assignedProviders || []).some((ap: any) => ap.providerId === myId));
      setAssignments(mine);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user, staffProfile]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const getApptDate = (a: any): Date | null => {
    if (!a.apptDate) return null;
    if (a.apptDate.toDate) return a.apptDate.toDate();
    try { return new Date(a.apptDate); } catch { return null; }
  };

  const todayJobs = assignments.filter(a => {
    const d = getApptDate(a);
    return d && d >= today && d < tomorrow;
  });
  const upcomingJobs = assignments.filter(a => {
    const d = getApptDate(a);
    return d && d >= tomorrow;
  }).sort((a, b) => (getApptDate(a)?.getTime() || 0) - (getApptDate(b)?.getTime() || 0));
  const pastJobs = assignments.filter(a => {
    const d = getApptDate(a);
    return d && d < today;
  }).sort((a, b) => (getApptDate(b)?.getTime() || 0) - (getApptDate(a)?.getTime() || 0));

  // Upload handler
  const handleUpload = async (projectId: string, files: FileList) => {
    const storage = getStorage();
    setUploading(true);
    const fileArray = Array.from(files);
    let completed = 0;
    for (const file of fileArray) {
      const path = `listings/${projectId}/raw/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on("state_changed",
          (snap) => { setUploadProgress(Math.round(((completed + snap.bytesTransferred / snap.totalBytes) / fileArray.length) * 100)); },
          (err) => { toast.error("Upload failed: " + file.name); reject(err); },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            const listingRef = doc(db, "listings", projectId);
            const snap = await getDocs(collection(db, "listings"));
            const current = snap.docs.find(d => d.id === projectId)?.data()?.images || [];
            await updateDoc(listingRef, {
              images: [...current, { url, name: file.name, path, uploadedAt: new Date().toISOString(), uploadedBy: user?.uid }],
              updatedAt: serverTimestamp(),
            });
            completed++;
            resolve();
          }
        );
      });
    }
    setUploading(false);
    setUploadProgress(0);
    toast.success(fileArray.length + " file(s) uploaded!");
  };

  // Revenue calculation (placeholder rates)
  const payRate = staffProfile?.payRate || 75; // per project default
  const completedCount = pastJobs.filter(j => (j.status || "").includes("completed") || (j.images || []).length > 0).length;
  const pendingPayout = completedCount * payRate;
  const totalEarnings = assignments.length * payRate;

  function JobCard({ job, showUpload }: { job: any; showUpload?: boolean }) {
    const services = (job.services || []).map((s: any) => typeof s === "string" ? s : s.name).join(", ");
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-black text-black">{fmtAddr(job.address || job.shootLocation)}</p>
            <p className="text-xs text-gray-500">{job.clientName || "—"}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${STATUS_COLORS[job.status] || "bg-gray-100 text-gray-500"}`}>
            {(job.status || "assigned").replace(/_/g, " ")}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div><p className={labelCls}>Date</p><p className="text-xs font-bold">{fmtDate(job.apptDate)}</p></div>
          <div><p className={labelCls}>Time</p><p className="text-xs font-bold">{fmtTime(job.apptTime)}</p></div>
          <div><p className={labelCls}>Duration</p><p className="text-xs font-bold">{job.appointmentDuration ? job.appointmentDuration + " min" : "—"}</p></div>
        </div>
        {services && <div className="mb-3"><p className={labelCls}>Services</p><p className="text-xs font-bold">{services}</p></div>}
        {job.accessInfo && <div className="mb-3 p-2 bg-yellow-50 rounded-lg"><p className={labelCls}>Access</p><p className="text-xs font-bold">{job.accessInfo}</p></div>}
        {job.notes && <div className="mb-3"><p className={labelCls}>Notes</p><p className="text-xs text-gray-600">{job.notes}</p></div>}
        <div className="flex gap-2 mt-3">
          <a href={`https://maps.google.com/?q=${encodeURIComponent(fmtAddr(job.address || job.shootLocation))}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0d9488]/10 text-[#0d9488] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0d9488]/20">
            <MapPin className="w-3.5 h-3.5" /> Directions
          </a>
          {showUpload && (
            <button onClick={() => { setSelectedProject(job.id); fileInputRef.current?.click(); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e]">
              <Upload className="w-3.5 h-3.5" /> Upload Photos
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <AdminLayout title="My Jobs">
      <input ref={fileInputRef} type="file" multiple accept="image/*,.raw,.cr2,.nef,.arw,.dng" className="hidden"
        onChange={e => { if (e.target.files && selectedProject) handleUpload(selectedProject, e.target.files); }} />

      {/* Upload progress */}
      {uploading && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm p-3">
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold">Uploading...</p>
              <p className="text-xs font-bold text-[#0d9488]">{uploadProgress}%</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-[#0d9488] h-2 rounded-full transition-all" style={{ width: uploadProgress + "%" }} /></div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black">{todayJobs.length}</p>
          <p className={labelCls}>Today</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black">{upcomingJobs.length}</p>
          <p className={labelCls}>Upcoming</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black">{completedCount}</p>
          <p className={labelCls}>Completed</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black text-[#0d9488]">${pendingPayout}</p>
          <p className={labelCls}>Pending Payout</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 overflow-x-auto">
        {(["today", "upcoming", "past", "uploads", "revenue"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-shrink-0 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}>
            {t === "today" ? "Today's Jobs" : t === "upcoming" ? "Upcoming" : t === "past" ? "Past Jobs" : t === "uploads" ? "Uploads" : "Revenue"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* TODAY */}
          {activeTab === "today" && (
            todayJobs.length === 0 ? (
              <div className="text-center py-20"><Calendar className="w-12 h-12 text-gray-200 mx-auto mb-4" /><p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No jobs today</p></div>
            ) : todayJobs.map(j => <JobCard key={j.id} job={j} showUpload />)
          )}

          {/* UPCOMING */}
          {activeTab === "upcoming" && (
            upcomingJobs.length === 0 ? (
              <div className="text-center py-20"><Calendar className="w-12 h-12 text-gray-200 mx-auto mb-4" /><p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No upcoming jobs</p></div>
            ) : upcomingJobs.map(j => <JobCard key={j.id} job={j} />)
          )}

          {/* PAST */}
          {activeTab === "past" && (
            pastJobs.length === 0 ? (
              <div className="text-center py-20"><Clock className="w-12 h-12 text-gray-200 mx-auto mb-4" /><p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No past jobs</p></div>
            ) : pastJobs.map(j => <JobCard key={j.id} job={j} showUpload />)
          )}

          {/* UPLOADS */}
          {activeTab === "uploads" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 mb-4">Select a project to upload RAW photos. Files will be automatically sorted and sent to the editing pipeline.</p>
              {assignments.filter(a => a.status !== "archived").map(a => (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{fmtAddr(a.address || a.shootLocation)}</p>
                    <p className="text-xs text-gray-400">{fmtDate(a.apptDate)} &middot; {(a.images || []).length} photos uploaded</p>
                  </div>
                  <button onClick={() => { setSelectedProject(a.id); fileInputRef.current?.click(); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e]">
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* REVENUE */}
          {activeTab === "revenue" && (
            <div className="space-y-6">
              <div className="bg-black rounded-2xl p-6 text-white">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Current Pay Period</p>
                <p className="text-3xl font-black text-[#0d9488]">${pendingPayout.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{completedCount} completed projects @ ${payRate}/project</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className={`${labelCls} mb-4`}>Earnings History</h3>
                <div className="space-y-3">
                  {pastJobs.slice(0, 20).map(j => (
                    <div key={j.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-xs font-bold">{fmtAddr(j.address || j.shootLocation)}</p>
                        <p className="text-[10px] text-gray-400">{fmtDate(j.apptDate)}</p>
                      </div>
                      <p className="text-sm font-black">${payRate}</p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 text-center">Note: Pay rates shown are estimates. Actual payouts are calculated by the office based on project scope and completion.</p>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

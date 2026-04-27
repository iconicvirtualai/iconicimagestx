import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Camera, Upload, CheckCircle, Clock, AlertCircle, Eye,
  Download, ArrowRight, RefreshCw, Folder, Image, Zap,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

function fmtAddr(a: any): string {
  if (!a) return "—";
  if (typeof a === "string") return a;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return "—"; }
}

const STAGES = [
  { id: "raw_uploaded", label: "RAW Uploaded", icon: Upload, color: "bg-yellow-100 text-yellow-700" },
  { id: "ai_processing", label: "AI Processing", icon: Zap, color: "bg-blue-100 text-blue-700" },
  { id: "needs_review", label: "Needs Review", icon: Eye, color: "bg-purple-100 text-purple-700" },
  { id: "completed", label: "Completed", icon: CheckCircle, color: "bg-green-100 text-green-700" },
  { id: "delivered", label: "Delivered", icon: ArrowRight, color: "bg-teal-100 text-teal-700" },
];

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";

export default function AdminEditingPipeline() {
  const [projects, setProjects] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeStage, setActiveStage] = React.useState("all");
  const [processing, setProcessing] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "listings"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Only show projects that have images (entered the editing pipeline)
      setProjects(all.filter((p: any) => (p.images || []).length > 0 || p.editingStatus));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const getEditingStage = (p: any): string => {
    if (p.editingStatus) return p.editingStatus;
    if (p.status === "delivered" || p.status === "delivered_paid" || p.status === "delivered_unpaid") return "delivered";
    if (p.status === "in_review") return "completed";
    if ((p.images || []).length > 0 && !p.aiProcessedAt) return "raw_uploaded";
    if (p.aiProcessedAt && !p.reviewedAt) return "needs_review";
    if (p.reviewedAt) return "completed";
    return "raw_uploaded";
  };

  const filteredProjects = activeStage === "all" ? projects : projects.filter(p => getEditingStage(p) === activeStage);

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s.id] = projects.filter(p => getEditingStage(p) === s.id).length;
    return acc;
  }, {} as Record<string, number>);

  // Simulate AI processing (in real implementation, this calls Autoenhance API)
  const handleProcessAI = async (projectId: string) => {
    setProcessing(projectId);
    try {
      await updateDoc(doc(db, "listings", projectId), {
        editingStatus: "ai_processing",
        aiProcessingStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("AI processing started. NORA will handle the rest overnight.");

      // Simulate completion after a delay (real implementation: webhook from Autoenhance)
      setTimeout(async () => {
        try {
          await updateDoc(doc(db, "listings", projectId), {
            editingStatus: "needs_review",
            aiProcessedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (e) { console.error(e); }
      }, 5000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to start processing.");
    } finally {
      setProcessing(null);
    }
  };

  const handleMarkReviewed = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "listings", projectId), {
        editingStatus: "completed",
        reviewedAt: serverTimestamp(),
        reviewedBy: "admin",
        updatedAt: serverTimestamp(),
      });
      toast.success("Marked as reviewed. Ready for delivery.");
    } catch (err) {
      console.error(err);
      toast.error("Failed.");
    }
  };

  const handleMarkDelivered = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "listings", projectId), {
        editingStatus: "delivered",
        status: "delivered_unpaid",
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Marked as delivered.");
    } catch (err) {
      console.error(err);
      toast.error("Failed.");
    }
  };

  return (
    <AdminLayout title="Editing Pipeline">
      <p className="text-xs text-gray-400 mb-6">Manage the photo editing workflow: RAW uploads → AI processing (Autoenhance) → Human review → Delivery</p>

      {/* Stage cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <button onClick={() => setActiveStage("all")}
          className={`rounded-2xl border p-4 text-center transition-all ${activeStage === "all" ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-100 bg-white"}`}>
          <p className="text-2xl font-black">{projects.length}</p>
          <p className={labelCls}>All</p>
        </button>
        {STAGES.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setActiveStage(s.id)}
              className={`rounded-2xl border p-4 text-center transition-all ${activeStage === s.id ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-100 bg-white"}`}>
              <Icon className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-2xl font-black">{stageCounts[s.id] || 0}</p>
              <p className={labelCls}>{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* NORA status bar */}
      <div className="bg-black rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#0d9488] flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></div>
          <div>
            <p className="text-sm font-black text-white">NORA — Night Operations</p>
            <p className="text-[10px] text-gray-500">Autoenhance.ai integration • Processes uploads overnight</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Active</span>
        </div>
      </div>

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20">
          <Image className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No projects in this stage</p>
          <p className="text-xs text-gray-300 mt-2">Photos appear here after photographers upload them</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map(p => {
            const stage = getEditingStage(p);
            const stageInfo = STAGES.find(s => s.id === stage) || STAGES[0];
            const photoCount = (p.images || []).length;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-black text-black">{fmtAddr(p.address || p.shootLocation)}</p>
                    <p className="text-xs text-gray-500">{p.clientName || "—"} • {photoCount} photos</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${stageInfo.color}`}>
                    {stageInfo.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex gap-1 mb-4">
                  {STAGES.map((s, i) => (
                    <div key={s.id} className={`h-1.5 flex-1 rounded-full ${STAGES.indexOf(stageInfo) >= i ? "bg-[#0d9488]" : "bg-gray-100"}`} />
                  ))}
                </div>

                {/* Folder info */}
                <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                  <span className="flex items-center gap-1"><Folder className="w-3 h-3" /> {p.id.substring(0, 8)}</span>
                  {p.aiProcessedAt && <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> AI done {fmtDate(p.aiProcessedAt)}</span>}
                  {p.reviewedAt && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Reviewed {fmtDate(p.reviewedAt)}</span>}
                  {p.deliveredAt && <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Delivered {fmtDate(p.deliveredAt)}</span>}
                </div>

                {/* Actions based on stage */}
                <div className="flex gap-2">
                  {stage === "raw_uploaded" && (
                    <Button onClick={() => handleProcessAI(p.id)} disabled={processing === p.id}
                      className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                      <Zap className="w-3.5 h-3.5 mr-1.5" />{processing === p.id ? "Processing..." : "Run AI Edit"}
                    </Button>
                  )}
                  {stage === "ai_processing" && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-xl">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                      <span className="text-[10px] font-bold text-blue-600">AI Processing...</span>
                    </div>
                  )}
                  {stage === "needs_review" && (
                    <Button onClick={() => handleMarkReviewed(p.id)}
                      className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> Mark Reviewed
                    </Button>
                  )}
                  {stage === "completed" && (
                    <Button onClick={() => handleMarkDelivered(p.id)}
                      className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                      <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Mark Delivered
                    </Button>
                  )}
                  {photoCount > 0 && (
                    <Button variant="outline" className="rounded-xl text-[10px] font-bold">
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download All
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Home, Building2, User, Calendar, Clock, Upload, Download,
  Trash2, Plus, Check, X, Edit3, FileText, History, CreditCard, Lock,
  Video, Smartphone, Layers, Camera, ExternalLink, Copy, MapPin,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { toast } from "sonner";

// ─── Status systems ─────────────────────────────────────────────────────────────
const RE_STATUSES = ["unscheduled", "scheduled", "in_progress", "delivered", "paid", "archived"];
const BIZ_STATUSES = ["unscheduled", "consult_scheduled", "appt_scheduled", "in_progress", "delivered", "paid", "archived"];

const STATUS_LABELS: Record<string, string> = {
  unscheduled:       "Unscheduled",
  scheduled:         "Scheduled",
  in_progress:       "In Progress",
  delivered:         "Delivered",
  paid:              "Paid",
  archived:          "Archived",
  consult_scheduled: "Consult Scheduled",
  appt_scheduled:    "Appt Scheduled",
};

const STATUS_BADGE: Record<string, string> = {
  unscheduled:       "bg-red-100 text-red-700",
  scheduled:         "bg-green-100 text-green-700",
  in_progress:       "bg-blue-100 text-blue-700",
  delivered:         "bg-sky-100 text-sky-700",
  paid:              "bg-teal-100 text-teal-700",
  archived:          "bg-gray-100 text-gray-400",
  consult_scheduled: "bg-orange-100 text-orange-700",
  appt_scheduled:    "bg-green-100 text-green-700",
};

// ─── Tab configs ─────────────────────────────────────────────────────────────────
const RE_TABS  = ["Media", "Video", "Social Media", "3D Content", "Files", "Listing Info", "Audit Log"];
const BIZ_TABS = ["Photos", "Videography", "Branding", "Social Content", "Files", "Project Info", "Audit Log"];

// ─── Helpers ────────────────────────────────────────────────────────────────────
const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";
const labelCls = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1";

function InfoField({ label, value, editing, onChange, type = "text" }: {
  label: string; value: any; editing: boolean; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <p className={labelCls}>{label}</p>
      {editing ? (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} className={inputCls} />
      ) : (
        <p className="text-sm font-bold text-gray-800">{value || "—"}</p>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? "bg-[#0d9488]" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export default function AdminListingFile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState(0);
  const [updating, setUpdating] = React.useState(false);

  // Info editing
  const [editingInfo, setEditingInfo] = React.useState(false);
  const [infoForm, setInfoForm] = React.useState<any>({});

  // Tour URL input
  const [tourInput, setTourInput] = React.useState("");

  // Live listener
  React.useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "listings", id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setProject(data);
        setInfoForm(data);
      } else {
        toast.error("Project not found");
        navigate("/admin/listings");
      }
      setLoading(false);
    }, err => {
      console.error(err);
      toast.error("Failed to load project");
      setLoading(false);
    });
    return () => unsub();
  }, [id, navigate]);

  const patch = async (data: Record<string, any>) => {
    if (!id) return;
    await updateDoc(doc(db, "listings", id), { ...data, updatedAt: serverTimestamp() });
  };

  const updateStatus = async (val: string) => {
    setUpdating(true);
    try { await patch({ status: val }); toast.success(`Status → ${STATUS_LABELS[val] ?? val}`); }
    catch { toast.error("Failed to update status"); }
    finally { setUpdating(false); }
  };

  const saveInfo = async () => {
    setUpdating(true);
    try { await patch(infoForm); toast.success("Saved."); setEditingInfo(false); }
    catch { toast.error("Failed to save."); }
    finally { setUpdating(false); }
  };

  const saveTourUrl = async () => {
    if (!tourInput.trim()) return;
    try { await patch({ tourUrl: tourInput.trim() }); toast.success("3D tour URL saved."); setTourInput(""); }
    catch { toast.error("Failed to save tour URL."); }
  };

  const logAudit = async (action: string) => {
    if (!id) return;
    const entry = { action, by: "admin", at: new Date().toLocaleString() };
    const log = [...(project?.auditLog || []), entry];
    await patch({ auditLog: log });
  };

  if (loading) return (
    <AdminLayout title="Project">
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  );

  if (!project) return null;

  const isRE = project.projectType !== "business";
  const tabs = isRE ? RE_TABS : BIZ_TABS;
  const statuses = isRE ? RE_STATUSES : BIZ_STATUSES;
  const location = project.address || project.shootLocation || "—";
  const badge = STATUS_BADGE[project.status] ?? "bg-gray-100 text-gray-500";
  const badgeLabel = STATUS_LABELS[project.status] ?? project.status ?? "—";
  const images: any[] = project.images || [];

  const fmtDate = (v: any) => {
    if (!v) return "—";
    if (v.toDate) return v.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <AdminLayout title={isRE ? "Real Estate Project" : "Business Project"}>
      {/* Back + badges */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <button
          onClick={() => navigate("/admin/listings")}
          className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Projects
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${isRE ? "bg-[#0d9488]/10 text-[#0d9488]" : "bg-black text-white"}`}>
            {isRE ? <><Home className="w-3 h-3 inline mr-1" />Real Estate</> : <><Building2 className="w-3 h-3 inline mr-1" />Business</>}
          </span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${badge}`}>{badgeLabel}</span>
        </div>
      </div>

      {/* Hero card */}
      <div className="bg-black rounded-[2rem] p-8 text-white mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 font-mono">{project.id}</p>
            <h1 className="text-2xl font-black uppercase tracking-tight mb-1 leading-tight">{location}</h1>
            <p className="text-gray-400 flex items-center gap-1.5 text-sm mb-1">
              <User className="w-3.5 h-3.5 flex-shrink-0" /> {project.clientName || "—"}
            </p>
            {project.clientEmail && <p className="text-gray-500 text-xs">{project.clientEmail}</p>}
            {project.clientPhone && <p className="text-gray-500 text-xs">{project.clientPhone}</p>}
            {project.services && (
              <p className="text-gray-500 text-xs mt-2">{project.services}</p>
            )}
          </div>
          <div className="bg-white/10 rounded-2xl p-5 border border-white/10 space-y-3 min-w-[220px]">
            {project.apptDate && (
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Appointment</p>
                <p className="text-sm font-bold">{fmtDate(project.apptDate)}{project.apptTime ? ` · ${project.apptTime}` : ""}</p>
              </div>
            )}
            {isRE && project.accessInfo && (
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Access</p>
                <p className="text-xs font-bold text-gray-300">{project.accessInfo}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Status</p>
              <select
                value={project.status || "unscheduled"}
                onChange={e => updateStatus(e.target.value)}
                disabled={updating}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-black text-white focus:outline-none disabled:opacity-50"
              >
                {statuses.map(s => <option key={s} value={s} className="text-black bg-white">{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tabs area */}
        <div className="lg:col-span-3">
          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 overflow-x-auto">
            {tabs.map((t, i) => (
              <button key={t} onClick={() => setActiveTab(i)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === i ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
              >{t}</button>
            ))}
          </div>

          {/* Tab body */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7 min-h-[400px]">

            {/* ── MEDIA / PHOTOS (tab 0) ── */}
            {activeTab === 0 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{isRE ? "Media Gallery" : "Photo Gallery"}</h3>
                  <button
                    onClick={() => navigate("/admin/upload")}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e] transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Photos
                  </button>
                </div>
                {images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img: any, i: number) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden relative group bg-gray-100">
                        <img src={img.url} alt={img.name || `Photo ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <a href={img.url} download className="p-2 bg-white rounded-lg"><Download className="w-4 h-4 text-black" /></a>
                          <button
                            onClick={async () => {
                              const updated = images.filter((_: any, idx: number) => idx !== i);
                              await patch({ images: updated });
                              toast.success("Photo removed.");
                            }}
                            className="p-2 bg-white rounded-lg"
                          ><Trash2 className="w-4 h-4 text-red-500" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Camera className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">No photos yet</p>
                    <button
                      onClick={() => navigate("/admin/upload")}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e] transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload Photos
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── VIDEO / VIDEOGRAPHY (tab 1) ── */}
            {activeTab === 1 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{isRE ? "Listing Videos" : "Videography"}</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e] transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Video
                  </button>
                </div>
                {(project.videos || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Video className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No videos yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(project.videos || []).map((v: any, i: number) => (
                      <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                        <Video className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{v.name || `Video ${i + 1}`}</p>
                          {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0d9488] font-bold flex items-center gap-1">View <ExternalLink className="w-3 h-3" /></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── BRANDING / SOCIAL (tab 2) ── */}
            {activeTab === 2 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{isRE ? "Social Media Content" : "Branding Assets"}</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e] transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Content
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  {isRE ? <Smartphone className="w-12 h-12 text-gray-200 mb-4" /> : <Layers className="w-12 h-12 text-gray-200 mb-4" />}
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No content yet</p>
                </div>
              </div>
            )}

            {/* ── 3D CONTENT / SOCIAL CONTENT (tab 3) ── */}
            {activeTab === 3 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{isRE ? "3D Content & Virtual Tours" : "Social Media Content"}</h3>
                </div>
                {isRE ? (
                  project.tourUrl ? (
                    <div className="p-5 bg-gray-50 rounded-2xl flex items-center gap-4 mb-4">
                      <Layers className="w-6 h-6 text-[#0d9488] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold mb-1">3D Tour / Matterport</p>
                        <a href={project.tourUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0d9488] font-bold flex items-center gap-1 break-all">
                          {project.tourUrl} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                      <button onClick={() => patch({ tourUrl: null })} className="p-2 hover:bg-gray-200 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col items-center justify-center py-10 text-center mb-6">
                        <Layers className="w-12 h-12 text-gray-200 mb-4" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">No 3D content yet</p>
                      </div>
                      <div>
                        <label className={labelCls}>Matterport / Tour URL</label>
                        <div className="flex gap-2">
                          <input value={tourInput} onChange={e => setTourInput(e.target.value)} placeholder="https://my.matterport.com/..." className={inputCls} />
                          <button onClick={saveTourUrl} className="px-4 py-2 bg-[#0d9488] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#0f766e] whitespace-nowrap">Save</button>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Smartphone className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No social content yet</p>
                  </div>
                )}
              </div>
            )}

            {/* ── FILES (tab 4) ── */}
            {activeTab === 4 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Files & Documents</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e] transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Upload File
                  </button>
                </div>
                {(project.files || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <FileText className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No files yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(project.files || []).map((f: any, i: number) => (
                      <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <p className="flex-1 text-sm font-bold truncate">{f.name}</p>
                        <a href={f.url} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4 text-[#0d9488]" /></a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── INFO (tab 5) ── */}
            {activeTab === 5 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{isRE ? "Listing Information" : "Project Information"}</h3>
                  <button
                    onClick={() => editingInfo ? saveInfo() : setEditingInfo(true)}
                    disabled={updating}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0f766e] transition-colors disabled:opacity-50"
                  >
                    {editingInfo ? <><Check className="w-3.5 h-3.5" /> Save</> : <><Edit3 className="w-3.5 h-3.5" /> Edit</>}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {isRE ? (<>
                    <InfoField label="Property Address"  value={infoForm.address}      editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, address: v }))} />
                    <InfoField label="List Price"        value={infoForm.listPrice}    editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, listPrice: v }))} />
                    <InfoField label="List Date"         value={infoForm.listDate}     editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, listDate: v }))} type="date" />
                    <InfoField label="MLS #"             value={infoForm.mlsNumber}    editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, mlsNumber: v }))} />
                    <InfoField label="Bedrooms"          value={infoForm.bedrooms}     editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, bedrooms: v }))} />
                    <InfoField label="Bathrooms"         value={infoForm.bathrooms}    editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, bathrooms: v }))} />
                    <InfoField label="Square Feet"       value={infoForm.squareFeet}   editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, squareFeet: v }))} />
                    <InfoField label="Lot Size"          value={infoForm.lotSize}      editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, lotSize: v }))} />
                    <InfoField label="Neighborhood"      value={infoForm.neighborhood} editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, neighborhood: v }))} />
                    <InfoField label="Access Info"       value={infoForm.accessInfo}   editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, accessInfo: v }))} />
                  </>) : (<>
                    <InfoField label="Shoot Location"    value={infoForm.shootLocation} editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, shootLocation: v }))} />
                    <InfoField label="Business Name"     value={infoForm.businessName}  editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, businessName: v }))} />
                    <InfoField label="Industry"          value={infoForm.industry}      editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, industry: v }))} />
                    <InfoField label="Website"           value={infoForm.website}       editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, website: v }))} />
                    <InfoField label="Brand Colors"      value={infoForm.brandColors}   editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, brandColors: v }))} />
                    <InfoField label="Deliverables"      value={infoForm.deliverables}  editing={editingInfo} onChange={v => setInfoForm((f: any) => ({ ...f, deliverables: v }))} />
                  </>)}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Notes</label>
                    {editingInfo ? (
                      <textarea value={infoForm.notes || ""} onChange={e => setInfoForm((f: any) => ({ ...f, notes: e.target.value }))} rows={3} className={`${inputCls} resize-none`} />
                    ) : (
                      <p className="text-sm font-bold text-gray-700">{infoForm.notes || "—"}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── AUDIT LOG (tab 6) ── */}
            {activeTab === 6 && (
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Audit Log</h3>
                {(project.auditLog || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <History className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No activity recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...(project.auditLog || [])].reverse().map((entry: any, i: number) => (
                      <div key={i} className="flex gap-4 p-4 bg-gray-50 rounded-xl">
                        <div className="w-2 h-2 rounded-full bg-[#0d9488] mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-black">{entry.action}</p>
                          <p className="text-[10px] text-gray-400">{entry.by} · {entry.at}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="space-y-6">
          {/* Client */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5">
            <h3 className={`${labelCls} mb-4`}>Client</h3>
            <p className="text-sm font-black text-black mb-1">{project.clientName || "—"}</p>
            {project.clientEmail && <p className="text-xs text-gray-500 mb-1 break-all">{project.clientEmail}</p>}
            {project.clientPhone && <p className="text-xs text-gray-500">{project.clientPhone}</p>}
          </div>

          {/* Security */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5">
            <h3 className={`${labelCls} mb-4 flex items-center gap-2`}><Lock className="w-3.5 h-3.5" /> Security</h3>
            <div className="space-y-3">
              <Toggle label="Lock Downloads"  value={!!project.lockDownloads}  onChange={v => patch({ lockDownloads: v })} />
              <Toggle label="Lock Studio"     value={!!project.lockStudio}     onChange={v => patch({ lockStudio: v })} />
              <Toggle label="Require Payment" value={!!project.requirePayment} onChange={v => patch({ requirePayment: v })} />
              <Toggle label="Social Permission" value={!!project.socialPermission} onChange={v => patch({ socialPermission: v })} />
            </div>
          </div>

          {/* Client Studio link */}
          {project.studioEnabled && (
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5">
              <h3 className={`${labelCls} mb-3`}>Client Studio</h3>
              <p className="text-[10px] text-gray-400 mb-3">Share this link with the client to view their deliverables.</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/studio/${id}`);
                  toast.success("Studio link copied!");
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Studio Link
              </button>
            </div>
          )}

          {/* Invoice */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5">
            <h3 className={`${labelCls} mb-4 flex items-center gap-2`}><CreditCard className="w-3.5 h-3.5" /> Invoice</h3>
            {project.total > 0 ? (
              <div className="mb-3">
                <p className="text-xl font-black text-black">${Number(project.total).toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">{project.invoiceStatus || "Draft"}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">No invoice generated yet.</p>
            )}
            <button className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-colors">
              Manage Invoice
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Edit3, Save, Calendar, DollarSign, Archive,
  X, AlertCircle, User, Phone, Mail, MapPin, Clock, FileText,
  Camera, Check, Home, Building2, Send, Eye, Layers, Plus,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
  collection, addDoc, getDocs,
} from "firebase/firestore";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAddr(addr: any): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  if (addr.formatted) return addr.formatted;
  return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (typeof ts === "string" && ts.includes(",")) return ts; // already formatted like "Tuesday, April 28, 2026"
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); } catch { return String(ts); }
}
function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const labelCls = "block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5";
const valCls = "text-sm font-bold text-white";
const inputCls = "w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#0d9488]/50";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "New Request", color: "bg-yellow-100 text-yellow-700" },
  request: { label: "New Request", color: "bg-yellow-100 text-yellow-700" },
  needs_scheduled: { label: "Needs Scheduled", color: "bg-red-100 text-red-700" },
  scheduled: { label: "Scheduled", color: "bg-green-100 text-green-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  delivered: { label: "Delivered", color: "bg-sky-100 text-sky-700" },
  paid: { label: "Paid", color: "bg-teal-100 text-teal-700" },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-400" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-600" },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminOrderRequest() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);
  const [showSchedule, setShowSchedule] = React.useState(false);
  const [schedDate, setSchedDate] = React.useState("");
  const [schedTime, setSchedTime] = React.useState("");
  const [showCancel, setShowCancel] = React.useState(false);
  const [staff, setStaff] = React.useState<any[]>([]);
  const [selectedProviders, setSelectedProviders] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "orderRequests", id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setOrder(data);
        setForm(data);
        // Pre-fill schedule fields from request
        if (data.appointmentDate) setSchedDate(data.appointmentDate);
        if (data.appointmentTime) setSchedTime(data.appointmentTime);
      } else {
        toast.error("Order not found");
        navigate("/admin/orders");
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id, navigate]);

  React.useEffect(() => {
    getDocs(collection(db, "staff")).then(snap => {
      setStaff(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(), role: data.role, ...data };
      }).filter((s: any) => s.isActive !== false));
    }).catch(() => {});
  }, []);

  // ─── ACTIONS ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updates: any = { ...form, updatedAt: serverTimestamp() };
      delete updates.id;
      await updateDoc(doc(db, "orderRequests", id), updates);
      setEditing(false);
      toast.success("Order updated.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save.");
    } finally { setSaving(false); }
  };

  // CREATE/MANAGE PROJECT — creates a listing tile in Projects
  const handleCreateProject = async () => {
    if (!id || !order) return;
    if (order.listingId) {
      // Already has a project — navigate to it
      navigate(`/admin/listing/${order.listingId}`);
      return;
    }
    setSaving(true);
    try {
      const isRE = (order.specializedPhotography === "mls") ||
        (order.lineItems || []).some((li: any) => {
          const n = (li.name || "").toLowerCase();
          return n.includes("listing") || n.includes("aerial") || n.includes("matterport") || n.includes("3d");
        });

      const listingData: any = {
        projectType: isRE ? "real_estate" : "business",
        orderRequestId: id,
        clientName: order.clientName || `${order.firstName || ""} ${order.lastName || ""}`.trim(),
        clientEmail: order.email || "",
        clientPhone: order.phone || "",
        address: fmtAddr(order.address),
        apptDate: order.appointmentDate ? new Date(order.appointmentDate + "T12:00:00") : null,
        apptTime: order.scheduledTime || order.appointmentTime || null,
        services: (order.lineItems || []).map((li: any) => li.name || String(li)),
        status: order.appointmentDate ? "scheduled" : "unscheduled",
        total: Number(order.total) || Number(order.pricing?.total) || 0,
        images: [],
        studioEnabled: true,
        studioToken: crypto.randomUUID(),
        lockDownloads: true,
        requirePayment: true,
        lockStudio: false,
        socialPermission: false,
        accessInfo: [order.accessMethod, order.lockboxCode].filter(Boolean).join(" - ") || "",
        photographerPreference: order.photographerPreference || null,
        squareFootage: order.squareFootage || null,
        furnishingStatus: order.furnishingStatus || null,
        propertyStatus: order.propertyStatus || null,
        notes: order.vibeNote || order.notes || "",
        assignedProviders: selectedProviders.map(pid => {
          const s = staff.find(st => st.id === pid);
          return { providerId: pid, name: s?.name || pid, role: s?.role || "photographer" };
        }),
        photographerIds: selectedProviders,
        photographerNames: selectedProviders.map(pid => staff.find(st => st.id === pid)?.name || pid),
        invoice: {
          invoiceNumber: `INV-${id.substring(0, 6).toUpperCase()}`,
          status: "draft",
          amountDue: Number(order.total) || 0,
          amountPaid: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "listings"), listingData);
      await updateDoc(doc(db, "orderRequests", id), { listingId: ref.id, updatedAt: serverTimestamp() });
      toast.success("Project created!");
      navigate(`/admin/listing/${ref.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create project.");
    } finally { setSaving(false); }
  };

  // SCHEDULE — just sets a date/time, does NOT create a project
  const handleSchedule = async () => {
    if (!id) return;
    if (!schedDate) { toast.error("Select a date."); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "orderRequests", id), {
        status: "scheduled",
        appointmentDate: schedDate,
        appointmentTime: schedTime || null,
        scheduledDate: fmtDate(schedDate),
        scheduledTime: schedTime || null,
        assignedProviders: selectedProviders.map(pid => {
          const s = staff.find(st => st.id === pid);
          return { providerId: pid, name: s?.name || pid, role: s?.role || "photographer" };
        }),
        updatedAt: serverTimestamp(),
      });
      toast.success("Appointment scheduled.");
      setShowSchedule(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to schedule.");
    } finally { setSaving(false); }
  };

  const handleArchive = async () => {
    if (!id) return;
    await updateDoc(doc(db, "orderRequests", id), { status: "archived", updatedAt: serverTimestamp() });
    toast.success("Archived."); navigate("/admin/orders");
  };

  const handleCancel = async () => {
    if (!id) return;
    await updateDoc(doc(db, "orderRequests", id), { status: "cancelled", updatedAt: serverTimestamp() });
    toast.success("Order cancelled."); setShowCancel(false); navigate("/admin/orders");
  };

  if (loading) return <AdminLayout title="Order Request"><div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div></AdminLayout>;
  if (!order) return null;

  const statusKey = (typeof order.status === "string" ? order.status : "new").toLowerCase().replace(/\s+/g, "_");
  const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.new;
  const lineItems: any[] = order.lineItems || [];
  const orderTotal = Number(order.total) || Number(order.pricing?.total) || 0;
  const subtotal = Number(order.pricing?.subtotal) || orderTotal;
  const promoDiscount = Number(order.promoDiscount) || 0;
  const clientName = order.clientName || `${order.firstName || ""} ${order.lastName || ""}`.trim() || "—";

  return (
    <AdminLayout title="Order Request">
      {/* Back */}
      <button onClick={() => navigate("/admin/orders")} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to Orders
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ LEFT: Main content — black header + detail cards ═══ */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── BLACK HERO HEADER ── */}
          <div className="bg-black rounded-[2rem] p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusInfo.color}`}>{statusInfo.label}</span>
                {order.listingId && (
                  <button onClick={() => navigate(`/admin/listing/${order.listingId}`)} className="px-3 py-1 rounded-full bg-[#0d9488]/20 text-[#0d9488] text-[9px] font-black uppercase tracking-widest hover:bg-[#0d9488]/30">
                    View Project →
                  </button>
                )}
              </div>
              <p className="text-[10px] font-mono text-gray-500">#{(order.id || "").substring(0, 8)}</p>
            </div>

            {/* Client */}
            <h1 className="text-2xl font-black uppercase tracking-tight mb-1">{clientName}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400 mb-6">
              {order.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{order.email}</span>}
              {order.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{order.phone}</span>}
            </div>

            {/* Address + Appointment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className={labelCls}>Address</p>
                <p className={valCls}>{fmtAddr(order.address)}</p>
              </div>
              <div>
                <p className={labelCls}>Requested Date / Time</p>
                <p className={valCls}>{order.scheduledDate || fmtDate(order.appointmentDate || order.requestedDate) || "—"}</p>
                <p className="text-xs text-gray-400">{order.scheduledTime || order.appointmentTime || order.requestedTime || ""}</p>
              </div>
            </div>

            {/* Property details row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              {order.squareFootage && <div><p className={labelCls}>Sq. Ft.</p><p className={valCls}>{order.squareFootage}</p></div>}
              {order.furnishingStatus && <div><p className={labelCls}>Furnishing</p><p className={valCls}>{order.furnishingStatus}</p></div>}
              {order.propertyStatus && <div><p className={labelCls}>Property Status</p><p className={valCls}>{order.propertyStatus}</p></div>}
              {order.specializedPhotography && <div><p className={labelCls}>Photo Type</p><p className={valCls}>{order.specializedPhotography.toUpperCase()}</p></div>}
            </div>

            {/* Access info */}
            {(order.accessMethod || order.lockboxCode) && (
              <div className="mt-6 p-4 bg-white/5 rounded-xl">
                <p className={labelCls}>Access</p>
                <p className="text-sm font-bold text-white">
                  {[order.accessMethod, order.lockboxCode ? `Code: ${order.lockboxCode}` : null].filter(Boolean).join(" • ")}
                </p>
              </div>
            )}

            {/* Photographer preference */}
            {order.photographerPreference && (
              <div className="mt-4">
                <p className={labelCls}>Photographer Preference</p>
                <p className={valCls}>{order.photographerPreference}</p>
              </div>
            )}

            {/* Notes / Vibe */}
            {(order.vibeNote || order.notes) && (
              <div className="mt-4">
                <p className={labelCls}>Client Notes</p>
                <p className="text-sm text-gray-300">{order.vibeNote || order.notes}</p>
              </div>
            )}
          </div>

          {/* ── EDITABLE FIELDS (when Manage Order is active) ── */}
          {editing && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Edit Order Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">First Name</label><input value={form.firstName || ""} onChange={e => setForm((f: any) => ({...f, firstName: e.target.value, clientName: `${e.target.value} ${f.lastName || ""}`.trim()}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Last Name</label><input value={form.lastName || ""} onChange={e => setForm((f: any) => ({...f, lastName: e.target.value, clientName: `${f.firstName || ""} ${e.target.value}`.trim()}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Email</label><input value={form.email || ""} onChange={e => setForm((f: any) => ({...f, email: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Phone</label><input value={form.phone || ""} onChange={e => setForm((f: any) => ({...f, phone: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Address</label><input value={typeof form.address === "string" ? form.address : fmtAddr(form.address)} onChange={e => setForm((f: any) => ({...f, address: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Appt Date</label><input type="date" value={form.appointmentDate || ""} onChange={e => setForm((f: any) => ({...f, appointmentDate: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Appt Time</label><input type="time" value={form.appointmentTime || ""} onChange={e => setForm((f: any) => ({...f, appointmentTime: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Access Method</label><input value={form.accessMethod || ""} onChange={e => setForm((f: any) => ({...f, accessMethod: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Lockbox Code</label><input value={form.lockboxCode || ""} onChange={e => setForm((f: any) => ({...f, lockboxCode: e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Notes</label><textarea value={form.vibeNote || form.notes || ""} onChange={e => setForm((f: any) => ({...f, vibeNote: e.target.value}))} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 resize-none" /></div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving} className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold">
                  <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button onClick={() => { setEditing(false); setForm(order); }} variant="outline" className="rounded-xl text-xs font-bold">Cancel Edit</Button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT SIDEBAR ═══ */}
        <div className="space-y-6">

          {/* ── Order Summary / Billing ── */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Order Summary</h3>

            {/* Services list */}
            {lineItems.length > 0 ? (
              <div className="space-y-2 mb-4">
                {lineItems.map((li: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{li.name || safe(li)}</span>
                    {li.price != null && <span className="font-bold">{fmtCurrency(li.price)}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-4">No services listed.</p>
            )}

            {/* Promo */}
            {order.promoCode && (
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Promo ({order.promoCode})</span>
                <span className="text-green-600 font-bold">-{fmtCurrency(promoDiscount)}</span>
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-gray-100 pt-3 mt-3 space-y-1">
              {subtotal !== orderTotal && (
                <div className="flex justify-between text-sm"><span className="text-gray-400">Subtotal</span><span className="font-bold">{fmtCurrency(subtotal)}</span></div>
              )}
              <div className="flex justify-between text-lg">
                <span className="font-black">Total</span>
                <span className="font-black text-[#0d9488]">{fmtCurrency(orderTotal)}</span>
              </div>
            </div>

            {/* Status + Dates */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 uppercase tracking-widest font-bold">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusInfo.color}`}>{statusInfo.label}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 uppercase tracking-widest font-bold">Requested</span>
                <span className="font-bold">{order.scheduledDate || fmtDate(order.appointmentDate) || "—"}</span>
              </div>
              {order.scheduledTime && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400 uppercase tracking-widest font-bold">Time</span>
                  <span className="font-bold">{order.scheduledTime || order.appointmentTime}</span>
                </div>
              )}
            </div>

            {/* Invoice buttons */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <Button variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                <Eye className="w-3.5 h-3.5 mr-1.5" /> View Invoice
              </Button>
              <Button variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                <Send className="w-3.5 h-3.5 mr-1.5" /> Send Receipt
              </Button>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Actions</h3>
            <div className="space-y-2">
              {/* Create/Manage Project */}
              <Button onClick={order.listingId ? () => navigate(`/admin/listing/${order.listingId}`) : handleCreateProject}
                disabled={saving}
                className="w-full rounded-xl text-xs font-bold justify-center bg-[#0d9488] hover:bg-[#0f766e] text-white">
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                {order.listingId ? "View Project" : "Create Project"}
              </Button>

              {/* Manage Order (edit toggle) */}
              {!editing && (
                <Button onClick={() => setEditing(true)} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Manage Order
                </Button>
              )}

              {/* Schedule */}
              <Button onClick={() => setShowSchedule(true)} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                <Calendar className="w-3.5 h-3.5 mr-1.5" /> Schedule
              </Button>

              {/* Archive */}
              {statusKey !== "archived" && statusKey !== "cancelled" && (
                <Button onClick={handleArchive} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                  <Archive className="w-3.5 h-3.5 mr-1.5" /> Archive
                </Button>
              )}

              {/* Cancel */}
              {statusKey !== "cancelled" && (
                <Button onClick={() => setShowCancel(true)} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center text-red-500 border-red-200 hover:bg-red-50">
                  <X className="w-3.5 h-3.5 mr-1.5" /> Cancel Order
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── SCHEDULE POPUP ─── */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-black mb-2">Schedule Appointment</h3>
            <p className="text-xs text-gray-500 mb-6">Set a date and time for this appointment. This does not create a project.</p>
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Date *</label><input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Time</label><input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30" /></div>
              </div>
              {staff.filter(s => ["photographer", "admin", "coordinator"].includes(s.role)).length > 0 && (
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Assign Provider(s)</label>
                  <div className="flex flex-wrap gap-2">
                    {staff.filter(s => ["photographer", "admin", "coordinator"].includes(s.role)).map(s => {
                      const sel = selectedProviders.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => setSelectedProviders(sel ? selectedProviders.filter(p => p !== s.id) : [...selectedProviders, s.id])}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sel ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowSchedule(false)} variant="outline" className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSchedule} disabled={saving || !schedDate} className="flex-1 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold">
                {saving ? "Scheduling..." : "Confirm Schedule"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CANCEL POPUP ─── */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-black mb-2">Cancel This Order?</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to cancel this order? This cannot be undone.</p>
            <div className="flex gap-3">
              <Button onClick={() => setShowCancel(false)} variant="outline" className="flex-1 rounded-xl">Keep Order</Button>
              <Button onClick={handleCancel} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold">Yes, Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

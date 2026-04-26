import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Edit3, Save, Calendar, DollarSign, Archive,
  X, AlertCircle, User, Phone, Mail, MapPin, Clock, FileText,
  Camera, Check, Plus, Send, Printer, Home, Building2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
  collection, addDoc, getDocs,
} from "firebase/firestore";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAddress(addr: any): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  if (addr.formatted) return addr.formatted;
  return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ") || "—";
}

function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); } catch { return "—"; }
}

function fmtCurrency(n: number): string {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function safeStr(v: any): string {
  if (!v) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  request: { label: "New Request", color: "bg-yellow-100 text-yellow-700" },
  new: { label: "New Request", color: "bg-yellow-100 text-yellow-700" },
  needs_scheduled: { label: "Needs Scheduled", color: "bg-red-100 text-red-700" },
  scheduled: { label: "Scheduled", color: "bg-green-100 text-green-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  pending_edit: { label: "Pending Edit", color: "bg-purple-100 text-purple-700" },
  in_review: { label: "In Review", color: "bg-indigo-100 text-indigo-700" },
  delivered_unpaid: { label: "Delivered - Unpaid", color: "bg-orange-100 text-orange-700" },
  delivered_paid: { label: "Delivered - Paid", color: "bg-teal-100 text-teal-700" },
  delivered: { label: "Delivered", color: "bg-sky-100 text-sky-700" },
  paid: { label: "Paid", color: "bg-teal-100 text-teal-700" },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-400" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-600" },
};

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";
const labelCls = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1";

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminOrderRequest() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  // Edit mode
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);

  // Schedule modal
  const [showSchedule, setShowSchedule] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState("");
  const [scheduleTime, setScheduleTime] = React.useState("");

  // Staff for assignment
  const [staff, setStaff] = React.useState<any[]>([]);
  const [selectedProviders, setSelectedProviders] = React.useState<string[]>([]);

  // Cancel modal
  const [showCancel, setShowCancel] = React.useState(false);

  // Active tab
  const [activeTab, setActiveTab] = React.useState<"details" | "invoice" | "history">("details");

  // Load order
  React.useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "orderRequests", id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setOrder(data);
        setForm(data);
      } else {
        toast.error("Order not found");
        navigate("/admin/orders");
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id, navigate]);

  // Load staff
  React.useEffect(() => {
    getDocs(collection(db, "staff")).then(snap => {
      setStaff(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(), role: data.role, ...data };
      }).filter((s: any) => s.isActive !== false));
    }).catch(() => {});
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────

  // MANAGE ORDER — save edits to Firestore
  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "orderRequests", id), {
        clientName: form.clientName || form.customerName,
        customerName: form.clientName || form.customerName,
        clientEmail: form.clientEmail || form.email,
        clientPhone: form.clientPhone || form.phone,
        address: form.address,
        requestedDate: form.requestedDate || form.preferredDate,
        requestedTime: form.requestedTime || form.preferredTime,
        notes: form.notes,
        accessInstructions: form.accessInstructions,
        services: form.services,
        total: form.total,
        internalNotes: form.internalNotes,
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
      toast.success("Order updated.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // SCHEDULE — creates a project in listings AND updates orderRequest status
  const handleSchedule = async () => {
    if (!id || !order) return;
    if (!scheduleDate) { toast.error("Select a date."); return; }

    setSaving(true);
    try {
      const clientName = safeStr(order.clientName || order.customerName || order.name);
      const addr = order.address;
      const formattedAddr = fmtAddress(addr);
      const isRE = (order.type === "real_estate") ||
        (typeof order.services === "object" && !Array.isArray(order.services) ? false :
          (order.services || []).some((s: any) => {
            const name = typeof s === "string" ? s : s?.name || "";
            return name.toLowerCase().includes("listing") || name.toLowerCase().includes("aerial") || name.toLowerCase().includes("3d");
          }));

      // Create project tile in listings collection
      const listingData: any = {
        projectType: isRE ? "real_estate" : "business",
        orderRequestId: id,
        clientName,
        clientEmail: order.clientEmail || order.email || "",
        clientPhone: order.clientPhone || order.phone || "",
        address: formattedAddr,
        shootLocation: !isRE ? formattedAddr : undefined,
        apptDate: new Date(scheduleDate + "T12:00:00"),
        apptTime: scheduleTime || null,
        services: Array.isArray(order.services)
          ? order.services.map((s: any) => typeof s === "string" ? s : s.name)
          : order.services ? [String(order.services)] : [],
        status: "scheduled",
        total: Number(order.total) || Number(order.amount) || 0,
        images: [],
        studioEnabled: true,
        studioToken: crypto.randomUUID(),
        // Security defaults
        lockDownloads: true,
        lockStudio: false,
        requirePayment: true,
        socialPermission: false,
        // Providers
        assignedProviders: selectedProviders.map(pid => {
          const s = staff.find(st => st.id === pid);
          return { providerId: pid, name: s?.name || pid, role: s?.role || "photographer" };
        }),
        photographerIds: selectedProviders,
        photographerNames: selectedProviders.map(pid => staff.find(st => st.id === pid)?.name || pid),
        // Invoice
        invoice: {
          invoiceNumber: (order.orderNumber || id).replace("ORD", "INV"),
          status: "draft",
          amountDue: Number(order.total) || Number(order.amount) || 0,
          amountPaid: 0,
        },
        notes: order.notes || "",
        accessInfo: order.accessInstructions || "",
        internalNotes: order.internalNotes || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const listingRef = await addDoc(collection(db, "listings"), listingData);

      // Update the orderRequest to mark as scheduled + link to listing
      await updateDoc(doc(db, "orderRequests", id), {
        status: "scheduled",
        listingId: listingRef.id,
        appointmentDate: scheduleDate,
        appointmentTime: scheduleTime || null,
        assignedProviders: listingData.assignedProviders,
        updatedAt: serverTimestamp(),
      });

      toast.success("Scheduled! Project created in Projects tab.");
      setShowSchedule(false);
      navigate(`/admin/listing/${listingRef.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to schedule.");
    } finally {
      setSaving(false);
    }
  };

  // ARCHIVE
  const handleArchive = async () => {
    if (!id) return;
    await updateDoc(doc(db, "orderRequests", id), { status: "archived", updatedAt: serverTimestamp() });
    toast.success("Order archived.");
    navigate("/admin/orders");
  };

  // CANCEL
  const handleCancel = async () => {
    if (!id) return;
    await updateDoc(doc(db, "orderRequests", id), { status: "cancelled", updatedAt: serverTimestamp() });
    toast.success("Order cancelled.");
    setShowCancel(false);
    navigate("/admin/orders");
  };

  if (loading) return (
    <AdminLayout title="Order Request">
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  );
  if (!order) return null;

  const statusKey = (typeof order.status === "string" ? order.status : "request").toLowerCase().replace(/\s+/g, "_");
  const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.request;
  const clientName = safeStr(order.clientName || order.customerName || order.name);
  const clientEmail = safeStr(order.clientEmail || order.email);
  const clientPhone = safeStr(order.clientPhone || order.phone);
  const addr = fmtAddress(order.address || order.shootLocation || order.location);
  const svcList = Array.isArray(order.services) ? order.services : (order.services ? [order.services] : []);
  const orderTotal = Number(order.total) || Number(order.amount) || 0;
  const invoice = order.invoice || {};

  return (
    <AdminLayout title={`Order ${order.orderNumber || "#" + (order.id || "").substring(0, 6)}`}>
      {/* Back + Status */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <button onClick={() => navigate("/admin/orders")} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest">
          <ChevronLeft className="w-4 h-4" /> Orders
        </button>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusInfo.color}`}>{statusInfo.label}</span>
          {order.listingId && (
            <button onClick={() => navigate(`/admin/listing/${order.listingId}`)} className="px-3 py-1.5 rounded-full bg-[#0d9488]/10 text-[#0d9488] text-[9px] font-black uppercase tracking-widest hover:bg-[#0d9488]/20">
              View Project →
            </button>
          )}
        </div>
      </div>

      {/* ─── ACTION BUTTONS ─── */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={() => editing ? handleSave() : setEditing(true)} disabled={saving}
          className={`rounded-xl text-xs font-bold ${editing ? "bg-[#0d9488] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
          {editing ? <><Save className="w-3.5 h-3.5 mr-1.5" /> Save Changes</> : <><Edit3 className="w-3.5 h-3.5 mr-1.5" /> Manage Order</>}
        </Button>

        {!order.listingId && statusKey !== "scheduled" && statusKey !== "cancelled" && statusKey !== "archived" && (
          <Button onClick={() => setShowSchedule(true)} className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white">
            <Calendar className="w-3.5 h-3.5 mr-1.5" /> Schedule
          </Button>
        )}

        <Button variant="outline" className="rounded-xl text-xs font-bold" onClick={() => setActiveTab("invoice")}>
          <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Create Invoice
        </Button>

        {statusKey !== "archived" && statusKey !== "cancelled" && (
          <Button onClick={handleArchive} variant="outline" className="rounded-xl text-xs font-bold">
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Archive
          </Button>
        )}

        {statusKey !== "cancelled" && (
          <Button onClick={() => setShowCancel(true)} variant="outline" className="rounded-xl text-xs font-bold text-red-500 border-red-200 hover:bg-red-50">
            <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6">
        {(["details", "invoice", "history"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ─── DETAILS TAB ─── */}
      {activeTab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Client info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Client Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  {editing ? <input value={form.clientName || form.customerName || form.name || ""} onChange={e => setForm((f: any) => ({...f, clientName: e.target.value, customerName: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{clientName}</p>}
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  {editing ? <input value={form.clientEmail || form.email || ""} onChange={e => setForm((f: any) => ({...f, clientEmail: e.target.value, email: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{clientEmail}</p>}
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  {editing ? <input value={form.clientPhone || form.phone || ""} onChange={e => setForm((f: any) => ({...f, clientPhone: e.target.value, phone: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{clientPhone}</p>}
                </div>
                <div>
                  <label className={labelCls}>Order Type</label>
                  <p className="text-sm font-bold capitalize">{safeStr(order.type || order.projectType).replace(/_/g, " ")}</p>
                </div>
              </div>
            </div>

            {/* Address & Appointment */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Location & Appointment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Address</label>
                  {editing ? (
                    <input value={typeof form.address === "string" ? form.address : fmtAddress(form.address)} onChange={e => setForm((f: any) => ({...f, address: e.target.value}))} className={inputCls} />
                  ) : <p className="text-sm font-bold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{addr}</p>}
                </div>
                <div>
                  <label className={labelCls}>Requested Date</label>
                  {editing ? <input type="date" value={form.requestedDate || form.preferredDate || ""} onChange={e => setForm((f: any) => ({...f, requestedDate: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{fmtDate(order.requestedDate || order.preferredDate || order.appointmentDate || order.date)}</p>}
                </div>
                <div>
                  <label className={labelCls}>Requested Time</label>
                  {editing ? <input type="time" value={form.requestedTime || form.preferredTime || ""} onChange={e => setForm((f: any) => ({...f, requestedTime: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{order.requestedTime || order.preferredTime || order.appointmentTime || "—"}</p>}
                </div>
                <div>
                  <label className={labelCls}>Access Instructions</label>
                  {editing ? <input value={form.accessInstructions || ""} onChange={e => setForm((f: any) => ({...f, accessInstructions: e.target.value}))} className={inputCls} placeholder="Lockbox, gate code..." />
                    : <p className="text-sm font-bold">{order.accessInstructions || "—"}</p>}
                </div>
                <div>
                  <label className={labelCls}>Notes from Client</label>
                  {editing ? <input value={form.notes || ""} onChange={e => setForm((f: any) => ({...f, notes: e.target.value}))} className={inputCls} />
                    : <p className="text-sm text-gray-600">{order.notes || "—"}</p>}
                </div>
              </div>
            </div>

            {/* Services & Pricing */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Services & Pricing</h3>
              {svcList.length > 0 ? (
                <div>
                  {svcList.map((s: any, i: number) => {
                    const name = typeof s === "string" ? s : (s.name || s.label || JSON.stringify(s));
                    const price = typeof s === "object" ? s.price : null;
                    return (
                      <div key={i} className={`flex justify-between py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                        <p className="text-sm font-bold">{name}</p>
                        {price != null && <p className="text-sm font-black">{fmtCurrency(price * (s.qty || 1))}</p>}
                      </div>
                    );
                  })}
                  {orderTotal > 0 && (
                    <div className="border-t-2 border-gray-200 mt-3 pt-3 flex justify-between">
                      <span className="text-lg font-black">Total</span>
                      <span className="text-lg font-black text-[#0d9488]">{fmtCurrency(orderTotal)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No services listed.</p>
              )}
            </div>

            {/* Internal notes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-3`}>Internal Notes (admin only)</h3>
              {editing ? <textarea value={form.internalNotes || ""} onChange={e => setForm((f: any) => ({...f, internalNotes: e.target.value}))} rows={3} className={`${inputCls} resize-none`} placeholder="Private notes..." />
                : <p className="text-sm text-gray-600">{order.internalNotes || "None."}</p>}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick summary card */}
            <div className="bg-black text-white rounded-2xl p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Order Summary</p>
              <p className="text-2xl font-black mb-1">{fmtCurrency(orderTotal)}</p>
              <p className="text-xs text-gray-400 mb-4">{svcList.length} service(s)</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-bold">{statusInfo.label}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="font-bold">{fmtDate(order.createdAt || order.date)}</span></div>
                {order.listingId && <div className="flex justify-between"><span className="text-gray-500">Project</span><span className="font-bold text-[#0d9488]">Created</span></div>}
              </div>
            </div>

            {/* Assigned providers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className={`${labelCls} mb-3`}>Assigned Providers</h3>
              {(order.assignedProviders || []).length > 0 ? (
                <div className="space-y-2">
                  {order.assignedProviders.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <Camera className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-bold">{p.name || p.providerId}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Not assigned yet. Use Schedule to assign.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── INVOICE TAB ─── */}
      {activeTab === "invoice" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-2xl">
          <div className="flex justify-between mb-8">
            <div>
              <h2 className="text-xl font-black">INVOICE</h2>
              <p className="text-sm text-gray-400">{invoice.invoiceNumber || order.orderNumber || order.id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">Iconic Images Photography, LLC</p>
              <p className="text-xs text-gray-400">cadi@iconicimagestx.com</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className={labelCls}>Bill To</p>
              <p className="text-sm font-bold">{clientName}</p>
              <p className="text-xs text-gray-500">{clientEmail}</p>
              <p className="text-xs text-gray-500">{clientPhone}</p>
            </div>
            <div className="text-right">
              <p className={labelCls}>Order Date</p>
              <p className="text-sm font-bold">{fmtDate(order.createdAt || order.date)}</p>
            </div>
          </div>
          <table className="w-full mb-8">
            <thead><tr className="border-b-2 border-gray-200">
              <th className="text-left text-[10px] font-black text-gray-400 uppercase pb-2">Service</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase pb-2">Qty</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase pb-2">Price</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase pb-2">Total</th>
            </tr></thead>
            <tbody>
              {svcList.map((s: any, i: number) => {
                const name = typeof s === "string" ? s : (s.name || "Service");
                const price = typeof s === "object" ? (s.price || 0) : 0;
                const qty = typeof s === "object" ? (s.qty || 1) : 1;
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 text-sm font-bold">{name}</td>
                    <td className="py-3 text-sm text-right">{qty}</td>
                    <td className="py-3 text-sm text-right">{fmtCurrency(price)}</td>
                    <td className="py-3 text-sm text-right font-bold">{fmtCurrency(price * qty)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-400">Subtotal</span><span className="font-bold">{fmtCurrency(order.subtotal || orderTotal)}</span></div>
              {order.tax > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">Tax</span><span>{fmtCurrency(order.tax)}</span></div>}
              <div className="flex justify-between border-t-2 pt-2"><span className="text-lg font-black">Total</span><span className="text-lg font-black">{fmtCurrency(orderTotal)}</span></div>
              <div className="flex justify-between"><span className="text-sm font-bold">Amount Due</span><span className="text-sm font-black text-[#0d9488]">{fmtCurrency(orderTotal - (invoice.amountPaid || 0))}</span></div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button className="rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white text-xs font-bold"><Send className="w-3.5 h-3.5 mr-1.5" /> Send Invoice</Button>
            <Button variant="outline" className="rounded-xl text-xs font-bold"><Printer className="w-3.5 h-3.5 mr-1.5" /> Print</Button>
          </div>
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {activeTab === "history" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className={`${labelCls} mb-4`}>Order History</h3>
          {(order.history || []).length > 0 ? (
            <div className="space-y-3">
              {[...(order.history || [])].reverse().map((h: any, i: number) => (
                <div key={i} className="flex gap-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-[#0d9488] mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold">{h.action}</p>
                    <p className="text-[10px] text-gray-400">{h.by} &middot; {h.at}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No history yet.</p>}
        </div>
      )}

      {/* ─── SCHEDULE MODAL ─── */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-black mb-4">Schedule Appointment</h3>
            <p className="text-xs text-gray-500 mb-6">This will create a project in the Projects tab and assign the selected service providers.</p>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Date *</label><input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Time</label><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className={inputCls} /></div>
              </div>

              <div>
                <label className={labelCls}>Assign Service Providers</label>
                {staff.filter(s => ["photographer", "admin", "coordinator"].includes(s.role)).length > 0 ? (
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
                ) : <p className="text-xs text-gray-400">No staff found. Add team members in Team settings.</p>}
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => setShowSchedule(false)} variant="outline" className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSchedule} disabled={saving || !scheduleDate} className="flex-1 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold">
                {saving ? "Scheduling..." : "Schedule & Create Project"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CANCEL MODAL ─── */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-black mb-2">Cancel This Order?</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to cancel? This cannot be undone.</p>
            <div className="flex gap-3">
              <Button onClick={() => setShowCancel(false)} variant="outline" className="flex-1 rounded-xl">Keep Order</Button>
              <Button onClick={handleCancel} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold">Yes, Cancel Order</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
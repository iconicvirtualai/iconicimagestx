import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Edit3, Check, X, Calendar, Clock, MapPin, User,
  Phone, Mail, DollarSign, FileText, Archive, Trash2, Send,
  Camera, AlertCircle, Plus, Minus, Save, Printer, ExternalLink,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";

// ─── Status system ────────────────────────────────────────────────────────────
const ORDER_STATUSES = [
  { value: "request", label: "Request", color: "bg-yellow-100 text-yellow-700" },
  { value: "scheduled", label: "Scheduled", color: "bg-green-100 text-green-700" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "pending_edit", label: "Pending Edit", color: "bg-purple-100 text-purple-700" },
  { value: "in_review", label: "In Review", color: "bg-indigo-100 text-indigo-700" },
  { value: "delivered_unpaid", label: "Delivered - Unpaid", color: "bg-orange-100 text-orange-700" },
  { value: "delivered_paid", label: "Delivered - Paid", color: "bg-teal-100 text-teal-700" },
  { value: "archived", label: "Archived", color: "bg-gray-100 text-gray-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-600" },
];

function getStatusBadge(status: string) {
  return ORDER_STATUSES.find(s => s.value === status) || { value: status, label: status, color: "bg-gray-100 text-gray-500" };
}

function fmtAddress(addr: any): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  if (addr.formatted) return addr.formatted;
  const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtCurrency(n: number): string {
  return `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";
const labelCls = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1";

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);
  const [showCancel, setShowCancel] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"details"|"invoice"|"gallery"|"history">("details");

  // Staff for assignment
  const [staff, setStaff] = React.useState<any[]>([]);
  const [services, setServices] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (!id) return;
    // Try orders collection first, then orderRequests for backward compat
    const unsub = onSnapshot(doc(db, "orders", id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setOrder(data);
        setEditForm(data);
        setLoading(false);
      } else {
        // Fallback to orderRequests
        const unsub2 = onSnapshot(doc(db, "orderRequests", id), snap2 => {
          if (snap2.exists()) {
            setOrder({ id: snap2.id, ...snap2.data() });
            setEditForm({ id: snap2.id, ...snap2.data() });
          } else {
            toast.error("Order not found");
            navigate("/admin/orders");
          }
          setLoading(false);
        });
        return () => unsub2();
      }
    });
    return () => unsub();
  }, [id, navigate]);

  React.useEffect(() => {
    getDocs(collection(db, "staff")).then(snap => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.isActive !== false));
    }).catch(() => {});
    getDocs(collection(db, "services")).then(snap => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => {});
  }, []);

  const patch = async (data: Record<string, any>, historyAction?: string) => {
    if (!id || !order) return;
    const col = order._collection || "orders";
    const updates: any = { ...data, updatedAt: serverTimestamp() };
    if (historyAction) {
      updates.history = [...(order.history || []), {
        action: historyAction,
        by: "admin",
        at: new Date().toISOString(),
        details: "",
      }];
    }
    await updateDoc(doc(db, "orders", id), updates);
    toast.success("Updated.");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {};
      // Client info
      if (editForm.clientName !== order.clientName) updates.clientName = editForm.clientName;
      if (editForm.clientEmail !== order.clientEmail) updates.clientEmail = editForm.clientEmail;
      if (editForm.clientPhone !== order.clientPhone) updates.clientPhone = editForm.clientPhone;
      // Address
      if (editForm.address?.street !== order.address?.street ||
          editForm.address?.city !== order.address?.city) {
        updates.address = editForm.address;
      }
      // Appointment
      if (editForm.appointmentDate !== order.appointmentDate) updates.appointmentDate = editForm.appointmentDate;
      if (editForm.appointmentTime !== order.appointmentTime) updates.appointmentTime = editForm.appointmentTime;
      if (editForm.appointmentNotes !== order.appointmentNotes) updates.appointmentNotes = editForm.appointmentNotes;
      if (editForm.accessInstructions !== order.accessInstructions) updates.accessInstructions = editForm.accessInstructions;
      if (editForm.internalNotes !== order.internalNotes) updates.internalNotes = editForm.internalNotes;

      if (Object.keys(updates).length > 0) {
        await patch(updates, "Order details updated by admin");
      }
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!editForm.appointmentDate) {
      toast.error("Set an appointment date first.");
      return;
    }
    await patch({
      status: "scheduled",
      appointmentDate: editForm.appointmentDate,
      appointmentTime: editForm.appointmentTime || null,
    }, "Order scheduled");
  };

  const handleCancel = async () => {
    await patch({ status: "cancelled" }, "Order cancelled by admin");
    setShowCancel(false);
    toast.success("Order cancelled.");
  };

  const handleArchive = async () => {
    // Check all deliverables are complete
    const pending = (order.deliverables || []).filter((d: any) => d.status !== "delivered");
    if (pending.length > 0) {
      toast.error(`Cannot archive: ${pending.length} deliverable(s) still pending.`);
      return;
    }
    await patch({ status: "archived", archivedAt: serverTimestamp() }, "Order archived");
  };

  if (loading) return (
    <AdminLayout title="Order"><div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div></AdminLayout>
  );
  if (!order) return null;

  const statusBadge = getStatusBadge(order.status || "request");
  const addr = fmtAddress(order.address);
  const svcList = order.services || [];
  const invoice = order.invoice || {};

  return (
    <AdminLayout title={`Order ${order.orderNumber || order.id?.substring(0,8)}`}>
      {/* Back + Status */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <button onClick={() => navigate("/admin/orders")} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest">
          <ChevronLeft className="w-4 h-4" /> Orders
        </button>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusBadge.color}`}>{statusBadge.label}</span>
          <span className="text-[10px] font-mono text-gray-400">{order.orderNumber || order.id}</span>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={() => editing ? handleSave() : setEditing(true)} disabled={saving}
          className={`rounded-xl text-xs font-bold ${editing ? "bg-[#0d9488] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
          {editing ? <><Save className="w-3.5 h-3.5 mr-1.5" /> Save Changes</> : <><Edit3 className="w-3.5 h-3.5 mr-1.5" /> Manage Order</>}
        </Button>
        {order.status === "request" && (
          <Button onClick={handleSchedule} className="rounded-xl text-xs font-bold bg-green-600 hover:bg-green-700 text-white">
            <Calendar className="w-3.5 h-3.5 mr-1.5" /> Schedule
          </Button>
        )}
        <Button onClick={() => setActiveTab("invoice")} variant="outline" className="rounded-xl text-xs font-bold">
          <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Invoice
        </Button>
        {order.status !== "archived" && order.status !== "cancelled" && (
          <Button onClick={handleArchive} variant="outline" className="rounded-xl text-xs font-bold">
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Archive
          </Button>
        )}
        <Button onClick={() => setShowCancel(true)} variant="outline" className="rounded-xl text-xs font-bold text-red-500 border-red-200 hover:bg-red-50">
          <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6">
        {(["details","invoice","gallery","history"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
          >{t}</button>
        ))}
      </div>

      {/* ─── DETAILS TAB ─── */}
      {activeTab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Client */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Client Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  {editing ? <input value={editForm.clientName || ""} onChange={e => setEditForm((f: any) => ({...f, clientName: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{order.clientName || "—"}</p>}
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  {editing ? <input value={editForm.clientEmail || ""} onChange={e => setEditForm((f: any) => ({...f, clientEmail: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{order.clientEmail || "—"}</p>}
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  {editing ? <input value={editForm.clientPhone || ""} onChange={e => setEditForm((f: any) => ({...f, clientPhone: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{order.clientPhone || "—"}</p>}
                </div>
                <div>
                  <label className={labelCls}>Type</label>
                  <p className="text-sm font-bold capitalize">{(order.type || "").replace(/_/g, " ")}</p>
                </div>
              </div>
            </div>

            {/* Appointment */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Appointment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Address</label>
                  {editing ? (
                    <div className="space-y-2">
                      <input value={editForm.address?.street || ""} onChange={e => setEditForm((f: any) => ({...f, address: {...(f.address||{}), street: e.target.value}}))} placeholder="Street" className={inputCls} />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={editForm.address?.city || ""} onChange={e => setEditForm((f: any) => ({...f, address: {...(f.address||{}), city: e.target.value}}))} placeholder="City" className={inputCls} />
                        <input value={editForm.address?.state || ""} onChange={e => setEditForm((f: any) => ({...f, address: {...(f.address||{}), state: e.target.value}}))} placeholder="ST" className={inputCls} />
                        <input value={editForm.address?.zip || ""} onChange={e => setEditForm((f: any) => ({...f, address: {...(f.address||{}), zip: e.target.value}}))} placeholder="Zip" className={inputCls} />
                      </div>
                    </div>
                  ) : <p className="text-sm font-bold">{addr}</p>}
                </div>
                <div>
                  <label className={labelCls}>Date & Time</label>
                  {editing ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={editForm.appointmentDate || editForm.requestedDate || ""} onChange={e => setEditForm((f: any) => ({...f, appointmentDate: e.target.value}))} className={inputCls} />
                      <input type="time" value={editForm.appointmentTime || editForm.requestedTime || ""} onChange={e => setEditForm((f: any) => ({...f, appointmentTime: e.target.value}))} className={inputCls} />
                    </div>
                  ) : (
                    <p className="text-sm font-bold">
                      {fmtDate(order.appointmentDate || order.requestedDate)}
                      {(order.appointmentTime || order.requestedTime) && ` at ${order.appointmentTime || order.requestedTime}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Duration</label>
                  <p className="text-sm font-bold">{order.appointmentDuration ? `${order.appointmentDuration} min` : "—"}</p>
                </div>
                <div>
                  <label className={labelCls}>Access Instructions</label>
                  {editing ? <input value={editForm.accessInstructions || ""} onChange={e => setEditForm((f: any) => ({...f, accessInstructions: e.target.value}))} className={inputCls} />
                    : <p className="text-sm font-bold">{order.accessInstructions || "—"}</p>}
                </div>
              </div>
              {(order.appointmentNotes || order.notes) && (
                <div className="mt-4">
                  <label className={labelCls}>Notes</label>
                  {editing ? <textarea value={editForm.appointmentNotes || editForm.notes || ""} onChange={e => setEditForm((f: any) => ({...f, appointmentNotes: e.target.value}))} rows={2} className={`${inputCls} resize-none`} />
                    : <p className="text-sm text-gray-600">{order.appointmentNotes || order.notes}</p>}
                </div>
              )}
            </div>

            {/* Services */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Services & Pricing</h3>
              {svcList.length > 0 ? (
                <div>
                  {svcList.map((s: any, i: number) => (
                    <div key={i} className={`flex justify-between py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                      <div>
                        <p className="text-sm font-bold">{typeof s === "string" ? s : s.name}</p>
                        {s.duration > 0 && <p className="text-[10px] text-gray-400">{s.duration} min</p>}
                      </div>
                      <p className="text-sm font-black">{s.price ? fmtCurrency(s.price * (s.qty || 1)) : ""}</p>
                    </div>
                  ))}
                  <div className="border-t-2 border-gray-200 mt-2 pt-3 space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Subtotal</span><span className="font-bold">{fmtCurrency(order.subtotal || 0)}</span></div>
                    {order.tax > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">Tax</span><span>{fmtCurrency(order.tax)}</span></div>}
                    {order.discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">Discount</span><span className="text-green-600">-{fmtCurrency(order.discount)}</span></div>}
                    <div className="flex justify-between text-lg mt-1"><span className="font-black">Total</span><span className="font-black text-[#0d9488]">{fmtCurrency(order.total || 0)}</span></div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No services listed. Use Manage Order to add services.</p>
              )}
            </div>

            {/* Internal notes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Internal Notes</h3>
              {editing ? <textarea value={editForm.internalNotes || ""} onChange={e => setEditForm((f: any) => ({...f, internalNotes: e.target.value}))} rows={3} placeholder="Notes visible only to admin..." className={`${inputCls} resize-none`} />
                : <p className="text-sm text-gray-600">{order.internalNotes || "No internal notes."}</p>}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Assigned providers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className={`${labelCls} mb-4`}>Assigned Service Providers</h3>
              {(order.assignedProviders || []).length > 0 ? (
                <div className="space-y-2">
                  {order.assignedProviders.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                      <Camera className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-bold">{p.name}</p>
                        <p className="text-[10px] text-gray-400 capitalize">{p.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 mb-3">No providers assigned yet.</p>
                  {editing && staff.length > 0 && (
                    <div className="space-y-1">
                      {staff.filter(s => ["photographer","admin","coordinator"].includes(s.role)).map(s => (
                        <button key={s.id} onClick={() => {
                          const current = editForm.assignedProviders || [];
                          if (!current.find((p: any) => p.providerId === s.id)) {
                            setEditForm((f: any) => ({...f, assignedProviders: [...current, {
                              providerId: s.id, name: s.name || `${s.firstName} ${s.lastName}`, role: s.role,
                            }]}));
                          }
                        }} className="w-full text-left px-3 py-2 text-xs font-bold bg-gray-50 hover:bg-[#0d9488]/10 rounded-lg">
                          + {s.name || `${s.firstName} ${s.lastName}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deliverables status */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className={`${labelCls} mb-4`}>Deliverables</h3>
              {(order.deliverables || []).length > 0 ? (
                <div className="space-y-2">
                  {order.deliverables.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <span className="text-xs font-bold capitalize">{d.type?.replace(/_/g, " ")}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        d.status === "delivered" ? "bg-teal-100 text-teal-700" :
                        d.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{d.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No deliverables tracked yet.</p>
              )}
            </div>

            {/* Quick invoice summary */}
            <div className="bg-black text-white rounded-2xl p-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Invoice</h3>
              <p className="text-2xl font-black">{fmtCurrency(order.total || 0)}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                {invoice.status === "paid" ? "Paid" : invoice.amountPaid > 0 ? `$${invoice.amountPaid} paid` : "Unpaid"}
              </p>
              <p className="text-[10px] text-gray-500 mt-2">{invoice.invoiceNumber || "—"}</p>
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
              <p className="text-sm text-gray-400">{invoice.invoiceNumber || order.orderNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">Iconic Images Photography, LLC</p>
              <p className="text-xs text-gray-400">cadi@iconicimagestx.com</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className={labelCls}>Bill To</p>
              <p className="text-sm font-bold">{order.clientName}</p>
              <p className="text-xs text-gray-500">{order.clientEmail}</p>
              <p className="text-xs text-gray-500">{order.clientPhone}</p>
            </div>
            <div className="text-right">
              <p className={labelCls}>Order Date</p>
              <p className="text-sm font-bold">{fmtDate(order.createdAt)}</p>
              {invoice.dueDate && <><p className={`${labelCls} mt-2`}>Due Date</p><p className="text-sm font-bold">{fmtDate(invoice.dueDate)}</p></>}
            </div>
          </div>

          {/* Line items */}
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest pb-2">Service</th>
                <th className="text-right text-[10px] font-black text-gray-400 uppercase tracking-widest pb-2">Qty</th>
                <th className="text-right text-[10px] font-black text-gray-400 uppercase tracking-widest pb-2">Price</th>
                <th className="text-right text-[10px] font-black text-gray-400 uppercase tracking-widest pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {svcList.map((s: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 text-sm font-bold">{typeof s === "string" ? s : s.name}</td>
                  <td className="py-3 text-sm text-right">{s.qty || 1}</td>
                  <td className="py-3 text-sm text-right">{s.price ? fmtCurrency(s.price) : "—"}</td>
                  <td className="py-3 text-sm text-right font-bold">{s.price ? fmtCurrency(s.price * (s.qty || 1)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between"><span className="text-sm text-gray-400">Subtotal</span><span className="text-sm font-bold">{fmtCurrency(order.subtotal || 0)}</span></div>
              {order.tax > 0 && <div className="flex justify-between"><span className="text-sm text-gray-400">Tax</span><span className="text-sm">{fmtCurrency(order.tax)}</span></div>}
              {order.discount > 0 && <div className="flex justify-between"><span className="text-sm text-gray-400">Discount</span><span className="text-sm text-green-600">-{fmtCurrency(order.discount)}</span></div>}
              <div className="flex justify-between border-t-2 border-gray-200 pt-2"><span className="text-lg font-black">Total</span><span className="text-lg font-black">{fmtCurrency(order.total || 0)}</span></div>
              {invoice.amountPaid > 0 && <div className="flex justify-between"><span className="text-sm text-gray-400">Paid</span><span className="text-sm text-green-600">-{fmtCurrency(invoice.amountPaid)}</span></div>}
              <div className="flex justify-between"><span className="text-sm font-bold">Amount Due</span><span className="text-sm font-black text-[#0d9488]">{fmtCurrency((order.total || 0) - (invoice.amountPaid || 0))}</span></div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <Button className="rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white text-xs font-bold">
              <Send className="w-3.5 h-3.5 mr-1.5" /> Send Invoice
            </Button>
            <Button variant="outline" className="rounded-xl text-xs font-bold">
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
            </Button>
          </div>
        </div>
      )}

      {/* ─── GALLERY TAB ─── */}
      {activeTab === "gallery" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className={`${labelCls} mb-4`}>Gallery & Deliverables</h3>
          {order.gallery?.galleryUrl ? (
            <div className="p-4 bg-gray-50 rounded-xl">
              <a href={order.gallery.galleryUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-[#0d9488] font-bold text-sm">
                View Gallery <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Gallery not created yet. Photos will appear here once uploaded and processed.</p>
          )}
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
                    {h.details && <p className="text-[10px] text-gray-500 mt-0.5">{h.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No history recorded yet.</p>}
        </div>
      )}

      {/* Cancel confirmation */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-black mb-2">Cancel This Order?</h3>
            <p className="text-sm text-gray-500 mb-6">This action cannot be undone. The client will be notified.</p>
            <div className="flex gap-3">
              <Button onClick={() => setShowCancel(false)} variant="outline" className="flex-1 rounded-xl">Keep Order</Button>
              <Button onClick={handleCancel} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold">Cancel Order</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Edit3, Save, Calendar, Archive,
  X, AlertCircle, MapPin, Clock, Camera, Layers, Eye, Send, Check, FilePlus,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
  collection, addDoc, getDocs,
} from "firebase/firestore";
import { toast } from "sonner";
import { listingAppointmentDate } from "@shared/listingWrite";
import {
  invoiceDraftFromOrder,
  listingLinkFields,
  nonEmptyId,
  orderInvoiceButtonLabel,
} from "@shared/orderProjectInvoice";
import { staffInvoicePath } from "@shared/staffInvoice";
import { ensureLinkedInvoice, resolveLinkedInvoice } from "@/lib/orderProjectInvoice";
import { syncOrderBillingToInvoice } from "@/lib/staffInvoice";
import { separatePromoDiscount } from "@shared/bookingPricing";
import { orderChargeSummary, orderServiceLines } from "@shared/orderPackageLines";
import { linkOrderToListing, resolvePortalClientId } from "@/lib/listingClient";
import { deliverInvoiceEmail } from "@/lib/deliverInvoice";
import { useAuth } from "@/contexts/AuthContext";
import {
  markScheduledAppointmentConfirmed,
  upsertScheduledAppointment,
} from "@/lib/scheduleRecords";
import {
  LIFE_OF_THE_LISTING_CARE_PRICE_LABEL,
  LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL,
} from "@shared/lifeOfTheListingCare";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAddr(a: any): string {
  if (!a) return "—";
  if (typeof a === "string") return a;
  if (a.formatted) return a.formatted;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (typeof ts === "string" && ts.includes(",")) return ts;

  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago"
  };

  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", options);

  // If it's a YYYY-MM-DD string, add noon to prevent timezone shifts
  let dateObj: Date;
  if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    dateObj = new Date(ts + "T12:00:00");
  } else {
    dateObj = new Date(ts);
  }

  try {
    return isNaN(dateObj.getTime()) ? String(ts) : dateObj.toLocaleDateString("en-US", options);
  } catch {
    return String(ts);
  }
}

function fmtTimeStandard(timeStr: string | any): string {
  if (!timeStr) return "";
  if (typeof timeStr !== "string") return "";
  if (timeStr.match(/am|pm/i)) return timeStr.toUpperCase();
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}
function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

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

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";
const valCls = "text-sm font-bold text-black mt-1 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl min-h-[38px] flex items-center whitespace-pre-wrap";
const darkValCls = "text-sm font-bold text-white mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl min-h-[38px] flex items-center whitespace-pre-wrap";
const editInputCls = "w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/50";

// ─── Read-only field ──────────────────────────────────────────────────────────
function Field({ label, value, editing, editValue, onChange, type = "text", span2, dark }: {
  label: string; value: any; editing: boolean; editValue?: any; onChange?: (v: string) => void; type?: string; span2?: boolean; dark?: boolean;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : ""}>
      <p className={labelCls}>{label}</p>
      {editing && onChange ? (
        type === "textarea" ? (
          <textarea value={editValue ?? value ?? ""} onChange={e => onChange(e.target.value)} rows={2} className={`${editInputCls} resize-none mt-1`} />
        ) : (
          <input type={type} value={editValue ?? value ?? ""} onChange={e => onChange(e.target.value)} className={`${dark ? "w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm font-bold text-white focus:outline-none" : editInputCls} mt-1`} />
        )
      ) : (
        <div className={dark ? darkValCls : valCls}>{safe(value)}</div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminOrderRequest() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);
  const [showSchedule, setShowSchedule] = React.useState(false);
  const [schedDate, setSchedDate] = React.useState("");
  const [schedTime, setSchedTime] = React.useState("");
  const [showCancel, setShowCancel] = React.useState(false);
  const [sendingReceipt, setSendingReceipt] = React.useState(false);
  const [invoicePhase, setInvoicePhase] = React.useState<"loading" | "missing" | "linked">("loading");
  const [linkedInvoiceId, setLinkedInvoiceId] = React.useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = React.useState(false);
  const [staff, setStaff] = React.useState<any[]>([]);
  const [selectedProviders, setSelectedProviders] = React.useState<string[]>([]);
  const [projectTypeChoice, setProjectTypeChoice] = React.useState<"real_estate" | "business">("real_estate");
  const projectTypeTouched = React.useRef(false);
  const editingRef = React.useRef(false);
  editingRef.current = editing;

  React.useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "orderRequests", id), snap => {
      if (snap.exists()) {
        const data: any = { id: snap.id, ...snap.data() };
        setOrder(data);
        if (!editingRef.current) setForm(data);
        if (!projectTypeTouched.current) {
          const lineItems = data.lineItems || [];
          const inferredRealEstate = data.specializedPhotography === "mls" || lineItems.some((li: any) => {
            const n = (li.name || "").toLowerCase();
            return n.includes("listing") || n.includes("aerial") || n.includes("matterport") || n.includes("3d");
          });
          const hasBusinessSignal = Boolean(data.specializedPhotography && data.specializedPhotography !== "mls") || (lineItems.length > 0 && !inferredRealEstate);
          setProjectTypeChoice(hasBusinessSignal ? "business" : "real_estate");
        }
        if (data.appointmentDate) setSchedDate(data.appointmentDate);
        if (data.appointmentTime) setSchedTime(data.appointmentTime);
      } else { toast.error("Order not found"); navigate("/admin/orders"); }
      setLoading(false);
    });
    return () => unsub();
  }, [id, navigate]);

  React.useEffect(() => {
    if (!order?.id) return;
    let cancel = false;
    resolveLinkedInvoice({
      orderRequestId: order.id,
      orderId: order.convertedToOrderId || order.orderId,
      listingId: order.listingId,
      orderInvoiceId: order.invoiceId,
    }).then((invoiceId) => {
      if (cancel) return;
      setLinkedInvoiceId(invoiceId);
      setInvoicePhase(invoiceId ? "linked" : "missing");
    }).catch((err) => {
      console.error("[AdminOrderRequest] Invoice lookup failed.", err);
      if (cancel) return;
      const stored = typeof order.invoiceId === "string" ? order.invoiceId.trim() : "";
      setLinkedInvoiceId(stored || null);
      setInvoicePhase(stored ? "linked" : "missing");
    });
    return () => { cancel = true; };
  }, [order?.id, order?.invoiceId, order?.listingId, order?.convertedToOrderId, order?.orderId]);

  React.useEffect(() => {
    getDocs(collection(db, "staff")).then(snap => {
      setStaff(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(), role: data.role, ...data };
      }).filter((s: any) => s.isActive !== false));
    }).catch(() => {});
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updates: any = { ...form, updatedAt: serverTimestamp() };
      delete updates.id;
      await updateDoc(doc(db, "orderRequests", id), updates);
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save.");
      setSaving(false);
      return;
    }
    try {
      let invoiceId = nonEmptyId(linkedInvoiceId) || nonEmptyId(form.invoiceId);
      if (!invoiceId) {
        invoiceId = await resolveLinkedInvoice({
          orderRequestId: id,
          orderId: form.convertedToOrderId || form.orderId,
          listingId: form.listingId,
          orderInvoiceId: form.invoiceId,
        });
      }
      if (invoiceId) {
        const synced = await syncOrderBillingToInvoice(invoiceId, form);
        toast.success(synced ? "Order updated. Invoice updated." : "Order updated.");
      } else {
        toast.success("Order updated.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Order saved. The linked invoice could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProject = async () => {
    if (!id || !order) return;
    if (order.listingId) { navigate(`/admin/listing/${order.listingId}`); return; }
    setSaving(true);
    try {
      const clientEmail = String(order.email || order.clientEmail || "").trim().toLowerCase();
      let clientId = order.clientId || null;
      try {
        clientId = await resolvePortalClientId({ email: clientEmail, clientId: order.clientId });
      } catch (lookupErr) {
        console.warn("[AdminOrderRequest] Client lookup failed.", lookupErr);
      }
      const apptDate = listingAppointmentDate(order.appointmentDate);
      const links = listingLinkFields({
        orderRequestId: id,
        orderId: order.convertedToOrderId || order.orderId,
        invoiceId: linkedInvoiceId || order.invoiceId,
      });
      const listingData: any = {
        projectType: projectTypeChoice,
        ...links,
        clientId,
        clientName: order.clientName || `${order.firstName || ""} ${order.lastName || ""}`.trim(),
        clientEmail,
        clientPhone: order.phone || "",
        address: fmtAddr(order.address),
        shootLocation: projectTypeChoice === "business" ? fmtAddr(order.address) : null,
        apptDate,
        apptTime: order.scheduledTime || order.appointmentTime || null,
        services: (order.lineItems || []).map((li: any) => li.name || String(li)),
        status: apptDate ? "scheduled" : "unscheduled",
        total: Number(order.total) || Number(order.pricing?.total) || 0,
        images: [], studioEnabled: true, studioToken: crypto.randomUUID(),
        lockDownloads: true, requirePayment: true, lockStudio: false, socialPermission: false,
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
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "listings"), listingData);
      await linkOrderToListing({
        orderRequestId: id,
        listingId: ref.id,
        clientId,
        clientEmail,
        orderId: links.orderId || null,
        invoiceId: links.invoiceId || null,
      });
      toast.success("Project created!");
      navigate(`/admin/listing/${ref.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create project.");
    }
    finally { setSaving(false); }
  };

  const handleSchedule = async () => {
    if (!id || !schedDate) { toast.error("Select a date."); return; }
    setSaving(true);
    try {
      await upsertScheduledAppointment({
        orderRequestId: id,
        order,
        date: schedDate,
        time: schedTime || null,
        providerIds: selectedProviders,
        staff,
      });
      toast.success("Scheduled."); setShowSchedule(false);
    } catch (err) { console.error(err); toast.error("Failed."); }
    finally { setSaving(false); }
  };

  const handleConfirmBooking = async () => {
    if (!id || !order) return;
    const status = String(order.status || "").toLowerCase();
    if (status === "confirmed") {
      toast.success("This appointment is already confirmed.");
      return;
    }
    if (!["scheduled", "appt_scheduled", "consult_scheduled"].includes(status)) {
      toast.error("Schedule this appointment before marking it confirmed.");
      return;
    }

    setSaving(true);
    try {
      await markScheduledAppointmentConfirmed(id, order);
      toast.success("Appointment marked confirmed.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    await updateDoc(doc(db, "orderRequests", id), { status: "archived", updatedAt: serverTimestamp() });
    toast.success("Archived."); navigate("/admin/orders");
  };

  const handleCancel = async () => {
    if (!id) return;
    await updateDoc(doc(db, "orderRequests", id), { status: "cancelled", updatedAt: serverTimestamp() });
    toast.success("Cancelled."); setShowCancel(false); navigate("/admin/orders");
  };

  const handleInvoice = async () => {
    if (!order?.id || invoicePhase === "loading") return;
    setInvoiceBusy(true);
    try {
      const invoiceId = await ensureLinkedInvoice({
        orderRequestId: order.id,
        orderId: order.convertedToOrderId || order.orderId,
        listingId: order.listingId,
        orderInvoiceId: linkedInvoiceId || order.invoiceId,
      }, invoiceDraftFromOrder(order));
      setLinkedInvoiceId(invoiceId);
      setInvoicePhase("linked");
      navigate(staffInvoicePath(invoiceId));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not open the invoice.");
    } finally {
      setInvoiceBusy(false);
    }
  };

  const handleSendReceipt = async () => {
    const invoiceId = linkedInvoiceId || "";
    if (!invoiceId) return;
    if (!user) {
      toast.error("Please sign in again.");
      return;
    }
    setSendingReceipt(true);
    try {
      const token = await user.getIdToken();
      const action = await deliverInvoiceEmail(invoiceId, token);
      toast.success(action === "payment_receipt" ? "Receipt sent to the client." : "Pay link sent to the client.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSendingReceipt(false);
    }
  };

  if (loading) return <AdminLayout title="Order Request"><div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div></AdminLayout>;
  if (!order) return null;

  const statusKey = (typeof order.status === "string" ? order.status : "new").toLowerCase().replace(/\s+/g, "_");
  const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.new;
  const lineItems = orderServiceLines(order);
  const charges = orderChargeSummary(order, lineItems);
  const orderTotal = charges.total;
  const promoDiscount = Number(order.promoDiscount) || 0;
  const extraPromo = separatePromoDiscount(lineItems, promoDiscount);
  const clientName = order.clientName || `${order.firstName || ""} ${order.lastName || ""}`.trim() || "—";
  const f = (key: string) => form[key] ?? order[key] ?? "";
  const setF = (key: string) => (val: string) => setForm((prev: any) => ({ ...prev, [key]: val }));

  const isScheduledState = ["scheduled", "in_progress", "delivered", "paid"].includes(statusKey);
  const invoiceAttached = invoicePhase === "linked" && Boolean(linkedInvoiceId);
  const invoiceLabel = invoicePhase === "loading" ? "Invoice…" : orderInvoiceButtonLabel(invoiceAttached);

  return (
    <AdminLayout title="Order Request">
      <button onClick={() => navigate("/admin/orders")} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to Orders
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ LEFT: Full order view (read-only by default, editable on Manage Order) ═══ */}
        <div className="lg:col-span-2 space-y-6">

          {/* Status + Order ID bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusInfo.color}`}>{statusInfo.label}</span>
              {order.listingId && (
                <button onClick={() => navigate(`/admin/listing/${order.listingId}`)} className="px-3 py-1 rounded-full bg-[#0d9488]/10 text-[#0d9488] text-[9px] font-black uppercase tracking-widest hover:bg-[#0d9488]/20">View Project →</button>
              )}
            </div>
            <span className="text-[10px] font-mono text-gray-400">#{(order.id || "").substring(0, 8)}</span>
          </div>

          {/* ── CLIENT INFORMATION ── */}
          <div className="bg-black rounded-2xl p-6">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Client Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="First Name" value={order.firstName} editing={editing} editValue={f("firstName")} onChange={setF("firstName")} dark />
              <Field label="Last Name" value={order.lastName} editing={editing} editValue={f("lastName")} onChange={setF("lastName")} dark />
              <Field label="Email" value={order.email} editing={editing} editValue={f("email")} onChange={setF("email")} type="email" dark />
              <Field label="Phone" value={order.phone} editing={editing} editValue={f("phone")} onChange={setF("phone")} type="tel" dark />
              {order.photographerPreference && <Field label="Photographer Preference" value={order.photographerPreference} editing={editing} editValue={f("photographerPreference")} onChange={setF("photographerPreference")} dark />}
            </div>
          </div>

          {/* ── PROPERTY / LOCATION ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Property & Location</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Address" value={fmtAddr(order.address)} editing={editing} editValue={typeof f("address") === "string" ? f("address") : fmtAddr(f("address"))} onChange={setF("address")} span2 />
              {order.squareFootage && <Field label="Square Footage" value={order.squareFootage} editing={editing} editValue={f("squareFootage")} onChange={setF("squareFootage")} />}
              {order.furnishingStatus && <Field label="Furnishing Status" value={order.furnishingStatus} editing={editing} editValue={f("furnishingStatus")} onChange={setF("furnishingStatus")} />}
              {order.propertyStatus && <Field label="Property Status" value={order.propertyStatus} editing={editing} editValue={f("propertyStatus")} onChange={setF("propertyStatus")} />}
              {order.specializedPhotography && <Field label="Photo Type" value={order.specializedPhotography?.toUpperCase()} editing={editing} editValue={f("specializedPhotography")} onChange={setF("specializedPhotography")} />}
            </div>
          </div>

          {/* ── APPOINTMENT ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Appointment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field label={isScheduledState ? "Scheduled Date" : "Requested Date"} value={fmtDate(order.scheduledDate || order.appointmentDate || order.requestedDate)} editing={editing} editValue={f("appointmentDate")} onChange={setF("appointmentDate")} type="date" />
              <Field label={isScheduledState ? "Scheduled Time" : "Requested Time"} value={fmtTimeStandard(order.scheduledTime || order.appointmentTime || order.requestedTime)} editing={editing} editValue={f("appointmentTime")} onChange={setF("appointmentTime")} type="time" />
              <Field label="Access Method" value={order.accessMethod} editing={editing} editValue={f("accessMethod")} onChange={setF("accessMethod")} />
              <Field label="Lockbox Code" value={order.lockboxCode} editing={editing} editValue={f("lockboxCode")} onChange={setF("lockboxCode")} />
            </div>
          </div>

          {/* ── SERVICES ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Notes</h3>
            <div className="grid grid-cols-1 gap-y-4">
              <Field label="Client Notes / Vibe" value={order.vibeNote || order.notes} editing={editing} editValue={f("vibeNote") || f("notes")} onChange={setF("vibeNote")} type="textarea" span2 />
              <Field label="Internal Notes (admin only)" value={order.internalNotes} editing={editing} editValue={f("internalNotes")} onChange={setF("internalNotes")} type="textarea" span2 />
            </div>
          </div>

          {/* Save/Cancel buttons when editing */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Services</h3>
            {editing ? (
              <div>
                {(form.lineItems || []).map((li, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input value={li.name || ""} onChange={e => { var items = [...(form.lineItems || [])]; items[i] = {...items[i], name: e.target.value}; setForm(function(f){ return {...f, lineItems: items}; }); }} placeholder="Service name" className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold text-black focus:outline-none" />
                    <input type="number" value={li.price || ""} onChange={e => { var items = [...(form.lineItems || [])]; items[i] = {...items[i], price: Number(e.target.value)}; setForm(function(f){ return {...f, lineItems: items, total: items.reduce(function(s,x){return s+(Number(x.price)||0)},0)}; }); }} placeholder="Price" className="w-28 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold text-black focus:outline-none" />
                    <button onClick={() => { var items = (form.lineItems || []).filter(function(_,idx){return idx!==i}); setForm(function(f){ return {...f, lineItems: items, total: items.reduce(function(s,x){return s+(Number(x.price)||0)},0)}; }); }} className="text-red-400 hover:text-red-300 text-xs font-bold px-2">X</button>
                  </div>
                ))}
                <button onClick={() => setForm(function(f){ return {...f, lineItems: [...(f.lineItems||[]), {name:"",price:0}]}; })} className="text-[#0d9488] text-xs font-bold mt-2">+ Add Service</button>
                <div className="border-t border-white/20 pt-3 mt-3 flex justify-between">
                  <span className="text-lg font-black text-white">Total</span>
                  <span className="text-lg font-black text-[#0d9488]">{fmtCurrency((form.lineItems||[]).reduce(function(s,x){return s+(Number(x.price)||0)},0))}</span>
                </div>
              </div>
            ) : lineItems.length > 0 ? (
              <div className="mt-1 bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                {lineItems.map((li: any, i: number) => (
                  <div key={i} className={`flex justify-between items-center px-4 py-3 ${i > 0 ? "border-t border-gray-200/50" : ""}`}>
                    <span className="text-sm font-bold text-gray-900">{li.name || safe(li)}</span>
                    {li.price != null && <span className="text-sm font-black text-[#0d9488]">{fmtCurrency(li.price)}</span>}
                  </div>
                ))}
                {order.lifeOfTheListingCare === true && (
                  <div className="flex justify-between items-center gap-3 px-4 py-3 border-t border-gray-200/50">
                    <span className="text-sm font-bold text-gray-900">{LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL}</span>
                    <span className="text-sm font-black text-gray-500 shrink-0">{LIFE_OF_THE_LISTING_CARE_PRICE_LABEL}</span>
                  </div>
                )}
                {extraPromo > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200/50 bg-green-50/50">
                    <span className="text-sm font-bold text-gray-500 italic">Promo ({order.promoCode})</span>
                    <span className="text-sm font-bold text-green-600">-{fmtCurrency(extraPromo)}</span>
                  </div>
                )}
                <div className="bg-white border-t border-gray-200 px-4 py-4 flex justify-between items-center">
                  <span className="text-base font-black uppercase tracking-tight">Total Amount</span>
                  <span className="text-xl font-black text-black">{fmtCurrency(orderTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No services listed.</p>
            )}
            {editing && order.lifeOfTheListingCare === true && (
              <p className="mt-3 text-sm font-bold text-gray-700">
                {LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL}
                <span className="ml-2 font-black text-gray-500">{LIFE_OF_THE_LISTING_CARE_PRICE_LABEL}</span>
              </p>
            )}
          </div>

          {/* ── NOTES ── */}
          {editing && (
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold">
                <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button onClick={() => { setEditing(false); setForm(order); }} variant="outline" className="rounded-xl text-xs font-bold">Cancel Edit</Button>
            </div>
          )}
        </div>

        {/* ═══ RIGHT SIDEBAR ═══ */}
        <div className="space-y-6">

          {/* ── Order Summary / Billing ── */}
          <div className="bg-black rounded-[2rem] p-6 text-white">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Order Summary</h3>
            {lineItems.length > 0 && (
              <div className="space-y-2 mb-4">
                {lineItems.map((li: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-300 font-medium">{li.name || safe(li)}</span>
                    {li.price != null && <span className="font-bold">{fmtCurrency(li.price)}</span>}
                  </div>
                ))}
                {order.lifeOfTheListingCare === true && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-300 font-medium">{LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL}</span>
                    <span className="font-bold shrink-0">{LIFE_OF_THE_LISTING_CARE_PRICE_LABEL}</span>
                  </div>
                )}
              </div>
            )}
            {extraPromo > 0 && (
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Promo</span>
                <span className="text-green-600 font-bold">-{fmtCurrency(extraPromo)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 mt-2">
              <div className="flex justify-between text-lg">
                <span className="font-black text-white">Total</span>
                <span className="font-black text-[#0d9488]">{fmtCurrency(orderTotal)}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-xs">
              <div className="flex justify-between"><span className={`${labelCls}`}>Status</span><span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusInfo.color}`}>{statusInfo.label}</span></div>
              <div className="flex justify-between"><span className={`${labelCls}`}>{isScheduledState ? "Scheduled" : "Requested"}</span><span className="font-bold text-white">{fmtDate(order.scheduledDate || order.appointmentDate) || "—"}</span></div>
              {(order.scheduledTime || order.appointmentTime) && (
                <div className="flex justify-between"><span className={`${labelCls}`}>Time</span><span className="font-bold text-white">{fmtTimeStandard(order.scheduledTime || order.appointmentTime)}</span></div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <Button type="button" onClick={handleInvoice} disabled={invoiceBusy || invoicePhase === "loading"} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center text-black">
                {invoiceAttached ? <Eye className="w-3.5 h-3.5 mr-1.5" /> : <FilePlus className="w-3.5 h-3.5 mr-1.5" />}
                {invoiceBusy ? "Opening..." : invoiceLabel}
              </Button>
              <Button type="button" onClick={handleSendReceipt} disabled={!invoiceAttached || sendingReceipt} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center text-black"><Send className="w-3.5 h-3.5 mr-1.5" /> {sendingReceipt ? "Sending..." : "Send Receipt"}</Button>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Actions</h3>
            <div className="space-y-2">
              {!order.listingId && (
                <div>
                  <p className={`${labelCls} mb-2`}>Project type</p>
                  <div className="flex bg-gray-100 rounded-xl p-1" role="group" aria-label="Project type">
                    <button type="button" onClick={() => { projectTypeTouched.current = true; setProjectTypeChoice("real_estate"); }}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${projectTypeChoice === "real_estate" ? "bg-[#0d9488] text-white" : "text-gray-500"}`}
                    >Real Estate</button>
                    <button type="button" onClick={() => { projectTypeTouched.current = true; setProjectTypeChoice("business"); }}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${projectTypeChoice === "business" ? "bg-black text-white" : "text-gray-500"}`}
                    >Business</button>
                  </div>
                </div>
              )}
              <Button onClick={order.listingId ? () => navigate(`/admin/listing/${order.listingId}`) : handleCreateProject}
                disabled={saving} className="w-full rounded-xl text-xs font-bold justify-center bg-[#0d9488] hover:bg-[#0f766e] text-white">
                <Layers className="w-3.5 h-3.5 mr-1.5" />{order.listingId ? "View Project" : "Create Project"}
              </Button>
              <Button onClick={handleConfirmBooking}
                disabled={saving || statusKey === "confirmed"} className="w-full rounded-xl text-xs font-bold justify-center bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                <Check className="w-3.5 h-3.5 mr-1.5" />{statusKey === "confirmed" ? "Confirmed" : "Mark Client Confirmed"}
              </Button>
              {!editing ? (
                <Button onClick={() => setEditing(true)} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Manage Order
                </Button>
              ) : null}
              <Button onClick={() => setShowSchedule(true)} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                <Calendar className="w-3.5 h-3.5 mr-1.5" /> Schedule
              </Button>
              {statusKey !== "archived" && statusKey !== "cancelled" && (
                <Button onClick={handleArchive} variant="outline" className="w-full rounded-xl text-xs font-bold justify-center">
                  <Archive className="w-3.5 h-3.5 mr-1.5" /> Archive
                </Button>
              )}
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
            <p className="text-xs text-gray-500 mb-6">Set a date and time. This does not create a project.</p>
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div><p className={`${labelCls}`}>Date *</p><input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className={`${editInputCls}`} /></div>
                <div><p className={`${labelCls}`}>Time</p><input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className={`${editInputCls}`} /></div>
              </div>
              {staff.filter(s => ["photographer", "admin", "coordinator"].includes(s.role)).length > 0 && (
                <div>
                  <p className={`${labelCls} mb-2`}>Assign Provider(s)</p>
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
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to cancel this order?</p>
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

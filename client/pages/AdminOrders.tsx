import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { X, Archive, Calendar, Layers, RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, writeBatch, doc, serverTimestamp, addDoc, getDocs, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { listingAppointmentDate } from "@shared/listingWrite";
import { linkOrderToListing, resolvePortalClientId } from "@/lib/listingClient";
import { listingLinkFields } from "@shared/orderProjectInvoice";
import { Button } from "@/components/ui/button";
import OperationsStatsGrid from "@/components/OperationsStatsGrid";
import { upsertScheduledAppointment } from "@/lib/scheduleRecords";
import { recordAddressText } from "@shared/addressText";
import { type AdminStudioId } from "@shared/adminOrderTile";
import { adminOrdersViewStorageKey } from "@shared/adminOrderList";
import { AdminOrdersBrowser } from "@/components/admin/AdminOrdersBrowser";
import { useAuth } from "@/contexts/AuthContext";

function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const getName = (o: any) => safe(o.clientName || o.customerName || o.name || ((o.firstName || "") + " " + (o.lastName || "")).trim());
const getAddr = (o: any) => recordAddressText(o) || "—";
const getTotal = (o: any) => Number(o.total) || Number(o.amount) || Number(o.pricing?.total) || 0;

export default function AdminOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [staff, setStaff] = React.useState<any[]>([]);
  const [isBulkScheduling, setIsBulkScheduling] = React.useState(false);
  const [isBulkProjecting, setIsBulkProjecting] = React.useState(false);
  const [bulkProjectType, setBulkProjectType] = React.useState<"real_estate" | "business">("real_estate");

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); toast.error("Failed to load orders"); setLoading(false); });

    getDocs(collection(db, "staff")).then(snap => {
      setStaff(snap.docs.map(d => ({ id: d.id, name: d.data().name || `${d.data().firstName || ""} ${d.data().lastName || ""}`.trim(), ...d.data() })).filter((s: any) => s.isActive !== false));
    });

    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  const toggleSelect = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  };

  const selectAll = (ids: string[]) => {
    const allIn = ids.every(id => selection.has(id));
    const next = new Set(selection);
    if (allIn) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    setSelection(next);
  };

  const handleBulkStatus = async (status: string) => {
    if (selection.size === 0) return;
    const batch = writeBatch(db);
    selection.forEach(id => batch.update(doc(db, "orderRequests", id), { status, updatedAt: serverTimestamp() }));
    await batch.commit();
    toast.success(`Updated ${selection.size} orders.`);
    setSelection(new Set());
  };

  const handleBulkProject = async () => {
    if (selection.size === 0) return;
    setIsBulkProjecting(true);
    let count = 0;
    const failures: string[] = [];
    try {
      for (const id of Array.from(selection)) {
        const order = orders.find(o => o.id === id);
        if (!order || order.listingId) continue;

        try {
          const clientEmail = String(order.email || order.clientEmail || "").trim().toLowerCase();
          let clientId = order.clientId || null;
          try {
            clientId = await resolvePortalClientId({ email: clientEmail, clientId: order.clientId });
          } catch (lookupErr) {
            console.warn("[AdminOrders] Client lookup failed.", lookupErr);
          }
          const apptDate = listingAppointmentDate(order.appointmentDate);
          const links = listingLinkFields({
            orderRequestId: id,
            orderId: order.convertedToOrderId || order.orderId,
            invoiceId: order.invoiceId,
          });
          const listingData: any = {
            projectType: bulkProjectType,
            ...links,
            clientId,
            clientName: getName(order),
            clientEmail,
            clientPhone: order.phone || "",
            address: getAddr(order),
            shootLocation: bulkProjectType === "business" ? getAddr(order) : null,
            apptDate,
            apptTime: order.scheduledTime || order.appointmentTime || null,
            services: (order.lineItems || []).map((li: any) => li.name || String(li)),
            status: apptDate ? "scheduled" : "unscheduled",
            total: getTotal(order),
            images: [], studioEnabled: true, studioToken: crypto.randomUUID(),
            lockDownloads: true, requirePayment: true, lockStudio: false, socialPermission: false,
            accessInfo: [order.accessMethod, order.lockboxCode].filter(Boolean).join(" - ") || "",
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
          count++;
        } catch (err) {
          console.error(err);
          failures.push(err instanceof Error ? err.message : "Failed to create project.");
        }
      }
      if (failures.length === 0) toast.success(`Created projects for ${count} orders.`);
      else if (count === 0) toast.error(failures[0]);
      else toast.error(`Created ${count}. ${failures.length} failed: ${failures[0]}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Some projects failed.");
    }
    finally { setIsBulkProjecting(false); setSelection(new Set()); }
  };

  const setStudio = async (orderId: string, studio: AdminStudioId) => {
    try {
      await updateDoc(doc(db, "orderRequests", orderId), { studio, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      toast.error("Could not update the studio.");
    }
  };

  return (
    <AdminLayout title="Orders">
      <div className="pb-10">
        <OperationsStatsGrid />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <AdminOrdersBrowser
          orders={orders}
          staff={staff}
          selection={selection}
          storageKey={adminOrdersViewStorageKey(user)}
          onToggleSelect={toggleSelect}
          onSelectIds={selectAll}
          onStudioChange={setStudio}
        />
      )}

      {/* ── BULK ACTION BAR ── */}
      {selection.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-black text-white px-6 py-4 rounded-3xl shadow-2xl border border-white/10 flex flex-wrap items-center gap-4 max-w-[calc(100vw-2rem)]">
            <div className="flex items-center gap-3 pr-6 border-r border-white/20">
              <div className="w-8 h-8 bg-[#0d9488] rounded-full flex items-center justify-center font-bold text-sm">{selection.size}</div>
              <span className="text-xs font-bold uppercase tracking-wider">Orders Selected</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => handleBulkStatus("archived")} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-[#0d9488] transition-colors"><Archive className="w-4 h-4" /> Archive</button>
              <button onClick={() => handleBulkStatus("cancelled")} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-colors"><X className="w-4 h-4" /> Cancel</button>
              <div className="flex rounded-xl bg-white/10 p-0.5" role="group" aria-label="Project type">
                <button type="button" onClick={() => setBulkProjectType("real_estate")} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${bulkProjectType === "real_estate" ? "bg-[#0d9488] text-white" : "text-gray-300"}`}>Real Estate</button>
                <button type="button" onClick={() => setBulkProjectType("business")} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${bulkProjectType === "business" ? "bg-white text-black" : "text-gray-300"}`}>Business</button>
              </div>
              <button onClick={handleBulkProject} disabled={isBulkProjecting} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-[#0d9488] transition-colors">
                {isBulkProjecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />} Create Projects
              </button>
              <button onClick={() => setIsBulkScheduling(true)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-[#0d9488] transition-colors"><Calendar className="w-4 h-4" /> Schedule</button>
            </div>
            <button onClick={() => setSelection(new Set())} className="ml-4 p-2 hover:bg-white/10 rounded-full"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
        </div>
      )}

      {/* ── BULK SCHEDULE MODAL ── */}
      {isBulkScheduling && (
        <BulkScheduleFlow
          ids={Array.from(selection)}
          orders={orders}
          staff={staff}
          onClose={() => { setIsBulkScheduling(false); setSelection(new Set()); }}
        />
      )}
    </AdminLayout>
  );
}

// ─── BULK SCHEDULE FLOW ──────────────────────────────────────────────────────

function BulkScheduleFlow({ ids, orders, staff, onClose }: any) {
  const [idx, setIdx] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [providers, setProviders] = React.useState<string[]>([]);

  const orderId = ids[idx];
  const order = orders.find((o: any) => o.id === orderId);

  React.useEffect(() => {
    if (order) {
      setDate(order.appointmentDate || "");
      setTime(order.appointmentTime || "");
      setProviders((order.assignedProviders || []).map((p: any) => p.providerId));
    }
  }, [order]);

  const handleNext = async () => {
    setSaving(true);
    try {
      await upsertScheduledAppointment({
        orderRequestId: orderId,
        order,
        date,
        time: time || null,
        providerIds: providers,
        staff,
      });

      if (idx < ids.length - 1) {
        setIdx(idx + 1);
      } else {
        toast.success("All orders scheduled.");
        onClose();
      }
    } catch (err) { toast.error("Failed to schedule."); }
    finally { setSaving(false); }
  };

  if (!order) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-black text-white px-8 py-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Bulk Scheduling</p>
            <h3 className="text-lg font-bold">Order {idx + 1} of {ids.length}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Customer & Address</p>
            <p className="text-sm font-bold text-black">{getName(order)}</p>
            <p className="text-xs text-gray-500">{getAddr(order)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 block mb-2">Appt Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm font-bold focus:ring-2 focus:ring-[#0d9488]/20 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 block mb-2">Appt Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm font-bold focus:ring-2 focus:ring-[#0d9488]/20 outline-none" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 block mb-3">Assign Providers</label>
            <div className="flex flex-wrap gap-2">
              {staff.map((s: any) => {
                const sel = providers.includes(s.id);
                return (
                  <button key={s.id} onClick={() => setProviders(sel ? providers.filter(p => p !== s.id) : [...providers, s.id])}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sel ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-8 bg-gray-50 flex gap-3">
          <Button onClick={onClose} variant="outline" className="flex-1 h-12 rounded-xl text-xs font-bold uppercase tracking-widest">Skip / Cancel</Button>
          <Button onClick={handleNext} disabled={saving || !date} className="flex-1 h-12 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold uppercase tracking-widest">
            {saving ? "Scheduling..." : (idx < ids.length - 1 ? "Confirm & Next" : "Complete Bulk Schedule")}
          </Button>
        </div>
      </div>
    </div>
  );
}

import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Search, ChevronDown, X, Archive, Calendar, Layers, ChevronUp, RefreshCw } from "lucide-react";
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
import { buildAdminOrderTile, type AdminStudioId } from "@shared/adminOrderTile";
import { exclusiveOrderBuckets } from "@shared/orderPackageLines";
import { AdminOrderTile } from "@/components/admin/AdminOrderTile";

function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Unified status flow
function getUnifiedStatus(o: any): string {
  var s = (typeof o.status === "string" ? o.status : "").toLowerCase().replace(/\s+/g, "_");
  if (s === "archived") return "archived";
  if (s === "cancelled") return "cancelled";

  var inv = o.invoice || {};
  var paid = inv.amountPaid > 0 || inv.status === "paid" || s === "paid" || s === "delivered_paid";

  if (paid && (s.includes("delivered") || s === "paid")) return "delivered_paid";
  if (s.includes("delivered")) return "delivered_unpaid";
  if (s === "in_review") return "in_review";
  if (s === "pending" || s === "pending_edit" || s === "in_progress") return "pending";
  if (s === "confirmed") return "confirmed";
  if (s === "scheduled" || s === "appt_scheduled" || s === "consult_scheduled") return "scheduled";
  return "unscheduled";
}

const getName = (o: any) => safe(o.clientName || o.customerName || o.name || ((o.firstName || "") + " " + (o.lastName || "")).trim());
const getAddr = (o: any) => recordAddressText(o) || "—";
const getTotal = (o: any) => Number(o.total) || Number(o.amount) || Number(o.pricing?.total) || 0;

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [staff, setStaff] = React.useState<any[]>([]);
  const [isBulkScheduling, setIsBulkScheduling] = React.useState(false);
  const [isBulkProjecting, setIsBulkProjecting] = React.useState(false);
  const [bulkProjectType, setBulkProjectType] = React.useState<"real_estate" | "business">("real_estate");

  // Section States
  const [sect1, setSect1] = React.useState({ perPage: 20, sort: "newest", search: "", collapsed: false });
  const [sect2, setSect2] = React.useState({ perPage: 20, sortField: "createdAt", sortOrder: "desc" as "asc"|"desc", search: "", collapsed: false });
  const [sect3, setSect3] = React.useState({ perPage: 20, sort: "newest", search: "", collapsed: true });

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

  // ─── FILTERING ─────────────────────────────────────────────────────────────

  const searchFilter = (list: any[], q: string) => {
    if (!q.trim()) return list;
    const low = q.toLowerCase();
    return list.filter(o => {
      const tile = buildAdminOrderTile(o);
      return [getName(o), getAddr(o), o.id, tile.packageName, tile.skinLabel, tile.orderCode, tile.clientName, tile.channel]
        .join(" ")
        .toLowerCase()
        .includes(low);
    });
  };

  const buckets = exclusiveOrderBuckets(orders, (order) => {
    const status = getUnifiedStatus(order);
    if (status === "archived" || status === "cancelled") return "archived";
    if (status === "unscheduled") return "action";
    return "active";
  });
  const actionRequired = buckets.action;
  const allActive = buckets.active;
  const archived = buckets.archived;

  // ─── SORTING ───────────────────────────────────────────────────────────────

  const sortOrders = (list: any[], field: string, order: "asc" | "desc") => {
    return [...list].sort((a, b) => {
      let va: any, vb: any;
      if (field === "createdAt") {
        va = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        vb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      } else if (field === "id") {
        va = a.id || ""; vb = b.id || "";
      } else if (field === "customer") {
        va = getName(a).toLowerCase(); vb = getName(b).toLowerCase();
      } else if (field === "total") {
        va = getTotal(a); vb = getTotal(b);
      } else if (field === "appointment") {
        va = (a.appointmentDate?.toDate ? a.appointmentDate.toDate().getTime() : (a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0));
        vb = (b.appointmentDate?.toDate ? b.appointmentDate.toDate().getTime() : (b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0));
      } else if (field === "status") {
        va = getUnifiedStatus(a); vb = getUnifiedStatus(b);
      }
      if (va < vb) return order === "asc" ? -1 : 1;
      if (va > vb) return order === "asc" ? 1 : -1;
      return 0;
    });
  };

  const sect1Filtered = sortOrders(searchFilter(actionRequired, sect1.search), "createdAt", sect1.sort === "newest" ? "desc" : "asc");
  const sect2Filtered = sortOrders(searchFilter(allActive, sect2.search), sect2.sortField, sect2.sortOrder);
  const sect3Filtered = sortOrders(searchFilter(archived, sect3.search), "createdAt", sect3.sort === "newest" ? "desc" : "asc");

  const visibleIds = (list: any[], perPage: number) => list.slice(0, perPage).map((order) => order.id);

  function renderTiles(list: any[]) {
    if (list.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-6 py-10 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">No orders in this list</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {list.map((order) => {
          const tile = buildAdminOrderTile(order);
          const setStudio = async (studio: AdminStudioId) => {
            try {
              await updateDoc(doc(db, "orderRequests", order.id), { studio, updatedAt: serverTimestamp() });
            } catch (err) {
              console.error(err);
              toast.error("Could not update the studio.");
            }
          };
          return (
            <AdminOrderTile
              key={order.id}
              order={tile}
              selected={selection.has(order.id)}
              onOpen={() => navigate("/admin/order-request/" + order.id)}
              onToggleSelect={() => toggleSelect(order.id)}
              onStudioChange={tile.studio ? setStudio : undefined}
            />
          );
        })}
      </div>
    );
  }

  return (
    <AdminLayout title="Orders">
      <div className="pb-10">
        <OperationsStatsGrid />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-12 pb-24">

          {/* ── SECTION 1: REQUIRING ACTION ── */}
          <section>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
              <h2
                className="text-sm font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity select-none"
                onClick={() => setSect1({...sect1, collapsed: !sect1.collapsed})}
              >
                {sect1.collapsed ? <ChevronDown className="w-4 h-4 text-[#0d9488]" /> : <ChevronUp className="w-4 h-4 text-[#0d9488]" />}
                Orders Requiring Action <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">{actionRequired.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search..." value={sect1.search} onChange={e => setSect1({...sect1, search: e.target.value})}
                    className="h-8 pl-8 pr-3 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-[#0d9488] outline-none" />
                </div>
                <select value={sect1.sort} onChange={e => setSect1({...sect1, sort: e.target.value})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
                <select value={sect1.perPage} onChange={e => setSect1({...sect1, perPage: Number(e.target.value)})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                </select>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <input type="checkbox" onChange={() => selectAll(visibleIds(sect1Filtered, sect1.perPage))}
                    checked={visibleIds(sect1Filtered, sect1.perPage).length > 0 && visibleIds(sect1Filtered, sect1.perPage).every(id => selection.has(id))}
                    className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
                  Select
                </label>
              </div>
            </div>
            {!sect1.collapsed && renderTiles(sect1Filtered.slice(0, sect1.perPage))}
          </section>

          {/* ── SECTION 2: ALL ORDERS ── */}
          <section>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
              <h2
                className="text-sm font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity select-none"
                onClick={() => setSect2({...sect2, collapsed: !sect2.collapsed})}
              >
                {sect2.collapsed ? <ChevronDown className="w-4 h-4 text-black" /> : <ChevronUp className="w-4 h-4 text-black" />}
                All Orders <span className="bg-black text-white px-2 py-0.5 rounded-full text-[10px]">{allActive.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search..." value={sect2.search} onChange={e => setSect2({...sect2, search: e.target.value})}
                    className="h-8 pl-8 pr-3 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-[#0d9488] outline-none" />
                </div>
                <select value={sect2.sortField} onChange={e => setSect2({...sect2, sortField: e.target.value})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  <option value="createdAt">Placed</option>
                  <option value="customer">Customer</option>
                  <option value="total">Total</option>
                  <option value="appointment">Appointment</option>
                  <option value="status">Status</option>
                  <option value="id">Order</option>
                </select>
                <button type="button" onClick={() => setSect2({...sect2, sortOrder: sect2.sortOrder === "asc" ? "desc" : "asc"})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  {sect2.sortOrder === "asc" ? "Asc" : "Desc"}
                </button>
                <select value={sect2.perPage} onChange={e => setSect2({...sect2, perPage: Number(e.target.value)})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                </select>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <input type="checkbox" onChange={() => selectAll(visibleIds(sect2Filtered, sect2.perPage))}
                    checked={visibleIds(sect2Filtered, sect2.perPage).length > 0 && visibleIds(sect2Filtered, sect2.perPage).every(id => selection.has(id))}
                    className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
                  Select
                </label>
              </div>
            </div>
            {!sect2.collapsed && renderTiles(sect2Filtered.slice(0, sect2.perPage))}
          </section>

          {/* ── SECTION 3: ARCHIVES & CANCELLATIONS ── */}
          <section>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
              <h2
                className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity select-none"
                onClick={() => setSect3({...sect3, collapsed: !sect3.collapsed})}
              >
                {sect3.collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                Archives & Cancellations <span className="bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full text-[10px]">{archived.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search..." value={sect3.search} onChange={e => setSect3({...sect3, search: e.target.value})}
                    className="h-8 pl-8 pr-3 rounded-lg border border-gray-200 text-xs focus:ring-1 focus:ring-[#0d9488] outline-none" />
                </div>
                <select value={sect3.perPage} onChange={e => setSect3({...sect3, perPage: Number(e.target.value)})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                </select>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <input type="checkbox" onChange={() => selectAll(visibleIds(sect3Filtered, sect3.perPage))}
                    checked={visibleIds(sect3Filtered, sect3.perPage).length > 0 && visibleIds(sect3Filtered, sect3.perPage).every(id => selection.has(id))}
                    className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
                  Select
                </label>
              </div>
            </div>
            {!sect3.collapsed && <div className="opacity-70">{renderTiles(sect3Filtered.slice(0, sect3.perPage))}</div>}
          </section>
        </div>
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

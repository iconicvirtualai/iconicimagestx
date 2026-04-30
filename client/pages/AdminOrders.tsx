import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Search, ChevronDown, X, Trash2, Archive, Calendar, Layers, Check, ChevronUp, AlertCircle, RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, writeBatch, doc, serverTimestamp, addDoc, getDocs, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function fmtAddr(a: any): string {
  if (!a) return "—";
  if (typeof a === "string") return a;
  if (a.formatted) return a.formatted;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "";
  if (typeof ts === "string" && ts.includes(",")) return ts;

  // Use America/Chicago (CST/CDT) for all formatting
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago"
  };

  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", options);
  try { return new Date(ts).toLocaleDateString("en-US", options); } catch { return ""; }
}

function fmtTimeStandard(timeStr: string | any): string {
  if (!timeStr) return "";
  if (typeof timeStr !== "string") return "";

  // If it's already in 12h format (e.g. "2:30 PM"), return as is
  if (timeStr.match(/am|pm/i)) return timeStr.toUpperCase();

  // Parse military time (e.g. "14:30")
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;

  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'

  return `${hours}:${minutes} ${ampm}`;
}
function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
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
  if (s === "scheduled" || s === "appt_scheduled" || s === "consult_scheduled") return "scheduled";
  return "unscheduled";
}

const UNIFIED_STATUS: Record<string, { label: string; color: string }> = {
  unscheduled: { label: "Unscheduled", color: "bg-red-500 text-white" },
  scheduled: { label: "Scheduled", color: "bg-blue-600 text-white" },
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
  in_review: { label: "In Review", color: "bg-purple-100 text-purple-700" },
  delivered_unpaid: { label: "Delivered - Unpaid", color: "bg-orange-100 text-orange-700" },
  delivered_paid: { label: "Delivered - Paid", color: "bg-teal-100 text-teal-700" },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-400" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-600" },
};

const getName = (o: any) => safe(o.clientName || o.customerName || o.name || ((o.firstName || "") + " " + (o.lastName || "")).trim());
const getAddr = (o: any) => fmtAddr(o.address || o.shootLocation || o.location);
const getTotal = (o: any) => Number(o.total) || Number(o.amount) || Number(o.pricing?.total) || 0;
const getLineItems = (o: any): any[] => o.lineItems || o.services || [];

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [itemsPopup, setItemsPopup] = React.useState<any[] | null>(null);
  const [notesPopup, setNotesPopup] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [staff, setStaff] = React.useState<any[]>([]);
  const [isBulkScheduling, setIsBulkScheduling] = React.useState(false);
  const [isBulkProjecting, setIsBulkProjecting] = React.useState(false);

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
    try {
      for (const id of Array.from(selection)) {
        const order = orders.find(o => o.id === id);
        if (!order || order.listingId) continue;

        const isRE = (order.specializedPhotography === "mls") || (order.lineItems || []).some((li: any) => {
          const n = (li.name || "").toLowerCase();
          return n.includes("listing") || n.includes("aerial") || n.includes("matterport") || n.includes("3d");
        });

        const listingData: any = {
          projectType: isRE ? "real_estate" : "business",
          orderRequestId: id,
          clientName: getName(order),
          clientEmail: order.email || "",
          clientPhone: order.phone || "",
          address: getAddr(order),
          apptDate: order.appointmentDate ? (order.appointmentDate.toDate ? order.appointmentDate.toDate() : new Date(order.appointmentDate + "T12:00:00")) : null,
          apptTime: order.scheduledTime || order.appointmentTime || null,
          services: (order.lineItems || []).map((li: any) => li.name || String(li)),
          status: order.appointmentDate ? "scheduled" : "unscheduled",
          total: getTotal(order),
          images: [], studioEnabled: true, studioToken: crypto.randomUUID(),
          lockDownloads: true, requirePayment: true, lockStudio: false, socialPermission: false,
          accessInfo: [order.accessMethod, order.lockboxCode].filter(Boolean).join(" - ") || "",
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, "listings"), listingData);
        await updateDoc(doc(db, "orderRequests", id), { listingId: ref.id, updatedAt: serverTimestamp() });
        count++;
      }
      toast.success(`Created projects for ${count} orders.`);
    } catch (err) { console.error(err); toast.error("Some projects failed."); }
    finally { setIsBulkProjecting(false); setSelection(new Set()); }
  };

  // ─── FILTERING ─────────────────────────────────────────────────────────────

  const searchFilter = (list: any[], q: string) => {
    if (!q.trim()) return list;
    const low = q.toLowerCase();
    return list.filter(o =>
      getName(o).toLowerCase().includes(low) ||
      getAddr(o).toLowerCase().includes(low) ||
      (o.id || "").toLowerCase().includes(low)
    );
  };

  const actionRequired = orders.filter(o => {
    const s = getUnifiedStatus(o);
    return s === "unscheduled" && s !== "archived" && s !== "cancelled";
  });

  const allActive = orders.filter(o => {
    const s = getUnifiedStatus(o);
    return s !== "archived" && s !== "cancelled";
  });

  const archived = orders.filter(o => {
    const s = getUnifiedStatus(o);
    return s === "archived" || s === "cancelled";
  });

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

  const thCls = "text-left text-[10px] font-black text-gray-400 uppercase tracking-widest py-3 px-3 whitespace-nowrap select-none cursor-pointer hover:text-black transition-colors";

  function SortHeader({ label, field, current, order, onSort, align = "left" }: any) {
    const active = current === field;
    return (
      <th className={thCls + (align === "right" ? " text-right" : align === "center" ? " text-center" : "")} onClick={() => onSort(field)}>
        <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""}`}>
          {label}
          {active && (order === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </div>
      </th>
    );
  }

  function OrderRow({ o }: { o: any }) {
    const status = getUnifiedStatus(o);
    const statusInfo = UNIFIED_STATUS[status] || UNIFIED_STATUS.unscheduled;
    const items = getLineItems(o);
    const requestedDate = o.scheduledDate || fmtDate(o.appointmentDate || o.requestedDate);
    const requestedTime = fmtTimeStandard(o.scheduledTime || o.appointmentTime || o.requestedTime || "");

    // Past detection logic
    let apptDate: Date | null = null;
    if (o.appointmentDate?.toDate) apptDate = o.appointmentDate.toDate();
    else if (o.appointmentDate) apptDate = new Date(o.appointmentDate);
    const isPast = apptDate ? apptDate.getTime() < now : false;

    const isScheduled = ["scheduled","in_progress","pending","pending_edit","in_review","delivered","delivered_unpaid","delivered_paid","paid"].includes(status);

    const assignedNames = (o.assignedProviders || []).map((p: any) => p.name).join(", ") || (Array.isArray(o.photographerNames) ? o.photographerNames.join(", ") : "");
    const preferredName = o.photographerPreference;
    const photogText = isScheduled ? assignedNames : preferredName;
    const notes = (o.vibeNote || "") + (o.notes ? "\n" + o.notes : "") + (o.internalNotes ? "\n" + o.internalNotes : "");

    return (
      <tr className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${selection.has(o.id) ? "bg-teal-50/50" : ""}`}>
        <td className="py-3 px-3">
          <input type="checkbox" checked={selection.has(o.id)} onChange={() => toggleSelect(o.id)} className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
        </td>

        {/* 1. Date Placed */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap cursor-pointer">
          {fmtDate(o.createdAt || o.submittedAt || o.date)}
        </td>

        {/* 2. Customer */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 whitespace-nowrap cursor-pointer">
          <p className="text-xs font-bold text-black">{getName(o)}</p>
          <p className="text-[10px] text-gray-400">{o.email || ""}</p>
        </td>

        {/* 3. Address */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 text-xs font-bold text-black whitespace-nowrap truncate max-w-[200px] cursor-pointer">
          {getAddr(o)}
        </td>

        {/* 4. Items */}
        <td className="py-3 px-3 text-center whitespace-nowrap">
          <button onClick={(e) => { e.stopPropagation(); setItemsPopup(items); }}
            className="text-xs font-bold text-[#0d9488] hover:underline cursor-pointer">
            {items.length}
          </button>
        </td>

        {/* 5. Total */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 text-xs font-bold text-right whitespace-nowrap cursor-pointer">
          {fmtCurrency(getTotal(o))}
        </td>

        {/* 6. Appt Requested Time (with photographer) */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 whitespace-nowrap cursor-pointer">
          <div className="flex flex-col items-start gap-1">
            {isPast ? (
              <span className="inline-block px-2.5 py-1 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm">
                {requestedDate} {requestedTime}
              </span>
            ) : isScheduled ? (
              <span className="inline-block px-2.5 py-1 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm">
                {requestedDate} {requestedTime}
              </span>
            ) : requestedDate ? (
              <span className="inline-block px-2.5 py-1 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm">
                {requestedDate} {requestedTime}
              </span>
            ) : (
              <span className="text-[10px] text-gray-300">—</span>
            )}
            {photogText && (
              <p className="text-[9px] text-gray-400 font-bold italic leading-none ml-1">
                {isScheduled ? "By: " : "Pref: "}{photogText}
              </p>
            )}
          </div>
        </td>

        {/* 7. Notes */}
        <td className="py-3 px-3 text-center whitespace-nowrap">
          {notes.trim() ? (
            <button onClick={(e) => { e.stopPropagation(); setNotesPopup(notes.trim()); }} className="text-lg hover:scale-110 transition-transform">
              🗒️
            </button>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>

        {/* 8. Status */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 whitespace-nowrap cursor-pointer text-center">
          <span className={"px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest " + statusInfo.color}>
            {statusInfo.label}
          </span>
        </td>

        {/* 9. Order # */}
        <td onClick={() => navigate("/admin/order-request/" + o.id)} className="py-3 px-3 text-xs font-bold text-[#0d9488] whitespace-nowrap cursor-pointer text-right">
          #{(o.id || "").substring(0, 6)}
        </td>
      </tr>
    );
  }

  return (
    <AdminLayout title="Orders">
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
              </div>
            </div>
            {!sect1.collapsed && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto animate-in fade-in slide-in-from-top-1 duration-300">
                <table className="w-full">
                  <thead><tr className="border-b-2 border-gray-200">
                    <th className="py-3 px-3 text-left w-10">
                      <input type="checkbox" onChange={() => selectAll(sect1Filtered.slice(0, sect1.perPage).map(o => o.id))}
                        checked={sect1Filtered.slice(0, sect1.perPage).length > 0 && sect1Filtered.slice(0, sect1.perPage).every(o => selection.has(o.id))}
                        className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
                    </th>
                    <th className={thCls}>Placed</th>
                    <th className={thCls}>Customer</th>
                    <th className={thCls}>Address</th>
                    <th className={thCls + " text-center"}>Items</th>
                    <th className={thCls + " text-right"}>Total</th>
                    <th className={thCls}>Appointment</th>
                    <th className={thCls + " text-center"}>Notes</th>
                    <th className={thCls + " text-center"}>Status</th>
                    <th className={thCls + " text-right"}>#</th>
                  </tr></thead>
                  <tbody>{sect1Filtered.slice(0, sect1.perPage).map(o => <OrderRow key={o.id} o={o} />)}</tbody>
                </table>
              </div>
            )}
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
                <select value={sect2.perPage} onChange={e => setSect2({...sect2, perPage: Number(e.target.value)})} className="h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold">
                  <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                </select>
              </div>
            </div>
            {!sect2.collapsed && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto animate-in fade-in slide-in-from-top-1 duration-300">
                <table className="w-full">
                  <thead><tr className="border-b-2 border-gray-200">
                    <th className="py-3 px-3 text-left w-10">
                      <input type="checkbox" onChange={() => selectAll(sect2Filtered.slice(0, sect2.perPage).map(o => o.id))}
                        checked={sect2Filtered.slice(0, sect2.perPage).length > 0 && sect2Filtered.slice(0, sect2.perPage).every(o => selection.has(o.id))}
                        className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
                    </th>
                    <SortHeader label="Placed" field="createdAt" current={sect2.sortField} order={sect2.sortOrder} onSort={(f: any) => setSect2({...sect2, sortField: f, sortOrder: sect2.sortField === f ? (sect2.sortOrder === "asc" ? "desc" : "asc") : "desc"})} />
                    <SortHeader label="Customer" field="customer" current={sect2.sortField} order={sect2.sortOrder} onSort={(f: any) => setSect2({...sect2, sortField: f, sortOrder: sect2.sortField === f ? (sect2.sortOrder === "asc" ? "desc" : "asc") : "desc"})} />
                    <th className={thCls}>Address</th>
                    <th className={thCls + " text-center"}>Items</th>
                    <SortHeader label="Total" field="total" current={sect2.sortField} order={sect2.sortOrder} align="right" onSort={(f: any) => setSect2({...sect2, sortField: f, sortOrder: sect2.sortField === f ? (sect2.sortOrder === "asc" ? "desc" : "asc") : "desc"})} />
                    <SortHeader label="Appointment" field="appointment" current={sect2.sortField} order={sect2.sortOrder} onSort={(f: any) => setSect2({...sect2, sortField: f, sortOrder: sect2.sortField === f ? (sect2.sortOrder === "asc" ? "desc" : "asc") : "desc"})} />
                    <th className={thCls + " text-center"}>Notes</th>
                    <SortHeader label="Status" field="status" current={sect2.sortField} order={sect2.sortOrder} align="center" onSort={(f: any) => setSect2({...sect2, sortField: f, sortOrder: sect2.sortField === f ? (sect2.sortOrder === "asc" ? "desc" : "asc") : "desc"})} />
                    <SortHeader label="#" field="id" current={sect2.sortField} order={sect2.sortOrder} align="right" onSort={(f: any) => setSect2({...sect2, sortField: f, sortOrder: sect2.sortField === f ? (sect2.sortOrder === "asc" ? "desc" : "asc") : "desc"})} />
                  </tr></thead>
                  <tbody>{sect2Filtered.slice(0, sect2.perPage).map(o => <OrderRow key={o.id} o={o} />)}</tbody>
                </table>
              </div>
            )}
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
              </div>
            </div>
            {!sect3.collapsed && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto opacity-70 animate-in fade-in slide-in-from-top-1 duration-300">
                <table className="w-full">
                  <thead><tr className="border-b-2 border-gray-200">
                    <th className="py-3 px-3 text-left w-10">
                      <input type="checkbox" onChange={() => selectAll(sect3Filtered.slice(0, sect3.perPage).map(o => o.id))}
                        checked={sect3Filtered.slice(0, sect3.perPage).length > 0 && sect3Filtered.slice(0, sect3.perPage).every(o => selection.has(o.id))}
                        className="w-4 h-4 rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]" />
                    </th>
                    <th className={thCls}>Placed</th>
                    <th className={thCls}>Customer</th>
                    <th className={thCls}>Address</th>
                    <th className={thCls + " text-center"}>Items</th>
                    <th className={thCls + " text-right"}>Total</th>
                    <th className={thCls}>Appointment</th>
                    <th className={thCls + " text-center"}>Notes</th>
                    <th className={thCls + " text-center"}>Status</th>
                    <th className={thCls + " text-right"}>#</th>
                  </tr></thead>
                  <tbody>{sect3Filtered.slice(0, sect3.perPage).map(o => <OrderRow key={o.id} o={o} />)}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── BULK ACTION BAR ── */}
      {selection.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-black text-white px-6 py-4 rounded-3xl shadow-2xl border border-white/10 flex items-center gap-6">
            <div className="flex items-center gap-3 pr-6 border-r border-white/20">
              <div className="w-8 h-8 bg-[#0d9488] rounded-full flex items-center justify-center font-bold text-sm">{selection.size}</div>
              <span className="text-xs font-bold uppercase tracking-wider">Orders Selected</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => handleBulkStatus("archived")} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-[#0d9488] transition-colors"><Archive className="w-4 h-4" /> Archive</button>
              <button onClick={() => handleBulkStatus("cancelled")} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-colors"><X className="w-4 h-4" /> Cancel</button>
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

      {itemsPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setItemsPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#0d9488]">Order Items</h3>
              <button onClick={() => setItemsPopup(null)}><X className="w-5 h-5 text-gray-400 hover:text-black" /></button>
            </div>
            {itemsPopup.length === 0 ? (
              <p className="text-xs text-gray-400">No items listed.</p>
            ) : (
              <div className="space-y-2">
                {itemsPopup.map((item: any, i: number) => {
                  const name = typeof item === "string" ? item : (item.name || item.label || JSON.stringify(item));
                  const price = typeof item === "object" ? item.price : null;
                  return (
                    <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm font-bold">{name}</span>
                      {price != null && <span className="text-sm font-black">{fmtCurrency(price)}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {notesPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setNotesPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#0d9488]">Order Notes</h3>
              <button onClick={() => setNotesPopup(null)}><X className="w-5 h-5 text-gray-400 hover:text-black" /></button>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-[60vh] overflow-y-auto">
              <p className="text-sm font-medium text-black whitespace-pre-wrap leading-relaxed">
                {notesPopup}
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setNotesPopup(null)} className="bg-black text-white rounded-xl text-xs font-bold px-6">Close</Button>
            </div>
          </div>
        </div>
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
      const updates: any = {
        status: "scheduled",
        appointmentDate: date,
        appointmentTime: time || null,
        scheduledDate: fmtDate(date),
        scheduledTime: time || null,
        assignedProviders: providers.map(pid => {
          const s = staff.find((st: any) => st.id === pid);
          return { providerId: pid, name: s?.name || pid, role: s?.role || "photographer" };
        }),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "orderRequests", orderId), updates);

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

import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Search, ChevronDown, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

function fmtAddr(a: any): string {
  if (!a) return "—";
  if (typeof a === "string") return a;
  if (a.formatted) return a.formatted;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "";
  if (typeof ts === "string" && ts.includes(",")) return ts;
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; }
}
function fmtTime(ts: any): string {
  if (!ts) return "";
  if (typeof ts === "string") return ts;
  return "";
}
function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function isPast(ts: any): boolean {
  if (!ts) return false;
  var d: Date | null = null;
  if (ts.toDate) d = ts.toDate();
  else if (typeof ts === "string") { try { d = new Date(ts); } catch { return false; } }
  return d ? d.getTime() < Date.now() : false;
}

// Unified status flow
function getUnifiedStatus(o: any): string {
  var s = (typeof o.status === "string" ? o.status : "").toLowerCase().replace(/\s+/g, "_");
  var inv = o.invoice || {};
  var paid = inv.amountPaid > 0 || inv.status === "paid" || s === "paid" || s === "delivered_paid";

  if (s === "archived") return "archived";
  if (s === "cancelled") return "cancelled";
  if (paid && (s.includes("delivered") || s === "paid")) return "delivered_paid";
  if (s.includes("delivered")) return "delivered_unpaid";
  if (s === "in_review") return "in_review";
  if (s === "pending" || s === "pending_edit" || s === "in_progress") return "pending";
  if (s === "scheduled" || s === "appt_scheduled" || s === "consult_scheduled") return "scheduled";
  return "unscheduled";
}

const UNIFIED_STATUS: Record<string, { label: string; color: string }> = {
  unscheduled: { label: "Unscheduled", color: "bg-red-100 text-red-700" },
  scheduled: { label: "Scheduled", color: "bg-green-100 text-green-700" },
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
  in_review: { label: "In Review", color: "bg-purple-100 text-purple-700" },
  delivered_unpaid: { label: "Delivered - Unpaid", color: "bg-orange-100 text-orange-700" },
  delivered_paid: { label: "Delivered - Paid", color: "bg-teal-100 text-teal-700" },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-400" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-600" },
};

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [perPage, setPerPage] = React.useState(20);
  const [sortBy, setSortBy] = React.useState("newest");
  const [itemsPopup, setItemsPopup] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); toast.error("Failed to load orders"); setLoading(false); });
    return () => unsub();
  }, []);

  const getName = (o: any) => safe(o.clientName || o.customerName || o.name || ((o.firstName || "") + " " + (o.lastName || "")).trim());
  const getAddr = (o: any) => fmtAddr(o.address || o.shootLocation || o.location);
  const getTotal = (o: any) => Number(o.total) || Number(o.amount) || Number(o.pricing?.total) || 0;
  const getLineItems = (o: any): any[] => o.lineItems || o.services || [];

  const filtered = React.useMemo(() => {
    let result = orders;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        getName(o).toLowerCase().includes(q) ||
        getAddr(o).toLowerCase().includes(q) ||
        (o.id || "").toLowerCase().includes(q) ||
        (o.email || "").toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(0);
      const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(0);
      return sortBy === "newest" ? db2.getTime() - da.getTime() : da.getTime() - db2.getTime();
    });
    return result;
  }, [orders, search, sortBy]);

  const requiring = filtered.filter(o => getUnifiedStatus(o) === "unscheduled");
  const displayed = filtered.slice(0, perPage);

  const thCls = "text-left text-[10px] font-black text-gray-400 uppercase tracking-widest py-3 px-3 whitespace-nowrap";

  function OrderRow({ o }: { o: any }) {
    const status = getUnifiedStatus(o);
    const statusInfo = UNIFIED_STATUS[status] || UNIFIED_STATUS.unscheduled;
    const items = getLineItems(o);
    const requestedDate = o.scheduledDate || fmtDate(o.appointmentDate || o.requestedDate);
    const requestedTime = o.scheduledTime || o.appointmentTime || o.requestedTime || "";
    const isScheduled = ["scheduled","in_progress","pending","pending_edit","in_review","delivered","delivered_unpaid","delivered_paid","paid"].includes(getUnifiedStatus(o)) || (typeof o.status === "string" && o.status.toLowerCase().includes("scheduled"));
    const apptPast = isPast(o.appointmentDate || o.requestedDate);

    return (
      <tr onClick={() => navigate("/admin/order-request/" + o.id)}
        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
        <td className="py-3 px-3 text-xs font-bold text-[#0d9488] whitespace-nowrap">#{(o.id || "").substring(0, 6)}</td>
        <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(o.createdAt || o.submittedAt || o.date)}</td>
        <td className="py-3 px-3 text-xs font-bold text-black whitespace-nowrap truncate max-w-[200px]">{getAddr(o)}</td>
        <td className="py-3 px-3 whitespace-nowrap">
          <p className="text-xs font-bold text-black">{getName(o)}</p>
          <p className="text-[10px] text-gray-400">{o.email || ""}</p>
        </td>
        <td className="py-3 px-3 text-center whitespace-nowrap">
          <button onClick={(e) => { e.stopPropagation(); setItemsPopup(items); }}
            className="text-xs font-bold text-[#0d9488] hover:underline cursor-pointer">
            {items.length}
          </button>
        </td>
        <td className="py-3 px-3 text-xs font-bold text-right whitespace-nowrap">{fmtCurrency(getTotal(o))}</td>
        <td className="py-3 px-3 whitespace-nowrap">
          {apptPast ? (
            <span className="inline-block px-2 py-0.5 bg-black text-white text-[10px] font-bold rounded">
              {requestedDate} {requestedTime}
            </span>
          ) : isScheduled && requestedDate ? (
            <span className="text-[10px] font-bold text-blue-600">{requestedDate} {requestedTime}</span>
          ) : requestedDate ? (
            <span className="text-[10px] font-bold text-red-500">{requestedDate} {requestedTime}</span>
          ) : (
            <span className="text-[10px] text-gray-300">—</span>
          )}
        </td>
        <td className="py-3 px-3 whitespace-nowrap">
          <span className={"px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest " + statusInfo.color}>
            {statusInfo.label}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <AdminLayout title="Orders">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20" />
        </div>
        <div className="flex items-center gap-3">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold bg-white">
            <option value="newest">Date Placed (Newest)</option>
            <option value="oldest">Date Placed (Oldest)</option>
          </select>
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
            className="h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold bg-white">
            <option value={10}>Show 10</option>
            <option value={20}>Show 20</option>
            <option value={50}>Show 50</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {requiring.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-black uppercase tracking-widest">Orders Requiring Action <span className="text-gray-400">({requiring.length})</span></h2>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b-2 border-gray-200">
                    <th className={thCls}>#</th>
                    <th className={thCls}>Placed</th>
                    <th className={thCls}>Address</th>
                    <th className={thCls}>Customer</th>
                    <th className={thCls + " text-center"}>Items</th>
                    <th className={thCls + " text-right"}>Total</th>
                    <th className={thCls}>Appointment</th>
                    <th className={thCls}>Status</th>
                  </tr></thead>
                  <tbody>{requiring.map(o => <OrderRow key={o.id} o={o} />)}</tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-widest">All Orders <span className="text-gray-400">({filtered.length})</span></h2>
              <p className="text-[10px] text-gray-400">{Math.min(perPage, displayed.length)} of {filtered.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b-2 border-gray-200">
                  <th className={thCls}>#</th>
                  <th className={thCls}>Placed</th>
                  <th className={thCls}>Address</th>
                  <th className={thCls}>Customer</th>
                  <th className={thCls + " text-center"}>Items</th>
                  <th className={thCls + " text-right"}>Total</th>
                  <th className={thCls}>Appointment</th>
                  <th className={thCls}>Status</th>
                </tr></thead>
                <tbody>{displayed.map(o => <OrderRow key={o.id} o={o} />)}</tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className="flex justify-center mt-4">
                <button onClick={() => setPerPage(p => p + 20)} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50">
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {itemsPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setItemsPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest">Order Items</h3>
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
    </AdminLayout>
  );
}

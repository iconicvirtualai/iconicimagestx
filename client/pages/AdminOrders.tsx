import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Search, ChevronDown, Plus, ArrowRight } from "lucide-react";
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
  if (!ts) return "—";
  if (typeof ts === "string" && ts.includes(",")) return ts;
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return "—"; }
}
function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-700",
  request: "bg-yellow-100 text-yellow-700",
  needs_scheduled: "bg-red-100 text-red-700",
  scheduled: "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  delivered: "bg-sky-100 text-sky-700",
  paid: "bg-teal-100 text-teal-700",
  archived: "bg-gray-100 text-gray-400",
  cancelled: "bg-red-100 text-red-600",
};

const PAID_COLORS: Record<string, string> = {
  unpaid: "bg-red-100 text-red-600",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [perPage, setPerPage] = React.useState(20);
  const [sortBy, setSortBy] = React.useState("newest");

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); toast.error("Failed to load orders"); setLoading(false); });
    return () => unsub();
  }, []);

  const getStatus = (o: any) => (typeof o.status === "string" ? o.status : "new").toLowerCase().replace(/\s+/g, "_");
  const getName = (o: any) => safe(o.clientName || o.customerName || o.name || `${o.firstName || ""} ${o.lastName || ""}`.trim());
  const getAddr = (o: any) => fmtAddr(o.address || o.shootLocation || o.location);
  const getTotal = (o: any) => Number(o.total) || Number(o.amount) || Number(o.pricing?.total) || 0;
  const getItems = (o: any) => (o.lineItems || o.services || []).length;
  const getPaid = (o: any) => {
    const inv = o.invoice || {};
    if (inv.status === "paid" || getStatus(o) === "paid") return "paid";
    if (inv.amountPaid > 0) return "partial";
    return "unpaid";
  };
  const getFulfilled = (o: any) => {
    const s = getStatus(o);
    if (["delivered", "paid", "archived"].includes(s)) return "Fulfilled";
    return "Unfulfilled";
  };
  const getSchedDate = (o: any) => o.scheduledDate || fmtDate(o.appointmentDate || o.requestedDate);
  const getSchedTime = (o: any) => o.scheduledTime || o.appointmentTime || o.requestedTime || "";

  // Filter
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
    // Sort
    result = [...result].sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(0);
      const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(0);
      return sortBy === "newest" ? db2.getTime() - da.getTime() : da.getTime() - db2.getTime();
    });
    return result;
  }, [orders, search, sortBy]);

  // Split: requiring action vs all
  const requiring = filtered.filter(o => {
    const s = getStatus(o);
    return ["new", "request", "needs_scheduled"].includes(s);
  });
  const displayed = filtered.slice(0, perPage);

  const thCls = "text-left text-[10px] font-black text-gray-400 uppercase tracking-widest py-3 px-4";

  function OrderRow({ o, i }: { o: any; i: number }) {
    const status = getStatus(o);
    const statusColor = STATUS_COLORS[status] || "bg-gray-100 text-gray-500";
    const paid = getPaid(o);
    const paidColor = PAID_COLORS[paid] || "bg-gray-100 text-gray-500";
    const fulfilled = getFulfilled(o);

    return (
      <tr onClick={() => navigate(`/admin/order-request/${o.id}`)}
        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
        <td className="py-3 px-4 text-xs font-bold text-[#0d9488]">#{(o.id || "").substring(0, 6)}</td>
        <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(o.createdAt || o.submittedAt || o.date)}</td>
        <td className="py-3 px-4 text-xs font-bold text-black">{getAddr(o)}</td>
        <td className="py-3 px-4">
          <p className="text-xs font-bold text-black">{getName(o)}</p>
          <p className="text-[10px] text-gray-400">{o.email || "—"}</p>
        </td>
        <td className="py-3 px-4 text-xs text-center">{getItems(o)}</td>
        <td className="py-3 px-4 text-xs font-bold text-right">{fmtCurrency(getTotal(o))}</td>
        <td className="py-3 px-4 text-xs">
          {getSchedDate(o) !== "—" ? (
            <span className="text-xs">{getSchedDate(o)} {getSchedTime(o)}</span>
          ) : (
            <span className="text-[9px] font-bold uppercase text-red-400">Unscheduled</span>
          )}
        </td>
        <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusColor}`}>{status.replace(/_/g, " ")}</span></td>
        <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${paidColor}`}>{paid}</span></td>
        <td className="py-3 px-4"><span className={`text-[9px] font-bold uppercase ${fulfilled === "Fulfilled" ? "text-green-600" : "text-red-400"}`}>{fulfilled}</span></td>
        <td className="py-3 px-4 text-xs text-gray-300"><Plus className="w-3.5 h-3.5" /></td>
      </tr>
    );
  }

  return (
    <AdminLayout title="Orders">
      {/* Search + controls */}
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
          {/* ═══ ORDERS REQUIRING ACTION ═══ */}
          {requiring.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-black uppercase tracking-widest">Orders Requiring Action <span className="text-gray-400">({requiring.length})</span></h2>
                <p className="text-[10px] text-gray-400">Unfulfilled orders with unscheduled appointments</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead><tr className="border-b-2 border-gray-200">
                    <th className={thCls}>#</th>
                    <th className={thCls}>Placed</th>
                    <th className={thCls}>Address</th>
                    <th className={thCls}>Customer</th>
                    <th className={`${thCls} text-center`}>Items</th>
                    <th className={`${thCls} text-right`}>Total</th>
                    <th className={thCls}>Appointment</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Paid</th>
                    <th className={thCls}>Fulfilled</th>
                    <th className={thCls}></th>
                  </tr></thead>
                  <tbody>{requiring.map((o, i) => <OrderRow key={o.id} o={o} i={i} />)}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ ALL ORDERS ═══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-widest">All Orders <span className="text-gray-400">({filtered.length})</span></h2>
              <p className="text-[10px] text-gray-400">{Math.min(perPage, displayed.length)} of {filtered.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead><tr className="border-b-2 border-gray-200">
                  <th className={thCls}>#</th>
                  <th className={thCls}>Placed</th>
                  <th className={thCls}>Address</th>
                  <th className={thCls}>Customer</th>
                  <th className={`${thCls} text-center`}>Items</th>
                  <th className={`${thCls} text-right`}>Total</th>
                  <th className={thCls}>Appointment</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Paid</th>
                  <th className={thCls}>Fulfilled</th>
                  <th className={thCls}></th>
                </tr></thead>
                <tbody>{displayed.map((o, i) => <OrderRow key={o.id} o={o} i={i} />)}</tbody>
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
    </AdminLayout>
  );
}

import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Search, ShoppingBag, ArrowRight, DollarSign, CheckCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

function fmtAddress(addr: any): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  if (typeof addr === "object" && addr !== null) {
    const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "—";
  }
  return String(addr);
}

function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function safeString(val: any): string {
  if (!val) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  needs_scheduled: "bg-red-100 text-red-700",
  scheduled: "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-teal-100 text-teal-700",
  delivered: "bg-sky-100 text-sky-700",
  paid: "bg-teal-100 text-teal-700",
  cancelled: "bg-gray-100 text-gray-400",
  archived: "bg-gray-100 text-gray-400",
};

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      console.error(err);
      toast.error("Failed to load orders");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = React.useMemo(() => {
    return orders.filter(o => {
      const addr = fmtAddress(o.address || o.shootLocation);
      const name = safeString(o.clientName || o.customerName || o.name);
      const matchSearch = !search.trim() ||
        addr.toLowerCase().includes(search.toLowerCase()) ||
        name.toLowerCase().includes(search.toLowerCase());
      const status = (typeof o.status === "string" ? o.status : "pending").toLowerCase().replace(/\s+/g, "_");
      const matchStatus = statusFilter === "all" || status.includes(statusFilter);
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const stats = React.useMemo(() => ({
    total: orders.length,
    completed: orders.filter(o => {
      const s = typeof o.status === "string" ? o.status.toLowerCase() : "";
      return s.includes("completed") || s.includes("paid") || s.includes("delivered");
    }).length,
    revenue: orders.reduce((sum, o) => sum + (Number(o.total) || Number(o.amount) || 0), 0),
  }), [orders]);

  return (
    <AdminLayout title="Orders">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#0d9488]/10 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-[#0d9488]" /></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Orders</p><p className="text-xl font-black">{stats.total}</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Completed</p><p className="text-xl font-black">{stats.completed}</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><DollarSign className="w-5 h-5 text-teal-600" /></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Revenue</p><p className="text-xl font-black">${stats.revenue.toLocaleString()}</p></div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-11 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {["all", "needs_scheduled", "scheduled", "in_progress", "delivered", "paid", "archived"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${statusFilter === s ? "bg-[#0d9488] text-white" : "bg-white border border-slate-200 text-gray-600 hover:border-[#0d9488]"}`}
          >{s.replace(/_/g, " ")}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24"><ShoppingBag className="w-12 h-12 text-gray-200 mx-auto mb-4" /><p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No orders found</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map((o, i) => {
            const name = safeString(o.clientName || o.customerName || o.name);
            const addr = fmtAddress(o.address || o.shootLocation || o.location);
            const status = (typeof o.status === "string" ? o.status : "pending").toLowerCase().replace(/\s+/g, "_");
            const badgeCls = STATUS_BADGE[status] || "bg-yellow-100 text-yellow-700";
            const amount = Number(o.total) || Number(o.amount) || 0;
            return (
              <div key={o.id} onClick={() => navigate(`/admin/order-request/${o.id}`)}
                className={`flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-black text-black">{name}</p>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${badgeCls}`}>{status.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{addr}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {amount > 0 && <p className="text-sm font-black text-black">${amount.toLocaleString()}</p>}
                  <p className="text-[10px] text-gray-400">{fmtDate(o.createdAt || o.date)}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
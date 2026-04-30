import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  ArrowUpRight,
  Mail,
  ClipboardList,
  AlertCircle,
  X,
  Check,
  Calendar,
  DollarSign,
  LayoutGrid,
  Users,
  Clock,
  ChevronRight,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";

// ─── Status system ─────────────────────────────────────────────────────────────
export const ORDER_STATUS: Record<string, { label: string; badge: string }> = {
  new:                  { label: "Unscheduled",          badge: "bg-red-100 text-red-700" },
  pending_confirmation: { label: "Pending Confirmation", badge: "bg-orange-100 text-orange-700" },
  scheduled:            { label: "Scheduled",            badge: "bg-green-100 text-green-700" },
  in_progress:          { label: "In Progress",          badge: "bg-blue-100 text-blue-700" },
  delivered:            { label: "Delivered",            badge: "bg-sky-100 text-sky-700" },
  delivered_paid:       { label: "Delivered · Paid",     badge: "bg-teal-500/10 text-teal-700" },
  cancelled:            { label: "CX — Cancelled",       badge: "bg-amber-900/10 text-amber-900" },
  rescheduled:          { label: "RS — Rescheduled",     badge: "bg-amber-900/10 text-amber-900" },
  archived:             { label: "Archived",             badge: "bg-gray-100 text-gray-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS[status] ?? { label: status || "Unscheduled", badge: "bg-red-100 text-red-700" };
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

// ─── Blank new order form ──────────────────────────────────────────────────────
const BLANK: { firstName: string; lastName: string; email: string; phone: string; address: string; serviceNote: string; scheduledDate: string } = {
  firstName: "", lastName: "", email: "", phone: "", address: "", serviceNote: "", scheduledDate: "",
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [orderRequests, setOrderRequests] = React.useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = React.useState(true);
  const [listingsCount, setListingsCount] = React.useState(0);
  const [scheduledCount, setScheduledCount] = React.useState(0);
  const [revenue, setRevenue] = React.useState(0);

  const [showNewOrder, setShowNewOrder] = React.useState(false);
  const [form, setForm] = React.useState(BLANK);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // ─── Order requests live listener ──────────────────────────────────────────
  React.useEffect(() => {
    const attach = (q: any) =>
      onSnapshot(q, (snap: any) => {
        const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setOrderRequests(docs);
        setScheduledCount(docs.filter((d: any) => d.status === "scheduled").length);
        setRevenue(docs.reduce((s: number, d: any) => s + (Number(d.total) || 0), 0));
        setLoadingOrders(false);
      });

    // Try createdAt first, fall back to submittedAt if index missing
    const q1 = query(collection(db, "orderRequests"), orderBy("createdAt", "desc"));
    let unsub = attach(q1);

    // If it errors (index not built), fall back silently
    const q1err = onSnapshot(q1, () => {}, () => {
      unsub();
      const q2 = query(collection(db, "orderRequests"), orderBy("submittedAt", "desc"));
      unsub = attach(q2);
    });

    return () => { unsub(); q1err(); };
  }, []);

  // ─── Listings live count ────────────────────────────────────────────────────
  React.useEffect(() => {
    const q = query(collection(db, "listings"), where("status", "!=", "archived"));
    const unsub = onSnapshot(q, (snap) => setListingsCount(snap.size), () => {
      onSnapshot(collection(db, "listings"), (snap) => setListingsCount(snap.size));
    });
    return () => unsub();
  }, []);

  // ─── Create new order ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.firstName || !form.email) {
      toast.error("First name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "orderRequests"), {
        firstName: form.firstName,
        lastName: form.lastName,
        clientName: `${form.firstName} ${form.lastName}`.trim(),
        email: form.email.toLowerCase().trim(),
        phone: form.phone,
        address: form.address,
        lineItems: form.serviceNote ? [{ name: form.serviceNote, price: 0 }] : [],
        pricing: {},
        total: 0,
        scheduledDate: form.scheduledDate || null,
        status: "new",
        source: "admin",
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Order created.");
      setShowNewOrder(false);
      setForm(BLANK);
      navigate(`/admin/order-request/${ref.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create order.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Filtered list ─────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    if (!search.trim()) return orderRequests;
    const s = search.toLowerCase();
    return orderRequests.filter((r) =>
      r.clientName?.toLowerCase().includes(s) ||
      r.address?.toLowerCase().includes(s) ||
      r.email?.toLowerCase().includes(s) ||
      r.id?.toLowerCase().includes(s)
    );
  }, [orderRequests, search]);

  const fmtDate = (ts: any) => {
    if (!ts) return "—";
    if (ts.toDate) return ts.toDate().toLocaleDateString();
    return new Date(ts).toLocaleDateString();
  };

  const fmtRev = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <AdminLayout title="Dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Managing the Iconic Ecosystem</p>
        <Button
          onClick={() => setShowNewOrder(true)}
          className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" /> New Order
        </Button>
      </div>

      {/* ── New Order Modal ─────────────────────────────────────────────────── */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-black uppercase tracking-widest">Create Order</h3>
              <button onClick={() => { setShowNewOrder(false); setForm(BLANK); }}>
                <X className="w-5 h-5 text-gray-400 hover:text-black" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {(["firstName", "lastName"] as const).map((k) => (
                <div key={k}>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
                    {k === "firstName" ? "First Name *" : "Last Name"}
                  </label>
                  <input
                    value={form[k]}
                    onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                />
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Property Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="123 Main St, Houston TX"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Service / Notes</label>
                <input
                  value={form.serviceNote}                  onChange={(e) => setForm((p) => ({ ...p, serviceNote: e.target.value }))}
                  placeholder="e.g. Listing Showcase + Aerial"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Appointment Date (optional)</label>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => setForm((p) => ({ ...p, scheduledDate: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl"
              >
                <Check className="w-4 h-4 mr-2" />
                {saving ? "Creating…" : "Create Order"}
              </Button>
              <Button variant="outline" onClick={() => { setShowNewOrder(false); setForm(BLANK); }} className="rounded-xl font-bold">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: "Order Requests", value: orderRequests.length.toString(), icon: <ClipboardList className="w-5 h-5" />, color: "bg-red-500",     href: "/admin/orders" },
          { label: "Scheduled",      value: scheduledCount.toString(),        icon: <Calendar className="w-5 h-5" />,      color: "bg-[#0d9488]", href: "/admin/schedule" },
          { label: "Projects in Progress",value: listingsCount.toString(),     icon: <LayoutGrid className="w-5 h-5" />,    color: "bg-blue-500",  href: "/admin/listings" },
          { label: "Revenue",        value: fmtRev(revenue),                  icon: <DollarSign className="w-5 h-5" />,    color: "bg-orange-500",href: "/admin/revenue" },
        ].map((s) => (
          <Link
            key={s.label}
            to={s.href}
            className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl text-white ${s.color} shadow-lg`}>{s.icon}</div>
              <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-[#0d9488] transition-colors" />
            </div>
            <h3 className="text-2xl font-black text-black mb-1">{s.value}</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Order Requests Queue */}
        <div id="requests" className="lg:col-span-2">
          <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-sm font-black text-black uppercase tracking-widest">Order Requests</h2>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl border border-gray-100 bg-gray-50 focus:border-[#0d9488] outline-none text-xs font-bold w-44"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {loadingOrders ? (
                <div className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-12 text-center text-xs text-gray-400 font-bold uppercase tracking-widest">
                  {search ? "No matches" : "No requests yet"}
                </p>
              ) : filtered.map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/admin/order-request/${r.id}`)}
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 cursor-pointer group transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-black text-sm text-black truncate">{r.clientName || `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—"}</p>
                      <StatusBadge status={r.status || "new"} />
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold truncate">{r.address || "Consultation"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.total > 0 && (
                      <p className="text-xs font-black text-black">${Number(r.total).toLocaleString()}</p>
                    )}
                    <p className="text-[10px] text-gray-400">{fmtDate(r.createdAt || r.submittedAt)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#0d9488] flex-shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">

          {/* Quick Actions */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { label: "New Listing",    sub: "Create a listing manually",  icon: <LayoutGrid className="w-4 h-4" />, href: "/admin/listings" },
                { label: "Messages",       sub: "Client inbox",               icon: <Mail className="w-4 h-4" />,       href: "/admin/messages" },
                { label: "Team",           sub: "Manage staff & roles",       icon: <Users className="w-4 h-4" />,      href: "/admin/team" },
                { label: "Email Templates",sub: "Edit automated emails",      icon: <Mail className="w-4 h-4" />,       href: "/admin/email-templates" },
              ].map((a) => (
                <Link
                  key={a.label}
                  to={a.href}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 group transition-colors"
                >
                  <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-[#0d9488] group-hover:text-white transition-colors text-gray-500 flex-shrink-0">
                    {a.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-black">{a.label}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest">{a.sub}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#0d9488] transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-black rounded-[2.5rem] p-6 text-white">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Recent Activity</h2>
              <Clock className="w-3.5 h-3.5 text-gray-600" />
            </div>
            <div className="space-y-4">
              {loadingOrders ? (
                <div className="w-5 h-5 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
              ) : orderRequests.length === 0 ? (
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">No activity yet</p>
              ) : orderRequests.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/admin/order-request/${r.id}`)}
                  className="cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-xs font-bold text-white truncate group-hover:text-[#0d9488] transition-colors">
                      {r.clientName || `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—"}
                    </p>
                    <StatusBadge status={r.status || "new"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 truncate">{r.address || "Consultation"}</p>
                    <p className="text-[10px] text-gray-600 flex-shrink-0 ml-2">{fmtDate(r.createdAt || r.submittedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}

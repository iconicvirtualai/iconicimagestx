import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  X,
  Check,
  Mail,
  Users,
  Clock,
  ChevronRight,
  ClipboardList,
  Calendar,
  LayoutGrid,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import OperationsStatsGrid from "@/components/OperationsStatsGrid";
import OperationsOverview from "@/components/OperationsOverview";

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
const BLANK = {
  firstName: "", lastName: "", email: "", phone: "", address: "", serviceNote: "", scheduledDate: "",
};

// ─── Hook for Recently Visited ─────────────────────────────────────────────────
function useRecentlyVisited() {
  const [recent, setRecent] = React.useState<{ path: string; label: string; time: number }[]>([]);
  const location = window.location; // Simplified for reuse

  React.useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("iconic_recent_pages") || "[]");
    setRecent(stored);
  }, []);

  React.useEffect(() => {
    if (location.pathname === "/admin/dashboard" || location.pathname === "/admin") return;

    const labelMap: Record<string, string> = {
      "/admin/orders": "Orders",
      "/admin/listings": "Projects",
      "/admin/schedule": "Schedule",
      "/admin/revenue": "Revenue",
      "/admin/team": "Team",
      "/admin/clients": "Clients",
      "/admin/messages": "Messages",
      "/admin/email-templates": "Email Templates",
    };

    let label = labelMap[location.pathname];
    if (!label) {
      if (location.pathname.startsWith("/admin/order-request/")) label = "Order Detail";
      if (location.pathname.startsWith("/admin/listing/")) label = "Project Detail";
    }

    if (!label) return;

    const stored = JSON.parse(localStorage.getItem("iconic_recent_pages") || "[]");
    const filtered = stored.filter((i: any) => i.path !== location.pathname);
    const updated = [{ path: location.pathname, label, time: Date.now() }, ...filtered].slice(0, 4);

    localStorage.setItem("iconic_recent_pages", JSON.stringify(updated));
    setRecent(updated);
  }, [location.pathname]);

  return recent;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const recentPages = useRecentlyVisited();

  const [orderRequests, setOrderRequests] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [showNewOrder, setShowNewOrder] = React.useState(false);
  const [form, setForm] = React.useState(BLANK);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), (snap) => {
      setOrderRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("[AdminDashboard] snapshot error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
      <OperationsStatsGrid />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Daily Overview Grid */}
        <div className="lg:col-span-2">
          <OperationsOverview />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">

          {/* Quick Actions (Live Box) */}
          <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {/* Primary Action */}
              <Link
                to="/admin/listings?new=true"
                className="flex items-center gap-3 p-4 rounded-2xl bg-[#0d9488] text-white hover:bg-[#0f766e] transition-colors group"
              >
                <div className="p-2 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors flex-shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black">New Project</p>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-70">CREATE A PROJECT MANUALLY</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>

              {/* Live Recommendations / Recents */}
              {recentPages.length > 0 && (
                <div className="pt-4 mt-4 border-t border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">Recommended for you</p>
                  <div className="space-y-1">
                    {recentPages.map((page, i) => (
                      <Link
                        key={i}
                        to={page.path}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 group transition-colors"
                      >
                        <div className="p-1.5 bg-gray-100 rounded-lg group-hover:bg-[#0d9488]/10 group-hover:text-[#0d9488] transition-colors text-gray-400 flex-shrink-0">
                          {page.label === "Orders" ? <ClipboardList className="w-3 h-3" /> :
                           page.label === "Projects" ? <LayoutGrid className="w-3 h-3" /> :
                           page.label === "Schedule" ? <Calendar className="w-3 h-3" /> :
                           <Clock className="w-3 h-3" />}
                        </div>
                        <span className="text-xs font-bold text-gray-700">{page.label}</span>
                        <ChevronRight className="w-3 h-3 text-gray-300 ml-auto" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Standard Links (if recents empty or just to fill) */}
              {recentPages.length < 3 && [
                { label: "Messages",       icon: <Mail className="w-3 h-3" />,       href: "/admin/messages" },
                { label: "Team",           icon: <Users className="w-3 h-3" />,      href: "/admin/team" },
              ].filter(link => !recentPages.some(r => r.path === link.href)).map((a) => (
                <Link
                  key={a.label}
                  to={a.href}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 group transition-colors"
                >
                  <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 flex-shrink-0">
                    {a.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-700">{a.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-black rounded-[2.5rem] p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Recent Activity</h2>
              <Clock className="w-3.5 h-3.5 text-gray-600" />
            </div>
            <div className="space-y-4">
              {loading ? (
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
                      {(r.vibeNote || r.notes || r.internalNotes) && <span className="text-[10px] ml-1">🗒️</span>}
                    </p>
                    <StatusBadge status={r.status || "new"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 truncate">{r.address || "Consultation"}</p>
                    <p className="text-[10px] text-gray-600 flex-shrink-0 ml-2">{new Date(r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt).toLocaleDateString()}</p>
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

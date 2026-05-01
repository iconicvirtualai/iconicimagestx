import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  isSameDay,
  isWithinInterval,
  parseISO,
  differenceInHours,
  subDays,
  isAfter,
  isBefore,
  addHours,
  setHours,
} from "date-fns";
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
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Star,
  Sun,
  Cloud,
  CloudRain,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Camera,
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

const fmtRev = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

const fmtCurrency = (n: number) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function generateAlerts(data: any) {
  const list = [];
  if (data.overdueDeliveries > 0) list.push({ text: `${data.overdueDeliveries} overdue deliveries`, status: "red" });
  if (data.urgentRequests > 0) list.push({ text: `${data.urgentRequests} urgent requests (<24h)`, status: "red" });
  if (data.missingUploads > 0) list.push({ text: `${data.missingUploads} missing uploads`, status: "yellow" });
  if (data.notScheduled > 5) list.push({ text: `${data.notScheduled} pending order requests`, status: "yellow" });
  if (data.revToday > 1000) list.push({ text: `Strong revenue day: ${fmtCurrency(data.revToday)}`, status: "green" });

  if (list.length === 0) list.push({ text: "All operations running smoothly", status: "green" });
  return list.slice(0, 3);
}

const isActiveAppointment = (o: any) => {
  const s = (o.status || "").toLowerCase().replace(/\s+/g, "_");
  if (!["scheduled", "appt_scheduled", "consult_scheduled"].includes(s)) return false;

  const apptDateStr = o.appointmentDate || o.scheduledDate || o.apptDate;
  if (!apptDateStr) return false;

  try {
    const apptDate = o.appointmentDate?.toDate ? o.appointmentDate.toDate() :
                     o.apptDate?.toDate ? o.apptDate.toDate() :
                     new Date(apptDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return apptDate >= today;
  } catch { return false; }
};

function getWeatherLabel(code: number) {
  if (code <= 3) return "Sunny/Clear";
  if (code <= 48) return "Cloudy/Foggy";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 99) return "Stormy";
  return "Cloudy";
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS[status] ?? { label: status || "Unscheduled", badge: "bg-red-100 text-red-700" };
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

// ─── Modular Overview Card ───────────────────────────────────────────────────
function OverviewCard({ title, items, color = "gray", icon }: {
  title: string;
  items: { label: string; value: string | number; sub?: string; trend?: "up" | "down"; status?: "green" | "yellow" | "red" | "gray" }[];
  color?: "red" | "orange" | "green" | "blue" | "gray" | "black";
  icon?: React.ReactNode;
}) {
  const colorMap = {
    red: "border-red-100 bg-red-50/30",
    orange: "border-orange-100 bg-orange-50/30",
    green: "border-green-100 bg-green-50/30",
    blue: "border-blue-100 bg-blue-50/30",
    gray: "border-gray-100 bg-gray-50/30",
    black: "border-gray-800 bg-black text-white",
  };

  const statusMap = {
    green: "text-green-600",
    yellow: "text-orange-500",
    red: "text-red-500",
    gray: "text-gray-400",
  };

  return (
    <div className={`rounded-3xl border p-5 transition-all hover:shadow-md ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${color === "black" ? "text-gray-400" : "text-gray-500"}`}>
          {title}
        </h3>
        {icon && <div className={`${color === "black" ? "text-gray-600" : "text-gray-300"}`}>{icon}</div>}
      </div>
      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold ${color === "black" ? "text-gray-500" : "text-gray-400"}`}>
                {item.label}
              </span>
              {item.trend && (
                item.trend === "up" ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-xl font-black ${item.status ? statusMap[item.status] : (color === "black" ? "text-white" : "text-black")}`}>
                {item.value}
              </span>
              {item.sub && (
                <span className={`text-[9px] font-medium uppercase tracking-wider ${color === "black" ? "text-gray-600" : "text-gray-400"}`}>
                  {item.sub}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Blank new order form ──────────────────────────────────────────────────────
const BLANK: { firstName: string; lastName: string; email: string; phone: string; address: string; serviceNote: string; scheduledDate: string } = {
  firstName: "", lastName: "", email: "", phone: "", address: "", serviceNote: "", scheduledDate: "",
};

// ─── Hook for Recently Visited ─────────────────────────────────────────────────
function useRecentlyVisited() {
  const [recent, setRecent] = React.useState<{ path: string; label: string; time: number }[]>([]);
  const location = useLocation();

  React.useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("iconic_recent_pages") || "[]");
    setRecent(stored);
  }, []);

  React.useEffect(() => {
    // Skip dashboard and hidden pages
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
  const [listings, setListings] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [weather, setWeather] = React.useState<any>(null);

  const [showNewOrder, setShowNewOrder] = React.useState(false);
  const [form, setForm] = React.useState(BLANK);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // ─── Data Listeners ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orderRequests"), (snap) => {
      setOrderRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubListings = onSnapshot(collection(db, "listings"), (snap) => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // Fetch weather (Houston fallback)
    fetch("https://api.open-meteo.com/v1/forecast?latitude=29.7604&longitude=-95.3698&current_weather=true")
      .then(r => r.json())
      .then(data => {
        if (data.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature * 9/5 + 32), // C to F
            condition: getWeatherLabel(data.current_weather.weathercode),
            code: data.current_weather.weathercode
          });
        }
      })
      .catch(() => {});

    return () => { unsubOrders(); unsubListings(); };
  }, []);

  const activeAppointmentsCount = listings.filter(l => isActiveAppointment(l)).length;
  const listingsInProgressCount = listings.filter(l => ["in_progress", "delivered"].includes((l.status || "").toLowerCase())).length;
  const paidRevenue = listings.filter(l => {
    const s = (l.status || "").toLowerCase();
    return s === "paid" || s === "delivered_paid";
  }).reduce((s, l) => s + (Number(l.total) || 0), 0);

  // ─── Calculations ────────────────────────────────────────────────────────
  const metrics = React.useMemo(() => {
    if (loading) return null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const getApptDate = (item: any) => {
      const d = item.appointmentDate || item.apptDate || item.scheduledDate;
      if (!d) return null;
      if (d.toDate) return d.toDate();
      if (typeof d === "string") {
        if (d.includes("T")) return parseISO(d);
        return parseISO(`${d}T12:00:00`); // Noon to avoid TZ shifts
      }
      return new Date(d);
    };

    const getCreatedAt = (item: any) => {
      const d = item.createdAt || item.submittedAt;
      if (!d) return null;
      if (d.toDate) return d.toDate();
      return new Date(d);
    };

    const isToday = (d: Date | null) => d && isSameDay(d, now);
    const isThisWeek = (d: Date | null) => d && isWithinInterval(d, { start: weekStart, end: weekEnd });
    const isThisMonth = (d: Date | null) => d && isAfter(d, monthStart);

    // Combine for metrics
    const allItems = [...orderRequests, ...listings];
    // Filter out duplicates (if listing has orderRequestId)
    const uniqueItems = listings.concat(
      orderRequests.filter(or => !listings.some(l => l.orderRequestId === or.id))
    );

    const scheduledToday = uniqueItems.filter(i => isToday(getApptDate(i)));
    const scheduledWeek = uniqueItems.filter(i => isThisWeek(getApptDate(i)));
    const scheduledMonth = uniqueItems.filter(i => isThisMonth(getApptDate(i)));

    const revToday = scheduledToday.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const revWeek = scheduledWeek.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const revMonth = scheduledMonth.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const revProjected = uniqueItems.filter(i => {
      const d = getApptDate(i);
      return d && isAfter(d, now) && !["paid", "delivered_paid"].includes((i.status || "").toLowerCase());
    }).reduce((s, i) => s + (Number(i.total) || 0), 0);

    // Active Shooters
    const shooters: Record<string, number> = {};
    scheduledToday.forEach(i => {
      const names = i.photographerNames || (i.assignedProviders || []).map((p: any) => p.name) || [];
      if (Array.isArray(names)) {
        names.forEach((n: string) => shooters[n] = (shooters[n] || 0) + 1);
      } else if (typeof names === "string") {
        shooters[names] = (shooters[names] || 0) + 1;
      }
    });
    const shooterList = Object.entries(shooters).map(([name, count]) => `${name}(${count})`).join(", ");

    // Action Required
    const notScheduled = orderRequests.filter(or => {
      const s = (or.status || "").toLowerCase();
      return ["new", "needs_scheduled", "unscheduled", "request"].includes(s) && !or.appointmentDate;
    }).length;

    const urgentRequests = orderRequests.filter(or => {
      const d = getApptDate(or) || getCreatedAt(or);
      return d && differenceInHours(d, now) <= 24 && differenceInHours(d, now) >= -24;
    }).length;

    const overdueDeliveries = listings.filter(l => {
      const appt = getApptDate(l);
      if (!appt || isAfter(appt, now)) return false;
      const status = (l.status || "").toLowerCase();
      if (["delivered", "paid", "delivered_paid"].includes(status)) return false;

      // Cutoff 10AM next day
      const cutoff = setHours(addHours(appt, 24), 10);
      return isAfter(now, cutoff);
    }).length;

    const missingUploads = listings.filter(l => {
      const status = (l.status || "").toLowerCase();
      return (status === "in_progress" || status === "delivered_unpaid") && (!l.images || l.images.length === 0);
    }).length;

    // Stability
    const last7Days = { start: subDays(now, 7), end: now };
    const stabilityItems = uniqueItems.filter(i => {
      const d = getApptDate(i) || getCreatedAt(i);
      return d && isWithinInterval(d, last7Days);
    });
    const reschedules = stabilityItems.filter(i => (i.status || "").toLowerCase().includes("rescheduled")).length;
    const cancellations = stabilityItems.filter(i => (i.status || "").toLowerCase() === "cancelled").length;
    const noShows = stabilityItems.filter(i => (i.status || "").toLowerCase() === "no_show").length;

    // Clients
    const clientData: Record<string, { rev: number, vol: number, last: Date }> = {};
    uniqueItems.forEach(i => {
      const name = i.clientName || i.customerName || "Unknown";
      const date = getApptDate(i) || getCreatedAt(i) || new Date(0);
      if (!clientData[name]) clientData[name] = { rev: 0, vol: 0, last: date };
      clientData[name].rev += (Number(i.total) || 0);
      clientData[name].vol += 1;
      if (isAfter(date, clientData[name].last)) clientData[name].last = date;
    });

    const topClientRev = Object.entries(clientData).sort((a, b) => b[1].rev - a[1].rev)[0];
    const topClientVol = Object.entries(clientData).sort((a, b) => b[1].vol - a[1].vol)[0];
    const atRiskCount = Object.values(clientData).filter(c => differenceInHours(now, c.last) > 24 * 30).length;

    return {
      revenue: [
        { label: "Today", value: fmtCurrency(revToday), status: revToday > 0 ? "green" : "gray" },
        { label: "This Week", value: fmtCurrency(revWeek), sub: "Mon-Sun" },
        { label: "Month to Date", value: fmtCurrency(revMonth) },
        { label: "Projected", value: fmtCurrency(revProjected), sub: "Scheduled" },
      ],
      operations: [
        { label: "Appts Today", value: scheduledToday.length },
        { label: "Appts This Week", value: scheduledWeek.length },
        { label: "Active Shooters", value: Object.keys(shooters).length, sub: shooterList || "None" },
      ],
      actionRequired: [
        { label: "Pending Requests", value: notScheduled, status: notScheduled > 0 ? "red" : "gray", sub: "Not Scheduled" },
        { label: "Urgent Requests", value: urgentRequests, status: urgentRequests > 0 ? "red" : "gray", sub: "<24hr Notice" },
        { label: "Overdue Delivery", value: overdueDeliveries, status: overdueDeliveries > 0 ? "yellow" : "gray" },
        { label: "Missing Uploads", value: missingUploads, status: missingUploads > 0 ? "yellow" : "gray", sub: "RAWs Needed" },
      ],
      stability: [
        { label: "Reschedules", value: reschedules, sub: "Last 7 Days" },
        { label: "Cancellations", value: cancellations, sub: "Last 7 Days" },
        { label: "No-Shows", value: noShows, status: noShows > 0 ? "red" : "green" },
      ],
      clients: [
        { label: "Top (Rev)", value: topClientRev ? topClientRev[0] : "—", sub: topClientRev ? fmtCurrency(topClientRev[1].rev) : "" },
        { label: "Top (Vol)", value: topClientVol ? topClientVol[0] : "—", sub: topClientVol ? `${topClientVol[1].vol} Orders` : "" },
        { label: "At-Risk", value: atRiskCount, status: atRiskCount > 5 ? "red" : "yellow", sub: "Inactive > 30d" },
      ],
      performance: [
        { label: "On-Time Rate", value: "96%", status: "green" },
        { label: "Late Appts", value: 0, status: "green" },
        { label: "SLA (24hr)", value: "92%", status: "green" },
      ],
      feedback: [
        { label: "Complaints", value: 0, status: "green" },
        { label: "Compliments", value: 0, status: "gray" },
        { label: "Reviews", value: "—", icon: <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> },
      ],
      external: [
        { label: "Weather", value: weather ? `${weather.temp}°F` : "—", sub: weather ? weather.condition : "Houston, TX", icon: weather ? <Sun className="w-5 h-5 text-orange-400" /> : <Cloud className="w-5 h-5 text-gray-300" /> },
        { label: "Impacted Appts", value: 0, status: "green" },
      ],
      alerts: generateAlerts({ notScheduled, urgentRequests, overdueDeliveries, missingUploads, revToday, revWeek })
    };
  }, [loading, orderRequests, listings, weather]);

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
          { label: "Order Requests", value: orderRequests.filter(r => ["new", "needs_scheduled", "unscheduled", "request"].includes((r.status||"").toLowerCase())).length.toString(), icon: <ClipboardList className="w-5 h-5" />, color: "bg-red-500",     href: "/admin/orders" },
          { label: "Active Appointments", value: activeAppointmentsCount.toString(), icon: <Calendar className="w-5 h-5" />,      color: "bg-[#0d9488]", href: "/admin/schedule" },
          { label: "Projects in Progress",value: listingsInProgressCount.toString(), icon: <LayoutGrid className="w-5 h-5" />,    color: "bg-blue-500",  href: "/admin/listings" },
          { label: "Revenue",        value: fmtRev(paidRevenue),              icon: <DollarSign className="w-5 h-5" />,    color: "bg-orange-500",href: "/admin/revenue" },
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

        {/* Daily Overview Grid */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm min-h-full">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#0d9488]/10 rounded-lg">
                  <LayoutGrid className="w-5 h-5 text-[#0d9488]" />
                </div>
                <h2 className="text-sm font-black text-black uppercase tracking-widest">Daily Overview</h2>
              </div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {new Date().toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>

            {/* Alerts Bar */}
            <div className="mb-8 space-y-2">
              {!metrics ? (
                <div className="h-10 bg-gray-50 animate-pulse rounded-2xl" />
              ) : metrics.alerts.map((alert: any, i: number) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest border ${
                  alert.status === "red" ? "bg-red-50 border-red-100 text-red-600" :
                  alert.status === "yellow" ? "bg-orange-50 border-orange-100 text-orange-600" :
                  "bg-green-50 border-green-100 text-green-600"
                }`}>
                  {alert.status === "red" ? <AlertTriangle className="w-4 h-4" /> :
                   alert.status === "yellow" ? <Clock className="w-4 h-4" /> :
                   <CheckCircle className="w-4 h-4" />}
                  {alert.text}
                </div>
              ))}
            </div>

            {/* Modular Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!metrics ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-48 bg-gray-50 animate-pulse rounded-3xl" />
                ))
              ) : (
                <>
                  <OverviewCard title="Revenue" items={metrics.revenue} color="green" icon={<DollarSign className="w-4 h-4" />} />
                  <OverviewCard title="Operations" items={metrics.operations} color="blue" icon={<Calendar className="w-4 h-4" />} />
                  <OverviewCard title="Action Required" items={metrics.actionRequired} color="red" icon={<AlertCircle className="w-4 h-4" />} />
                  <OverviewCard title="Stability (7d)" items={metrics.stability} color="orange" icon={<TrendingUp className="w-4 h-4" />} />
                  <OverviewCard title="Client Insights" items={metrics.clients} color="gray" icon={<Users className="w-4 h-4" />} />
                  <OverviewCard title="Team Performance" items={metrics.performance} color="green" icon={<CheckCircle className="w-4 h-4" />} />
                  <OverviewCard title="External Factors" items={metrics.external} />
                  <OverviewCard title="Feedback" items={metrics.feedback} color="gray" icon={<MessageSquare className="w-4 h-4" />} />
                </>
              )}
            </div>
          </div>
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

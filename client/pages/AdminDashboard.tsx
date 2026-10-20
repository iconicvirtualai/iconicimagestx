import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Mail,
  Users,
  Clock,
  ChevronRight,
  ClipboardList,
  Calendar,
  LayoutGrid,
} from "lucide-react";
import { recordAddressText } from "@shared/addressText";
import { formatChicagoDate } from "@shared/clientHome";
import {
  appointmentTravelEvents,
  assignablePhotographers,
  orderAssignmentPatch,
  type AssignablePhotographer,
} from "@shared/adminOrderSchedule";
import { adminAppointmentWarnings, DEFAULT_BOOKING_DURATION_MINUTES } from "@shared/bookingAvailability";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { resolvePortalClientId } from "@/lib/listingClient";
import { upsertScheduledAppointment } from "@/lib/scheduleRecords";
import { BLANK_NEW_ORDER, NewOrderDialog, type NewOrderClient } from "@/components/NewOrderDialog";
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
      "/admin/customers": "Clients",
      "/admin/clients": "Clients",
      "/admin/communications": "Communications",
      "/admin/messages": "Communications",
      "/admin/email-templates": "Email Templates",
    };

    let label = labelMap[location.pathname];
    if (!label) {
      if (location.pathname.startsWith("/admin/order-request/")) label = "Order Detail";
      if (location.pathname.startsWith("/admin/listing/")) label = "Project Detail";
      if (location.pathname.startsWith("/admin/customers/")) label = "Client Account";
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
  const [form, setForm] = React.useState(BLANK_NEW_ORDER);
  const [saving, setSaving] = React.useState(false);
  const [clients, setClients] = React.useState<NewOrderClient[]>([]);
  const [staff, setStaff] = React.useState<Array<Record<string, unknown>>>([]);
  const [bookingPeople, setBookingPeople] = React.useState<Array<{ id: string; name: string }>>([]);
  const [appointments, setAppointments] = React.useState<Array<Record<string, unknown>>>([]);
  const [bufferMinutes, setBufferMinutes] = React.useState<number | undefined>(undefined);

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

  React.useEffect(() => {
    if (!showNewOrder) return;
    let cancel = false;
    getDocs(collection(db, "clients"))
      .then((snap) => {
        if (!cancel) setClients(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      })
      .catch((err) => console.warn("[AdminDashboard] Client list failed.", err));
    getDocs(collection(db, "staff"))
      .then((snap) => {
        if (cancel) return;
        setStaff(snap.docs.map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
            ...data,
          };
        }));
      })
      .catch((err) => console.warn("[AdminDashboard] Staff list failed.", err));
    getDocs(collection(db, "appointments"))
      .then((snap) => {
        if (!cancel) setAppointments(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      })
      .catch((err) => console.warn("[AdminDashboard] Appointment list failed.", err));
    fetch("/api/bookings/photographers")
      .then((response) => response.json())
      .then((body) => {
        if (cancel) return;
        const people = Array.isArray(body?.photographers) ? body.photographers : [];
        setBookingPeople(people.filter((person: { id?: unknown; name?: unknown }) => person?.id && person?.name));
        if (typeof body?.bufferMinutes === "number") setBufferMinutes(body.bufferMinutes);
      })
      .catch((err) => console.warn("[AdminDashboard] Photographer list failed.", err));
    return () => { cancel = true; };
  }, [showNewOrder]);

  const photographers = assignablePhotographers({
    booking: bookingPeople,
    staff: staff as never,
  });
  const selectedPhotographer = photographers.find((person) => person.key === form.photographerKey) || null;
  const scheduleWarnings = selectedPhotographer && form.scheduledDate && form.scheduledTime
    ? adminAppointmentWarnings({
      photographerId: selectedPhotographer.bookingPhotographerId || selectedPhotographer.staffId || selectedPhotographer.key,
      photographerName: selectedPhotographer.name,
      role: selectedPhotographer.role,
      date: form.scheduledDate,
      time: form.scheduledTime,
      bufferMinutes,
      events: appointmentTravelEvents({
        records: [...orderRequests, ...appointments],
        photographer: selectedPhotographer,
        date: form.scheduledDate,
      }),
    })
    : [];

  const closeNewOrder = () => {
    setShowNewOrder(false);
    setForm(BLANK_NEW_ORDER);
  };

  const handleCreate = async () => {
    if (!form.firstName || !form.email) {
      toast.error("First name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const email = form.email.toLowerCase().trim();
      let clientId: string | null = form.clientId || null;
      try {
        clientId = await resolvePortalClientId({ email, clientId });
      } catch (lookupErr) {
        console.warn("[AdminDashboard] Client lookup failed.", lookupErr);
      }
      const photographer: AssignablePhotographer | null = photographers.find((person) => person.key === form.photographerKey) || null;
      const assignment = orderAssignmentPatch({
        photographer,
        date: form.scheduledDate,
        time: form.scheduledTime,
        durationMinutes: form.scheduledDate ? DEFAULT_BOOKING_DURATION_MINUTES : null,
        overrideNotes: scheduleWarnings,
      });
      const lineItems = form.serviceNote ? [{ name: form.serviceNote, price: 0 }] : [];
      const ref = await addDoc(collection(db, "orderRequests"), {
        firstName: form.firstName,
        lastName: form.lastName,
        clientName: `${form.firstName} ${form.lastName}`.trim(),
        email,
        clientEmail: email,
        clientId,
        phone: form.phone,
        address: form.address,
        lineItems,
        pricing: {},
        total: 0,
        status: "new",
        source: "admin",
        ...assignment,
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (form.scheduledDate) {
        const providerId = photographer?.staffId || photographer?.bookingPhotographerId || "";
        try {
          await upsertScheduledAppointment({
            orderRequestId: ref.id,
            order: {
              firstName: form.firstName,
              lastName: form.lastName,
              clientName: `${form.firstName} ${form.lastName}`.trim(),
              email,
              phone: form.phone,
              address: form.address,
              clientId,
              lineItems,
            },
            date: form.scheduledDate,
            time: form.scheduledTime || null,
            providerIds: providerId ? [providerId] : [],
            staff: providerId && photographer ? [{
              id: providerId,
              name: photographer.name,
              role: photographer.role,
            }] : [],
          });
        } catch (scheduleErr) {
          console.error(scheduleErr);
          toast.error(scheduleErr instanceof Error ? scheduleErr.message : "Order saved. The schedule could not be updated.");
        }
      }
      toast.success(clientId ? "Order created and linked to that client." : "Order created. No client account uses that email yet.");
      if (scheduleWarnings.length > 0) toast.warning(scheduleWarnings[0]);
      setShowNewOrder(false);
      setForm(BLANK_NEW_ORDER);
      navigate(`/admin/order-request/${ref.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create order.");
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
        <NewOrderDialog
          form={form}
          setForm={setForm}
          clients={clients}
          photographers={photographers}
          warnings={scheduleWarnings}
          saving={saving}
          onClose={closeNewOrder}
          onCreate={handleCreate}
        />
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
                { label: "Communications", icon: <Mail className="w-3 h-3" />,       href: "/admin/communications" },
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
                    <p className="text-[10px] text-gray-500 truncate">{recordAddressText(r) || "Consultation"}</p>
                    <p className="text-[10px] text-gray-600 flex-shrink-0 ml-2">{formatChicagoDate(r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt) || ""}</p>
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

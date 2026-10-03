import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clientPortalAction, staffHomePath } from "@shared/staffAccess";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import { CalendarClock, ClipboardList, FolderOpen, Image, LogOut, Receipt } from "lucide-react";

interface PortalHome {
  profile?: { firstName?: string; lastName?: string; email?: string };
  appointments?: Array<{
    id: string;
    address: string;
    status: string;
    statusLabel: string;
    scheduledDate: string;
    scheduledTime: string;
  }>;
  orders?: Array<{ id: string; address: string; status: string; href?: string }>;
  galleries: Array<{ id: string; title: string; address?: string; status: string; href: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; total: number; amountDue: number; href: string }>;
  projects: Array<{ id: string; address: string; status: string; imageCount: number; href: string }>;
}

function money(value: number) {
  return "$" + (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function ClientPortal() {
  const { user, userType, staffProfile, clientProfile, loading, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [home, setHome] = useState<PortalHome | null>(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading || !user || userType !== "client") return;

    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/clients/me/home", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load your portal.");
        if (!cancelled) setHome(data);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your portal.");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userType, loading]);

  if (loading) {
    return <PortalPending />;
  }

  if (user && userType === "staff") {
    return <Navigate to={staffHomePath(staffProfile?.role)} replace />;
  }

  const gate = clientPortalAction({
    loading,
    hasUser: Boolean(user),
    isClient: userType === "client",
  });
  if (gate.type !== "show-home" || !user) {
    return <Navigate to="/portal" replace />;
  }

  const firstName = home?.profile?.firstName || clientProfile?.firstName || "there";

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-black">
      <header className="bg-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
            <h1 className="text-3xl font-black mt-2">Hello, {firstName}</h1>
            <p className="text-gray-400 text-sm mt-1">Appointment requests, galleries, invoices, and projects for your account.</p>
          </div>
          <Button
            variant="outline"
            className="border-zinc-700 bg-transparent text-white hover:bg-zinc-900"
            onClick={async () => {
              await signOutUser();
              navigate("/portal");
            }}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="font-bold">{error}</p>
            <Button asChild className="mt-4 bg-black text-white">
              <Link to="/portal">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <Section
              icon={<CalendarClock className="w-4 h-4" />}
              title="Appointments"
              empty="No appointment requests yet. A booking made with this email shows up here."
            >
              {(home?.appointments || []).map((appointment) => (
                <div key={appointment.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="font-black">{appointment.address}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">
                    {appointment.statusLabel}
                    {appointment.scheduledDate ? ` · ${appointment.scheduledDate}` : ""}
                    {appointment.scheduledTime ? ` · ${appointment.scheduledTime}` : ""}
                  </p>
                </div>
              ))}
            </Section>

            <Section
              icon={<ClipboardList className="w-4 h-4" />}
              title="Orders"
              empty="No orders yet. An order created for this email shows up here."
            >
              {(home?.orders || []).map((order) => {
                const body = (
                  <>
                    <p className="font-black">{order.address || "Order"}</p>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{String(order.status || "new").replace(/_/g, " ")}</p>
                  </>
                );
                return order.href ? (
                  <Link key={order.id} to={order.href} className="block bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#0d9488]">
                    {body}
                  </Link>
                ) : (
                  <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5">{body}</div>
                );
              })}
            </Section>

            <Section
              icon={<Image className="w-4 h-4" />}
              title="Galleries"
              empty="No galleries yet. Delivered photos for your email will show up here, including a playtest gallery once it is seeded."
            >
              {home?.galleries.map((gallery) => (
                <Link key={gallery.id} to={gallery.href} className="block bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#0d9488]">
                  <p className="font-black">{gallery.address || gallery.title}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{gallery.status.replace(/_/g, " ")}</p>
                </Link>
              ))}
            </Section>

            <Section
              icon={<Receipt className="w-4 h-4" />}
              title="Invoices"
              empty="No invoices yet. Unpaid invoices stay locked until payment, the same way live deliveries do."
            >
              {home?.invoices.map((invoice) => (
                <Link key={invoice.id} to={invoice.href} className="block bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#0d9488]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{invoice.invoiceNumber}</p>
                    <p className="font-black">{money(invoice.amountDue)}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{invoice.status}</p>
                </Link>
              ))}
            </Section>

            <Section
              icon={<FolderOpen className="w-4 h-4" />}
              title="Projects"
              empty="No projects are tied to this login yet. After a photographer uploads to your job, the photos open from here."
            >
              {home?.projects.map((project) => (
                <Link key={project.id} to={project.href} className="block bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#0d9488]">
                  <p className="font-black">{typeof project.address === "string" ? project.address : "Project"}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">
                    {String(project.status || "").replace(/_/g, " ")} · {project.imageCount} photo{project.imageCount === 1 ? "" : "s"}
                  </p>
                </Link>
              ))}
            </Section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function PortalPending() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Section({
  icon,
  title,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  const hasItems = items.length > 0;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[#0d9488]">
        {icon}
        <h2 className="text-xs font-black uppercase tracking-widest">{title}</h2>
      </div>
      {hasItems ? <div className="grid gap-3">{children}</div> : (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{empty}</div>
      )}
    </section>
  );
}

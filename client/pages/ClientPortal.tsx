import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clientPortalAction, staffHomePath } from "@shared/staffAccess";
import { calendarDateKey, type ClientAppointment, type ClientInvoiceStatement, type ClientListingCard } from "@shared/clientHome";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ClientHomeView, type ClientHomeSection } from "@/components/client-home/ClientHomeDashboard";

interface PortalHome {
  profile?: { firstName?: string; lastName?: string; email?: string };
  listings?: ClientListingCard[];
  projects?: ClientListingCard[];
  invoices?: ClientInvoiceStatement[];
  appointments?: ClientAppointment[];
  listingsTruncated?: boolean;
  invoicesTruncated?: boolean;
  appointmentsTruncated?: boolean;
}

export default function ClientPortal() {
  const { user, userType, staffProfile, clientProfile, loading, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [home, setHome] = useState<PortalHome | null>(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);
  const [section, setSection] = useState<ClientHomeSection>("listings");

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
  const listings = home?.listings?.length ? home.listings : home?.projects || [];
  const today = calendarDateKey(new Date()) || "1970-01-01";

  return (
    <div className="min-h-screen bg-[#f6f7f8] flex flex-col">
      <div className="flex-1">
        {error && !home ? (
          <div className="min-h-screen bg-[#f6f7f8] text-black">
            <div className="max-w-xl mx-auto px-4 py-24 text-center">
              <p className="font-bold">{error}</p>
              <Button asChild className="mt-4 bg-black text-white">
                <Link to="/portal">Back to sign in</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ClientHomeView
            firstName={firstName}
            listings={listings}
            invoices={home?.invoices || []}
            appointments={home?.appointments || []}
            listingsTruncated={Boolean(home?.listingsTruncated)}
            invoicesTruncated={Boolean(home?.invoicesTruncated)}
            appointmentsTruncated={Boolean(home?.appointmentsTruncated)}
            section={section}
            onSection={setSection}
            onSignOut={async () => {
              await signOutUser();
              navigate("/portal");
            }}
            today={today}
            loading={fetching}
            error={error}
          />
        )}
      </div>
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

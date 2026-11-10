import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clientPortalAction, staffHomePath } from "@shared/staffAccess";
import { CHANGE_PASSWORD_PATH } from "@shared/passwordAccount";
import { calendarDateKey, type ClientAppointment, type ClientInvoiceStatement, type ClientListingCard } from "@shared/clientHome";
import { Button } from "@/components/ui/button";
import { ClientHomeView, type ClientHomeSection } from "@/components/client-home/ClientHomeDashboard";
import { portalHref } from "@/components/client-hub/PortalShell";
import { exampleAppointments, exampleInvoice, exampleListings, exampleThreads, samplePortalProfile } from "@/lib/exampleHub";

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
  const { user, userType, staffProfile, clientProfile, loading, mustChangePassword, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const example = params.get("example") === "1";
  const requested = params.get("section");
  const section: ClientHomeSection = requested === "schedule" || requested === "messages" || requested === "orders" ? requested : "listings";
  const [home, setHome] = useState<PortalHome | null>(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(!example);
  function onSection(next: ClientHomeSection) {
    const nextParams = new URLSearchParams(params);
    if (example) nextParams.set("example", "1");
    if (next === "listings") nextParams.delete("section");
    else nextParams.set("section", next);
    setParams(nextParams, { replace: true });
  }

  useEffect(() => {
    if (example || loading || !user || userType !== "client") return;

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
  }, [user, userType, loading, example]);

  if (!example && loading) {
    return <PortalPending />;
  }

  if (!example && !loading && user && mustChangePassword) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  if (!example && user && userType === "staff") {
    return <Navigate to={staffHomePath(staffProfile?.role)} replace />;
  }

  if (!example) {
    const gate = clientPortalAction({
      loading,
      hasUser: Boolean(user),
      isClient: userType === "client",
    });
    if (gate.type !== "show-home" || !user) {
      return <Navigate to="/portal" replace />;
    }
  }

  const sampleProfile = example ? samplePortalProfile() : null;
  const firstName = sampleProfile?.firstName || home?.profile?.firstName || clientProfile?.firstName || "there";
  const accountName = sampleProfile
    ? `${sampleProfile.firstName} ${sampleProfile.lastName}`.trim()
    : [home?.profile?.firstName, home?.profile?.lastName].filter(Boolean).join(" ") || [clientProfile?.firstName, clientProfile?.lastName].filter(Boolean).join(" ") || firstName;
  const listings = example ? exampleListings() : home?.listings?.length ? home.listings : home?.projects || [];
  const today = calendarDateKey(new Date()) || "1970-01-01";

  return (
    <div className="iframe-safe-page">
      {error && !home && !example ? (
        <div className="iframe-safe-page bg-[#f5f2ea] text-black">
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
          accountName={accountName}
          listings={listings}
          invoices={example ? [exampleInvoice()] : home?.invoices || []}
          appointments={example ? exampleAppointments() : home?.appointments || []}
          listingsTruncated={Boolean(home?.listingsTruncated)}
          invoicesTruncated={Boolean(home?.invoicesTruncated)}
          appointmentsTruncated={Boolean(home?.appointmentsTruncated)}
          section={section}
          onSection={onSection}
          onSignOut={async () => {
            await signOutUser();
            navigate(portalHref("/portal", example));
          }}
          today={today}
          loading={fetching}
          error={error}
          example={example}
          messageCount={example ? exampleThreads().length : 0}
        />
      )}
    </div>
  );
}

function PortalPending() {
  return (
    <div className="iframe-safe-page bg-[#f6f7f8] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

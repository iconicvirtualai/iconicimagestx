import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clientPortalAction, staffHomePath } from "@shared/staffAccess";
import { billingPrefill, type BillingProfile, type ClientHubProfile } from "@shared/clientHubSettings";
import Footer from "@/components/Footer";
import BookingForm, { type PortalOrderPrefill } from "@/components/BookingForm";
import { PortalShell } from "@/components/client-hub/PortalShell";
import { useExampleMode } from "@/pages/PortalSettings";
import { exampleBilling, exampleProfile } from "@/lib/exampleHub";

export default function PortalOrder() {
  const example = useExampleMode();
  const { user, userType, staffProfile, clientProfile, loading, signOutUser } = useAuth();
  const [prefill, setPrefill] = useState<PortalOrderPrefill | null>(example ? billingPrefill(exampleProfile(), exampleBilling()) : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const [profileRes, billingRes] = await Promise.all([
          fetch("/api/clients/me/hub/profile", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/clients/me/hub/billing", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const profileBody = await profileRes.json().catch(() => ({}));
        const billingBody = await billingRes.json().catch(() => ({}));
        if (!profileRes.ok) throw new Error(profileBody.error || "Could not load your profile.");
        if (cancelled) return;
        const profile = profileBody.profile as ClientHubProfile;
        const billing = billingRes.ok ? billingBody.billing as BillingProfile : null;
        setPrefill(billingPrefill(profile, billing));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your profile.");
      }
    })();
    return () => { cancelled = true; };
  }, [example, user]);

  if (!example) {
    if (loading) return <Pending />;
    if (user && userType === "staff") return <Navigate to={staffHomePath(staffProfile?.role)} replace />;
    const gate = clientPortalAction({ loading, hasUser: Boolean(user), isClient: userType === "client" });
    if (gate.type !== "show-home" || !user) return <Navigate to="/portal" replace />;
  }

  const firstName = example ? "Example" : clientProfile?.firstName || prefill?.firstName || "there";

  return (
    <div className="iframe-safe-page bg-[#f6f7f8] flex flex-col">
      <PortalShell
        firstName={firstName}
        example={example}
        active="order"
        onSignOut={example ? undefined : () => void signOutUser().then(() => { window.location.assign("/portal"); })}
      >
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-4 pt-6 sm:px-6">
            <h2 className="text-2xl font-black">Place an order</h2>
            <p className="text-sm text-gray-500 mt-1">Packages, add-ons, and appointment times are the same as the public order form.</p>
            {prefill ? (
              <p className="text-sm text-gray-700 mt-3 break-words">
                Ordering as {prefill.firstName} {prefill.lastName} · {prefill.email}
                {prefill.billingEmail ? ` · Billing ${prefill.billingEmail}` : ""}
                {prefill.billToAddress ? ` · ${prefill.billToAddress}` : ""}
              </p>
            ) : null}
            {error ? <p className="mt-3 text-sm font-bold">{error}</p> : null}
          </div>
          {prefill ? <BookingForm prefill={prefill} source="portal" /> : <Pending />}
        </div>
      </PortalShell>
      <Footer />
    </div>
  );
}

function Pending() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

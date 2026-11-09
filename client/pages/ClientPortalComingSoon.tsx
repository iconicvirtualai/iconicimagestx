import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CLIENT_PORTAL_MEDIA_HREF, clientPortalEnabled } from "@shared/clientPortal";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { staffHomePath } from "@shared/staffAccess";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/Footer";

/**
 * Shown for /login, /portal, and portal subpages while CLIENT_PORTAL_ENABLED
 * is not exactly "true". Signed-in staff still go to their admin home.
 * Signed-out staff can open /admin/login from the text link.
 */
export function ClientPortalComingSoon() {
  const { user, userType, staffProfile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && userType === "staff") {
      navigate(staffHomePath(staffProfile?.role), { replace: true });
    }
  }, [loading, user, userType, staffProfile, navigate]);

  if (loading) {
    return (
      <div className="iframe-safe-page bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="iframe-safe-page bg-black flex flex-col text-white">
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold tracking-wider">ICONIC</h1>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-zinc-500">Client portal</p>
          <h2 className="mt-8 text-2xl font-semibold">Client portal coming soon</h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">
            Email{" "}
            <a href={BUSINESS_CONTACT.emailHref} className="font-semibold text-white underline underline-offset-4">
              {BUSINESS_CONTACT.email}
            </a>
            {" "}and we will send you access to your media.
          </p>
          {CLIENT_PORTAL_MEDIA_HREF ? (
            <p className="mt-6">
              <a href={CLIENT_PORTAL_MEDIA_HREF} className="text-sm font-semibold text-white underline underline-offset-4">
                Open your media
              </a>
            </p>
          ) : null}
          <p className="mt-10 text-xs text-zinc-600">
            <Link to="/admin/login" className="hover:text-zinc-400">Staff sign in</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function ClientPortalSurface({ children }: { children: ReactNode }) {
  if (clientPortalEnabled()) return <>{children}</>;
  return <ClientPortalComingSoon />;
}

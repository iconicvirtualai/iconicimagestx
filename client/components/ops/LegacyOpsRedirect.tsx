import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { legacyOpsTarget } from "@shared/opsLifecycle";

/** Old Delivery, Photographer, and Upload bookmarks. Query strings stay on the new URL. */
export default function LegacyOpsRedirect() {
  const { pathname, search } = useLocation();
  const { staffProfile, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
      </div>
    );
  }
  const target = legacyOpsTarget({
    pathname,
    search,
    role: staffProfile?.role || "",
  });
  return <Navigate to={target} replace />;
}

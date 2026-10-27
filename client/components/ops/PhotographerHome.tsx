import { Navigate, useLocation } from "react-router-dom";
import AdminPhotographer from "@/pages/AdminPhotographer";
import { useAuth } from "@/contexts/AuthContext";
import { legacyOpsTarget } from "@shared/opsLifecycle";

/** Photographers keep the portal. Admins and coordinators use the shoot lifecycle. */
export default function PhotographerHome() {
  const { staffProfile } = useAuth();
  const { search } = useLocation();
  if (staffProfile?.role === "photographer") return <AdminPhotographer />;
  return (
    <Navigate
      to={legacyOpsTarget({ pathname: "/admin/photographer", search, role: staffProfile?.role || "admin" })}
      replace
    />
  );
}

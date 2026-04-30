/**
 * ProtectedRoute — Role-based route guard for admin pages.
 *
 * Usage:
 *   <ProtectedRoute requiredRole="admin">...</ProtectedRoute>
 *   <ProtectedRoute requiredRole="coordinator">...</ProtectedRoute>
 *   <ProtectedRoute requiredRole="photographer">...</ProtectedRoute>
 *   <ProtectedRoute requiredRole="editor">...</ProtectedRoute>
 *   <ProtectedRoute requiredRole="staff">...</ProtectedRoute>  // any staff
 */

import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldOff } from "lucide-react";

type RequiredRole = "admin" | "coordinator" | "photographer" | "editor" | "staff";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: RequiredRole;
}

// Role hierarchy check — returns true if the user's role satisfies the requirement
function hasAccess(
  userRole: string | undefined,
  required: RequiredRole
): boolean {
  if (!userRole) return false;

  switch (required) {
    case "admin":
      return userRole === "admin";
    case "coordinator":
      return userRole === "admin" || userRole === "coordinator";
    case "photographer":
      return (
        userRole === "admin" ||
        userRole === "coordinator" ||
        userRole === "photographer"
      );
    case "editor":
      return (
        userRole === "admin" ||
        userRole === "coordinator" ||
        userRole === "editor"
      );
    case "staff":
      return ["admin", "coordinator", "photographer", "editor"].includes(
        userRole
      );
    default:
      return false;
  }
}

export default function ProtectedRoute({
  children,
  requiredRole = "staff",
}: ProtectedRouteProps) {
  const { user, staffProfile, loading, isStaff } = useAuth();
  const location = useLocation();

  // Still loading auth state — show spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-[#0d9488] mx-auto mb-4 animate-pulse" />
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Not logged in — send to login with redirect
  if (!user || !isStaff) {
    return (
      <Navigate to="/admin/login" state={{ from: location }} replace />
    );
  }

  // Logged in but wrong role — show 403
  const role = staffProfile?.role;
  if (!hasAccess(role, requiredRole)) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-6">
            <ShieldOff className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-3">
            Access Denied
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            You don't have permission to view this page. Contact your
            administrator if you believe this is an error.
          </p>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            Your role: {role || "unknown"}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

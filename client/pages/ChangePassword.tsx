import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { nextPathAfterSignIn, passwordChoiceError } from "@shared/passwordAccount";
import { PasswordField } from "@/components/PasswordField";

export default function ChangePassword() {
  const { user, loading, userType, staffProfile, clientProfile, mustChangePassword, refreshProfile, notePasswordChanged } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="iframe-safe-page bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = passwordChoiceError(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change the password.");
      notePasswordChanged();
      await refreshProfile();
      const next = nextPathAfterSignIn({
        mustChangePassword: false,
        userType,
        role: staffProfile?.role,
        clientDestination: "/portal/home",
      }) || "/login";
      navigate(next, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
      setSubmitting(false);
    }
  };

  return (
    <div className="iframe-safe-page bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold tracking-wider">ICONIC</h1>
          <p className="text-gray-500 text-xs tracking-[0.3em] uppercase mt-1">Change password</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-zinc-400 text-sm text-center">
            {mustChangePassword
              ? "Choose a new password before the portal opens."
              : "Choose a new password for this account."}
          </p>
          <PasswordField
            id="new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            tone="dark"
          />
          <PasswordField
            id="confirm-password"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            tone="dark"
          />
          {error ? <p role="alert" className="text-center text-sm text-red-300">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-gray-100 font-semibold">
            {submitting ? "Saving..." : "Save password"}
          </Button>
          {mustChangePassword ? null : (
            <div className="text-center">
              <Link to={userType === "client" ? "/portal/home" : "/admin"} className="text-zinc-500 hover:text-zinc-300 text-sm">
                Cancel
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

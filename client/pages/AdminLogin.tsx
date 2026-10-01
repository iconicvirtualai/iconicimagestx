/**
 * Iconic Images — Admin Login
 * Full replacement for the existing client/pages/AdminLogin.tsx
 * Now uses Firebase Auth via AuthContext.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { staffHomePath } from "@shared/staffAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function AdminLogin() {
  const { signIn, signOutUser, user, isStaff, staffProfile, loading, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSentTo, setResetSentTo] = useState("");

  // Photographers and editors cannot open the coordinator dashboard.
  useEffect(() => {
    if (loading) return;
    if (user && isStaff) {
      navigate(staffHomePath(staffProfile?.role));
      return;
    }
    if (user && !isStaff) {
      toast.error("This login is not an active staff account.");
      void signOutUser();
    }
    // signOutUser identity changes each render; only the auth state should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isStaff, staffProfile, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email, password);
      // AuthContext will update, useEffect will redirect
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToReset = resetEmail.trim();
    if (!emailToReset) {
      toast.error("Enter the email on the account.");
      return;
    }
    setSendingReset(true);
    try {
      await resetPassword(emailToReset, "admin");
      setResetSentTo(emailToReset);
      toast.success("If an account exists for that email, a reset link is on its way.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold tracking-wider">ICONIC</h1>
          <p className="text-gray-500 text-xs tracking-[0.3em] uppercase mt-1">
            aICON Dashboard
          </p>
        </div>

        {resetSentTo ? (
          <div className="space-y-4 text-center">
            <p className="text-zinc-200 text-sm">Check {resetSentTo}</p>
            <p className="text-zinc-400 text-sm">
              If an account exists for that email, a reset link is on its way. Open the link, choose a new password, and you will come back to this page to sign in.
            </p>
            <Button
              type="button"
              onClick={() => {
                setResetSentTo("");
                setShowReset(false);
              }}
              className="w-full bg-white text-black hover:bg-gray-100 font-semibold"
            >
              Back to sign in
            </Button>
          </div>
        ) : !showReset ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-zinc-400"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-zinc-400"
                autoComplete="current-password"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-white text-black hover:bg-gray-100 font-semibold py-2.5"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setResetEmail((current) => current || email);
                  setShowReset(true);
                }}
                className="text-zinc-300 hover:text-white text-sm underline underline-offset-4 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-zinc-400 text-sm text-center">
              Enter your email and we will send a link to set a new password. The link opens on this site and brings you back here to sign in.
            </p>
            <label className="sr-only" htmlFor="admin-reset-email">Email address</label>
            <Input
              id="admin-reset-email"
              type="email"
              placeholder="Email address"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
              autoComplete="email"
              required
            />
            <Button
              type="submit"
              disabled={sendingReset}
              className="w-full bg-white text-black hover:bg-gray-100 font-semibold"
            >
              {sendingReset ? "Sending reset link..." : "Send reset link"}
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-zinc-700 text-xs mt-8">
          Staff access only. Client portal →{" "}
          <a href="/portal" className="text-zinc-500 hover:text-zinc-300">
            iconicimagestx.com/portal
          </a>
        </p>
      </div>
    </div>
  );
}

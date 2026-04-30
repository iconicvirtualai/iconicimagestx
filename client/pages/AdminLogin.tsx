/**
 * Iconic Images — Admin Login
 * Full replacement for the existing client/pages/AdminLogin.tsx
 * Now uses Firebase Auth via AuthContext.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function AdminLogin() {
  const { signIn, user, isStaff, loading, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Redirect if already logged in as staff
  useEffect(() => {
    if (!loading && user && isStaff) {
      navigate("/admin/dashboard");
    }
  }, [user, isStaff, loading, navigate]);

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
    if (!resetEmail) return;
    try {
      await resetPassword(resetEmail);
      toast.success("Reset email sent. Check your inbox.");
      setShowReset(false);
    } catch {
      toast.error("Failed to send reset email.");
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

        {!showReset ? (
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
                onClick={() => setShowReset(true)}
                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-zinc-400 text-sm text-center">
              Enter your email to receive a password reset link.
            </p>
            <Input
              type="email"
              placeholder="Email address"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
              required
            />
            <Button
              type="submit"
              className="w-full bg-white text-black hover:bg-gray-100"
            >
              Send Reset Link
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

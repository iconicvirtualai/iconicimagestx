import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { staffHomePath } from "@shared/staffAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function clientDestination(pathname?: string) {
  if (!pathname) return "/portal/home";
  const allowed = ["/portal/home", "/gallery/", "/invoice/", "/studio/"];
  if (pathname === "/portal/home" || allowed.some((prefix) => pathname.startsWith(prefix))) {
    return pathname;
  }
  return "/portal/home";
}

export default function Login() {
  const { signIn, user, userType, staffProfile, loading, resetPassword, registerClient } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    if (loading || !user || !userType) return;
    if (userType === "staff") {
      navigate(staffHomePath(staffProfile?.role));
      return;
    }
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    navigate(clientDestination(from));
  }, [user, userType, staffProfile, loading, navigate, location]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Enter your first and last name.");
      return;
    }
    const finishingExistingLogin = Boolean(user && !userType);
    if (!finishingExistingLogin) {
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await registerClient(email, password, { firstName, lastName, phone });
      toast.success("Account created. Welcome in.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    try {
      const gate = await fetch("/api/client-notify");
      const gateData = await gate.json().catch(() => ({ live: false }));
      if (!gate.ok || gateData?.live !== true) {
        toast.error("Failed to send reset email.");
        return;
      }
      await resetPassword(resetEmail);
      toast.success("Reset email sent. Check your inbox.");
      setMode("signin");
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

  const inputClass = "bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-zinc-400";

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold tracking-wider">ICONIC</h1>
          <p className="text-gray-500 text-xs tracking-[0.3em] uppercase mt-1">
            Client Portal
          </p>
        </div>

        {user && !userType ? (
          <form onSubmit={handleSignup} className="space-y-4">
            <p className="text-zinc-400 text-sm text-center">
              You are signed in, but this login is not linked to a client profile yet.
            </p>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={inputClass} required />
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputClass} required />
            <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-gray-100 font-semibold">
              {submitting ? "Saving..." : "Finish client profile"}
            </Button>
          </form>
        ) : mode === "reset" ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-zinc-400 text-sm text-center">
              Enter your email to receive a password reset link.
            </p>
            <Input
              type="email"
              placeholder="Email address"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className={inputClass}
              required
            />
            <Button type="submit" className="w-full bg-white text-black hover:bg-gray-100">
              Send Reset Link
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => setMode("signin")} className="text-zinc-500 hover:text-zinc-300 text-sm">
                Back to sign in
              </button>
            </div>
          </form>
        ) : mode === "signup" ? (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={inputClass} autoComplete="given-name" required />
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputClass} autoComplete="family-name" required />
            </div>
            <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" required />
            <Input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} autoComplete="tel" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" required />
            <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} autoComplete="new-password" required />
            <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-gray-100 font-semibold py-2.5">
              {submitting ? "Creating account..." : "Create account"}
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => setMode("signin")} className="text-zinc-500 hover:text-zinc-300 text-sm">
                Already have an account? Sign in
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
              required
            />
            <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-gray-100 font-semibold py-2.5">
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => setMode("reset")} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {mode === "signin" && !(user && !userType) && (
          <div className="mt-8 pt-8 border-t border-zinc-800 text-center space-y-3">
            <p className="text-zinc-400 text-sm">Need a portal login before your first booking?</p>
            <Button type="button" variant="outline" onClick={() => setMode("signup")} className="w-full border-zinc-700 bg-transparent text-white hover:bg-zinc-900">
              Create account
            </Button>
            <p className="text-zinc-600 text-xs">
              Create a client login here. If this email was already used on a booking, that client record is linked to the new login.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

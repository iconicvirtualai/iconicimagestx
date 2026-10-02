/**
 * Completes Firebase email actions on this site.
 * Password reset is the staff/portal path. Email verify and recovery are
 * handled here too, because the Firebase action URL is shared by every
 * auth email template.
 */

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ADMIN_LOGIN_PATH,
  PORTAL_LOGIN_PATH,
  firebaseErrorCode,
  parseAuthActionParams,
  passwordResetConfirmError,
  safePasswordResetReturnPath,
  validateNewPassword,
} from "@shared/passwordReset";

type Phase = "checking" | "ready" | "saving" | "done" | "verified" | "recovered" | "error";

const inputClass =
  "bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-zinc-400";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [returnPath, setReturnPath] = useState(ADMIN_LOGIN_PATH);

  useEffect(() => {
    const parsed = parseAuthActionParams(location.search, location.hash);
    const nextReturn = safePasswordResetReturnPath(parsed.continueUrl, window.location.origin);
    setReturnPath(nextReturn);

    let cancelled = false;
    const fail = (err: unknown) => {
      if (cancelled) return;
      setMessage(passwordResetConfirmError(firebaseErrorCode(err)));
      setPhase("error");
    };

    const run = async () => {
      if (!parsed.oobCode) {
        if (!cancelled) {
          setMessage("This link is missing a reset code. Request a new one from the sign-in page.");
          setPhase("error");
        }
        return;
      }

      if (parsed.mode === "resetPassword") {
        try {
          const email = await verifyPasswordResetCode(auth, parsed.oobCode);
          if (cancelled) return;
          setAccountEmail(email);
          setPhase("ready");
        } catch (err) {
          fail(err);
        }
        return;
      }

      if (parsed.mode === "verifyEmail") {
        try {
          await applyActionCode(auth, parsed.oobCode);
          if (cancelled) return;
          setMessage("Email verified. You can sign in.");
          setPhase("verified");
        } catch (err) {
          fail(err);
        }
        return;
      }

      if (parsed.mode === "recoverEmail") {
        try {
          const info = await checkActionCode(auth, parsed.oobCode);
          const restored = info.data.email || "";
          await applyActionCode(auth, parsed.oobCode);
          if (cancelled) return;
          setAccountEmail(restored);
          setMessage(
            restored
              ? `Email address restored to ${restored}. Sign in, then reset the password if you did not make that change.`
              : "Email address restored. Sign in, then reset the password if you did not make that change.",
          );
          setPhase("recovered");
        } catch (err) {
          fail(err);
        }
        return;
      }

      if (!cancelled) {
        setMessage("This link is not a password reset. Request a new reset email from the sign-in page.");
        setPhase("error");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.hash, location.search]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => {
      navigate(returnPath, { replace: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [navigate, phase, returnPath]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseAuthActionParams(location.search, location.hash);
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      toast.error(problem);
      setMessage(problem);
      return;
    }
    if (!parsed.oobCode) {
      toast.error("This reset link is missing a code.");
      return;
    }

    setPhase("saving");
    setMessage("");
    try {
      await confirmPasswordReset(auth, parsed.oobCode, password);
      setMessage("Password updated. Taking you back to sign in.");
      setPhase("done");
      toast.success("Password updated. Sign in with the new password.");
    } catch (err) {
      const code = firebaseErrorCode(err);
      const text = passwordResetConfirmError(code);
      const canRetry = code === "auth/weak-password" || code === "auth/network-request-failed";
      setMessage(text);
      setPhase(canRetry ? "ready" : "error");
      toast.error(text);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold tracking-wider">ICONIC</h1>
          <p className="text-gray-500 text-xs tracking-[0.3em] uppercase mt-1">Reset password</p>
        </div>

        {phase === "checking" || phase === "saving" ? (
          <div className="flex flex-col items-center gap-3 text-zinc-400 text-sm">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <p>{phase === "saving" ? "Saving your new password..." : "Checking this reset link..."}</p>
          </div>
        ) : null}

        {phase === "ready" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-zinc-400 text-sm text-center">
              Choose a new password{accountEmail ? ` for ${accountEmail}` : ""}. You will return to sign in when it is saved.
            </p>
            <label className="sr-only" htmlFor="new-password">New password</label>
            <Input
              id="new-password"
              type="password"
              name="new-password"
              placeholder="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <label className="sr-only" htmlFor="confirm-password">Confirm new password</label>
            <Input
              id="confirm-password"
              type="password"
              name="confirm-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputClass}
              autoComplete="new-password"
              minLength={6}
              required
            />
            {message ? <p role="alert" className="text-red-400 text-sm text-center">{message}</p> : null}
            <Button type="submit" className="w-full bg-white text-black hover:bg-gray-100 font-semibold">
              Save new password
            </Button>
          </form>
        ) : null}

        {phase === "done" || phase === "verified" || phase === "recovered" ? (
          <div className="space-y-4 text-center">
            <p className="text-zinc-200 text-sm">{message}</p>
            <Button asChild className="w-full bg-white text-black hover:bg-gray-100 font-semibold">
              <Link to={returnPath}>Continue to sign in</Link>
            </Button>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="space-y-4 text-center">
            <p role="alert" className="text-red-400 text-sm">{message}</p>
            <Button asChild className="w-full bg-white text-black hover:bg-gray-100 font-semibold">
              <Link to={ADMIN_LOGIN_PATH}>Staff sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full border-zinc-700 bg-transparent text-white hover:bg-zinc-900">
              <Link to={PORTAL_LOGIN_PATH}>Client portal sign in</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/passwordReset";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const origin = window.location.origin;
      const message = await requestPasswordReset(email, origin);
      setNotice(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="iframe-safe-page bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold tracking-wider">ICONIC</h1>
          <p className="text-gray-500 text-xs tracking-[0.3em] uppercase mt-1">Reset password</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-zinc-400 text-sm text-center">
            Enter the email on the account. Firebase sends the reset link.
          </p>
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-zinc-400"
            autoComplete="email"
            required
          />
          <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-gray-100">
            {submitting ? "Sending..." : "Send reset link"}
          </Button>
          {notice ? (
            <p role="status" className="text-center text-sm text-zinc-200">{notice}</p>
          ) : null}
          <div className="text-center space-y-2">
            <Link to="/login" className="block text-zinc-500 hover:text-zinc-300 text-sm">Back to sign in</Link>
            <Link to="/admin/login" className="block text-zinc-600 hover:text-zinc-400 text-sm">Staff sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

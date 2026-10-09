import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/marketing/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: params.get("token") || "" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not unsubscribe.");
      setDone(data.message || "You are unsubscribed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unsubscribe.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0d9488]">Iconic Images</p>
        <h1 className="mt-2 text-2xl font-black text-gray-900">Unsubscribe</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          This removes the address from Iconic marketing email. Order updates and invoices are separate.
        </p>
        {done ? <p className="mt-6 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{done}</p> : (
          <>
            <label className="mt-6 block text-[10px] font-black uppercase tracking-widest text-gray-400">Email</label>
            <input className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#0d9488]/30" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <button type="submit" disabled={working} className="mt-4 w-full rounded-xl bg-[#0d9488] py-3 text-[11px] font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-50">
              {working ? "Saving" : "Unsubscribe"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

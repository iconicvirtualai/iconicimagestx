import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import type { SuppressionEntry, SuppressionReason } from "@shared/emailMarketing/types";
import MarketingFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

const REASONS: SuppressionReason[] = ["manual", "unsubscribed", "bounced", "blocked", "complained"];

export default function SuppressionPage() {
  const { user } = useAuth();
  const token = () => user?.getIdToken();
  const [entries, setEntries] = useState<SuppressionEntry[]>([]);
  const [kind, setKind] = useState<"email" | "domain" | "name">("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<SuppressionReason>("manual");
  const [hold, setHold] = useState<"" | "personal">("");
  const [note, setNote] = useState("");
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const data = await marketingApi<{ entries: SuppressionEntry[] }>(token, "/api/marketing/suppression");
    setEntries(data.entries);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the list."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await marketingApi(token, "/api/marketing/suppression", {
        method: "POST",
        body: JSON.stringify({ kind, value, reason, hold, note }),
      });
      setValue("");
      setNote("");
      setNotice("Saved to the do-not-email list.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that entry.");
    }
  }

  async function attachEmail(entry: SuppressionEntry) {
    const email = emailDrafts[entry.id] || "";
    await marketingApi(token, "/api/marketing/suppression", {
      method: "POST",
      body: JSON.stringify({ ...entry, email, names: entry.aliases }),
    });
    setNotice(`Saved ${email} on ${entry.value}.`);
    await load();
  }

  async function remove(id: string) {
    await marketingApi(token, `/api/marketing/suppression/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <MarketingFrame title="Do not email" subtitle="Bounces, blocks, unsubscribes, complaints, and manual holds. Campaigns skip this list at send time.">
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{notice}</p> : null}
      <form onSubmit={add} className={`${cardCls} mb-4 grid gap-3 p-5 md:grid-cols-4`}>
        <label>
          <span className={labelCls}>Type</span>
          <select className={inputCls} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="email">Email</option>
            <option value="domain">Domain</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label className="md:col-span-2">
          <span className={labelCls}>Value</span>
          <input className={inputCls} value={value} onChange={(event) => setValue(event.target.value)} required placeholder="name@example.com" />
        </label>
        <label>
          <span className={labelCls}>Reason</span>
          <select className={inputCls} value={reason} onChange={(event) => setReason(event.target.value as SuppressionReason)}>
            {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className={labelCls}>Note</span>
          <input className={inputCls} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="flex items-end gap-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={hold === "personal"} onChange={(event) => setHold(event.target.checked ? "personal" : "")} />
          Personal hold
        </label>
        <div className="flex items-end"><button className={buttonCls} type="submit">Add</button></div>
      </form>
      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <tr><th className="px-4 py-3">Who</th><th className="px-4 py-3">Why</th><th className="px-4 py-3">Email</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3">
                  <p className="font-bold text-gray-900">{entry.kind === "domain" ? `@${entry.value}` : entry.value}</p>
                  <p className="text-xs text-gray-500">{entry.note}</p>
                </td>
                <td className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500">
                  {entry.hold === "personal" ? "Personal hold" : entry.reason}
                </td>
                <td className="px-4 py-3">
                  {entry.kind === "name" ? (
                    <div className="flex gap-2">
                      <input className={inputCls} placeholder="Add email" value={emailDrafts[entry.id] ?? entry.email} onChange={(event) => setEmailDrafts({ ...emailDrafts, [entry.id]: event.target.value })} />
                      <button type="button" className={ghostCls} onClick={() => attachEmail(entry).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save the email."))}>Save</button>
                    </div>
                  ) : <span className="text-gray-600">{entry.email || "—"}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className={ghostCls} onClick={() => remove(entry.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not remove it."))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MarketingFrame>
  );
}

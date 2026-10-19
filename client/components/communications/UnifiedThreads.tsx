import { useEffect, useState } from "react";
import { Mail, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { filterThreads, type ThreadAudience, type UnifiedThread } from "@shared/communications/threads";

const FILTERS: { id: ThreadAudience; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "leads", label: "Leads" },
  { id: "photographers", label: "Photographers" },
  { id: "socials", label: "Socials" },
];

async function authHeaders(user: { getIdToken?: () => Promise<string> } | null, extra: Record<string, string> = {}) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function UnifiedThreads() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<UnifiedThread[]>([]);
  const [audience, setAudience] = useState<ThreadAudience>("clients");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("Message from Iconic Images");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const visible = filterThreads(threads, audience, query);
  const selected = visible.find((thread) => thread.id === selectedId) || threads.find((thread) => thread.id === selectedId && thread.audiences.includes(audience)) || null;

  async function load() {
    try {
      const res = await fetch("/api/communications/threads", { headers: await authHeaders(user), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load conversations.");
      setThreads(Array.isArray(data.threads) ? data.threads : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load conversations.");
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  useEffect(() => {
    if (selected && !selected.audiences.includes(audience)) setSelectedId("");
  }, [audience, selected]);

  async function send() {
    if (!selected || !body.trim() || sending) return;
    setSending(true);
    setNotice("");
    try {
      const res = await fetch("/api/communications/reply", {
        method: "POST",
        headers: await authHeaders(user, { "Content-Type": "application/json" }),
        body: JSON.stringify({ threadId: selected.id, channel, body: body.trim(), subject }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send the reply.");
      setBody("");
      setNotice(data.delivery === "allowlist" ? "Sent to the test allowlist." : "Reply sent.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't send the reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col bg-gray-950 lg:flex-row" data-testid="unified-threads">
      <div className={`flex w-full min-w-0 flex-col border-gray-800 lg:w-80 lg:shrink-0 lg:border-r ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="flex flex-wrap gap-1 border-b border-gray-800 p-2" role="tablist" aria-label="Thread filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={audience === filter.id}
              onClick={() => { setAudience(filter.id); setSelectedId(""); }}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${audience === filter.id ? "bg-teal-500 text-black" : "bg-gray-800 text-gray-300"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="p-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search threads"
            className="w-full min-w-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? <p className="px-3 py-4 text-sm text-red-300">{error}</p> : null}
          {visible.length === 0 ? <p className="px-3 py-6 text-sm text-gray-500">No threads in {FILTERS.find((filter) => filter.id === audience)?.label}.</p> : null}
          {visible.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => { setSelectedId(thread.id); setNotice(""); setChannel(thread.email ? "email" : "sms"); }}
              className={`block w-full min-w-0 border-b border-gray-800 px-3 py-3 text-left ${selectedId === thread.id ? "bg-gray-800" : ""}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">{thread.title}</span>
                {thread.connectorNeeded ? <span className="shrink-0 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-yellow-300">Connector needed</span> : null}
              </span>
              <span className="mt-1 block truncate text-xs text-gray-400">{thread.preview || thread.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={`min-w-0 flex-1 ${selected ? "flex" : "hidden lg:flex"} flex-col`}>
        {selected ? (
          <>
            <div className="border-b border-gray-800 px-4 py-3">
              <button type="button" className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400 lg:hidden" onClick={() => setSelectedId("")}>Back</button>
              <h2 className="truncate text-base font-black text-white">{selected.title}</h2>
              <p className="truncate text-xs text-gray-400">{selected.subtitle}{selected.email ? ` · ${selected.email}` : ""}{selected.phone ? ` · ${selected.phone}` : ""}</p>
              {selected.connectorNeeded ? (
                <p className="mt-2 text-sm text-yellow-200">Connector needed. {selected.title} DMs and comments are not connected yet.</p>
              ) : null}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.length === 0 ? <p className="text-sm text-gray-500">{selected.connectorNeeded ? "No messages until a connector is added." : "No messages in this thread yet."}</p> : null}
              {selected.messages.map((message) => (
                <div key={message.id} className={`max-w-full rounded-2xl px-3 py-2 text-sm text-white sm:max-w-md ${message.direction === "outbound" ? "ml-auto bg-teal-700" : "bg-gray-800"}`}>
                  <p className="text-[10px] uppercase tracking-wide text-white/70">{message.senderName} · {message.channel}{message.delivery === "suppressed" ? " · not sent" : ""}</p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                </div>
              ))}
            </div>
            {selected.connectorNeeded ? null : (
              <div className="border-t border-gray-800 p-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setChannel("email")} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${channel === "email" ? "bg-teal-500 text-black" : "bg-gray-800 text-gray-300"}`}>
                    <Mail className="h-3 w-3" /> Email
                  </button>
                  <button type="button" onClick={() => setChannel("sms")} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${channel === "sms" ? "bg-teal-500 text-black" : "bg-gray-800 text-gray-300"}`}>
                    <Smartphone className="h-3 w-3" /> SMS
                  </button>
                </div>
                {channel === "email" ? (
                  <input value={subject} onChange={(event) => setSubject(event.target.value)} className="mb-2 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" aria-label="Email subject" />
                ) : null}
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} placeholder={channel === "email" ? (selected.email ? `Email ${selected.email}` : "This thread has no email address") : (selected.phone ? `Text ${selected.phone}` : "This thread has no phone number")} className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" />
                  <button type="button" onClick={() => void send()} disabled={sending || !body.trim()} className="shrink-0 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
                {notice ? <p className="mt-2 text-sm text-gray-300">{notice}</p> : null}
              </div>
            )}
          </>
        ) : (
          <div className="hidden flex-1 items-center justify-center p-6 text-sm text-gray-500 lg:flex">Select a thread to reply by email or SMS.</div>
        )}
      </div>
    </div>
  );
}

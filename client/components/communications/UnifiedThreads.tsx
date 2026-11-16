import { useEffect, useState } from "react";
import { ChevronLeft, Mail, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { filterThreads, type ThreadAudience, type UnifiedThread } from "@shared/communications/threads";
import { PersonChip } from "@/components/people/PersonChip";
import { OrderNumberMark } from "@/components/OrderNumberMark";
import { UnreadBadge } from "@/components/admin/UnreadBadge";

const FILTERS: { id: ThreadAudience; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "leads", label: "Leads" },
  { id: "website", label: "Website" },
  { id: "photographers", label: "Photographers" },
  { id: "socials", label: "Socials" },
];

function threadWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

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
    <div className={`flex min-h-[28rem] min-w-0 flex-1 flex-col bg-gray-950 lg:flex-row ${selected ? "max-lg:h-[calc(100dvh-7.5rem)] max-lg:min-h-0" : ""}`} data-testid="unified-threads">
      <div className={`flex w-full min-w-0 flex-col border-gray-800 lg:w-80 lg:shrink-0 lg:border-r ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="flex gap-1 overflow-x-auto border-b border-gray-800 p-2" role="tablist" aria-label="Thread filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={audience === filter.id}
              onClick={() => { setAudience(filter.id); setSelectedId(""); }}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-bold uppercase tracking-wide lg:min-h-0 lg:px-2.5 lg:py-1 lg:text-[10px] ${audience === filter.id ? "bg-teal-500 text-black" : "bg-gray-800 text-gray-300"}`}
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
            <div key={thread.id} className={`border-b border-gray-800 ${selectedId === thread.id ? "bg-gray-800" : ""}`}>
              {thread.orderNumber ? <div className="px-3 pt-3"><OrderNumberMark value={thread.orderNumber} light /></div> : null}
              <button
                type="button"
                onClick={() => { setSelectedId(thread.id); setNotice(""); setChannel(thread.email ? "email" : "sms"); }}
                className="block min-h-11 w-full min-w-0 px-3 py-3 text-left"
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{thread.title}</span>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-500">{threadWhen(thread.updatedAt)}</span>
                  {thread.unread > 0 ? <UnreadBadge count={thread.unread} /> : null}
                  {thread.connectorNeeded ? <span className="shrink-0 whitespace-nowrap rounded bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-yellow-300">Connector needed</span> : null}
                </span>
                <span className="mt-1 block truncate text-xs text-gray-400">{thread.preview || thread.subtitle}</span>
                {thread.email ? <span className="mt-1 block truncate text-[11px] text-gray-500">{thread.email}</span> : null}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className={`min-w-0 flex-1 ${selected ? "flex" : "hidden lg:flex"} flex-col`}>
        {selected ? (
          <>
            <div className="border-b border-gray-800 px-3 py-2 lg:px-4 lg:py-3">
              <button type="button" className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-gray-300 lg:hidden" aria-label="Back to conversations" onClick={() => setSelectedId("")}>
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              {selected.orderNumber ? <OrderNumberMark value={selected.orderNumber} light /> : null}
              <h2 className="truncate text-base font-black text-white">{selected.title}</h2>
              <p className="truncate text-xs text-gray-400">{selected.subtitle}{selected.email ? ` · ${selected.email}` : ""}{selected.phone ? ` · ${selected.phone}` : ""}</p>
              {selected.connectorNeeded ? (
                <p className="mt-2 text-sm text-yellow-200">Connector needed. {selected.title} DMs and comments are not connected yet.</p>
              ) : null}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.length === 0 ? <p className="text-sm text-gray-500">{selected.connectorNeeded ? "No messages until a connector is added." : "No messages in this thread yet."}</p> : null}
              {selected.messages.map((message) => (
                <div key={message.id} className={`max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm text-white sm:max-w-md ${message.direction === "outbound" ? "ml-auto bg-teal-700" : "bg-gray-800"}`}>
                  <p className="truncate text-[10px] uppercase tracking-wide text-white/70">
                    <PersonChip
                      tone="dark"
                      name={message.senderName || "Sender"}
                      kind={message.senderType === "client" ? "client" : message.senderId ? "staff" : null}
                      sourceId={message.senderId || null}
                    />
                    {" · "}{message.channel}{message.delivery === "suppressed" ? " · not sent" : ""}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  {message.createdAt ? <p className="mt-1 whitespace-nowrap text-right text-[11px] text-white/60">{threadWhen(message.createdAt)}</p> : null}
                </div>
              ))}
            </div>
            {selected.connectorNeeded ? null : (
              <div className="shrink-0 border-t border-gray-800 bg-gray-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                  <button type="button" onClick={() => void send()} disabled={sending || !body.trim()} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-bold text-white disabled:opacity-40">
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

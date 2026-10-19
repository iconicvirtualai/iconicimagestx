import { useEffect, useState } from "react";
import { Mail, MessageSquare, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { UnifiedThread } from "@shared/communications/threads";

async function authHeaders(user: { getIdToken?: () => Promise<string> } | null, extra: Record<string, string> = {}) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function PortalMessages({ appearance = "light" }: { appearance?: "light" | "dark" }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<UnifiedThread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const selected = threads.find((thread) => thread.id === selectedId) || null;
  const dark = appearance === "dark";

  async function load() {
    try {
      const res = await fetch("/api/communications/mine", { headers: await authHeaders(user), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load your messages.");
      setThreads(Array.isArray(data.threads) ? data.threads : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  async function send() {
    if (!selected || !body.trim() || sending) return;
    setSending(true);
    setNotice("");
    try {
      const res = await fetch("/api/communications/mine/reply", {
        method: "POST",
        headers: await authHeaders(user, { "Content-Type": "application/json" }),
        body: JSON.stringify({ threadId: selected.id, body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send the reply.");
      setBody("");
      setNotice("Reply saved on this thread.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't send the reply.");
    } finally {
      setSending(false);
    }
  }

  const shell = dark ? "bg-gray-950 text-white" : "bg-white text-black";
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const line = dark ? "border-gray-800" : "border-gray-200";

  return (
    <div className={`flex min-w-0 flex-col gap-4 lg:flex-row ${shell}`} data-testid="portal-messages">
      <div className={`w-full min-w-0 lg:w-72 lg:shrink-0 ${selected ? "hidden lg:block" : "block"}`}>
        <h2 className="mb-3 text-xs font-black uppercase tracking-widest">Your messages</h2>
        {loading ? <p className={`text-sm ${muted}`}>Loading messages…</p> : null}
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        {!loading && !error && threads.length === 0 ? (
          <p className={`rounded-2xl border ${line} px-4 py-6 text-sm ${muted}`}>No messages for this login yet.</p>
        ) : (
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(thread.id); setNotice(""); }}
                  className={`w-full min-w-0 rounded-2xl border px-3 py-3 text-left ${line} ${selectedId === thread.id ? "border-[#0d9488]" : ""}`}
                >
                  <span className="block truncate text-sm font-black">{thread.title}</span>
                  <span className={`mt-1 block truncate text-xs ${muted}`}>{thread.preview || thread.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={`min-w-0 flex-1 ${selected ? "block" : "hidden lg:block"}`}>
        {selected ? (
          <div className={`rounded-2xl border ${line} p-4`}>
            <button type="button" className={`mb-3 text-xs font-black uppercase tracking-widest lg:hidden ${muted}`} onClick={() => setSelectedId("")}>
              Back to messages
            </button>
            <h3 className="truncate text-lg font-black">{selected.title}</h3>
            <p className={`text-xs ${muted}`}>{selected.subtitle}</p>
            <div className="mt-4 space-y-3">
              {selected.messages.map((message) => (
                <div key={message.id} className={`max-w-full rounded-2xl px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-[#0d9488] text-white" : dark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{message.senderName}</p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                </div>
              ))}
            </div>
            <label className="mt-4 block text-xs font-black uppercase tracking-widest">Reply</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              className={`mt-2 w-full min-w-0 rounded-xl border px-3 py-2 text-sm ${line} ${dark ? "bg-gray-900 text-white" : "bg-white text-black"}`}
              placeholder="Write a reply"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !body.trim()}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#0d9488] px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
            >
              <MessageSquare className="h-4 w-4" /> {sending ? "Sending…" : "Send reply"}
            </button>
            {notice ? <p className="mt-2 text-sm">{notice}</p> : null}
          </div>
        ) : (
          <div className={`hidden rounded-2xl border ${line} px-4 py-10 text-sm lg:block ${muted}`}>
            <Mail className="mb-2 h-5 w-5" />
            Choose a thread to read it and reply. You only see messages for this login.
            <Smartphone className="mt-3 h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

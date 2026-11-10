import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, MessageSquare, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { UnifiedThread } from "@shared/communications/threads";
import { SAMPLE_PORTAL_THREAD } from "./teamChatSample";
import type { TeamChatMessage } from "@shared/teamChat";

async function authHeaders(user: { getIdToken?: () => Promise<string> } | null, extra: Record<string, string> = {}) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function PortalMessages({ appearance = "light", example = false }: { appearance?: "light" | "dark"; example?: boolean }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const listingId = params.get("listing") || "";
  const [shooterThreads, setShooterThreads] = useState<Array<{ id: string; title: string; messages: TeamChatMessage[] }>>([]);
  const [shooterBody, setShooterBody] = useState("");
  const [shooterNotice, setShooterNotice] = useState("");
  const [threads, setThreads] = useState<UnifiedThread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const selected = threads.find((thread) => thread.id === selectedId) || null;
  const shooterSelected = shooterThreads.find((thread) => thread.id === selectedId) || null;
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
    if (example || !user) return;
    void load();
    void (async () => {
      const response = await fetch("/api/team-chat/portal/threads", { headers: await authHeaders(user) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.threads)) return;
      setShooterThreads(data.threads.map((item: { thread?: { id?: string; name?: string }; messages?: TeamChatMessage[] }) => ({
        id: String(item.thread?.id || ""),
        title: String(item.thread?.name || "Shooter"),
        messages: Array.isArray(item.messages) ? item.messages : [],
      })));
    })();
  }, [user, example]);

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

  async function sendToShooter() {
    if (!listingId || !shooterBody.trim() || !user) return;
    setShooterNotice("");
    const response = await fetch("/api/team-chat/portal/message", {
      method: "POST",
      headers: await authHeaders(user, { "Content-Type": "application/json" }),
      body: JSON.stringify({ listingId, body: shooterBody.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setShooterNotice(data.error || "Could not message the shooter.");
      return;
    }
    setShooterBody("");
    setShooterNotice("Sent in the portal. The shooter gets a push, then a text only if push is off. You are not texted.");
    const created = data.thread;
    if (created?.id) {
      setShooterThreads((current) => {
        const rest = current.filter((thread) => thread.id !== created.id);
        return [{ id: created.id, title: created.name || "Shooter", messages: [data.message] }, ...rest];
      });
    }
  }

  if (example) return <ExamplePortalMessages dark={dark} />;

  const shell = dark ? "bg-gray-950 text-white" : "bg-white text-black";
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const line = dark ? "border-gray-800" : "border-gray-200";

  return (
    <div className={`flex min-w-0 flex-col gap-4 lg:flex-row ${shell}`} data-testid="portal-messages">
      <div className={`w-full min-w-0 lg:w-72 lg:shrink-0 ${selected ? "hidden lg:block" : "block"}`}>
        <h2 className="mb-3 text-xs font-black uppercase tracking-widest">Your messages</h2>
        {listingId ? (
          <form
            className={`mb-4 rounded-2xl border p-3 ${line}`}
            onSubmit={(event) => {
              event.preventDefault();
              void sendToShooter();
            }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0f766e]">Message shooter</p>
            <textarea
              value={shooterBody}
              onChange={(event) => setShooterBody(event.target.value)}
              rows={3}
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm ${line} ${dark ? "bg-gray-900" : "bg-white"}`}
              placeholder="Write the shooter. Your phone number is not shared."
            />
            <button type="submit" className="mt-2 rounded-xl bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">Send</button>
            {shooterNotice ? <p className="mt-2 text-xs">{shooterNotice}</p> : null}
          </form>
        ) : null}
        {shooterThreads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => setSelectedId(thread.id)}
            className={`mb-2 w-full rounded-2xl border px-3 py-3 text-left ${line}`}
          >
            <span className="block text-sm font-black">{thread.title}</span>
            <span className={`mt-1 block truncate text-xs ${muted}`}>{thread.messages[thread.messages.length - 1]?.body}</span>
          </button>
        ))}
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
      <div className={`min-w-0 flex-1 ${selected || shooterSelected ? "block" : "hidden lg:block"}`}>
        {shooterSelected ? (
          <div className={`rounded-2xl border ${line} p-4`} data-testid="shooter-thread">
            <h3 className="text-lg font-black">{shooterSelected.title}</h3>
            <p className={`text-xs ${muted}`}>The shooter is notified in the app. You are not texted.</p>
            <div className="mt-4 space-y-3">
              {shooterSelected.messages.map((message) => (
                <div key={message.id} className={`max-w-full rounded-2xl px-3 py-2 text-sm ${message.senderRole === "client" ? "ml-auto bg-[#0d9488] text-white" : "bg-gray-100"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{message.senderName}</p>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : selected ? (
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

function ExamplePortalMessages({ dark }: { dark: boolean }) {
  const [extra, setExtra] = useState<TeamChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("Sample. The shooter would get a push. You are not texted or emailed.");
  const messages = [...SAMPLE_PORTAL_THREAD.messages, ...extra];
  return (
    <div className={`rounded-2xl border p-4 ${dark ? "border-gray-800 bg-gray-950 text-white" : "border-gray-200 bg-white text-black"}`} data-testid="portal-messages">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-800">Sample</p>
      <h3 className="mt-1 text-lg font-black">{SAMPLE_PORTAL_THREAD.title}</h3>
      <p className="text-xs text-gray-500">{SAMPLE_PORTAL_THREAD.subtitle}</p>
      <div className="mt-4 space-y-3">
        {messages.map((message) => (
          <div key={message.id} className={`max-w-full rounded-2xl px-3 py-2 text-sm ${message.senderRole === "client" ? "ml-auto bg-[#0d9488] text-white" : "bg-[#f5f2ea]"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${message.senderRole === "client" ? "text-[#e8c872]" : "text-[#0f766e]"}`}>{message.senderName}</p>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </div>
        ))}
      </div>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const text = body.trim();
          if (!text) return;
          setExtra((current) => [...current, {
            id: `sample-${current.length}`,
            threadId: "order-example",
            senderId: "client-example",
            senderName: "Example Agent",
            senderRole: "client",
            body: text,
            source: "app",
            createdAt: new Date().toISOString(),
          }]);
          setBody("");
          setNotice("Saved in this sample. No text and no email went out.");
        }}
      >
        <label className="text-xs font-black uppercase tracking-widest" htmlFor="example-shooter">Message shooter</label>
        <textarea id="example-shooter" value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Write the shooter" />
        <button type="submit" className="mt-2 rounded-xl bg-[#0d9488] px-4 py-2 text-xs font-black uppercase tracking-widest text-white">Send</button>
      </form>
      <p className="mt-2 text-sm">{notice}</p>
    </div>
  );
}

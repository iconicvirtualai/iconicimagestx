import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { exampleThreads } from "@/lib/exampleHub";
import type { UnifiedThread } from "@shared/communications/threads";

async function authHeaders(user: { getIdToken?: () => Promise<string> } | null, extra: Record<string, string> = {}) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function PortalMessages({ example = false }: { example?: boolean; appearance?: "light" | "dark" }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<UnifiedThread[]>(() => example ? exampleThreads() : []);
  const [selectedId, setSelectedId] = useState(() => example ? exampleThreads()[0]?.id || "" : "");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!example);
  const [sending, setSending] = useState(false);
  const selected = threads.find((thread) => thread.id === selectedId) || null;

  async function load() {
    try {
      const res = await fetch("/api/communications/mine", { headers: await authHeaders(user), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load your messages.");
      const next = Array.isArray(data.threads) ? data.threads as UnifiedThread[] : [];
      setThreads(next);
      setSelectedId((current) => current || next[0]?.id || "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (example) {
      const sample = exampleThreads();
      setThreads(sample);
      setSelectedId(sample[0]?.id || "");
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, example]);

  async function send() {
    if (!selected || !body.trim() || sending) return;
    if (example) {
      const reply = body.trim();
      setThreads((current) => current.map((thread) => thread.id === selected.id ? {
        ...thread,
        messages: [...thread.messages, {
          id: `sample-${thread.messages.length + 1}`,
          direction: "outbound" as const,
          senderId: "sample-client",
          senderName: "Jordan Hale",
          senderType: "client",
          body: reply,
          channel: "portal",
          createdAt: new Date().toISOString(),
          delivery: "sample",
        }],
      } : thread));
      setBody("");
      setNotice("Sample preview — the reply stays on this page.");
      return;
    }
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

  return (
    <div data-testid="portal-messages">
      <div className="page-head">
        <div>
          <div className="kicker">Messages</div>
          <h1>Your messages</h1>
          <p className="sub">
            You only see messages for this login. Choose a thread to read it and reply.
            {example ? <span className="sample">Sample</span> : null}
          </p>
        </div>
      </div>
      {loading ? <p className="muted">Loading messages…</p> : null}
      {error ? <p className="notice">{error}</p> : null}
      {!loading && !error && threads.length === 0 ? (
        <div className="card"><p>No messages for this login yet.</p></div>
      ) : null}
      {threads.length > 0 ? (
        <div className="msg-layout">
          <aside className="threads">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={selectedId === thread.id ? "th on" : "th"}
                onClick={() => { setSelectedId(thread.id); setNotice(""); }}
              >
                {thread.title === "Mike Luna" ? (
                  <img src="/media/portal-v2/mike.jpg" alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <span className="av" style={{ width: 40, height: 40, fontSize: 12 }}>{initials(thread.title)}</span>
                )}
                <span>
                  <span className="tn">{thread.title}</span>
                  <span className="tp">{thread.preview || thread.subtitle}</span>
                </span>
                <span className="tm">{thread.unread ? "New" : ""}</span>
              </button>
            ))}
          </aside>
          <section className="thread">
            {selected ? (
              <>
                <div className="thread-head">
                  {selected.title === "Mike Luna" ? (
                    <img src="/media/portal-v2/mike.jpg" alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <span className="av" style={{ width: 40, height: 40 }}>{initials(selected.title)}</span>
                  )}
                  <div>
                    <div className="tn">{selected.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{selected.subtitle}</div>
                  </div>
                </div>
                <div className="thread-body">
                  {selected.messages.map((message) => (
                    <div key={message.id} className={message.direction === "outbound" ? "bubble out" : "bubble in"}>
                      {message.body}
                    </div>
                  ))}
                </div>
                <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                  <input
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write a reply…"
                    aria-label="Write a reply"
                  />
                  <button className="btn btn-teal btn-md" type="submit" disabled={sending || !body.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </form>
                {notice ? <p className="muted" style={{ padding: "0 18px 14px" }}>{notice}</p> : null}
              </>
            ) : (
              <div className="thread-body">
                <p className="muted">Choose a thread to read it and reply. You only see messages for this login.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "ID";
}

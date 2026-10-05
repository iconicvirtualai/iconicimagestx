import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import type { ContactThreadView } from "@shared/contactThread";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const POLL_MS = 2000;

function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function preview(thread: ContactThreadView) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "No messages";
  const who = last.sender === "staff" ? "You" : thread.name;
  return `${who}: ${last.text}`;
}

export default function ContactLiveChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [threads, setThreads] = useState<ContactThreadView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;

  async function authHeaders(extra: Record<string, string> = {}) {
    const token = await user?.getIdToken?.();
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function loadThreads() {
    try {
      const res = await fetch("/api/contact/staff/threads", {
        cache: "no-store",
        headers: await authHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { threads?: ContactThreadView[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Couldn't load contact chats.");
        return;
      }
      setThreads(data.threads || []);
      setError("");
    } catch {
      setError("Couldn't load contact chats.");
    }
  }

  useEffect(() => {
    void loadThreads();
    const timer = window.setInterval(() => {
      void loadThreads();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages.length, selectedId]);

  async function sendReply() {
    const text = reply.trim();
    if (!text || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/contact/staff/threads/${selected.id}/reply`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { thread?: ContactThreadView; error?: string };
      if (!res.ok || !data.thread) {
        throw new Error(data.error || "Couldn't save the reply.");
      }
      const next = data.thread;
      setThreads((current) => {
        const rest = current.filter((thread) => thread.id !== next.id);
        return [next, ...rest].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      });
      setSelectedId(next.id);
      setReply("");
    } catch (err) {
      toast({
        title: "Reply not saved",
        description: err instanceof Error ? err.message : "Couldn't save the reply.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400">Contact chat</p>
          <p className="text-xs text-gray-500 mt-1">Site threads. Replies stay here.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No contact chats yet.</p>
          ) : (
            threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const waiting = last?.sender === "client";
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-900 ${
                    selectedId === thread.id ? "bg-gray-900" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white truncate">{thread.name}</span>
                    {waiting ? <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" aria-label="Waiting for a reply" /> : null}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-1">{preview(thread)}</p>
                  <p className="text-[11px] text-gray-600 mt-1 truncate">
                    {[thread.email, thread.phone].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-gray-950">
        {error ? (
          <p role="alert" className="px-6 py-3 text-sm text-red-300 border-b border-gray-800">{error}</p>
        ) : null}
        {selected ? (
          <>
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">{selected.name}</h2>
              <p className="text-gray-400 text-xs mt-1">
                {[selected.email, selected.phone].filter(Boolean).join(" · ") || "Contact chat"}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4" role="log" aria-live="polite">
              {selected.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "client" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-md rounded-2xl px-4 py-3 ${
                      message.sender === "client" ? "bg-gray-800 text-white" : "bg-teal-600 text-white"
                    }`}
                  >
                    <p className="text-xs font-medium mb-1 opacity-70">{message.senderName}</p>
                    <p className="text-sm leading-relaxed">{message.text}</p>
                    <p className="text-[11px] opacity-60 mt-1 text-right">{clock(message.createdAt)}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form
              className="p-4 border-t border-gray-800"
              onSubmit={(event) => {
                event.preventDefault();
                void sendReply();
              }}
            >
              <div className="flex gap-3">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendReply();
                    }
                  }}
                  placeholder="Reply in this chat..."
                  aria-label="Reply"
                  rows={2}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-teal-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={sending || !reply.trim()}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-2 text-sm self-end"
                >
                  <Send className="w-4 h-4" />
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                The client sees this in the site chat. It does not send email or text.
              </p>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a contact chat to reply</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, MessageSquare, Send } from "lucide-react";
import { contactThreadIdFromSearch, type ContactThreadView } from "@shared/contactThread";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { UnreadBadge } from "@/components/admin/UnreadBadge";

const POLL_MS = 2000;

export type WebsiteChatFilter = "all" | "unread";

function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function shortWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) return clock(iso);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function preview(thread: ContactThreadView) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "No messages";
  const who = last.sender === "staff" ? "You" : thread.name;
  return `${who}: ${last.text}`;
}

/** Client messages still waiting on a staff reply. */
export function waitingCount(thread: ContactThreadView): number {
  let count = 0;
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    if (thread.messages[index].sender === "staff") break;
    count += 1;
  }
  return count;
}

function contactLine(thread: ContactThreadView) {
  return [thread.email, thread.phone].filter(Boolean).join(" · ") || "Website chat";
}

/**
 * Keeps the reply box above the on-screen keyboard. Desktop leaves this alone.
 */
function useKeyboardOverlap(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const phone = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (!phone.matches) {
        document.documentElement.style.removeProperty("--keyboard-overlap");
        return;
      }
      const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--keyboard-overlap", `${Math.round(overlap)}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    phone.addEventListener("change", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      phone.removeEventListener("change", apply);
      document.documentElement.style.removeProperty("--keyboard-overlap");
    };
  }, [active]);
}

export function ContactChatDesk({
  threads,
  selectedId,
  filter,
  error,
  reply,
  sending,
  onFilter,
  onSelect,
  onBack,
  onReplyChange,
  onSend,
}: {
  threads: ContactThreadView[];
  selectedId: string | null;
  filter: WebsiteChatFilter;
  error: string;
  reply: string;
  sending: boolean;
  onFilter: (filter: WebsiteChatFilter) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onReplyChange: (value: string) => void;
  onSend: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const visible = threads.filter((thread) => filter === "all" || waitingCount(thread) > 0);
  const unreadTotal = threads.reduce((sum, thread) => sum + waitingCount(thread), 0);
  useKeyboardOverlap(Boolean(selectedId));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [selected?.messages.length, selectedId]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col md:flex-row" data-testid="contact-live-chat">
      <div className={`${selectedId ? "hidden" : "flex"} min-h-0 w-full min-w-0 flex-col bg-gray-950 md:flex md:w-72 md:shrink-0 md:border-r md:border-gray-800`}>
        <div className="border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400">Website</p>
            <UnreadBadge count={unreadTotal} testId="website-chat-unread" />
          </div>
          <p className="mt-1 text-xs text-gray-500">Site threads. Replies stay here.</p>
          <div className="mt-3 flex gap-2" role="tablist" aria-label="Website chats">
            {([
              ["all", "All"],
              ["unread", "Unread"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => onFilter(id)}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-bold md:min-h-0 md:px-3 md:py-1 ${
                  filter === id ? "bg-teal-500 text-black" : "bg-gray-800 text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{filter === "unread" ? "No unread website chats." : "No website chats yet."}</p>
          ) : (
            visible.map((thread) => {
              const waiting = waitingCount(thread);
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className={`block min-h-11 w-full min-w-0 border-b border-gray-800 px-4 py-3 text-left hover:bg-gray-900 ${
                    selectedId === thread.id ? "bg-gray-900" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{thread.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-500">{shortWhen(thread.updatedAt)}</span>
                    {waiting > 0 ? <UnreadBadge count={waiting} /> : null}
                  </span>
                  <span className="mt-1 block truncate text-xs text-gray-400">{preview(thread)}</span>
                  <span className="mt-1 block truncate text-[11px] text-gray-500">{contactLine(thread)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={`${selectedId ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col bg-gray-950 md:flex`} data-testid="contact-thread">
        {error ? (
          <p role="alert" className="border-b border-gray-800 px-4 py-3 text-sm text-red-300 md:px-6">{error}</p>
        ) : null}
        {selected ? (
          <>
            <div className="flex min-w-0 items-center gap-1 border-b border-gray-800 px-2 py-2 md:px-6 md:py-4">
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-white md:hidden"
                aria-label="Back to conversations"
                data-testid="contact-back"
                onClick={onBack}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-white md:text-lg">{selected.name}</h2>
                <p className="truncate text-xs text-gray-400">{contactLine(selected)}</p>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6" role="log" aria-live="polite">
              {selected.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex min-w-0 ${message.sender === "client" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-3 md:max-w-md ${
                      message.sender === "client" ? "bg-gray-800 text-white" : "bg-teal-600 text-white"
                    }`}
                  >
                    <p className="mb-1 truncate text-xs font-medium opacity-70">{message.senderName}</p>
                    <p className="break-words text-sm leading-relaxed">{message.text}</p>
                    <p className="mt-1 whitespace-nowrap text-right text-[11px] opacity-60">{clock(message.createdAt)}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form
              className="shrink-0 border-t border-gray-800 bg-gray-950 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              data-testid="contact-reply"
              onSubmit={(event) => {
                event.preventDefault();
                onSend();
              }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(event) => onReplyChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Reply in this chat..."
                  aria-label="Reply"
                  rows={2}
                  className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !reply.trim()}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 self-end rounded-xl bg-teal-600 px-4 text-sm text-white hover:bg-teal-500 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                The client sees this in the site chat. It does not send email or text.
              </p>
            </form>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center border-b border-gray-800 px-2 py-2 md:hidden">
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-white"
                aria-label="Back to conversations"
                onClick={onBack}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="truncate text-sm text-gray-300">Website chat</p>
            </div>
            <div className="flex flex-1 items-center justify-center px-6 text-center text-gray-400">
              <div>
                <MessageSquare className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>{selectedId ? "That website chat is not in this list." : "Select a website chat to reply"}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactLiveChat({
  previewThreads,
}: {
  /** Sample threads for a local preview. Skips the staff poll. */
  previewThreads?: ContactThreadView[];
} = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const preview = Array.isArray(previewThreads);
  const [threads, setThreads] = useState<ContactThreadView[]>(previewThreads ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => contactThreadIdFromSearch(params.toString()));
  const [filter, setFilter] = useState<WebsiteChatFilter>("all");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedId(contactThreadIdFromSearch(params.toString()));
  }, [params]);

  function writeThread(id: string | null) {
    const next = new URLSearchParams(params);
    next.set("tab", "contact");
    if (id) next.set("thread", id);
    else next.delete("thread");
    setSelectedId(id);
    setParams(next, { replace: true });
  }

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
        setError(data.error || "Couldn't load website chats.");
        return;
      }
      setThreads(data.threads || []);
      setError("");
    } catch {
      setError("Couldn't load website chats.");
    }
  }

  useEffect(() => {
    if (preview) return;
    void loadThreads();
    const timer = window.setInterval(() => {
      void loadThreads();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [user, preview]);

  async function sendReply() {
    const text = reply.trim();
    const selected = threads.find((thread) => thread.id === selectedId) ?? null;
    if (!text || !selected || sending) return;
    if (preview) {
      setReply("");
      return;
    }
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
      writeThread(next.id);
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
    <ContactChatDesk
      threads={threads}
      selectedId={selectedId}
      filter={filter}
      error={error}
      reply={reply}
      sending={sending}
      onFilter={setFilter}
      onSelect={writeThread}
      onBack={() => writeThread(null)}
      onReplyChange={setReply}
      onSend={() => void sendReply()}
    />
  );
}

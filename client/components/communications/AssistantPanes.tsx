import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface AssistStatus {
  openai: boolean;
  grok: boolean;
  grokNotice: string;
  openaiNotice: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

async function authHeaders(user: { getIdToken?: () => Promise<string> } | null, extra: Record<string, string> = {}) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function Pane({
  title,
  provider,
  enabled,
  notice,
  turns,
  draft,
  onDraft,
  onSend,
  sending,
}: {
  title: string;
  provider: "grok" | "openai";
  enabled: boolean;
  notice: string;
  turns: Turn[];
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-gray-800 bg-gray-900" data-testid={`assistant-${provider}`}>
      <header className="border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-white">{title}</h2>
        {notice ? <p className="mt-1 text-sm text-yellow-200">{notice}</p> : <p className="mt-1 text-xs text-gray-500">Owner and admin only. The key stays on the server.</p>}
      </header>
      <div className="min-h-40 flex-1 space-y-2 overflow-y-auto p-3">
        {turns.length === 0 ? <p className="text-sm text-gray-500">No messages yet.</p> : null}
        {turns.map((turn, index) => (
          <p key={`${provider}-${index}`} className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${turn.role === "user" ? "bg-gray-800 text-white" : "bg-teal-900/40 text-teal-50"}`}>
            {turn.content}
          </p>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-2 border-t border-gray-800 p-3 sm:flex-row">
        <textarea
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          disabled={!enabled || sending}
          rows={2}
          aria-label={`${title} message`}
          className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white disabled:opacity-50"
        />
        <button type="button" onClick={onSend} disabled={!enabled || sending || !draft.trim()} className="shrink-0 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </section>
  );
}

export function AssistantPanes() {
  const { user } = useAuth();
  const [status, setStatus] = useState<AssistStatus | null>(null);
  const [locked, setLocked] = useState("");
  const [grokTurns, setGrokTurns] = useState<Turn[]>([]);
  const [openTurns, setOpenTurns] = useState<Turn[]>([]);
  const [grokDraft, setGrokDraft] = useState("");
  const [openDraft, setOpenDraft] = useState("");
  const [sending, setSending] = useState<"grok" | "openai" | "">("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/communications/assist/status", { headers: await authHeaders(user) });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.status === 403) {
        setLocked(data.error || "Owner or admin access required.");
        return;
      }
      if (res.ok) setStatus(data as AssistStatus);
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function send(provider: "grok" | "openai") {
    const draft = provider === "grok" ? grokDraft : openDraft;
    const prior = provider === "grok" ? grokTurns : openTurns;
    const text = draft.trim();
    if (!text) return;
    const messages = [...prior, { role: "user" as const, content: text }];
    if (provider === "grok") {
      setGrokTurns(messages);
      setGrokDraft("");
    } else {
      setOpenTurns(messages);
      setOpenDraft("");
    }
    setSending(provider);
    try {
      const res = await fetch("/api/communications/assist", {
        method: "POST",
        headers: await authHeaders(user, { "Content-Type": "application/json" }),
        body: JSON.stringify({ provider, messages }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = typeof data.reply === "string" ? data.reply : (data.error || "The assistant did not reply.");
      const next = [...messages, { role: "assistant" as const, content: reply }];
      if (provider === "grok") setGrokTurns(next);
      else setOpenTurns(next);
    } finally {
      setSending("");
    }
  }

  if (locked) {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-300">{locked}</div>;
  }

  return (
    <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 p-3 lg:grid-cols-2" data-testid="assistant-panes">
      <Pane
        title="Grok"
        provider="grok"
        enabled={Boolean(status?.grok)}
        notice={status?.grokNotice || ""}
        turns={grokTurns}
        draft={grokDraft}
        onDraft={setGrokDraft}
        onSend={() => void send("grok")}
        sending={sending === "grok"}
      />
      <Pane
        title="OpenAI"
        provider="openai"
        enabled={Boolean(status?.openai)}
        notice={status?.openaiNotice || ""}
        turns={openTurns}
        draft={openDraft}
        onDraft={setOpenDraft}
        onSend={() => void send("openai")}
        sending={sending === "openai"}
      />
    </div>
  );
}

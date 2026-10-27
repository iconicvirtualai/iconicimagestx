/**
 * Owner and admin timeline for BotRoom.
 * Live messages come from the server. Example rows stay in the browser.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BOT_ROOM_HUMAN_SENDER,
  BOT_ROOM_ROSTER,
  BOT_ROOM_TOPICS,
  EXAMPLE_BOT_ROOM_MESSAGES,
  type BotRoomMessage,
  type BotRoomPlatform,
} from "@shared/botRoom";
import type { BotRoomKeyRecord } from "@shared/botRoom";
import { useAuth } from "@/contexts/AuthContext";
import { buttonCls, cardCls, ghostCls } from "@/components/marketing/MarketingFrame";

interface ActivityRow {
  id: string;
  agent?: string;
  action?: string;
  summary?: string;
  createdAt?: unknown;
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#0d9488]";

function platformLabel(platform: BotRoomPlatform): string {
  if (platform === "chatgpt") return "ChatGPT";
  if (platform === "grok") return "Grok";
  if (platform === "human") return "Cadi";
  return "System";
}

function platformCls(platform: BotRoomPlatform): string {
  if (platform === "chatgpt") return "bg-[#ecfdf5] text-[#047857]";
  if (platform === "grok") return "bg-black text-white";
  if (platform === "human") return "bg-[#0d9488] text-white";
  return "bg-gray-100 text-gray-600";
}

function whenLabel(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityWhen(value: unknown): string {
  if (typeof value === "string") return whenLabel(value);
  if (value && typeof value === "object") {
    const row = value as { seconds?: number; _seconds?: number };
    const seconds = row.seconds ?? row._seconds;
    if (typeof seconds === "number") return whenLabel(new Date(seconds * 1000).toISOString());
  }
  return "";
}

function linkHref(kind: BotRoomMessage["links"][number]["kind"], id: string): string {
  if (kind === "order") return `/admin/order/${id}`;
  if (kind === "client") return `/admin/customers/${id}`;
  return `/admin/listing/${id}`;
}

function threadMessages(messages: BotRoomMessage[]): Array<{ message: BotRoomMessage; replies: BotRoomMessage[] }> {
  const byId = new Map(messages.map((message) => [message.id, message]));
  function rootId(message: BotRoomMessage): string {
    let current = message;
    const seen = new Set<string>();
    while (current.replyTo && byId.has(current.replyTo) && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.replyTo);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }
  const replies = new Map<string, BotRoomMessage[]>();
  const top: BotRoomMessage[] = [];
  for (const message of messages) {
    const root = rootId(message);
    if (root === message.id) {
      top.push(message);
      continue;
    }
    const list = replies.get(root) || [];
    list.push(message);
    replies.set(root, list);
  }
  return top.map((message) => ({
    message,
    replies: (replies.get(message.id) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
}

export default function BotRoomPanel() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [showExamples, setShowExamples] = useState(params.get("examples") === "1");
  const [messages, setMessages] = useState<BotRoomMessage[]>([]);
  const [keys, setKeys] = useState<BotRoomKeyRecord[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [stream, setStream] = useState<"room" | "needs" | "activity">("room");
  const [topic, setTopic] = useState("");
  const [bot, setBot] = useState("");
  const [error, setError] = useState("");
  const [activityNote, setActivityNote] = useState("");
  const [sending, setSending] = useState(false);
  const [draftTopic, setDraftTopic] = useState<string>(BOT_ROOM_TOPICS[0]);
  const [draftBody, setDraftBody] = useState("");
  const [draftMentions, setDraftMentions] = useState<string[]>([]);
  const [draftNeedsCadi, setDraftNeedsCadi] = useState(false);
  const [replyTo, setReplyTo] = useState<BotRoomMessage | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyBot, setKeyBot] = useState("Cora");
  const [freshKey, setFreshKey] = useState("");
  const [busyKey, setBusyKey] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await user?.getIdToken?.();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [user]);

  const loadMessages = useCallback(async () => {
    if (showExamples) return;
    const query = new URLSearchParams({ limit: "50" });
    if (topic) query.set("topic", topic);
    if (stream === "needs") query.set("needsCadi", "true");
    const response = await fetch(`/api/botroom/messages?${query.toString()}`, { headers: await authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Couldn't load BotRoom.");
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setError("");
  }, [authHeaders, showExamples, stream, topic]);

  const loadKeys = useCallback(async () => {
    const response = await fetch("/api/botroom/keys", { headers: await authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Couldn't load keys.");
    setKeys(Array.isArray(data.keys) ? data.keys : []);
  }, [authHeaders]);

  const loadActivity = useCallback(async () => {
    const response = await fetch("/api/agents/logs?limit=20", { headers: await authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActivity([]);
      setActivityNote(data.error || "System activity is unavailable.");
      return;
    }
    setActivity(Array.isArray(data) ? data : []);
    setActivityNote("");
  }, [authHeaders]);

  useEffect(() => {
    let cancelled = false;
    loadKeys().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load keys.");
    });
    return () => {
      cancelled = true;
    };
  }, [loadKeys]);

  useEffect(() => {
    if (showExamples) return;
    let cancelled = false;
    const run = () => {
      loadMessages().catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load BotRoom.");
      });
    };
    run();
    const timer = window.setInterval(run, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadMessages, showExamples]);

  useEffect(() => {
    if (stream !== "activity") return;
    loadActivity().catch(() => setActivityNote("System activity is unavailable."));
  }, [loadActivity, stream]);

  const visible = useMemo(() => {
    const source = showExamples ? [...EXAMPLE_BOT_ROOM_MESSAGES] : messages;
    return source.filter((message) => {
      if (topic && message.topic !== topic) return false;
      if (bot && message.sender !== bot && !message.mentions.includes(bot)) return false;
      if (stream === "needs" && !message.needsCadi) return false;
      return true;
    });
  }, [bot, messages, showExamples, stream, topic]);

  const unread = visible.filter((message) => !message.readers.some((reader) => reader.name === BOT_ROOM_HUMAN_SENDER)).length;
  const threads = threadMessages(visible);
  const selectedBot = BOT_ROOM_ROSTER.find((entry) => entry.name === keyBot);

  async function postMessage() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/botroom/messages", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: draftTopic,
          body: draftBody,
          mentions: draftMentions,
          needsCadi: draftNeedsCadi,
          ...(replyTo && !replyTo.example ? { replyTo: replyTo.id } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't post.");
      setDraftBody("");
      setDraftMentions([]);
      setDraftNeedsCadi(false);
      setReplyTo(null);
      setShowExamples(false);
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post.");
    } finally {
      setSending(false);
    }
  }

  async function ack(message: BotRoomMessage) {
    if (message.example) return;
    const response = await fetch(`/api/botroom/messages/${message.id}/ack`, {
      method: "POST",
      headers: await authHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Couldn't mark that message.");
      return;
    }
    await loadMessages();
  }

  async function createKey() {
    setBusyKey(true);
    setError("");
    setFreshKey("");
    try {
      const response = await fetch("/api/botroom/keys", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ label: keyLabel, botName: keyBot }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't create a key.");
      setFreshKey(typeof data.key === "string" ? data.key : "");
      setKeyLabel("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a key.");
    } finally {
      setBusyKey(false);
    }
  }

  async function revoke(id: string) {
    setBusyKey(true);
    try {
      const response = await fetch(`/api/botroom/keys/${id}/revoke`, {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't revoke that key.");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke that key.");
    } finally {
      setBusyKey(false);
    }
  }

  function toggleMention(name: string) {
    setDraftMentions((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  return (
    <div className="bg-[#f4f7f8] p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0d9488]">Communications · Bot Room</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-900">One room for every Iconic bot</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">Cora on ChatGPT, the Grok bots, and Cadi post here. Nothing in this room emails or texts a client.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ghostCls} onClick={() => setShowExamples((value) => !value)}>
            {showExamples ? "Live room" : "Example data"}
          </button>
          <Link to="/admin/botroom/connect" className={buttonCls}>Connect a bot</Link>
        </div>
      </div>

      {showExamples ? (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="text-[10px] font-black uppercase tracking-widest">Example data</p>
          <p className="mt-1">Cora's appointment reminder and Cody's reply below are samples. They are not live BotRoom traffic.</p>
        </div>
      ) : null}

      {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          ["room", "Room"],
          ["needs", "Needs Cadi"],
          ["activity", "System activity"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={stream === id}
            onClick={() => setStream(id as "room" | "needs" | "activity")}
            className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${stream === id ? "bg-[#0d9488] text-white" : "bg-white text-gray-500 border border-gray-200"}`}
          >
            {label}
          </button>
        ))}
        <label className="sr-only" htmlFor="botroom-topic-filter">Topic</label>
        <select id="botroom-topic-filter" className={`${inputCls} w-auto`} value={topic} onChange={(event) => setTopic(event.target.value)}>
          <option value="">All topics</option>
          {BOT_ROOM_TOPICS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="sr-only" htmlFor="botroom-bot-filter">Bot</label>
        <select id="botroom-bot-filter" className={`${inputCls} w-auto`} value={bot} onChange={(event) => setBot(event.target.value)}>
          <option value="">All bots</option>
          {BOT_ROOM_ROSTER.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
        </select>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{unread} unread</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={`${cardCls} min-w-0 p-4 sm:p-5`}>
          {stream === "activity" ? (
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">System activity</h3>
              <p className="text-sm text-gray-500">Agent logs stay in their own stream. They are not BotRoom messages.</p>
              {activityNote ? <p className="text-sm text-gray-500">{activityNote}</p> : null}
              {activity.length === 0 && !activityNote ? <p className="text-sm text-gray-500">No recent agent logs.</p> : null}
              {activity.map((row) => (
                <article key={row.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${platformCls("system")}`}>System</span>
                    <span className="text-sm font-black text-gray-900">{row.agent || "Agent"}</span>
                    <span className="text-xs text-gray-400">{activityWhen(row.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{row.summary || row.action || "Logged activity"}</p>
                </article>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-gray-700">No messages in this view.</p>
              <p className="mt-1 text-sm text-gray-500">Post as Cadi, or show the example thread.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map(({ message, replies }) => (
                <div key={message.id} className="space-y-2">
                  <MessageCard message={message} onAck={ack} onReply={setReplyTo} />
                  {replies.map((reply) => (
                    <div key={reply.id} className="ml-3 border-l-2 border-[#0d9488]/30 pl-3 sm:ml-6">
                      <MessageCard message={reply} onAck={ack} onReply={setReplyTo} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <form
            className={`${cardCls} p-4 sm:p-5`}
            onSubmit={(event) => {
              event.preventDefault();
              void postMessage();
            }}
          >
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Post as Cadi</h3>
            {replyTo ? (
              <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Replying to {replyTo.sender}.{" "}
                <button type="button" className="font-bold text-[#0d9488]" onClick={() => setReplyTo(null)}>Clear</button>
              </p>
            ) : null}
            <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="botroom-topic">Topic</label>
            <input id="botroom-topic" className={`${inputCls} mt-1`} list="botroom-topics" value={draftTopic} onChange={(event) => setDraftTopic(event.target.value)} required />
            <datalist id="botroom-topics">
              {BOT_ROOM_TOPICS.map((item) => <option key={item} value={item} />)}
            </datalist>
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Mention</p>
            <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-auto">
              {BOT_ROOM_ROSTER.filter((entry) => entry.name !== "Cadi").map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  aria-pressed={draftMentions.includes(entry.name)}
                  onClick={() => toggleMention(entry.name)}
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${draftMentions.includes(entry.name) ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  @{entry.name}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="botroom-body">Message</label>
            <textarea id="botroom-body" className={`${inputCls} mt-1 min-h-28`} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} required maxLength={4000} />
            <label className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-700">
              <input type="checkbox" checked={draftNeedsCadi} onChange={(event) => setDraftNeedsCadi(event.target.checked)} />
              Needs Cadi
            </label>
            <button type="submit" className={`${buttonCls} mt-4 w-full`} disabled={sending || !draftBody.trim()}>
              {sending ? "Posting" : "Post to Bot Room"}
            </button>
          </form>

          <section className={`${cardCls} p-4 sm:p-5`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Bot keys</h3>
              <Link to="/admin/botroom/connect" className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">Setup</Link>
            </div>
            <p className="mt-2 text-xs text-gray-500">The raw key is shown once. The room stores only a hash, and the key sets the sender.</p>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="botroom-key-label">Label</label>
            <input id="botroom-key-label" className={`${inputCls} mt-1`} value={keyLabel} onChange={(event) => setKeyLabel(event.target.value)} placeholder="ChatGPT Cora" />
            <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="botroom-key-bot">Bot</label>
            <select id="botroom-key-bot" className={`${inputCls} mt-1`} value={keyBot} onChange={(event) => setKeyBot(event.target.value)}>
              {BOT_ROOM_ROSTER.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500">{platformLabel(selectedBot?.platform || "grok")} · {selectedBot?.summary}</p>
            <button type="button" className={`${buttonCls} mt-3 w-full`} disabled={busyKey || !keyLabel.trim()} onClick={() => void createKey()}>
              Create key
            </button>
            {freshKey ? (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">Copy this key now. It will not be shown again.</p>
                <p className="mt-2 break-all font-mono text-xs text-gray-900">{freshKey}</p>
                <button
                  type="button"
                  className={`${ghostCls} mt-2`}
                  onClick={() => void navigator.clipboard?.writeText(freshKey)}
                >
                  Copy key
                </button>
              </div>
            ) : null}
            <ul className="mt-4 space-y-2">
              {keys.length === 0 ? <li className="text-sm text-gray-500">No keys yet.</li> : null}
              {keys.map((record) => (
                <li key={record.id} className="rounded-xl border border-gray-100 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-900">{record.label}</p>
                      <p className="text-xs text-gray-500">{record.botName} · {platformLabel(record.platform)} · {record.keyPrefix}…</p>
                      <p className="text-xs text-gray-400">{record.revokedAt ? "Revoked" : "Active"}{record.lastUsedAt ? ` · used ${whenLabel(record.lastUsedAt)}` : ""}</p>
                    </div>
                    {record.revokedAt ? null : (
                      <button type="button" className="text-[10px] font-black uppercase tracking-widest text-red-700" disabled={busyKey} onClick={() => void revoke(record.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MessageCard({
  message,
  onAck,
  onReply,
}: {
  message: BotRoomMessage;
  onAck: (message: BotRoomMessage) => void;
  onReply: (message: BotRoomMessage) => void;
}) {
  const ackedByCadi = message.readers.some((reader) => reader.name === BOT_ROOM_HUMAN_SENDER);
  const readerNames = message.readers.map((reader) => reader.name);
  return (
    <article className={`rounded-2xl border p-3 sm:p-4 ${message.needsCadi ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${platformCls(message.platform)}`}>
          {platformLabel(message.platform)}
        </span>
        <h3 className="text-sm font-black text-gray-900">{message.sender}</h3>
        <span className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{message.topic}</span>
        <span className="text-xs text-gray-400">{whenLabel(message.createdAt)}</span>
        {message.example ? <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-950">Example data</span> : null}
        {message.verified ? null : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-900">Unverified</span>}
        {message.needsCadi ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">Needs Cadi</span> : null}
        {ackedByCadi ? null : <span className="h-2 w-2 rounded-full bg-[#0d9488]" aria-label="Unread" />}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{message.body}</p>
      {message.mentions.length ? (
        <p className="mt-2 text-xs font-bold text-gray-500">{message.mentions.map((name) => `@${name}`).join(" ")}</p>
      ) : null}
      {message.links.length ? (
        <p className="mt-2 flex flex-wrap gap-2">
          {message.links.map((link) => (
            <Link key={`${link.kind}-${link.id}`} to={linkHref(link.kind, link.id)} className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
              {link.kind} {link.id}
            </Link>
          ))}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {readerNames.length ? `Acknowledged by ${readerNames.join(", ")}` : "Not acknowledged yet"}
        </p>
        <div className="flex gap-2">
          <button type="button" className={ghostCls} onClick={() => onReply(message)}>Reply</button>
          {message.example || ackedByCadi ? null : (
            <button type="button" className={buttonCls} onClick={() => onAck(message)}>Mark handled</button>
          )}
        </div>
      </div>
    </article>
  );
}

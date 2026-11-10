import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Bell, Hash, MessageSquarePlus, Moon, Smartphone, Users, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import ContactLiveChat from "@/components/ContactLiveChat";
import {
  TEAM_CHAT_INBOX,
  TEAM_THREAD_LIVE,
  type TeamChatMessage,
  type TeamChatThreadSummary,
  type TeamDirectoryPerson,
  type TeamSmsLogEntry,
} from "@shared/teamChat";
import {
  SAMPLE_DIRECTORY,
  SAMPLE_MESSAGES,
  SAMPLE_PREFS,
  SAMPLE_SMS_LOG,
  SAMPLE_THREADS,
  SAMPLE_VIEWER,
  sampleThreadId,
  type TeamChatSampleView,
} from "./teamChatSample";

type Prefs = {
  smsMuted: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  timeZone: string;
  smsOptOut: boolean;
  push: boolean;
};

const field = "w-full rounded-xl border border-[#e7e0d2] bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#0d9488]";
const tealBtn = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-40";

function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function TeamChatPanel({
  viewerId,
  threads,
  directory,
  messages,
  selectedId,
  smsLog,
  smsLive,
  prefs,
  showList,
  showNew,
  showLog,
  showPrefs,
  draft,
  groupName,
  groupMembers,
  notice,
  onSelect,
  onDraft,
  onSend,
  onShowNew,
  onShowLog,
  onShowPrefs,
  onGroupName,
  onToggleMember,
  onCreateGroup,
  onRemoveMember,
  onPrefs,
  onSavePrefs,
}: {
  viewerId: string;
  threads: TeamChatThreadSummary[];
  directory: TeamDirectoryPerson[];
  messages: TeamChatMessage[];
  selectedId: string;
  smsLog: TeamSmsLogEntry[];
  smsLive: boolean;
  prefs: Prefs;
  showList: boolean;
  showNew: boolean;
  showLog: boolean;
  showPrefs: boolean;
  draft: string;
  groupName: string;
  groupMembers: string[];
  notice: string;
  onSelect: (id: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onShowNew: (open: boolean) => void;
  onShowLog: (open: boolean) => void;
  onShowPrefs: (open: boolean) => void;
  onGroupName: (value: string) => void;
  onToggleMember: (uid: string) => void;
  onCreateGroup: () => void;
  onRemoveMember: (uid: string) => void;
  onPrefs: (patch: Partial<Prefs>) => void;
  onSavePrefs: () => void;
}) {
  const selected = threads.find((thread) => thread.id === selectedId) || null;
  const sections = [
    { title: "Channels", kinds: ["channel"] },
    { title: "Groups", kinds: ["group"] },
    { title: "Direct messages", kinds: ["dm"] },
    { title: "Client threads", kinds: ["order"] },
  ] as const;
  const threadOpen = Boolean(selected) && !showNew && !showLog && !showPrefs;
  return (
    <div data-testid="team-chat" className="flex min-h-[36rem] flex-1 flex-col bg-[#f5f2ea] text-stone-900 lg:min-h-0 lg:flex-row">
      <aside
        data-testid="team-channel-list"
        className={`${showList || !threadOpen ? "flex" : "hidden"} w-full shrink-0 flex-col border-[#e7e0d2] bg-[#f5f2ea] lg:flex lg:w-72 lg:border-r`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0f766e]">Team</p>
            <h2 className="text-lg font-black">Chats</h2>
          </div>
          <button type="button" className={tealBtn} onClick={() => onShowNew(true)}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> New
          </button>
        </div>
        <div className="flex gap-2 px-4 pb-3">
          <button type="button" className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-stone-600" onClick={() => onShowLog(true)}>
            Text log
          </button>
          <button type="button" className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-stone-600" onClick={() => onShowPrefs(true)}>
            Text settings
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
          {sections.map((section) => {
            const rows = threads.filter((thread) => (section.kinds as readonly string[]).includes(thread.kind));
            if (rows.length === 0) return null;
            return (
              <div key={section.title}>
                <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-widest text-stone-400">{section.title}</p>
                <ul className="space-y-1">
                  {rows.map((thread) => (
                    <li key={thread.id}>
                      <button
                        type="button"
                        data-testid={`team-thread-${thread.id}`}
                        onClick={() => onSelect(thread.id)}
                        className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left ${selectedId === thread.id ? "bg-[#0d9488] text-white" : "hover:bg-white"}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black">{thread.name}</span>
                          <span className={`block truncate text-[11px] ${selectedId === thread.id ? "text-teal-50" : "text-stone-500"}`}>{thread.preview}</span>
                        </span>
                        {thread.unread > 0 ? (
                          <span className="rounded-full bg-[#e8c872] px-1.5 py-0.5 text-[10px] font-black text-stone-900">{thread.unread}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="px-4 pb-4 text-[11px] leading-relaxed text-stone-500">
          Phone numbers stay off this screen. Push is first. Texts use the Iconic number only when push is off.
        </p>
      </aside>
      <section className={`${threadOpen || showNew || showLog || showPrefs ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}>
        {showNew ? (
          <NewGroup
            directory={directory.filter((person) => person.uid !== viewerId)}
            name={groupName}
            members={groupMembers}
            onName={onGroupName}
            onToggle={onToggleMember}
            onCreate={onCreateGroup}
            onClose={() => onShowNew(false)}
          />
        ) : showLog ? (
          <SmsLog entries={smsLog} live={smsLive} onClose={() => onShowLog(false)} />
        ) : showPrefs ? (
          <TextSettings prefs={prefs} onChange={onPrefs} onSave={onSavePrefs} onClose={() => onShowPrefs(false)} />
        ) : selected ? (
          <ThreadPane
            thread={selected}
            messages={messages}
            viewerId={viewerId}
            directory={directory}
            draft={draft}
            notice={notice}
            onBack={() => onSelect("")}
            onDraft={onDraft}
            onSend={onSend}
            onRemove={onRemoveMember}
          />
        ) : (
          <div className="hidden flex-1 items-center justify-center p-8 text-sm text-stone-500 lg:flex">
            Choose a channel, a group, or a teammate.
          </div>
        )}
      </section>
    </div>
  );
}

function ThreadPane({
  thread,
  messages,
  viewerId,
  directory,
  draft,
  notice,
  onBack,
  onDraft,
  onSend,
  onRemove,
}: {
  thread: TeamChatThreadSummary;
  messages: TeamChatMessage[];
  viewerId: string;
  directory: TeamDirectoryPerson[];
  draft: string;
  notice: string;
  onBack: () => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onRemove: (uid: string) => void;
}) {
  return (
    <div data-testid="team-thread" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-[#e7e0d2] px-4 py-3">
        <button type="button" className="text-[10px] font-black uppercase tracking-widest text-[#0f766e] lg:hidden" onClick={onBack}>
          Chats
        </button>
        <div className="min-w-0">
          <h3 className="truncate text-base font-black">{thread.name}</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#0f766e]">Code {thread.code}</p>
        </div>
      </header>
        {thread.kind === "group" || thread.kind === "channel" ? (
        <ul className="flex gap-2 overflow-x-auto px-4 py-2">
          {directory.filter((person) => !thread.memberIds?.length || thread.memberIds.includes(person.uid)).map((person) => (
            <li key={person.uid} className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-stone-600">
              {person.name}
              {person.uid !== viewerId && thread.kind === "group" ? (
                <button type="button" aria-label={`Remove ${person.name}`} onClick={() => onRemove(person.uid)}>
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => {
          const mine = message.senderId === viewerId;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-[#0d9488] text-white" : "bg-white text-stone-900"}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${mine ? "text-[#e8c872]" : "text-[#0f766e]"}`}>
                  {message.senderName} · {clock(message.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="border-t border-[#e7e0d2] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <label className="sr-only" htmlFor={`draft-${thread.id}`}>Message</label>
        <div className="flex gap-2">
          <input
            id={`draft-${thread.id}`}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder={`Message ${thread.name}`}
            className={field}
          />
          <button type="submit" className={tealBtn} disabled={!draft.trim()}>Send</button>
        </div>
        {notice ? <p className="mt-2 text-xs text-stone-600">{notice}</p> : null}
      </form>
    </div>
  );
}

function NewGroup({
  directory,
  name,
  members,
  onName,
  onToggle,
  onCreate,
  onClose,
}: {
  directory: TeamDirectoryPerson[];
  name: string;
  members: string[];
  onName: (value: string) => void;
  onToggle: (uid: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div data-testid="team-new-group" className="flex-1 overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-black">New group</h3>
        <button type="button" onClick={onClose} aria-label="Close new group"><X className="h-4 w-4" /></button>
      </div>
      <label className="text-[10px] font-black uppercase tracking-widest text-stone-500" htmlFor="group-name">Name</label>
      <input id="group-name" value={name} onChange={(event) => onName(event.target.value)} className={`${field} mt-1`} placeholder="Saturday crew" />
      <p className="mb-2 mt-4 text-[10px] font-black uppercase tracking-widest text-stone-500">People</p>
      <ul className="space-y-2">
        {directory.map((person) => (
          <li key={person.uid}>
            <label className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2">
              <input type="checkbox" checked={members.includes(person.uid)} onChange={() => onToggle(person.uid)} />
              <span>
                <span className="block text-sm font-black">{person.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{person.role}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className={`${tealBtn} mt-4`} onClick={onCreate} disabled={!name.trim() || members.length === 0}>
        <Users className="h-3.5 w-3.5" /> Create group
      </button>
    </div>
  );
}

function SmsLog({ entries, live, onClose }: { entries: TeamSmsLogEntry[]; live: boolean; onClose: () => void }) {
  return (
    <div data-testid="team-sms-log" className="flex-1 overflow-y-auto p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-black">Text log</h3>
        <button type="button" onClick={onClose} aria-label="Close text log"><X className="h-4 w-4" /></button>
      </div>
      <p className="mb-4 rounded-2xl bg-[#e8c872]/40 px-3 py-2 text-sm font-semibold text-stone-800">
        {live ? "TEAM_SMS_LIVE is on. Texts go out from the Iconic number." : "Dry run. TEAM_SMS_LIVE is off, so nothing was sent."}
      </p>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-2xl bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0f766e]">{entry.status} · {entry.recipientName}</p>
            <p className="mt-1 text-sm font-bold">{entry.threadLabel}</p>
            <p className="mt-2 whitespace-pre-wrap text-xs text-stone-600">{entry.body}</p>
            <p className="mt-2 text-[11px] text-stone-500">{entry.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextSettings({
  prefs,
  onChange,
  onSave,
  onClose,
}: {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-black">Text settings</h3>
        <button type="button" onClick={onClose} aria-label="Close text settings"><X className="h-4 w-4" /></button>
      </div>
      <label className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3">
        <input type="checkbox" checked={prefs.smsMuted} onChange={(event) => onChange({ smsMuted: event.target.checked })} />
        <span>
          <span className="flex items-center gap-1 text-sm font-black"><Moon className="h-3.5 w-3.5" /> Mute texts</span>
          <span className="block text-xs text-stone-500">Push still arrives. STOP from your phone also turns texts off.</span>
        </span>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          Quiet from
          <input type="time" value={prefs.quietStart || ""} onChange={(event) => onChange({ quietStart: event.target.value || null })} className={`${field} mt-1`} />
        </label>
        <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          Until
          <input type="time" value={prefs.quietEnd || ""} onChange={(event) => onChange({ quietEnd: event.target.value || null })} className={`${field} mt-1`} />
        </label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-stone-500">
        Texts come from the Iconic number. Your phone number is not shown to the team or to clients. Reply STOP to opt out and HELP for help. Message frequency varies. Msg and data rates may apply.
      </p>
      {prefs.smsOptOut ? <p className="mt-2 text-xs font-bold text-stone-700">Texts are stopped on this number. Reply START to resume.</p> : null}
      <button type="button" className={`${tealBtn} mt-4`} onClick={onSave}>Save</button>
    </div>
  );
}

export function TeamChatSample({
  view = "channel",
  viewerId = SAMPLE_VIEWER.uid,
}: {
  view?: TeamChatSampleView;
  viewerId?: string;
}) {
  const [threads, setThreads] = useState(() => viewerId === "alex"
    ? SAMPLE_THREADS.map((thread) => thread.id === "dm-cadi" ? { ...thread, name: "Cadi" } : thread)
    : SAMPLE_THREADS);
  const [selectedId, setSelectedId] = useState(sampleThreadId(view));
  const [messagesByThread, setMessagesByThread] = useState(SAMPLE_MESSAGES);
  const [showNew, setShowNew] = useState(view === "new");
  const [showLog, setShowLog] = useState(view === "log");
  const [showPrefs, setShowPrefs] = useState(false);
  const [draft, setDraft] = useState("");
  const [groupName, setGroupName] = useState(view === "new" ? "Saturday crew" : "");
  const [groupMembers, setGroupMembers] = useState<string[]>(view === "new" ? ["alex", "sam"] : []);
  const [prefs, setPrefs] = useState<Prefs>(SAMPLE_PREFS);
  const [notice, setNotice] = useState("Sample. Nothing is sent.");
  useEffect(() => {
    setSelectedId(sampleThreadId(view));
    setShowNew(view === "new");
    setShowLog(view === "log");
    setShowPrefs(false);
    if (view === "new") {
      setGroupName("Saturday crew");
      setGroupMembers(["alex", "sam"]);
    }
  }, [view]);
  const messages = messagesByThread[selectedId] || [];
  const showList = view === "list" || !selectedId;

  function select(id: string) {
    setSelectedId(id);
    setShowNew(false);
    setShowLog(false);
    setShowPrefs(false);
    setThreads((current) => current.map((thread) => thread.id === id ? { ...thread, unread: 0 } : thread));
  }

  return (
    <TeamChatPanel
      viewerId={viewerId}
      threads={threads}
      directory={SAMPLE_DIRECTORY}
      messages={messages}
      selectedId={selectedId}
      smsLog={SAMPLE_SMS_LOG}
      smsLive={false}
      prefs={prefs}
      showList={showList}
      showNew={showNew}
      showLog={showLog}
      showPrefs={showPrefs}
      draft={draft}
      groupName={groupName}
      groupMembers={groupMembers}
      notice={notice}
      onSelect={select}
      onDraft={setDraft}
      onSend={() => {
        const text = draft.trim();
        if (!text || !selectedId) return;
        const next = {
          id: `local-${Date.now()}`,
          threadId: selectedId,
          senderId: viewerId,
          senderName: viewerId === "alex" ? "Alex Rivera" : "Cadi",
          senderRole: "staff" as const,
          body: text,
          source: "app" as const,
          createdAt: new Date().toISOString(),
        };
        setMessagesByThread((current) => ({ ...current, [selectedId]: [...(current[selectedId] || []), next] }));
        setDraft("");
        setNotice("Saved in this sample. Push would go out first. No text was sent.");
      }}
      onShowNew={(open) => {
        setShowNew(open);
        if (open) {
          setShowLog(false);
          setShowPrefs(false);
        }
      }}
      onShowLog={(open) => {
        setShowLog(open);
        if (open) {
          setShowNew(false);
          setShowPrefs(false);
        }
      }}
      onShowPrefs={(open) => {
        setShowPrefs(open);
        if (open) {
          setShowNew(false);
          setShowLog(false);
        }
      }}
      onGroupName={setGroupName}
      onToggleMember={(uid) => {
        setGroupMembers((current) => current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid]);
      }}
      onCreateGroup={() => {
        const id = `group-${groupName.toLowerCase().replace(/\s+/g, "-")}`;
        setThreads((current) => [{
          id,
          kind: "group",
          name: groupName.trim(),
          code: "H7N4",
          preview: "Group created",
          updatedAt: new Date().toISOString(),
          unread: 0,
        }, ...current]);
        setMessagesByThread((current) => ({ ...current, [id]: [] }));
        setShowNew(false);
        setSelectedId(id);
        setNotice("Sample group. Nobody was texted.");
      }}
      onRemoveMember={() => setNotice("Sample only. The person stays in this preview.")}
      onPrefs={(patch) => setPrefs((current) => ({ ...current, ...patch }))}
      onSavePrefs={() => setNotice(prefs.smsMuted ? "Texts muted in this sample." : "Quiet hours saved in this sample.")}
    />
  );
}

async function authHeaders(user: { getIdToken?: () => Promise<string> } | null, extra: Record<string, string> = {}) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function TeamChatLive({ initialThreadId = "" }: { initialThreadId?: string }) {
  const { user } = useAuth();
  const [viewerId, setViewerId] = useState("");
  const [threads, setThreads] = useState<TeamChatThreadSummary[]>([]);
  const [directory, setDirectory] = useState<TeamDirectoryPerson[]>([]);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState(initialThreadId);
  const [smsLog, setSmsLog] = useState<TeamSmsLogEntry[]>([]);
  const [smsLive, setSmsLive] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ ...SAMPLE_PREFS, push: false, quietStart: null, quietEnd: null });
  const [showNew, setShowNew] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [draft, setDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  async function loadInbox() {
    const response = await fetch("/api/team-chat/inbox", { headers: await authHeaders(user) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load chats.");
    setViewerId(String(data.uid || ""));
    setThreads(Array.isArray(data.threads) ? data.threads : []);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadInbox();
        const headers = await authHeaders(user);
        const [peopleResponse, prefsResponse] = await Promise.all([
          fetch("/api/team-chat/directory", { headers }),
          fetch("/api/team-chat/prefs", { headers }),
        ]);
        const peopleData = await peopleResponse.json().catch(() => ({}));
        const prefsData = await prefsResponse.json().catch(() => ({}));
        if (cancelled) return;
        if (peopleResponse.ok) setDirectory(Array.isArray(peopleData.people) ? peopleData.people : []);
        if (prefsResponse.ok) setPrefs((current) => ({ ...current, ...prefsData }));
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load chats.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !viewerId) return undefined;
    return onSnapshot(doc(db, TEAM_CHAT_INBOX, viewerId), (snap) => {
      const rows = snap.data()?.threads;
      if (Array.isArray(rows)) setThreads(rows as TeamChatThreadSummary[]);
    }, () => undefined);
  }, [user, viewerId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    return onSnapshot(doc(db, TEAM_THREAD_LIVE, selectedId), (snap) => {
      const rows = snap.data()?.messages;
      if (Array.isArray(rows)) setMessages(rows as TeamChatMessage[]);
    }, () => undefined);
  }, [selectedId]);

  useEffect(() => {
    if (!user || !selectedId) return;
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders(user);
      const response = await fetch(`/api/team-chat/threads/${selectedId}/messages`, { headers });
      const data = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && Array.isArray(data.messages)) setMessages(data.messages);
      await fetch(`/api/team-chat/threads/${selectedId}/read`, { method: "POST", headers });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, selectedId]);

  const showList = !selectedId && !showNew && !showLog && !showPrefs;
  const people = useMemo(() => directory, [directory]);

  return (
    <TeamChatPanel
      viewerId={viewerId}
      threads={threads}
      directory={people}
      messages={messages}
      selectedId={selectedId}
      smsLog={smsLog}
      smsLive={smsLive}
      prefs={prefs}
      showList={showList}
      showNew={showNew}
      showLog={showLog}
      showPrefs={showPrefs}
      draft={draft}
      groupName={groupName}
      groupMembers={groupMembers}
      notice={notice}
      onSelect={(id) => {
        setSelectedId(id);
        setShowNew(false);
        setShowLog(false);
        setShowPrefs(false);
      }}
      onDraft={setDraft}
      onSend={() => {
        const text = draft.trim();
        if (!text || !selectedId || !user) return;
        void user.getIdToken().then((token) => fetch(`/api/team-chat/threads/${selectedId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        })).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not send.");
          setDraft("");
          setMessages((current) => [...current, data.message]);
          const log = Array.isArray(data.log) ? data.log as TeamSmsLogEntry[] : [];
          if (log.some((entry) => entry.status === "dry-run")) setNotice("Push was not available. The text was logged and not sent.");
          else if (log.some((entry) => entry.status === "push")) setNotice("Push sent. No text, because the app is installed.");
          else setNotice("");
          await loadInbox();
        }).catch((error: Error) => setNotice(error.message));
      }}
      onShowNew={setShowNew}
      onShowLog={(open) => {
        setShowLog(open);
        if (!open || !user) return;
        void user.getIdToken().then((token) => fetch("/api/team-chat/sms-log", {
          headers: { Authorization: `Bearer ${token}` },
        })).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setNotice(data.error || "The text log is for coordinators.");
            return;
          }
          setSmsLive(Boolean(data.live));
          setSmsLog(Array.isArray(data.entries) ? data.entries : []);
        });
      }}
      onShowPrefs={setShowPrefs}
      onGroupName={setGroupName}
      onToggleMember={(uid) => setGroupMembers((current) => current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid])}
      onCreateGroup={() => {
        if (!user) return;
        void user.getIdToken().then((token) => fetch("/api/team-chat/threads", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "group", name: groupName, memberIds: groupMembers }),
        })).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not create the group.");
          setShowNew(false);
          setGroupName("");
          setGroupMembers([]);
          setSelectedId(data.thread?.id || "");
          await loadInbox();
        }).catch((error: Error) => setNotice(error.message));
      }}
      onRemoveMember={(uid) => {
        if (!user || !selectedId) return;
        void user.getIdToken().then((token) => fetch(`/api/team-chat/threads/${selectedId}/members`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ remove: [uid] }),
        })).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not update the group.");
          await loadInbox();
        }).catch((error: Error) => setNotice(error.message));
      }}
      onPrefs={(patch) => setPrefs((current) => ({ ...current, ...patch }))}
      onSavePrefs={() => {
        if (!user) return;
        void user.getIdToken().then((token) => fetch("/api/team-chat/prefs", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(prefs),
        })).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not save.");
          setPrefs((current) => ({ ...current, ...data }));
          setNotice("Text settings saved.");
        }).catch((error: Error) => setNotice(error.message));
      }}
    />
  );
}

export function ContactChatPane({ sample = false, view = "channel", threadId = "" }: {
  sample?: boolean;
  view?: TeamChatSampleView;
  threadId?: string;
}) {
  const [pane, setPane] = useState<"team" | "site">("team");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 border-b border-[#e7e0d2] bg-[#f5f2ea] px-3 py-2" role="tablist" aria-label="Chat">
        <button type="button" role="tab" aria-selected={pane === "team"} className={pane === "team" ? tealBtn : "rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"} onClick={() => setPane("team")}>
          <Hash className="h-3.5 w-3.5" /> Team
        </button>
        <button type="button" role="tab" aria-selected={pane === "site"} className={pane === "site" ? tealBtn : "rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500"} onClick={() => setPane("site")}>
          Site chats
        </button>
      </div>
      {pane === "team" ? (
        sample ? <TeamChatSample view={view} /> : <TeamChatLive initialThreadId={threadId} />
      ) : (
        <ContactLiveChat />
      )}
    </div>
  );
}

export function PushNotice({ title, body }: { title: string; body: string }) {
  return (
    <div data-testid="shooter-push-notice" className="pointer-events-none absolute inset-x-3 top-3 z-20 rounded-2xl border border-white/40 bg-white/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0d9488] text-[#e8c872]">
          <Bell className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-stone-400">
            <Smartphone className="h-3 w-3" /> Iconic · now
          </span>
          <span className="mt-0.5 block text-sm font-black text-stone-900">{title}</span>
          <span className="mt-0.5 block text-xs text-stone-600">{body}</span>
        </span>
      </div>
    </div>
  );
}

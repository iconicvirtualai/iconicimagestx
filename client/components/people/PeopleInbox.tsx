import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PersonChip } from "@/components/people/PersonChip";
import {
  previewGroups,
  previewProfiles,
  previewThreads,
  threadsForFolder,
  type DeskActor,
  type InboxFolder,
  type InboxThread,
  type PeopleGroup,
  type PersonProfile,
  type PersonRole,
} from "@shared/peopleProfiles";

const FOLDERS: { id: InboxFolder; label: string; admin?: boolean }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "drafts", label: "Drafts" },
  { id: "archived", label: "Archived" },
  { id: "trash", label: "Trash" },
  { id: "all-groups", label: "All groups", admin: true },
];

const ROLES: { id: "" | PersonRole; label: string }[] = [
  { id: "", label: "All roles" },
  { id: "admin", label: "Admins" },
  { id: "coordinator", label: "Office" },
  { id: "photographer", label: "Shooters" },
  { id: "editor", label: "Editors" },
  { id: "client", label: "Clients" },
  { id: "agent", label: "Agents" },
];

async function peopleFetch<T>(path: string, token: string | undefined, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load messages.");
  return body as T;
}

/**
 * One-to-one and group inbox. Mass sends stay in Marketing.
 * Nothing in this component calls email or SMS.
 */
export function PeopleInbox({
  tone = "light",
  leadAdmin = false,
  initialCompose = false,
  exampleViewer = null,
}: {
  tone?: "light" | "dark";
  leadAdmin?: boolean;
  initialCompose?: boolean;
  exampleViewer?: DeskActor | null;
}) {
  const { user } = useAuth();
  const local = Boolean(exampleViewer);
  const [folder, setFolder] = useState<InboxFolder>("inbox");
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [compose, setCompose] = useState(initialCompose);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!local);
  const dark = tone === "dark";
  const shell = dark ? "bg-gray-950 text-white" : "bg-white text-slate-900";
  const muted = dark ? "text-gray-400" : "text-slate-500";
  const line = dark ? "border-gray-800" : "border-slate-200";

  async function token() {
    return user?.getIdToken?.();
  }

  async function load(nextFolder = folder) {
    if (exampleViewer) {
      setThreads(threadsForFolder(previewThreads(), exampleViewer, nextFolder));
      setLoading(false);
      return;
    }
    try {
      const data = await peopleFetch<{ threads: InboxThread[] }>(`/api/people/inbox?folder=${nextFolder}`, await token());
      setThreads(data.threads || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(folder);
    // Reload when the folder or the signed-in person changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, exampleViewer, user?.uid]);

  const selected = threads.find((thread) => thread.id === selectedId) || null;

  async function file(id: string, next: "archived" | "trash" | "inbox" | "purge") {
    if (exampleViewer) {
      setNotice("Example only. Nothing was filed or sent.");
      return;
    }
    try {
      await peopleFetch(`/api/people/inbox/${id}/folder`, await token(), {
        method: "POST",
        body: JSON.stringify({ folder: next }),
      });
      setNotice(next === "trash" || next === "purge" ? "Moved to trash." : next === "archived" ? "Archived." : "Restored to the inbox.");
      await load(folder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that message.");
    }
  }

  return (
    <div data-testid="people-inbox" className={`flex min-h-[32rem] flex-col ${shell}`}>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${line}`}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0d9488]">Direct messages</p>
          <p className={`text-xs ${muted}`}>One person or one group. A blast still goes through Marketing, then Campaigns.</p>
        </div>
        <button
          type="button"
          data-testid="inbox-compose"
          onClick={() => { setCompose(true); setSelectedId(""); }}
          className="rounded-xl bg-[#0d9488] px-3 py-2 text-xs font-bold text-white"
        >
          Compose
        </button>
      </div>
      {exampleViewer ? (
        <p className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">Preview sample. Nothing is emailed or texted.</p>
      ) : null}
      {error ? <p className="px-4 py-2 text-sm text-red-500">{error}</p> : null}
      {notice ? <p className="px-4 py-2 text-sm text-[#0d9488]">{notice}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={`flex gap-2 overflow-x-auto border-b p-3 lg:w-36 lg:flex-col lg:border-b-0 lg:border-r ${line}`} role="tablist" aria-label="Message folders">
          {FOLDERS.filter((item) => !item.admin || leadAdmin).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={folder === item.id}
              onClick={() => { setFolder(item.id); setCompose(false); }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-left text-xs font-bold ${folder === item.id ? "bg-[#0d9488] text-white" : muted}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={`max-h-80 overflow-y-auto border-b lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r ${line}`}>
          {loading ? <p className={`p-4 text-sm ${muted}`}>Loading…</p> : null}
          {!loading && threads.length === 0 ? <p className={`p-4 text-sm ${muted}`}>Nothing in this folder.</p> : null}
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => { setSelectedId(thread.id); setCompose(false); }}
              className={`block w-full border-b px-4 py-3 text-left ${line} ${selectedId === thread.id ? (dark ? "bg-gray-900" : "bg-teal-50") : ""}`}
            >
              <span className="block truncate text-sm font-bold">{thread.groupName || thread.senderName}</span>
              <span className={`mt-1 block truncate text-xs ${muted}`}>{thread.subject || thread.body}</span>
              {thread.kind === "group" && thread.notified === false ? (
                <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-amber-600">Not notified</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-4">
          {compose ? (
            <ComposeForm
              dark={dark}
              local={local}
              onClose={() => setCompose(false)}
              onSaved={async (message) => {
                setNotice(message);
                setCompose(false);
                await load(folder);
              }}
            />
          ) : selected ? (
            <article>
              <h2 className="text-lg font-black">{selected.subject || "Message"}</h2>
              <p className={`mt-1 text-xs ${muted}`}>
                {selected.groupName ? `To ${selected.groupName}. Members only.` : `From ${selected.senderName}`}
                {selected.notified === false ? " · You can read this. You are not notified." : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.recipientProfileIds.map((id) => {
                  const [kind, sourceId] = id.split(":") as [PersonProfile["kind"], string];
                  const name = selected.messages.find((note) => note.senderProfileId === id)?.senderName || sourceId;
                  return <PersonChip key={id} name={name} kind={kind} sourceId={sourceId} tone={tone} audience={exampleViewer ? "portal" : "admin"} />;
                })}
              </div>
              <div className="mt-4 space-y-3">
                {selected.messages.map((note) => (
                  <div key={note.id} className={`rounded-2xl px-3 py-2 text-sm ${dark ? "bg-gray-900" : "bg-slate-50"}`}>
                    <PersonChip name={note.senderName} kind={note.senderProfileId.startsWith("client:") ? "client" : "staff"} sourceId={note.senderProfileId.split(":")[1]} tone={tone} audience={exampleViewer ? "portal" : "admin"} />
                    <p className="mt-2 whitespace-pre-wrap">{note.body}</p>
                  </div>
                ))}
                {selected.messages.length === 0 ? <p className={`text-sm ${muted}`}>{selected.body || "Empty draft."}</p> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {folder !== "archived" ? <button type="button" className={quiet(dark)} onClick={() => void file(selected.id, "archived")}>Archive</button> : null}
                {folder === "trash" ? (
                  <button type="button" className={quiet(dark)} onClick={() => void file(selected.id, "purge")}>Delete</button>
                ) : (
                  <button type="button" className={quiet(dark)} onClick={() => void file(selected.id, "trash")}>Delete</button>
                )}
                {folder !== "inbox" && selected.status !== "draft" ? <button type="button" className={quiet(dark)} onClick={() => void file(selected.id, "inbox")}>Move to inbox</button> : null}
              </div>
            </article>
          ) : (
            <p className={`text-sm ${muted}`}>Choose a message, or compose a new one.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function quiet(dark: boolean): string {
  return `rounded-xl border px-3 py-2 text-xs font-bold ${dark ? "border-gray-700 text-gray-200" : "border-slate-200 text-slate-700"}`;
}

function ComposeForm({
  dark,
  local,
  onClose,
  onSaved,
}: {
  dark: boolean;
  local: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [profiles, setProfiles] = useState<PersonProfile[]>(() => local ? previewProfiles() : []);
  const [groups, setGroups] = useState<PeopleGroup[]>(() => local ? previewGroups() : []);
  const [pickedPeople, setPickedPeople] = useState<string[]>([]);
  const [pickedGroup, setPickedGroup] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const muted = dark ? "text-gray-400" : "text-slate-500";

  useEffect(() => {
    if (local) {
      const needle = query.trim().toLowerCase();
      setProfiles(previewProfiles().filter((profile) => {
        if (role && profile.role !== role) return false;
        if (!needle) return true;
        return `${profile.displayName} ${profile.email}`.toLowerCase().includes(needle);
      }));
      setGroups(previewGroups().filter((group) => !needle || group.name.toLowerCase().includes(needle)));
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await user?.getIdToken?.();
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (role) params.set("role", role);
          const data = await peopleFetch<{ profiles: PersonProfile[]; groups: PeopleGroup[] }>(`/api/people/directory?${params}`, token);
          setProfiles(data.profiles || []);
          setGroups(data.groups || []);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not search people.");
        }
      })();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, role, local, user]);

  const chosenGroup = groups.find((group) => group.id === pickedGroup) || null;
  const summary = useMemo(() => {
    if (chosenGroup) return `To ${chosenGroup.name}. Only its members are notified.`;
    if (pickedPeople.length === 0) return "Choose people or one group.";
    return `${pickedPeople.length} selected.`;
  }, [chosenGroup, pickedPeople.length]);

  async function submit(mode: "draft" | "send") {
    setError("");
    if (local) {
      await onSaved(mode === "draft" ? "Draft kept on this example page." : "Example only. The message was not sent.");
      return;
    }
    try {
      const token = await user?.getIdToken?.();
      await peopleFetch(mode === "draft" ? "/api/people/inbox/draft" : "/api/people/inbox/send", token, {
        method: "POST",
        body: JSON.stringify({
          subject,
          body,
          profileIds: pickedGroup ? [] : pickedPeople,
          groupId: pickedGroup || undefined,
        }),
      });
      await onSaved(mode === "draft" ? "Draft saved in the app." : "Saved in the app. Nobody was emailed or texted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that message.");
    }
  }

  return (
    <form data-testid="inbox-compose-form" className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit("send"); }}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">New message</h2>
        <button type="button" onClick={onClose} className={`text-xs font-bold ${muted}`}>Close</button>
      </div>
      <label className="block text-xs font-bold">
        To
        <button
          type="button"
          data-testid="compose-to"
          className={`mt-1 flex min-h-11 w-full items-center rounded-xl border px-3 text-left text-sm ${dark ? "border-gray-700 bg-gray-900" : "border-slate-200 bg-white"}`}
          onClick={() => setOpen((value) => !value)}
        >
          {summary}
        </button>
      </label>
      {open ? (
        <div data-testid="compose-directory" className={`rounded-2xl border p-3 ${dark ? "border-gray-800 bg-gray-900" : "border-slate-200"}`}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people or groups"
              className={`h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm ${dark ? "border-gray-700 bg-gray-950 text-white" : "border-slate-200"}`}
            />
            <select
              aria-label="Filter by role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className={`h-11 rounded-xl border px-3 text-sm ${dark ? "border-gray-700 bg-gray-950 text-white" : "border-slate-200 bg-white"}`}
            >
              {ROLES.map((item) => <option key={item.label} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <p className={`mt-3 text-[10px] font-black uppercase tracking-widest ${muted}`}>Groups</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => { setPickedGroup(group.id === pickedGroup ? "" : group.id); setPickedPeople([]); }}
                className={`rounded-full px-3 py-1 text-xs font-bold ${pickedGroup === group.id ? "bg-[#0d9488] text-white" : dark ? "bg-white/10" : "bg-slate-100"}`}
              >
                {group.name}
              </button>
            ))}
          </div>
          <p className={`mt-3 text-[10px] font-black uppercase tracking-widest ${muted}`}>People</p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {profiles.map((profile) => {
              const on = pickedPeople.includes(profile.id);
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setPickedGroup("");
                    setPickedPeople((current) => on ? current.filter((id) => id !== profile.id) : [...current, profile.id]);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm ${on ? "bg-teal-500/15" : ""}`}
                >
                  <span className="font-semibold">{profile.displayName}</span>
                  <span className={`text-[10px] uppercase ${muted}`}>{profile.role}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <input
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Subject"
        className={`h-11 w-full rounded-xl border px-3 text-sm ${dark ? "border-gray-700 bg-gray-900 text-white" : "border-slate-200"}`}
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write the message"
        rows={5}
        className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-white" : "border-slate-200"}`}
      />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void submit("draft")} className={quiet(dark)}>Save as draft</button>
        <button type="submit" className="rounded-xl bg-[#0d9488] px-3 py-2 text-xs font-bold text-white">Save in app</button>
      </div>
      <p className={`text-xs ${muted}`}>This stays in the app. It does not email or text anyone.</p>
    </form>
  );
}

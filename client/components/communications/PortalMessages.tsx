import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Check,
  ChevronLeft,
  FileText,
  Home,
  Inbox,
  Lock,
  Mail,
  MoreHorizontal,
  PenLine,
  Search,
  Send,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { exampleThreads } from "@/lib/exampleHub";
import { portalHref } from "@/components/client-hub/PortalShell";
import { portalPortrait } from "@shared/portalAvatar";
import { OrderNumberMark } from "@/components/OrderNumberMark";
import { PersonChip } from "@/components/people/PersonChip";
import type { UnifiedThread } from "@shared/communications/threads";
import {
  buildDraft,
  buildOutbound,
  directoryHit,
  previewGroups,
  previewProfiles,
  previewThreads,
  ROLE_LABEL,
  type DeskActor,
  type InboxThread,
  type PeopleGroup,
  type PersonProfile,
  type PersonRole,
} from "@shared/peopleProfiles";
import {
  buildPortalInbox,
  folderCounts,
  inboxDayLabel,
  inboxTimeLabel,
  initials,
  itemsInFolder,
  listingChip,
  mergeFlag,
  orderChip,
  searchInbox,
  threadKey,
  unreadInboxCount,
  type FlagPatch,
  type PortalFolder,
  type PortalInboxItem,
  type PortalThreadFlag,
} from "@shared/portalInbox";
import "@/styles/portal-inbox.css";

const SAMPLE_VIEWER: DeskActor = {
  uid: "sample-jane",
  email: "jane.doe@example.com",
  kind: "client",
  role: "client",
  leadAdmin: false,
  permissions: null,
};

const FOLDERS: { id: PortalFolder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
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

const EMPTY: Record<
  PortalFolder,
  { title: string; body: string; compose?: boolean }
> = {
  inbox: {
    title: "No messages for this login yet.",
    body: "Choose Compose to write to one person or one group. It stays in the app.",
  },
  starred: {
    title: "No starred conversations.",
    body: "Star a conversation to find it here.",
  },
  drafts: {
    title: "No drafts yet.",
    body: "Hit Save as draft in a new message and it waits here until you're ready.",
    compose: true,
  },
  archived: {
    title: "Nothing in this folder.",
    body: "Archive a conversation to tuck it away here.",
  },
  trash: {
    title: "Trash is empty.",
    body: "Deleted conversations land here first, so nothing is lost by accident.",
  },
};

const IN_APP_NOTE = "This stays in the app. It does not email or text anyone.";

async function authHeaders(
  user: { getIdToken?: () => Promise<string> } | null,
  extra: Record<string, string> = {},
) {
  const token = await user?.getIdToken?.();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function groupsFor(actor: DeskActor, groups: PeopleGroup[]): PeopleGroup[] {
  if (actor.leadAdmin) return groups;
  return groups.filter(
    (group) =>
      group.memberUids.includes(actor.uid) ||
      group.canMessageUids.includes(actor.uid),
  );
}

export function PortalMessages({
  example = false,
  onUnreadCount,
}: {
  example?: boolean;
  appearance?: "light" | "dark";
  onUnreadCount?: (count: number) => void;
}) {
  const { user, userType } = useAuth();
  const viewer: DeskActor = example
    ? SAMPLE_VIEWER
    : {
        uid: user?.uid || "",
        email: user?.email || "",
        kind: userType === "staff" ? "staff" : "client",
        role: userType === "staff" ? "photographer" : "client",
        leadAdmin: false,
        permissions: null,
      };
  const [conversations, setConversations] = useState<UnifiedThread[]>(() =>
    example ? exampleThreads() : [],
  );
  const [direct, setDirect] = useState<InboxThread[]>(() =>
    example ? previewThreads() : [],
  );
  const [flags, setFlags] = useState<PortalThreadFlag[]>([]);
  const [folder, setFolder] = useState<PortalFolder>("inbox");
  const [selectedKey, setSelectedKey] = useState(() => {
    if (!example) return "";
    const first = buildPortalInbox(
      exampleThreads(),
      previewThreads(),
      SAMPLE_VIEWER,
      [],
    ).find(
      (item) => item.folder === "inbox" && item.direct?.status !== "draft",
    );
    return first?.key || "";
  });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!example);
  const [menuKey, setMenuKey] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    patches: FlagPatch[];
  } | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [selfPhoto, setSelfPhoto] = useState("");
  const [photoById, setPhotoById] = useState<Record<string, string>>({});

  const items = useMemo(
    () => buildPortalInbox(conversations, direct, viewer, flags),
    [conversations, direct, flags, viewer.uid, viewer.kind],
  );
  const counts = folderCounts(items);
  const visible = searchInbox(itemsInFolder(items, folder), query);
  const selected = items.find((item) => item.key === selectedKey) || null;
  const openItemInView =
    selected && visible.some((item) => item.key === selected.key)
      ? selected
      : null;
  const unread = unreadInboxCount(items);

  useEffect(() => {
    if (loading) return;
    onUnreadCount?.(unread);
  }, [loading, unread, onUnreadCount]);

  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders(user);
      const [profileRes, directoryRes] = await Promise.all([
        fetch("/api/clients/me/hub/profile", { headers }),
        fetch("/api/people/directory", { headers }),
      ]);
      if (cancelled) return;
      if (profileRes.ok) {
        const body = await profileRes.json().catch(() => ({}));
        setSelfPhoto(portalPortrait(body.profile || {}).url);
      }
      if (directoryRes.ok) {
        const body = await directoryRes.json().catch(() => ({}));
        const next: Record<string, string> = {};
        for (const profile of body.profiles || []) {
          if (!profile?.photoUrl) continue;
          if (profile.id) next[profile.id] = profile.photoUrl;
          if (profile.uid) next[profile.uid] = profile.photoUrl;
        }
        setPhotoById(next);
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [example, user]);

  function rowPhoto(item: { direct: InboxThread | null }): string {
    const direct = item.direct;
    if (direct) {
      const ids = [...(direct.recipientProfileIds || []), direct.senderProfileId].filter(Boolean);
      const other = ids.map((id) => photoById[id]).find((url) => url && url !== selfPhoto);
      if (other) return other;
    }
    return selfPhoto;
  }

  useEffect(() => {
    if (loading || selectedKey || composeOpen) return;
    const first = items.find(
      (item) => item.folder === "inbox" && item.direct?.status !== "draft",
    );
    if (first) setSelectedKey(first.key);
  }, [loading, items, selectedKey, composeOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadAll() {
    const headers = await authHeaders(user);
    const [mine, flagRes, ...folders] = await Promise.all([
      fetch("/api/communications/mine", { headers, cache: "no-store" }),
      fetch("/api/communications/mine/flags", { headers, cache: "no-store" }),
      ...(["inbox", "drafts", "archived", "trash"] as const).map((name) =>
        fetch(`/api/people/inbox?folder=${name}`, {
          headers,
          cache: "no-store",
        }),
      ),
    ]);
    const mineBody = await mine.json().catch(() => ({}));
    if (!mine.ok)
      throw new Error(mineBody.error || "Couldn't load your messages.");
    setConversations(Array.isArray(mineBody.threads) ? mineBody.threads : []);
    if (flagRes.ok) {
      const flagBody = await flagRes.json().catch(() => ({}));
      setFlags(Array.isArray(flagBody.flags) ? flagBody.flags : []);
    }
    const threads: InboxThread[] = [];
    for (const response of folders) {
      if (!response.ok) continue;
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.threads)) threads.push(...body.threads);
    }
    const byId = new Map<string, InboxThread>();
    for (const thread of threads) byId.set(thread.id, thread);
    setDirect([...byId.values()]);
    setError("");
  }

  useEffect(() => {
    if (example || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void loadAll()
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Couldn't load your messages.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Reload when the signed-in person changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [example, user?.uid]);

  function applyLocal(patches: FlagPatch[]) {
    const now = new Date().toISOString();
    setFlags((current) => {
      const map = new Map(current.map((flag) => [flag.threadKey, flag]));
      for (const patch of patches) {
        const nextPatch = patch.threadKey.startsWith("direct:")
          ? { ...patch, folder: undefined }
          : patch;
        if (
          nextPatch.folder === undefined &&
          nextPatch.starred === undefined &&
          nextPatch.forceUnread === undefined &&
          nextPatch.readAt === undefined
        )
          continue;
        const next = mergeFlag(
          map.get(patch.threadKey),
          { ...nextPatch, threadKey: patch.threadKey },
          now,
        );
        map.set(next.threadKey, next);
      }
      return [...map.values()];
    });
    setDirect((current) =>
      current.map((thread) => {
        const patch = patches.find(
          (item) =>
            item.threadKey === threadKey("direct", thread.id) && item.folder,
        );
        if (!patch?.folder) return thread;
        return {
          ...thread,
          folderByUid: { ...thread.folderByUid, [viewer.uid]: patch.folder },
        };
      }),
    );
  }

  async function persist(patches: FlagPatch[]) {
    applyLocal(patches);
    if (example || patches.length === 0) return;
    const res = await fetch("/api/communications/mine/flags", {
      method: "POST",
      headers: await authHeaders(user, { "Content-Type": "application/json" }),
      body: JSON.stringify({ updates: patches }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(data.error || "Couldn't update that conversation.");
    if (Array.isArray(data.flags)) setFlags(data.flags);
    if (
      patches.some(
        (patch) => patch.threadKey.startsWith("direct:") && patch.folder,
      )
    )
      await loadAll();
  }

  async function runPatches(
    patches: FlagPatch[],
    message?: string,
    undo?: FlagPatch[],
  ) {
    setError("");
    try {
      await persist(patches);
      if (message && undo) setToast({ message, patches: undo });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't update that conversation.",
      );
    }
  }

  function file(keys: string[], next: "inbox" | "archived" | "trash") {
    const patches: FlagPatch[] = [];
    const undo: FlagPatch[] = [];
    for (const key of keys) {
      const item = items.find((row) => row.key === key);
      if (!item) continue;
      patches.push({ threadKey: key, folder: next });
      undo.push({
        threadKey: key,
        folder:
          item.folder === "archived" || item.folder === "trash"
            ? item.folder
            : "inbox",
      });
    }
    const count = patches.length;
    const noun = count === 1 ? "Conversation" : `${count} conversations`;
    const label =
      next === "archived"
        ? `${noun} moved to Archived`
        : next === "trash"
          ? `${noun} moved to Trash`
          : `${noun} moved to Inbox`;
    setPicked([]);
    void runPatches(patches, label, undo);
  }

  function toggleStar(keys: string[], on: boolean) {
    void runPatches(keys.map((key) => ({ threadKey: key, starred: on })));
  }

  function markUnread(keys: string[]) {
    void runPatches(
      keys.map((key) => ({ threadKey: key, forceUnread: true, readAt: null })),
    );
  }

  function markRead(item: PortalInboxItem) {
    void runPatches([
      {
        threadKey: item.key,
        forceUnread: false,
        readAt: new Date().toISOString(),
      },
    ]);
  }

  function openCompose(thread?: InboxThread) {
    setComposeOpen(true);
    setDraftId(thread?.id || "");
    setSelectedKey("");
    setMobileThread(true);
    setNotice("");
    setMenuKey("");
  }

  function openItem(item: PortalInboxItem) {
    if (item.source === "direct" && item.direct?.status === "draft") {
      openCompose(item.direct);
      return;
    }
    setComposeOpen(false);
    setSelectedKey(item.key);
    setMobileThread(true);
    setMenuKey("");
    setNotice("");
    if (item.unread) markRead(item);
  }

  function chooseFolder(next: PortalFolder) {
    setFolder(next);
    setPicked([]);
    setComposeOpen(false);
    setMobileThread(false);
    setMenuKey("");
  }

  const shellClass = `portal-inbox${mobileThread && selected ? " is-thread" : ""}${mobileThread && composeOpen ? " is-compose" : ""}${picked.length ? " has-selection" : ""}`;

  return (
    <div
      id="messages-jump"
      data-testid="portal-messages"
      className={shellClass}
    >
      <div className="page-head">
        <div className="who">
          <span className="av" data-testid="portal-message-avatar" data-avatar-kind={selfPhoto ? "headshot" : "initials"}>
            {selfPhoto ? <img src={selfPhoto} alt="" /> : initials(accountInitials(viewer.email))}
          </span>
          <div>
          <div className="kicker">Messages</div>
          <h1>Your messages</h1>
          <p className="sub">
            You only see messages for this login. Choose a thread to read it and reply, or start a new one.
          </p>
          </div>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="btn btn-teal btn-lg compose-desk"
            data-testid="inbox-compose"
            onClick={() => openCompose()}
          >
            <PenLine className="ib-ico" /> Compose
          </button>
        </div>
      </div>
      {loading ? <p className="ib-ok">Loading messages…</p> : null}
      {error ? (
        <p className="ib-alert" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="ib-ok">{notice}</p> : null}
      <div className="ib-shell">
        <div className="ib-top">
          <div className="ib-tabs" role="tablist" aria-label="Message folders">
            {FOLDERS.map((item) => {
              const Icon = item.icon;
              const count = counts[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={folder === item.id}
                  className={folder === item.id ? "ib-tab on" : "ib-tab"}
                  data-testid={`folder-${item.id}`}
                  onClick={() => chooseFolder(item.id)}
                >
                  <Icon className="ib-ico" />
                  {item.label}
                  {count > 0 ? <span className="n">{count}</span> : null}
                </button>
              );
            })}
          </div>
          <label className="ib-search">
            <Search className="ib-ico" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages"
              aria-label="Search messages"
              data-testid="message-search"
            />
          </label>
        </div>
        <div className="ib-body">
          <section className="ib-list" aria-label="Conversations">
            {picked.length > 0 ? (
              <div className="ib-bulk" data-testid="bulk-bar">
                <span className="ib-check on" aria-hidden="true">
                  <Check className="ib-ico" />
                </span>
                <span>{picked.length} selected</span>
                <span className="sp" />
                <button
                  type="button"
                  aria-label="Star"
                  onClick={() => toggleStar(picked, true)}
                >
                  <Star className="ib-ico" />
                </button>
                <button
                  type="button"
                  aria-label="Mark unread"
                  onClick={() => markUnread(picked)}
                >
                  <Mail className="ib-ico" />
                </button>
                <button type="button" onClick={() => file(picked, "archived")}>
                  <Archive className="ib-ico" /> Archive
                </button>
                <button type="button" onClick={() => file(picked, "trash")}>
                  <Trash2 className="ib-ico" /> Trash
                </button>
              </div>
            ) : (
              <div className="ib-list-h">
                <span>
                  {visible.length} conversation{visible.length === 1 ? "" : "s"}
                  {folder === "inbox"
                    ? ` · ${visible.filter((item) => item.unread).length} unread`
                    : ""}
                </span>
              </div>
            )}
            {visible.length === 0 ? (
              <EmptyState
                folder={folder}
                searched={Boolean(query.trim())}
                onCompose={() => openCompose()}
              />
            ) : (
              visible.map((item) => (
                <ThreadRow
                  key={item.key}
                  item={item}
                  avatarUrl={rowPhoto(item)}
                  selected={item.key === selectedKey}
                  checked={picked.includes(item.key)}
                  example={example}
                  onOpen={() => openItem(item)}
                  onCheck={() =>
                    setPicked((current) =>
                      current.includes(item.key)
                        ? current.filter((key) => key !== item.key)
                        : [...current, item.key],
                    )
                  }
                  onStar={() => toggleStar([item.key], !item.starred)}
                  onUnread={() => markUnread([item.key])}
                  onArchive={() => file([item.key], "archived")}
                  onTrash={() => file([item.key], "trash")}
                  menuOpen={menuKey === item.key}
                  onMenu={() =>
                    setMenuKey((current) =>
                      current === item.key ? "" : item.key,
                    )
                  }
                />
              ))
            )}
          </section>
          {composeOpen ? (
            <ComposePane
              example={example}
              viewer={viewer}
              user={user}
              draft={direct.find((thread) => thread.id === draftId) || null}
              onClose={() => {
                setComposeOpen(false);
                setMobileThread(false);
              }}
              onSaved={(message, thread) => {
                setNotice(message);
                setComposeOpen(false);
                setMobileThread(false);
                if (thread) {
                  setDirect((current) => [
                    thread,
                    ...current.filter((item) => item.id !== thread.id),
                  ]);
                  setFolder(thread.status === "draft" ? "drafts" : "inbox");
                } else {
                  void loadAll();
                  setFolder("inbox");
                }
              }}
            />
          ) : (
            <ReadingPane
              item={openItemInView}
              avatarUrl={openItemInView ? rowPhoto(openItemInView) : ""}
              viewer={viewer}
              example={example}
              user={user}
              staff={userType === "staff" && !example}
              onBack={() => {
                setMobileThread(false);
                setSelectedKey("");
              }}
              onStar={() =>
                selected && toggleStar([selected.key], !selected.starred)
              }
              onUnread={() => selected && markUnread([selected.key])}
              onArchive={() =>
                selected &&
                file(
                  [selected.key],
                  selected.folder === "archived" ? "inbox" : "archived",
                )
              }
              onTrash={() => selected && file([selected.key], "trash")}
              onSent={(message) => {
                setNotice(message);
                if (!example) void loadAll();
              }}
              onExampleReply={(reply) => {
                if (!selected) return;
                const now = new Date().toISOString();
                if (selected.conversation) {
                  setConversations((current) =>
                    current.map((thread) =>
                      thread.id === selected.id
                        ? {
                            ...thread,
                            updatedAt: now,
                            preview: reply,
                            messages: [
                              ...thread.messages,
                              {
                                id: `local-${thread.messages.length + 1}`,
                                direction: "inbound" as const,
                                senderId: viewer.uid,
                                senderName: viewer.email,
                                senderType:
                                  viewer.kind === "client" ? "client" : "staff",
                                body: reply,
                                channel: "in-app",
                                createdAt: now,
                                delivery: "logged",
                              },
                            ],
                          }
                        : thread,
                    ),
                  );
                }
                if (selected.direct) {
                  setDirect((current) =>
                    current.map((thread) =>
                      thread.id === selected.id
                        ? {
                            ...thread,
                            body: reply,
                            updatedAt: now,
                            messages: [
                              ...thread.messages,
                              {
                                id: `local-${thread.messages.length + 1}`,
                                senderUid: viewer.uid,
                                senderProfileId: `client:${viewer.uid}`,
                                senderName: viewer.email,
                                body: reply,
                                at: now,
                              },
                            ],
                          }
                        : thread,
                    ),
                  );
                }
                setNotice("Saved in the app.");
              }}
            />
          )}
        </div>
        {toast ? (
          <div className="ib-toast" role="status" data-testid="undo-toast">
            <Archive className="ib-ico" />
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => {
                const patches = toast.patches;
                setToast(null);
                void runPatches(patches);
              }}
            >
              Undo
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-teal ib-fab"
        onClick={() => openCompose()}
      >
        <PenLine className="ib-ico" /> Compose
      </button>
    </div>
  );
}

function EmptyState({
  folder,
  searched,
  onCompose,
}: {
  folder: PortalFolder;
  searched: boolean;
  onCompose: () => void;
}) {
  const copy = searched
    ? {
        title: "No messages match that search.",
        body: "Try a name, an order number, or a few words from the message.",
        compose: false,
      }
    : EMPTY[folder];
  const Icon = FOLDERS.find((item) => item.id === folder)?.icon || Inbox;
  return (
    <div className="ib-empty" data-testid={`empty-${folder}`}>
      <div className="em">
        <Icon className="ib-ico" />
      </div>
      <h4>{copy.title}</h4>
      <p>{copy.body}</p>
      {copy.compose ? (
        <button
          type="button"
          className="btn btn-teal btn-md"
          onClick={onCompose}
        >
          <PenLine className="ib-ico" /> Compose
        </button>
      ) : null}
    </div>
  );
}

function accountInitials(email: string): string {
  const local = email.split("@")[0] || "You";
  return local;
}

function ThreadRow({
  item,
  avatarUrl = "",
  selected,
  checked,
  example,
  onOpen,
  onCheck,
  onStar,
  onUnread,
  onArchive,
  onTrash,
  menuOpen,
  onMenu,
}: {
  item: PortalInboxItem;
  avatarUrl?: string;
  selected: boolean;
  checked: boolean;
  example: boolean;
  onOpen: () => void;
  onCheck: () => void;
  onStar: () => void;
  onUnread: () => void;
  onArchive: () => void;
  onTrash: () => void;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const order = orderChip(item);
  const listing = listingChip(item);
  return (
    <div
      className={`ib-row${selected ? " sel" : ""}${item.unread ? " unread" : ""}${checked ? " checked" : ""}`}
      data-testid="thread-row"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a")) return;
        onOpen();
      }}
    >
      <button
        type="button"
        className={checked ? "ib-check on" : "ib-check"}
        aria-label={checked ? "Deselect conversation" : "Select conversation"}
        onClick={onCheck}
      >
        {checked ? <Check className="ib-ico" /> : null}
      </button>
      <span className="ib-dot" aria-hidden="true" />
      <span className="av" data-testid="thread-avatar" data-avatar-kind={avatarUrl ? "headshot" : "initials"}>
        {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(item.title)}
      </span>
      <div className="ib-main">
        <button type="button" className="ib-open" onClick={onOpen}>
          <span className="ib-row1">
            <span className="ib-name">{item.title}</span>
            <span className="ib-time">{inboxTimeLabel(item.updatedAt)}</span>
          </span>
          <span className="ib-sub">{item.preview}</span>
        </button>
        {order || listing ? (
          <span className="ib-chips">
            {order ? (
              <span
                className={order.tone === "gold" ? "ib-chip gold" : "ib-chip"}
              >
                <ShoppingBag className="ib-ico" />
                {item.orderNumber ? (
                  <span className="ordno">{order.label}</span>
                ) : (
                  order.label
                )}
              </span>
            ) : null}
            {listing ? (
              <Link
                className="ib-chip"
                to={portalHref(`/portal/listings/${listing.id}`, example)}
              >
                <Home className="ib-ico" />
                <span className="ib-name">{listing.label}</span>
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
      <span className="ib-hover">
        <button
          type="button"
          className={item.starred ? "ib-star on" : "ib-star"}
          aria-label="Star"
          onClick={onStar}
        >
          <Star className="ib-ico" />
        </button>
        <button type="button" aria-label="Mark unread" onClick={onUnread}>
          <Mail className="ib-ico" />
        </button>
        <button type="button" aria-label="Archive" onClick={onArchive}>
          <Archive className="ib-ico" />
        </button>
        <button type="button" aria-label="Move to Trash" onClick={onTrash}>
          <Trash2 className="ib-ico" />
        </button>
        <button
          type="button"
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={onMenu}
        >
          <MoreHorizontal className="ib-ico" />
        </button>
      </span>
      {menuOpen ? (
        <div className="ib-menu" role="menu">
          <div className="ib-mh">This conversation</div>
          <button type="button" onClick={onStar}>
            <Star className="ib-ico" /> Star / save
          </button>
          <button type="button" onClick={onUnread}>
            <Mail className="ib-ico" /> Mark as unread
          </button>
          <button type="button" onClick={onArchive}>
            <Archive className="ib-ico" /> Archive
          </button>
          <button type="button" className="del" onClick={onTrash}>
            <Trash2 className="ib-ico" /> Move to Trash
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReadingPane({
  item,
  avatarUrl = "",
  viewer,
  example,
  user,
  staff,
  onBack,
  onStar,
  onUnread,
  onArchive,
  onTrash,
  onSent,
  onExampleReply,
}: {
  item: PortalInboxItem | null;
  avatarUrl?: string;
  viewer: DeskActor;
  example: boolean;
  user: { getIdToken?: () => Promise<string> } | null;
  staff: boolean;
  onBack: () => void;
  onStar: () => void;
  onUnread: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onSent: (message: string) => void;
  onExampleReply: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    setBody("");
    setLocalError("");
  }, [item?.key]);
  if (!item) {
    return (
      <section className="ib-pane" data-testid="reading-pane">
        <div className="ib-msgs">
          <p className="ib-note">
            Choose a thread to read it and reply. You only see messages for this
            login.
          </p>
        </div>
      </section>
    );
  }
  const notes = item.conversation
    ? item.conversation.messages.map((message) => ({
        id: message.id,
        name: message.senderName,
        body: message.body,
        at: message.createdAt,
        mine: message.senderId === viewer.uid,
      }))
    : (item.direct?.messages || []).map((note) => ({
        id: note.id,
        name: note.senderName,
        body: note.body,
        at: note.at,
        mine: note.senderUid === viewer.uid,
      }));

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    if (example) {
      onExampleReply(text);
      setBody("");
      return;
    }
    setSending(true);
    setLocalError("");
    try {
      const path = item!.conversation
        ? "/api/communications/mine/reply"
        : `/api/people/inbox/${item!.id}/reply`;
      const payload = item!.conversation
        ? { threadId: item!.id, body: text }
        : { body: text };
      const res = await fetch(path, {
        method: "POST",
        headers: await authHeaders(user, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send the reply.");
      setBody("");
      onSent("Reply saved on this thread.");
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Couldn't send the reply.",
      );
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";
  let lastName = "";
  return (
    <section className="ib-pane" data-testid="reading-pane">
      <div className="ib-pane-h">
        <button
          type="button"
          className="ib-tool ib-back"
          aria-label="Back to messages"
          onClick={onBack}
        >
          <ChevronLeft className="ib-ico" />
        </button>
        <span className="av" data-avatar-kind={avatarUrl ? "headshot" : "initials"}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(item.title)}
        </span>
        <div className="ib-who">
          {item.orderNumber ? (
            <OrderNumberMark value={item.orderNumber} />
          ) : null}
          <div className="nm">{item.title}</div>
          <div className="meta">
            <Lock className="ib-ico" /> <span className="ib-keep">in-app</span>{" "}
            <span>·</span>{" "}
            <span className="ib-keep">
              {item.messageCount} message{item.messageCount === 1 ? "" : "s"}
            </span>
            {item.groupName ? (
              <span className="ib-keep">· Members only.</span>
            ) : null}
          </div>
        </div>
        <div className="ib-tools">
          <button
            type="button"
            className={item.starred ? "ib-tool wide on" : "ib-tool wide"}
            onClick={onStar}
          >
            <Star className="ib-ico" />{" "}
            <span>{item.starred ? "Starred" : "Star"}</span>
          </button>
          <button type="button" className="ib-tool wide" onClick={onUnread}>
            <Mail className="ib-ico" /> <span>Mark unread</span>
          </button>
          <button type="button" className="ib-tool wide" onClick={onArchive}>
            <Archive className="ib-ico" />{" "}
            <span>{item.folder === "archived" ? "Inbox" : "Archive"}</span>
          </button>
          <button type="button" className="ib-tool wide del" onClick={onTrash}>
            <Trash2 className="ib-ico" /> <span>Trash</span>
          </button>
        </div>
      </div>
      <div className="ib-msgs">
        {item.direct ? (
          <div className="ib-chips" style={{ marginBottom: 8 }}>
            {item.direct.recipientProfileIds.map((id) => {
              const [kind, sourceId] = id.split(":") as [
                PersonProfile["kind"],
                string,
              ];
              const fromNote = item.direct?.messages.find(
                (note) => note.senderProfileId === id,
              )?.senderName;
              const known = example
                ? previewProfiles().find((profile) => profile.id === id)
                : null;
              const name = fromNote || known?.displayName || sourceId;
              return (
                <PersonChip
                  key={id}
                  name={name}
                  kind={kind}
                  sourceId={sourceId}
                  audience={staff ? "admin" : "portal"}
                />
              );
            })}
          </div>
        ) : null}
        {notes.map((note) => {
          const day = inboxDayLabel(note.at);
          const showDay = Boolean(day) && day !== lastDay;
          const showName = showDay || note.name !== lastName;
          if (day) lastDay = day;
          lastName = note.name;
          return (
            <div key={note.id}>
              {showDay ? <div className="ib-day">{day}</div> : null}
              {showName ? (
                <div className="ib-when">
                  {note.name} · {inboxTimeLabel(note.at)}
                </div>
              ) : null}
              <div className={note.mine ? "ib-msg mine" : "ib-msg"}>
                <span className={showName ? "av" : "av ghost"}>
                  {initials(note.name)}
                </span>
                <div className="ib-bub">{note.body}</div>
              </div>
            </div>
          );
        })}
        {notes.length === 0 ? (
          <p className="ib-note">{item.preview || "Empty conversation."}</p>
        ) : null}
      </div>
      <form
        className="ib-reply"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="ib-reply-box">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a reply…"
            aria-label="Write a reply"
          />
          <button
            className="btn btn-teal btn-md"
            type="submit"
            disabled={sending || !body.trim()}
          >
            <Send className="ib-ico" /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="ib-note">
          <Lock className="ib-ico" /> {IN_APP_NOTE}
        </p>
        {localError ? <p className="ib-alert">{localError}</p> : null}
      </form>
    </section>
  );
}

function ComposePane({
  example,
  viewer,
  user,
  draft,
  onClose,
  onSaved,
}: {
  example: boolean;
  viewer: DeskActor;
  user: { getIdToken?: () => Promise<string> } | null;
  draft: InboxThread | null;
  onClose: () => void;
  onSaved: (message: string, thread: InboxThread | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [groups, setGroups] = useState<PeopleGroup[]>([]);
  const [pickedPeople, setPickedPeople] = useState<string[]>(
    draft?.groupId ? [] : draft?.recipientProfileIds || [],
  );
  const [pickedGroup, setPickedGroup] = useState(draft?.groupId || "");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.status === "draft" ? draft.body : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (example) {
      const visibleGroups = groupsFor(viewer, previewGroups()).filter(
        (group) =>
          !query.trim() ||
          group.name.toLowerCase().includes(query.trim().toLowerCase()),
      );
      setGroups(visibleGroups);
      const allowed = new Set(
        groupsFor(viewer, previewGroups()).flatMap((group) => [
          ...group.memberProfileIds,
          ...group.canMessageProfileIds,
        ]),
      );
      setProfiles(
        previewProfiles().filter((profile) => {
          if (
            viewer.kind === "client" &&
            profile.uid !== viewer.uid &&
            !allowed.has(profile.id)
          )
            return false;
          return directoryHit(profile, query, role);
        }),
      );
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (role) params.set("role", role);
          const res = await fetch(`/api/people/directory?${params}`, {
            headers: await authHeaders(user),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok)
            throw new Error(data.error || "Could not search people.");
          setProfiles(data.profiles || []);
          setGroups(data.groups || []);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not search people.",
          );
        }
      })();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, role, example, user, viewer]);

  const chosenGroup = groups.find((group) => group.id === pickedGroup) || null;
  const chosenPeople = profiles.filter((profile) =>
    pickedPeople.includes(profile.id),
  );
  const selectedCount = chosenGroup ? 1 : pickedPeople.length;

  async function submit(mode: "draft" | "send") {
    setError("");
    const input = {
      threadId: draft?.id,
      subject,
      body,
      profileIds: pickedGroup ? [] : pickedPeople,
      groupId: pickedGroup || undefined,
    };
    if (example) {
      if (mode === "draft") {
        const thread = buildDraft(viewer, input);
        thread.recipientProfileIds = input.profileIds || [];
        thread.groupId = input.groupId || null;
        onSaved("Draft saved in the app.", thread);
        return;
      }
      const built = buildOutbound(
        viewer,
        input,
        previewProfiles(),
        previewGroups(),
      );
      if (built.ok === false) {
        setError(built.error);
        return;
      }
      onSaved("Saved in the app. Nobody was emailed or texted.", built.thread);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        mode === "draft" ? "/api/people/inbox/draft" : "/api/people/inbox/send",
        {
          method: "POST",
          headers: await authHeaders(user, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(input),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Could not save that message.");
      onSaved(
        mode === "draft"
          ? "Draft saved in the app."
          : "Saved in the app. Nobody was emailed or texted.",
        data.thread || null,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save that message.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="ib-compose"
      data-testid="inbox-compose-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit("send");
      }}
    >
      <div className="ib-compose-h">
        <div>
          <h3>
            <PenLine className="ib-ico" /> New message
          </h3>
          <p>
            One person or one group. A blast still goes through Marketing, then
            Campaigns.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          <X className="ib-ico" /> Close
        </button>
      </div>
      <div className="ib-compose-b">
        <div className="field">
          <label>To</label>
          <div className="ib-to">
            <div className="ib-to-row">
              {chosenGroup ? (
                <button
                  type="button"
                  className="ib-pchip"
                  onClick={() => setPickedGroup("")}
                >
                  <span className="mini">{initials(chosenGroup.name)}</span>
                  {chosenGroup.name}
                  <X className="ib-ico" />
                </button>
              ) : (
                chosenPeople.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className="ib-pchip"
                    onClick={() =>
                      setPickedPeople((current) =>
                        current.filter((id) => id !== profile.id),
                      )
                    }
                  >
                    <span className="mini">
                      {initials(profile.displayName)}
                    </span>
                    {profile.displayName}
                    <X className="ib-ico" />
                  </button>
                ))
              )}
              <span className="ib-count" data-testid="selected-count">
                {selectedCount} selected.
              </span>
            </div>
            <div className="ib-to-search">
              <label className="ib-search">
                <Search className="ib-ico" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search people or groups"
                  aria-label="Search people or groups"
                />
              </label>
              <select
                aria-label="Filter by role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {ROLES.map((item) => (
                  <option key={item.label} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ib-pick" data-testid="compose-directory">
              <div className="ib-mh">Groups</div>
              {groups.length === 0 ? (
                <div className="ib-none">No groups to show.</div>
              ) : (
                groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={
                      pickedGroup === group.id ? "ib-prow on" : "ib-prow"
                    }
                    onClick={() => {
                      setPickedGroup(group.id === pickedGroup ? "" : group.id);
                      setPickedPeople([]);
                    }}
                  >
                    <span
                      className={
                        pickedGroup === group.id ? "ib-check on" : "ib-check"
                      }
                    >
                      {pickedGroup === group.id ? (
                        <Check className="ib-ico" />
                      ) : null}
                    </span>
                    <span className="mini">{initials(group.name)}</span>
                    <span className="pn">{group.name}</span>
                    <span className="ib-role">Group</span>
                  </button>
                ))
              )}
              <div className="ib-mh">People</div>
              {profiles.length === 0 ? (
                <div className="ib-none">No people to show.</div>
              ) : (
                profiles.map((profile) => {
                  const on = pickedPeople.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      className={on ? "ib-prow on" : "ib-prow"}
                      onClick={() => {
                        setPickedGroup("");
                        setPickedPeople((current) =>
                          on
                            ? current.filter((id) => id !== profile.id)
                            : [...current, profile.id],
                        );
                      }}
                    >
                      <span className={on ? "ib-check on" : "ib-check"}>
                        {on ? <Check className="ib-ico" /> : null}
                      </span>
                      <span className="mini">
                        {initials(profile.displayName)}
                      </span>
                      <span className="pn">{profile.displayName}</span>
                      <span className="ib-role">
                        {ROLE_LABEL[profile.role]}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <label className="field ib-subj">
          Subject
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
          />
        </label>
        <label className="field">
          Message
          <textarea
            className="ib-body-ta"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the message"
          />
        </label>
        {error ? <p className="ib-alert">{error}</p> : null}
      </div>
      <div className="ib-compose-f">
        <p className="ib-note">
          <Lock className="ib-ico" /> {IN_APP_NOTE}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-md"
          disabled={saving}
          onClick={() => void submit("draft")}
        >
          <FileText className="ib-ico" /> Save as draft
        </button>
        <button type="submit" className="btn btn-teal btn-md" disabled={saving}>
          <Send className="ib-ico" /> Save in app
        </button>
      </div>
    </form>
  );
}

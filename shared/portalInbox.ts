/**
 * One client-portal inbox over order/listing conversations and direct messages.
 * Folder, star, and unread are per person. Nothing here sends email or texts.
 */

import type { UnifiedThread } from "./communications/threads.ts";
import type { DeskActor, InboxThread } from "./peopleProfiles.ts";

export const PORTAL_FOLDERS = [
  "inbox",
  "starred",
  "drafts",
  "archived",
  "trash",
] as const;
export type PortalFolder = (typeof PORTAL_FOLDERS)[number];

export type PortalFlagFolder = "inbox" | "archived" | "trash";

export interface PortalThreadFlag {
  threadKey: string;
  folder: PortalFlagFolder | null;
  starred: boolean;
  /** Messages at or before this time are read, unless forceUnread is set. */
  readAt: string | null;
  forceUnread: boolean;
  updatedAt: string;
}

export interface FlagPatch {
  threadKey: string;
  folder?: PortalFlagFolder | null;
  starred?: boolean;
  readAt?: string | null;
  forceUnread?: boolean;
}

export interface PortalInboxItem {
  key: string;
  source: "conversation" | "direct";
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  unread: boolean;
  starred: boolean;
  folder: Exclude<PortalFolder, "starred">;
  messageCount: number;
  orderNumber: string;
  /** True when the thread is an order request or stores an order id. */
  orderLinked: boolean;
  orderRequest: boolean;
  listingId: string;
  listingLabel: string;
  groupName: string;
  searchable: string;
  conversation: UnifiedThread | null;
  direct: InboxThread | null;
}

const THREAD_KEY = /^(comm|direct):[A-Za-z0-9_.:-]{1,180}$/;
const CHICAGO = "America/Chicago";

export function threadKey(
  source: "conversation" | "direct",
  id: string,
): string {
  return `${source === "conversation" ? "comm" : "direct"}:${id}`;
}

export function emptyFlag(key: string): PortalThreadFlag {
  return {
    threadKey: key,
    folder: null,
    starred: false,
    readAt: null,
    forceUnread: false,
    updatedAt: "",
  };
}

export function parseFlagPatch(raw: unknown): FlagPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const key = typeof row.threadKey === "string" ? row.threadKey.trim() : "";
  if (!THREAD_KEY.test(key)) return null;
  const patch: FlagPatch = { threadKey: key };
  if ("folder" in row) {
    if (row.folder === null) patch.folder = null;
    else if (
      row.folder === "inbox" ||
      row.folder === "archived" ||
      row.folder === "trash"
    )
      patch.folder = row.folder;
    else return null;
  }
  if ("starred" in row) {
    if (typeof row.starred !== "boolean") return null;
    patch.starred = row.starred;
  }
  if ("forceUnread" in row) {
    if (typeof row.forceUnread !== "boolean") return null;
    patch.forceUnread = row.forceUnread;
  }
  if ("readAt" in row) {
    if (row.readAt === null) patch.readAt = null;
    else if (
      typeof row.readAt === "string" &&
      row.readAt.length > 0 &&
      row.readAt.length <= 40
    )
      patch.readAt = row.readAt;
    else return null;
  }
  if (
    patch.folder === undefined &&
    patch.starred === undefined &&
    patch.forceUnread === undefined &&
    patch.readAt === undefined
  ) {
    return null;
  }
  return patch;
}

export function mergeFlag(
  current: PortalThreadFlag | undefined,
  patch: FlagPatch,
  now: string,
): PortalThreadFlag {
  const base =
    current && current.threadKey === patch.threadKey
      ? current
      : emptyFlag(patch.threadKey);
  return {
    threadKey: patch.threadKey,
    folder: patch.folder !== undefined ? patch.folder : base.folder,
    starred: patch.starred !== undefined ? patch.starred : base.starred,
    readAt: patch.readAt !== undefined ? patch.readAt : base.readAt,
    forceUnread:
      patch.forceUnread !== undefined ? patch.forceUnread : base.forceUnread,
    updatedAt: now,
  };
}

export function flagDocId(threadKeyValue: string): string {
  return threadKeyValue.replace(/\//g, "_");
}

/** Unread for this person only. A stored read time does not change anyone else's copy. */
export function isUnread(
  latestAt: string,
  incoming: boolean,
  flag: PortalThreadFlag | undefined,
): boolean {
  if (flag?.forceUnread) return true;
  if (!incoming || !latestAt) return false;
  if (flag?.readAt && latestAt <= flag.readAt) return false;
  return true;
}

export function inboxTimeLabel(
  iso: string,
  now = new Date(),
  timeZone = CHICAGO,
): string {
  const then = new Date(iso);
  if (!iso || Number.isNaN(then.getTime())) return "";
  const dayKey = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  const day = dayKey(then);
  const today = dayKey(now);
  if (day === today) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(then);
  }
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(then);
}

export function inboxDayLabel(
  iso: string,
  now = new Date(),
  timeZone = CHICAGO,
): string {
  const then = new Date(iso);
  if (!iso || Number.isNaN(then.getTime())) return "";
  const dayKey = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  const day = dayKey(then);
  const today = dayKey(now);
  if (day === today) return "Today";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day === dayKey(yesterday)) return "Yesterday";
  return inboxTimeLabel(iso, now, timeZone);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
  if (letters) return letters;
  const compact = name.trim();
  return (compact[0] || "I").toUpperCase();
}

function directFolder(
  thread: InboxThread,
  uid: string,
  flag: PortalThreadFlag | undefined,
): Exclude<PortalFolder, "starred"> | "purged" {
  const stored = thread.folderByUid[uid];
  if (stored === "purged") return "purged";
  const flagged = flag?.folder;
  if (thread.status === "draft") {
    if (flagged === "trash" || stored === "trash") return "trash";
    if (flagged === "archived" || stored === "archived") return "archived";
    return "drafts";
  }
  if (flagged === "inbox" || flagged === "archived" || flagged === "trash") return flagged;
  if (stored === "archived" || stored === "trash") return stored;
  return "inbox";
}

function conversationIncoming(
  thread: UnifiedThread,
  viewer: DeskActor,
): boolean {
  const latest = thread.messages[thread.messages.length - 1];
  if (!latest || latest.delivery === "read") return false;
  if (latest.senderId && latest.senderId === viewer.uid) return false;
  if (viewer.kind === "staff") {
    return latest.senderType === "client" || latest.senderType === "lead";
  }
  return latest.senderType !== "client" && latest.senderType !== "lead";
}

export function conversationItem(
  thread: UnifiedThread,
  viewer: DeskActor,
  flag: PortalThreadFlag | undefined,
): PortalInboxItem {
  const key = threadKey("conversation", thread.id);
  const latest = thread.messages[thread.messages.length - 1];
  const stored = flag?.folder;
  const folder: Exclude<PortalFolder, "starred"> =
    stored === "archived" || stored === "trash" ? stored : "inbox";
  const orderNumber = thread.orderNumber || "";
  const listingId = thread.listingId || "";
  const listingLabel = listingId ? thread.listingLabel || "" : "";
  const orderRequest = thread.source === "orderRequest";
  const orderLinked = Boolean(orderNumber || orderRequest || thread.orderId);
  const preview = thread.preview || latest?.body || thread.subtitle || "";
  return {
    key,
    source: "conversation",
    id: thread.id,
    title: thread.title || "Conversation",
    preview,
    updatedAt: thread.updatedAt || latest?.createdAt || "",
    unread: isUnread(
      latest?.createdAt || thread.updatedAt,
      conversationIncoming(thread, viewer),
      flag,
    ),
    starred: Boolean(flag?.starred),
    folder,
    messageCount: thread.messages.length,
    orderNumber,
    orderLinked,
    orderRequest,
    listingId,
    listingLabel,
    groupName: "",
    searchable: [
      thread.title,
      thread.subtitle,
      preview,
      thread.email,
      orderNumber,
      listingLabel,
      thread.orderId,
    ].join(" "),
    conversation: thread,
    direct: null,
  };
}

export function directItem(
  thread: InboxThread,
  viewer: DeskActor,
  flag: PortalThreadFlag | undefined,
): PortalInboxItem | null {
  const folder = directFolder(thread, viewer.uid, flag);
  if (folder === "purged") return null;
  const member =
    thread.participantUids.includes(viewer.uid) ||
    thread.ownerUid === viewer.uid;
  if (!member) return null;
  if (thread.status === "draft" && thread.ownerUid !== viewer.uid) return null;
  const key = threadKey("direct", thread.id);
  const latest = thread.messages[thread.messages.length - 1];
  const title =
    thread.groupName || thread.senderName || thread.subject || "Message";
  const preview =
    thread.subject && thread.subject !== title
      ? thread.subject
      : latest?.body || thread.body || "";
  const incoming =
    thread.status === "sent" &&
    Boolean(latest) &&
    latest.senderUid !== viewer.uid;
  return {
    key,
    source: "direct",
    id: thread.id,
    title,
    preview,
    updatedAt: latest?.at || thread.updatedAt,
    unread:
      thread.status === "draft"
        ? false
        : isUnread(latest?.at || thread.updatedAt, incoming, flag),
    starred: Boolean(flag?.starred),
    folder,
    messageCount: thread.messages.length,
    orderNumber: "",
    orderLinked: false,
    orderRequest: false,
    listingId: "",
    listingLabel: "",
    groupName: thread.groupName || "",
    searchable: [
      title,
      thread.subject,
      thread.body,
      thread.groupName,
      ...thread.messages.map((note) => `${note.senderName} ${note.body}`),
    ].join(" "),
    conversation: null,
    direct: thread,
  };
}

export function buildPortalInbox(
  conversations: UnifiedThread[],
  direct: InboxThread[],
  viewer: DeskActor,
  flags: PortalThreadFlag[],
): PortalInboxItem[] {
  const byKey = new Map(flags.map((flag) => [flag.threadKey, flag]));
  const items: PortalInboxItem[] = [];
  for (const thread of conversations) {
    if (thread.connectorNeeded || thread.audiences.includes("socials"))
      continue;
    items.push(
      conversationItem(
        thread,
        viewer,
        byKey.get(threadKey("conversation", thread.id)),
      ),
    );
  }
  const seen = new Set<string>();
  for (const thread of direct) {
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    const item = directItem(
      thread,
      viewer,
      byKey.get(threadKey("direct", thread.id)),
    );
    if (item) items.push(item);
  }
  return items.sort((left, right) =>
    left.updatedAt < right.updatedAt
      ? 1
      : left.updatedAt > right.updatedAt
        ? -1
        : 0,
  );
}

export function itemsInFolder(
  items: PortalInboxItem[],
  folder: PortalFolder,
): PortalInboxItem[] {
  if (folder === "starred")
    return items.filter((item) => item.starred && item.folder !== "trash");
  return items.filter((item) => item.folder === folder);
}

export function folderCounts(
  items: PortalInboxItem[],
): Record<PortalFolder, number> {
  return {
    inbox: itemsInFolder(items, "inbox").length,
    starred: itemsInFolder(items, "starred").length,
    drafts: itemsInFolder(items, "drafts").length,
    archived: itemsInFolder(items, "archived").length,
    trash: itemsInFolder(items, "trash").length,
  };
}

export function unreadInboxCount(items: PortalInboxItem[]): number {
  return items.filter((item) => item.folder === "inbox" && item.unread).length;
}

/** Search only the threads already loaded for this person. */
export function searchInbox(
  items: PortalInboxItem[],
  query: string,
): PortalInboxItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.searchable.toLowerCase().includes(needle) ||
      item.title.toLowerCase().includes(needle),
  );
}

export function orderChip(
  item: Pick<PortalInboxItem, "orderNumber" | "orderLinked" | "orderRequest">,
): { tone: "gold" | "plain"; label: string } | null {
  if (item.orderNumber) return { tone: "gold", label: item.orderNumber };
  if (item.orderRequest) return { tone: "gold", label: "Order request" };
  if (item.orderLinked) return { tone: "gold", label: "Order" };
  return null;
}

export function listingChip(
  item: Pick<PortalInboxItem, "listingId" | "listingLabel">,
): { id: string; label: string } | null {
  if (!item.listingId) return null;
  return {
    id: item.listingId,
    label: item.listingLabel ? `Listing · ${item.listingLabel}` : "Listing",
  };
}

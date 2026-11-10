/**
 * Staff admin unread badges.
 *
 * Counts live on two small Firestore documents (`adminUnreadCounters/channels`
 * and `adminUnreadCounters/tasks`). Each staff user stores the counter value
 * they have already seen on `staffUnread/{uid}`. One person's seen value
 * never changes another's. This module does not read Firestore and does not
 * send email or texts.
 */

import { HOLIDAY_RSVP_LEAD } from "./holidayCheckout.ts";

export const ADMIN_UNREAD_COUNTERS_COLLECTION = "adminUnreadCounters";
export const ADMIN_UNREAD_CHANNELS_DOC = "channels";
export const ADMIN_UNREAD_TASKS_DOC = "tasks";
export const STAFF_UNREAD_COLLECTION = "staffUnread";

/** Little red circles show 9+ past this. Pass 99 to format 99+ instead. */
export const UNREAD_BADGE_CAP = 9;

export const ADMIN_UNREAD_CHANNELS = ["chat", "inbox", "sms", "botroom", "orders", "events"] as const;
export const ADMIN_UNREAD_KEYS = [...ADMIN_UNREAD_CHANNELS, "tasks"] as const;

export type AdminUnreadChannel = (typeof ADMIN_UNREAD_CHANNELS)[number];
export type AdminUnreadKey = (typeof ADMIN_UNREAD_KEYS)[number];

export interface AdminUnreadCounts {
  chat: number;
  inbox: number;
  sms: number;
  botroom: number;
  orders: number;
  events: number;
  tasks: number;
}

const COMMUNICATION_KEYS = ["chat", "inbox", "sms", "botroom"] as const satisfies readonly AdminUnreadKey[];

const TAB_KEYS: Record<string, AdminUnreadKey | null> = {
  sweep: null,
  contact: "chat",
  inbox: "inbox",
  sms: "sms",
  compose: null,
  campaigns: null,
  assistants: null,
  botroom: "botroom",
};

export function emptyAdminUnreadCounts(): AdminUnreadCounts {
  return { chat: 0, inbox: 0, sms: 0, botroom: 0, orders: 0, events: 0, tasks: 0 };
}

function whole(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

/** Unread items still waiting for this staff user. */
export function unreadDelta(total: unknown, seen: unknown): number {
  return Math.max(0, whole(total) - whole(seen));
}

export function formatUnreadBadge(count: number, cap = UNREAD_BADGE_CAP): string | null {
  const rounded = whole(count);
  const limit = whole(cap);
  if (rounded <= 0 || limit <= 0) return null;
  if (rounded > limit) return `${limit}+`;
  return String(rounded);
}

export function unreadCounts(input: {
  channels?: Partial<Record<AdminUnreadChannel, unknown>> | null;
  taskTotals?: Partial<Record<string, unknown>> | null;
  seen?: Partial<Record<AdminUnreadKey, unknown>> | null;
  uid?: string | null;
}): AdminUnreadCounts {
  const channels = input.channels || {};
  const seen = input.seen || {};
  const counts = emptyAdminUnreadCounts();
  for (const key of ADMIN_UNREAD_CHANNELS) {
    counts[key] = unreadDelta(channels[key], seen[key]);
  }
  const taskTotal = input.uid ? input.taskTotals?.[input.uid] : 0;
  counts.tasks = unreadDelta(taskTotal, seen.tasks);
  return counts;
}

/** Communications menu count. Bot Room is an admin-only tab, so coordinators leave it out. */
export function communicationUnreadTotal(counts: AdminUnreadCounts, includeBotRoom: boolean): number {
  return COMMUNICATION_KEYS.reduce((sum, key) => {
    if (key === "botroom" && !includeBotRoom) return sum;
    return sum + whole(counts[key]);
  }, 0);
}

export function navUnreadCount(href: string, counts: AdminUnreadCounts, role: string): number {
  if (href === "/admin/communications") return communicationUnreadTotal(counts, role === "admin");
  if (href === "/shooter") return whole(counts.chat);
  if (href === "/admin/botroom") return role === "admin" ? whole(counts.botroom) : 0;
  if (href === "/admin/orders") return whole(counts.orders);
  if (href === "/admin/events") return whole(counts.events);
  if (href === "/admin/tasks") return role === "admin" ? whole(counts.tasks) : 0;
  return 0;
}

/**
 * Mobile menu-button total. Bot Room is already inside the Communications
 * total for admins, so it is not added again from the separate Bot Room link.
 */
export function shellUnreadTotal(counts: AdminUnreadCounts, role: string): number {
  if (role !== "admin" && role !== "coordinator") return 0;
  return communicationUnreadTotal(counts, role === "admin")
    + whole(counts.orders)
    + whole(counts.events)
    + (role === "admin" ? whole(counts.tasks) : 0);
}

export function communicationTabUnreadKey(tab: string): AdminUnreadKey | null {
  return TAB_KEYS[tab] ?? null;
}

export function orderRequestSignal(leadSource: unknown): "orders" | "events" {
  return leadSource === HOLIDAY_RSVP_LEAD ? "events" : "orders";
}

/** Which counter a logged communications row should move. Outbound mail does not. */
export function signalForCommunication(entry: {
  direction?: string;
  channel?: string;
  senderType?: string;
}): AdminUnreadChannel | null {
  if (entry.direction !== "inbound") return null;
  if (entry.senderType === "staff") return null;
  if (entry.channel === "sms") return "sms";
  if (entry.channel === "in-app" || entry.channel === "contact" || entry.channel === "email" || !entry.channel) {
    return "inbox";
  }
  return null;
}

export function newlyAssignedStaffIds(
  previous: ReadonlyArray<{ id: string; assigneeId?: string | null }>,
  next: ReadonlyArray<{ id: string; assigneeId?: string | null }>,
  actorId: string | null,
): string[] {
  const before = new Map(previous.map((task) => [task.id, task.assigneeId || null]));
  const assigned: string[] = [];
  for (const task of next) {
    const assignee = task.assigneeId || null;
    if (!assignee) continue;
    if (actorId && assignee === actorId) continue;
    if (before.get(task.id) === assignee) continue;
    assigned.push(assignee);
  }
  return assigned;
}

export function assignmentBumps(ids: readonly string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of ids) {
    if (!id) continue;
    totals[id] = (totals[id] || 0) + 1;
  }
  return totals;
}

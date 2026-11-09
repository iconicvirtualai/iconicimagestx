/**
 * Admin task board.
 * Derives checklist rows from orders, deliveries, edits, and client questions.
 * Does not email, text, or write orders, galleries, or deliveries.
 * Manual order, assignee, priority, due date, stage, and dismissals are overlays.
 */

import { adminOrderDetailHref, adminOrderNumberLabel, adminOrderQueue } from "./adminOrderList.ts";
import { calendarDateKey } from "./clientHome.ts";
import { addressText } from "./addressText.ts";
import {
  PHOTOS_MAILBOX,
  photosInboxNotice,
  type InboundClientEmail,
} from "./inboundEmail.ts";
import { buildMediaDeliveryQueue, type DeliveryGallerySource, type DeliveryListingSource } from "./mediaDelivery.ts";
import { OPS_PATH } from "./opsLifecycle.ts";
import { orderServiceLines } from "./orderPackageLines.ts";
import { readPhotoEditRequests } from "./photoEditRequest.ts";
import type { ContactThreadView } from "./contactThread.ts";

export const TASK_BOARD_PATH = "/admin/tasks";
export const TASK_BOARD_COLLECTION = "taskBoardItems";

export const TASK_STAGES = ["queued", "production", "review", "ready", "delivered"] as const;
export type TaskStage = (typeof TASK_STAGES)[number];

export const TASK_STAGE_LABEL: Record<TaskStage, string> = {
  queued: "Queued",
  production: "In production",
  review: "Review",
  ready: "Ready",
  delivered: "Delivered",
};

/** Tracker labels. The list pill and the board column use the same stage. */
export const TASK_TRACK: { stage: TaskStage; label: string }[] = [
  { stage: "queued", label: "Queued" },
  { stage: "production", label: "Production" },
  { stage: "review", label: "Review" },
  { stage: "ready", label: "Ready" },
  { stage: "delivered", label: "Delivered" },
];

export const TASK_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const TASK_FILTERS = ["all", "mine", "unassigned", "overdue"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

const STAGE_RANK: Record<TaskStage, number> = {
  queued: 0,
  production: 1,
  review: 2,
  ready: 3,
  delivered: 4,
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const CLOSED_EDIT = new Set(["done", "completed", "resolved", "closed", "cancelled", "canceled", "received_back"]);

export interface TaskAssignee {
  id: string;
  name: string;
  sample?: boolean;
}

export interface TaskActivity {
  at: string;
  text: string;
  sample?: boolean;
}

export type TaskOrigin = "schedule" | "delivery" | "production" | "edit" | "question" | "email" | "manual";

export const CONTENT_STAGES = ["idea", "script", "record", "edit", "review", "scheduled", "published"] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];
export type ContentKind = "podcast" | "promo";

export const CONTENT_STAGE_LABEL: Record<ContentStage, string> = {
  idea: "Idea",
  script: "Script",
  record: "Record",
  edit: "Edit",
  review: "Review",
  scheduled: "Scheduled",
  published: "Published",
};

export function isContentStage(value: unknown): value is ContentStage {
  return typeof value === "string" && (CONTENT_STAGES as readonly string[]).includes(value);
}

export function isContentKind(value: unknown): value is ContentKind {
  return value === "podcast" || value === "promo";
}

export function boardStageForContent(stage: ContentStage): TaskStage {
  if (stage === "idea" || stage === "script") return "queued";
  if (stage === "record" || stage === "edit") return "production";
  if (stage === "review") return "review";
  if (stage === "scheduled") return "ready";
  return "delivered";
}

/** Keep a finer content stage when it already sits in the board column. */
export function contentStageForBoard(stage: TaskStage, current: ContentStage | null | undefined): ContentStage {
  if (current && boardStageForContent(current) === stage) return current;
  if (stage === "queued") return "idea";
  if (stage === "production") return "edit";
  if (stage === "review") return "review";
  if (stage === "ready") return "scheduled";
  return "published";
}

export function contentSectionHref(section: "podcast" | "promo" | "calendar", itemId?: string): string {
  const params = new URLSearchParams({ section });
  if (itemId) params.set("item", itemId);
  return `/admin/content?${params.toString()}`;
}

export interface TaskBoardTask {
  id: string;
  pipelineKey: string;
  origin: TaskOrigin;
  service: string;
  stage: TaskStage;
  stageLocked: boolean;
  resumeStage: TaskStage | null;
  status: "open" | "done";
  title: string;
  sourceLine: string;
  primaryHref: string | null;
  primaryHrefLabel: string | null;
  orderHref: string | null;
  orderLabel: string | null;
  galleryHref: string | null;
  galleryLabel: string | null;
  deliveryHref: string | null;
  deliveryLabel: string | null;
  clientRequest: string | null;
  clientRequestFrom: string | null;
  clientRequestAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: TaskPriority;
  dueOn: string | null;
  /** Saved manual queue position. Null until someone reorders. */
  sort: number | null;
  dismissed: boolean;
  fingerprint: string;
  sample: boolean;
  manual: boolean;
  activity: TaskActivity[];
  /** Podcast or Iconic promo. Listing videos leave this empty. */
  contentKind?: ContentKind | null;
  contentStage?: ContentStage | null;
  /** Calendar publish day. The checklist due date is updated with it. */
  publishOn?: string | null;
  insightId?: string | null;
}

export interface TaskBoardOverlay {
  sourceKey: string;
  pipelineKey: string;
  manual: boolean;
  title: string;
  sourceLine: string;
  origin: TaskOrigin;
  service: string;
  stage: TaskStage;
  stageLocked: boolean;
  resumeStage: TaskStage | null;
  status: "open" | "done";
  primaryHref: string | null;
  primaryHrefLabel: string | null;
  orderHref: string | null;
  orderLabel: string | null;
  galleryHref: string | null;
  galleryLabel: string | null;
  deliveryHref: string | null;
  deliveryLabel: string | null;
  clientRequest: string | null;
  clientRequestFrom: string | null;
  clientRequestAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeTouched: boolean;
  priority: TaskPriority;
  dueOn: string | null;
  dueTouched: boolean;
  sort: number | null;
  dismissed: boolean;
  fingerprint: string;
  sample: boolean;
  activity: TaskActivity[];
  contentKind?: ContentKind | null;
  contentStage?: ContentStage | null;
  publishOn?: string | null;
  publishTouched?: boolean;
  insightId?: string | null;
}

export interface TaskBoardInput {
  orderRequests?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  galleries?: Array<Record<string, unknown>>;
  listings?: Array<Record<string, unknown>>;
  editRequests?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
  contactThreads?: ContactThreadView[];
  emails?: InboundClientEmail[];
  emailConnected?: boolean;
  staff?: TaskAssignee[];
  overlays?: TaskBoardOverlay[];
}

export interface TaskBoardModel {
  tasks: TaskBoardTask[];
  emailNotice: string;
  emailConnected: boolean;
}

export interface TaskBoardStat {
  /** Null when this number cannot be known yet. */
  value: number | null;
  label: string;
}

export interface TaskBoardStats {
  open: TaskBoardStat;
  production: TaskBoardStat;
  ready: TaskBoardStat;
  overdue: TaskBoardStat;
  active: number;
  completed: number;
}

export interface TaskFilterCounts {
  all: number;
  mine: number;
  unassigned: number;
  overdue: number;
}

export function isTaskStage(value: unknown): value is TaskStage {
  return typeof value === "string" && (TASK_STAGES as readonly string[]).includes(value);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isTaskFilter(value: unknown): value is TaskFilter {
  return typeof value === "string" && (TASK_FILTERS as readonly string[]).includes(value);
}

export function chicagoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function columnStage(task: Pick<TaskBoardTask, "status" | "stage">): TaskStage {
  return task.status === "done" ? "delivered" : task.stage;
}

export function isOverdue(task: Pick<TaskBoardTask, "status" | "dueOn">, today: string): boolean {
  return task.status !== "done" && Boolean(task.dueOn) && (task.dueOn as string) < today;
}

export function dueLabel(dueOn: string | null, status: "open" | "done", today: string): string {
  if (status === "done") return "Done";
  if (!dueOn) return "—";
  if (dueOn < today) return "Overdue";
  if (dueOn === today) return "Today";
  if (dueOn === addCalendarDays(today, 1)) return "Tomorrow";
  if (dueOn <= addCalendarDays(today, 6)) {
    const [year, month, day] = dueOn.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    });
  }
  const [year, month, day] = dueOn.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function shortName(name: string | null | undefined): string {
  const clean = (name || "").trim();
  if (!clean) return "";
  return clean.split(/\s+/)[0];
}

export function taskBoardDocId(sourceKey: string): string {
  const clean = sourceKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 720);
  return clean || "task";
}

/** Removal writes the task list only. Orders, galleries, and deliveries stay. */
export function taskRemovalWrite(task: TaskBoardTask): {
  collection: typeof TASK_BOARD_COLLECTION;
  id: string;
  deleteDoc: boolean;
} {
  return {
    collection: TASK_BOARD_COLLECTION,
    id: taskBoardDocId(task.id),
    deleteDoc: task.manual,
  };
}

export function taskBoardStats(tasks: TaskBoardTask[], today: string): TaskBoardStats {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const production = openTasks.filter((task) => columnStage(task) === "production");
  const ready = openTasks.filter((task) => columnStage(task) === "ready");
  const dated = tasks.some((task) => Boolean(task.dueOn));
  const overdue = openTasks.filter((task) => isOverdue(task, today));
  const names = unique(production.map((task) => shortName(task.assigneeName)).filter(Boolean));
  return {
    open: { value: openTasks.length, label: "On this board" },
    production: {
      value: production.length,
      label: names.length ? names.join(" + ") : "No assignee yet",
    },
    ready: {
      value: ready.length,
      label: ready.length ? "In the Ready stage" : "Nothing ready",
    },
    overdue: dated
      ? { value: overdue.length, label: overdue.length ? "Past the due date" : "None past due" }
      : { value: null, label: "No due dates yet" },
    active: openTasks.length,
    completed: tasks.length - openTasks.length,
  };
}

export function taskFilterCounts(tasks: TaskBoardTask[], meId: string | null, today: string): TaskFilterCounts {
  const open = tasks.filter((task) => task.status !== "done");
  return {
    all: tasks.length,
    mine: open.filter((task) => Boolean(meId) && task.assigneeId === meId).length,
    unassigned: open.filter((task) => !task.assigneeId).length,
    overdue: open.filter((task) => isOverdue(task, today)).length,
  };
}

export function manualOrderSaved(tasks: TaskBoardTask[]): boolean {
  return tasks.length > 0 && tasks.every((task) => task.sort != null);
}

export function displayTasks(
  tasks: TaskBoardTask[],
  options: {
    filter: TaskFilter;
    meId: string | null;
    today: string;
    query: string;
    prioritySort: boolean;
  },
): TaskBoardTask[] {
  const query = options.query.trim().toLowerCase();
  const visible = tasks.filter((task) => {
    if (!matchesFilter(task, options.filter, options.meId, options.today)) return false;
    if (!query) return true;
    const blob = [
      task.title,
      task.sourceLine,
      task.assigneeName,
      task.orderLabel,
      task.clientRequest,
      task.service,
    ].join(" ").toLowerCase();
    return blob.includes(query);
  });
  const copy = [...visible];
  if (options.prioritySort) copy.sort(comparePriority);
  else copy.sort(compareManual);
  return copy;
}

export function buildTaskBoard(input: TaskBoardInput): TaskBoardModel {
  const staff = input.staff || [];
  const emails = input.emails || [];
  const candidates = deriveCandidates(input, staff);
  const overlays = input.overlays || [];
  const tasks = mergeCandidates(candidates, overlays);
  return {
    tasks,
    emailConnected: input.emailConnected === true,
    emailNotice: photosInboxNotice(input.emailConnected === true),
  };
}

export function taskToOverlay(task: TaskBoardTask): TaskBoardOverlay {
  return {
    sourceKey: task.id,
    pipelineKey: task.pipelineKey,
    manual: task.manual,
    title: task.title,
    sourceLine: task.sourceLine,
    origin: task.origin,
    service: task.service,
    stage: task.stage,
    stageLocked: task.stageLocked,
    resumeStage: task.resumeStage,
    status: task.status,
    primaryHref: task.primaryHref,
    primaryHrefLabel: task.primaryHrefLabel,
    orderHref: task.orderHref,
    orderLabel: task.orderLabel,
    galleryHref: task.galleryHref,
    galleryLabel: task.galleryLabel,
    deliveryHref: task.deliveryHref,
    deliveryLabel: task.deliveryLabel,
    clientRequest: task.clientRequest,
    clientRequestFrom: task.clientRequestFrom,
    clientRequestAt: task.clientRequestAt,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    assigneeTouched: true,
    priority: task.priority,
    dueOn: task.dueOn,
    dueTouched: true,
    sort: task.sort,
    dismissed: task.dismissed,
    fingerprint: task.fingerprint,
    sample: task.sample,
    activity: task.activity.slice(-20),
    contentKind: task.contentKind || null,
    contentStage: task.contentStage || null,
    publishOn: task.publishOn || null,
    publishTouched: true,
    insightId: task.insightId || null,
  };
}

export function readTaskBoardOverlay(id: string, data: unknown): TaskBoardOverlay | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const sourceKey = text(row.sourceKey) || text(id);
  const pipelineKey = text(row.pipelineKey) || sourceKey;
  if (!sourceKey || !pipelineKey) return null;
  const manual = row.manual === true;
  const title = text(row.title);
  if (manual && !title) return null;
  const stage = isTaskStage(row.stage) ? row.stage : "queued";
  const status = row.status === "done" ? "done" : "open";
  return {
    sourceKey,
    pipelineKey,
    manual,
    title,
    sourceLine: text(row.sourceLine),
    origin: isOrigin(row.origin) ? row.origin : (manual ? "manual" : "schedule"),
    service: text(row.service) || (manual ? "manual" : "schedule"),
    stage,
    stageLocked: row.stageLocked === true,
    resumeStage: isTaskStage(row.resumeStage) ? row.resumeStage : null,
    status,
    primaryHref: nullableText(row.primaryHref),
    primaryHrefLabel: nullableText(row.primaryHrefLabel),
    orderHref: nullableText(row.orderHref),
    orderLabel: nullableText(row.orderLabel),
    galleryHref: nullableText(row.galleryHref),
    galleryLabel: nullableText(row.galleryLabel),
    deliveryHref: nullableText(row.deliveryHref),
    deliveryLabel: nullableText(row.deliveryLabel),
    clientRequest: nullableText(row.clientRequest),
    clientRequestFrom: nullableText(row.clientRequestFrom),
    clientRequestAt: nullableText(row.clientRequestAt),
    assigneeId: nullableText(row.assigneeId),
    assigneeName: nullableText(row.assigneeName),
    assigneeTouched: row.assigneeTouched === true || "assigneeId" in row,
    priority: isTaskPriority(row.priority) ? row.priority : "normal",
    dueOn: dateOnly(row.dueOn),
    dueTouched: row.dueTouched === true || "dueOn" in row,
    sort: typeof row.sort === "number" && Number.isFinite(row.sort) ? row.sort : null,
    dismissed: row.dismissed === true,
    fingerprint: text(row.fingerprint),
    sample: row.sample === true,
    activity: readActivity(row.activity),
    contentKind: isContentKind(row.contentKind) ? row.contentKind : null,
    contentStage: isContentStage(row.contentStage) ? row.contentStage : null,
    publishOn: dateOnly(row.publishOn),
    publishTouched: row.publishTouched === true || "publishOn" in row,
    insightId: nullableText(row.insightId),
  };
}

export function readTaskAssignees(rows: Array<Record<string, unknown>>): TaskAssignee[] {
  const people: TaskAssignee[] = [];
  for (const row of rows) {
    if (row.isActive === false) continue;
    if (row.qaOnly === true || row.playtest === true) continue;
    const id = text(row.id);
    const name = text(row.name) || [text(row.firstName), text(row.lastName)].filter(Boolean).join(" ");
    if (!id || !name) continue;
    people.push({ id, name, sample: row.sample === true });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

export function withStage(tasks: TaskBoardTask[], id: string, stage: TaskStage, at: string): TaskBoardTask[] {
  return tasks.map((task) => {
    if (task.id !== id || !isTaskStage(stage)) return task;
    const done = stage === "delivered";
    return {
      ...task,
      stage,
      contentStage: task.contentKind ? contentStageForBoard(stage, task.contentStage) : task.contentStage,
      stageLocked: true,
      resumeStage: done ? (task.stage === "delivered" ? task.resumeStage : task.stage) : stage,
      status: done ? "done" : "open",
      activity: appendActivity(task.activity, at, `Moved to ${TASK_STAGE_LABEL[stage]}`),
    };
  });
}

export function withToggled(tasks: TaskBoardTask[], id: string, at: string): TaskBoardTask[] {
  return tasks.map((task) => {
    if (task.id !== id) return task;
    if (task.status === "done") {
      const stage = task.resumeStage && task.resumeStage !== "delivered" ? task.resumeStage : "queued";
      return {
        ...task,
        status: "open",
        stage,
        contentStage: task.contentKind ? contentStageForBoard(stage, task.contentStage === "published" ? null : task.contentStage) : task.contentStage,
        stageLocked: true,
        activity: appendActivity(task.activity, at, "Marked open"),
      };
    }
    return {
      ...task,
      status: "done",
      stage: "delivered",
      contentStage: task.contentKind ? "published" : task.contentStage,
      stageLocked: true,
      resumeStage: task.stage === "delivered" ? task.resumeStage : task.stage,
      activity: appendActivity(task.activity, at, "Marked complete"),
    };
  });
}

export function withAssignee(tasks: TaskBoardTask[], id: string, assignee: TaskAssignee | null, at: string): TaskBoardTask[] {
  return tasks.map((task) => {
    if (task.id !== id) return task;
    return {
      ...task,
      assigneeId: assignee?.id || null,
      assigneeName: assignee?.name || null,
      activity: appendActivity(task.activity, at, assignee ? `Assigned to ${assignee.name}` : "Assignee cleared"),
    };
  });
}

export function withPriority(tasks: TaskBoardTask[], id: string, priority: TaskPriority, at: string): TaskBoardTask[] {
  return tasks.map((task) => {
    if (task.id !== id || !isTaskPriority(priority)) return task;
    return {
      ...task,
      priority,
      activity: appendActivity(task.activity, at, `Priority set to ${TASK_PRIORITY_LABEL[priority]}`),
    };
  });
}

export function withDue(tasks: TaskBoardTask[], id: string, dueOn: string | null, at: string): TaskBoardTask[] {
  const nextDue = dueOn && /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? dueOn : null;
  return tasks.map((task) => {
    if (task.id !== id) return task;
    return {
      ...task,
      dueOn: nextDue,
      activity: appendActivity(task.activity, at, nextDue ? `Due date set to ${nextDue}` : "Due date cleared"),
    };
  });
}

export function withContentStage(tasks: TaskBoardTask[], id: string, contentStage: ContentStage, at: string): TaskBoardTask[] {
  if (!isContentStage(contentStage)) return tasks;
  const stage = boardStageForContent(contentStage);
  return withStage(tasks.map((task) => (task.id === id ? { ...task, contentStage } : task)), id, stage, at);
}

/** Sets the calendar day and the checklist due date together. */
export function withPublishOn(tasks: TaskBoardTask[], id: string, publishOn: string | null, at: string): TaskBoardTask[] {
  const next = publishOn && /^\d{4}-\d{2}-\d{2}$/.test(publishOn) ? publishOn : null;
  return tasks.map((task) => {
    if (task.id !== id) return task;
    return {
      ...task,
      publishOn: next,
      dueOn: next,
      activity: appendActivity(task.activity, at, next ? `Publish date set to ${next}` : "Publish date cleared"),
    };
  });
}

export function createContentItem(input: {
  id: string;
  kind: ContentKind;
  title: string;
  contentStage: ContentStage;
  publishOn: string | null;
  assignee: TaskAssignee | null;
  sample: boolean;
  insightId?: string | null;
  at: string;
}): { ok: true; task: TaskBoardTask } | { ok: false; error: string } {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Add a title." };
  if (!isContentKind(input.kind) || !isContentStage(input.contentStage)) return { ok: false, error: "That content type is not valid." };
  const id = text(input.id);
  if (!id) return { ok: false, error: "Could not save that item." };
  const stage = boardStageForContent(input.contentStage);
  const publishOn = input.publishOn && /^\d{4}-\d{2}-\d{2}$/.test(input.publishOn) ? input.publishOn : null;
  const section = input.kind === "podcast" ? "podcast" : "promo";
  return {
    ok: true,
    task: {
      id,
      pipelineKey: id,
      origin: "manual",
      service: input.kind,
      contentKind: input.kind,
      contentStage: input.contentStage,
      stage,
      stageLocked: true,
      resumeStage: stage,
      status: input.contentStage === "published" ? "done" : "open",
      title,
      sourceLine: input.kind === "podcast" ? "Podcast · Content plan" : "Marketing · Iconic promo",
      primaryHref: contentSectionHref(section, id),
      primaryHrefLabel: input.kind === "podcast" ? "Open podcast" : "Open promo",
      orderHref: null,
      orderLabel: null,
      galleryHref: null,
      galleryLabel: null,
      deliveryHref: null,
      deliveryLabel: null,
      clientRequest: null,
      clientRequestFrom: null,
      clientRequestAt: null,
      assigneeId: input.assignee?.id || null,
      assigneeName: input.assignee?.name || null,
      priority: "normal",
      dueOn: publishOn,
      publishOn,
      insightId: input.insightId || null,
      sort: null,
      dismissed: false,
      fingerprint: `${input.kind}|${id}|${title}`,
      sample: input.sample,
      manual: true,
      activity: appendActivity([], input.at, "Added to the content plan"),
    },
  };
}

export function withoutTask(tasks: TaskBoardTask[], id: string): { tasks: TaskBoardTask[]; removed: TaskBoardTask | null } {
  const removed = tasks.find((task) => task.id === id) || null;
  return {
    tasks: tasks.filter((task) => task.id !== id),
    removed: removed ? { ...removed, dismissed: true } : null,
  };
}

/** Changes queue position only. Priority sort is a view and does not call this. */
export function reorderTasks(tasks: TaskBoardTask[], activeId: string, overId: string): TaskBoardTask[] {
  if (!activeId || activeId === overId) return tasks;
  const ordered = [...tasks].sort(compareManual);
  const from = ordered.findIndex((task) => task.id === activeId);
  const to = ordered.findIndex((task) => task.id === overId);
  if (from < 0 || to < 0) return tasks;
  const next = [...ordered];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  const sortById = new Map(next.map((task, index) => [task.id, (index + 1) * 10]));
  return tasks.map((task) => ({ ...task, sort: sortById.get(task.id) ?? task.sort }));
}

export function createManualTask(input: {
  id: string;
  title: string;
  stage: TaskStage;
  priority: TaskPriority;
  dueOn: string | null;
  assignee: TaskAssignee | null;
  sample: boolean;
  sort: number | null;
  at: string;
}): { ok: true; task: TaskBoardTask } | { ok: false; error: string } {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Add a task title." };
  if (title.length > 160) return { ok: false, error: "Keep the title under 160 characters." };
  const id = text(input.id);
  if (!id) return { ok: false, error: "Could not save that task." };
  const stage = isTaskStage(input.stage) ? input.stage : "queued";
  const priority = isTaskPriority(input.priority) ? input.priority : "normal";
  const dueOn = input.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(input.dueOn) ? input.dueOn : null;
  return {
    ok: true,
    task: {
      id,
      pipelineKey: id,
      origin: "manual",
      service: "manual",
      stage,
      stageLocked: true,
      resumeStage: stage,
      status: stage === "delivered" ? "done" : "open",
      title,
      sourceLine: "Manual · Added on this board",
      primaryHref: null,
      primaryHrefLabel: null,
      orderHref: null,
      orderLabel: null,
      galleryHref: null,
      galleryLabel: null,
      deliveryHref: null,
      deliveryLabel: null,
      clientRequest: null,
      clientRequestFrom: null,
      clientRequestAt: null,
      assigneeId: input.assignee?.id || null,
      assigneeName: input.assignee?.name || null,
      priority,
      dueOn,
      sort: input.sort,
      dismissed: false,
      fingerprint: `manual|${id}|${title}`,
      sample: input.sample,
      manual: true,
      activity: appendActivity([], input.at, "Added to the board"),
    },
  };
}

export function sampleStaff(): TaskAssignee[] {
  return [
    { id: "sample-cadi", name: "Cadi Torres", sample: true },
    { id: "sample-daniel", name: "Daniel Adaclog", sample: true },
    { id: "sample-mike", name: "Mike Luna", sample: true },
  ];
}

/** Example rows for layout review. Every task is marked sample. */
export function sampleTaskBoard(today: string): TaskBoardModel & { staff: TaskAssignee[] } {
  const staff = sampleStaff();
  const mike = staff.find((person) => person.id === "sample-mike") || null;
  const daniel = staff.find((person) => person.id === "sample-daniel") || null;
  const cadi = staff.find((person) => person.id === "sample-cadi") || null;
  const requestAt = `${today}T15:12:00.000Z`;
  const photoEdit = {
    id: "sampleed126",
    listingId: "sample-listing-126",
    photoId: "opening-photo",
    photoName: "Opening photo",
    note: "Please replace the opening photo with the brighter kitchen image.",
    status: "requested",
    timeline: [{ status: "requested", at: requestAt, actor: "client", actorId: "sampleclient" }],
    replacement: null,
    clientId: "sampleclient",
    createdAt: requestAt,
    updatedAt: requestAt,
  };
  const built = buildTaskBoard({
    staff,
    emailConnected: false,
    emails: [],
    orderRequests: [
      orderRow("sample-order-123", 123, "unscheduled"),
      orderRow("sample-order-127", 127, "scheduled", "Listing video reel"),
      orderRow("sample-order-128", 128, "scheduled"),
      orderRow("sample-order-129", 129, "in_progress", "Podcast episode"),
      orderRow("sample-order-130", 130, "scheduled"),
      orderRow("sample-order-126", 126, "scheduled"),
    ],
    galleries: [{
      id: "sample-gallery-128",
      status: "ready_for_review",
      listingId: "sample-listing-128",
      orderId: "sample-order-128",
      clientName: "Sample Client",
      addressLabel: "200 Sample Avenue, Conroe, TX",
      mediaCount: 24,
      sample: true,
    }],
    listings: [
      {
        id: "sample-listing-126",
        orderRequestId: "sample-order-126",
        orderNumber: 126,
        sample: true,
        photoEditRequests: [photoEdit],
        address: "126 Sample Street, Conroe, TX",
      },
      { id: "sample-listing-128", address: "200 Sample Avenue, Conroe, TX", sample: true },
    ],
    messages: [{
      id: "sample-message-130",
      senderType: "client",
      isRead: false,
      channel: "sms",
      content: "Confirm usage rights for the photos.",
      orderId: "sample-order-130",
      senderName: "Sample Client",
      createdAt: requestAt,
      sample: true,
    }],
  });
  const patches = new Map<string, Partial<TaskBoardOverlay>>([
    ["order:sample-order-123:schedule", { sort: 10, priority: "high", dueOn: today, dueTouched: true }],
    ["order:sample-order-128:deliver", { sort: 20, priority: "high", dueOn: today, dueTouched: true, assigneeId: cadi?.id || null, assigneeName: cadi?.name || null, assigneeTouched: true }],
    ["photo:sampleed126", { sort: 30, priority: "urgent", dueOn: addCalendarDays(today, -1), dueTouched: true, assigneeId: mike?.id || null, assigneeName: mike?.name || null, assigneeTouched: true, activity: sampleActivity(requestAt) }],
    ["message:sample-message-130", { sort: 40, priority: "normal", dueOn: today, dueTouched: true, assigneeId: cadi?.id || null, assigneeName: cadi?.name || null, assigneeTouched: true }],
    ["order:sample-order-127:video", { sort: 50, priority: "high", dueOn: addCalendarDays(today, 1), dueTouched: true }],
    ["order:sample-order-129:podcast", { sort: 60, priority: "normal", dueOn: addCalendarDays(today, 2), dueTouched: true, publishOn: addCalendarDays(today, 2), publishTouched: true }],
  ]);
  const overlaid = built.tasks.map((task) => applyPatch(task, patches.get(task.pipelineKey)));
  const manual = createManualTask({
    id: "manual:sample-agenda",
    title: "Prepare weekly team agenda",
    stage: "queued",
    priority: "low",
    dueOn: addCalendarDays(today, wednesdayOffset(today)),
    assignee: null,
    sample: true,
    sort: 70,
    at: requestAt,
  });
  const done = createManualTask({
    id: "manual:sample-approve-122",
    title: "Approve gallery · order #122",
    stage: "delivered",
    priority: "normal",
    dueOn: addCalendarDays(today, -2),
    assignee: cadi,
    sample: true,
    sort: 80,
    at: requestAt,
  });
  const tasks = [
    ...overlaid,
    manual.ok ? { ...manual.task, sourceLine: "Manual · Added on this board" } : null,
    done.ok ? { ...done.task, sourceLine: "System · Approval recorded", status: "done" as const, stage: "delivered" as const } : null,
  ].filter((task): task is TaskBoardTask => Boolean(task));
  const promo = createContentItem({
    id: "content:sample-promo",
    kind: "promo",
    title: "Iconic promo · Market week",
    contentStage: "scheduled",
    publishOn: addCalendarDays(today, 5),
    assignee: cadi,
    sample: true,
    at: requestAt,
  });
  if (promo.ok) tasks.push({ ...promo.task, sort: 90 });
  tasks.sort(compareManual);
  return {
    tasks,
    staff,
    emailConnected: false,
    emailNotice: built.emailNotice,
  };
}

function sampleActivity(at: string): TaskActivity[] {
  return [
    { at, text: "Request added from the sample edit", sample: true },
    { at, text: "Assigned to Mike Luna", sample: true },
    { at, text: "Moved to Review", sample: true },
  ];
}

function applyPatch(task: TaskBoardTask, patch: Partial<TaskBoardOverlay> | undefined): TaskBoardTask {
  if (!patch) return task;
  return {
    ...task,
    sort: patch.sort ?? task.sort,
    priority: patch.priority ?? task.priority,
    dueOn: patch.dueTouched ? patch.dueOn ?? null : task.dueOn,
    assigneeId: patch.assigneeTouched ? patch.assigneeId ?? null : task.assigneeId,
    assigneeName: patch.assigneeTouched ? patch.assigneeName ?? null : task.assigneeName,
    activity: patch.activity ?? task.activity,
    publishOn: patch.publishOn ?? task.publishOn,
  };
}

function wednesdayOffset(today: string): number {
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (3 - weekday + 7) % 7 || 7;
}

function orderRow(id: string, orderNumber: number, status: string, service?: string): Record<string, unknown> {
  return {
    id,
    orderNumber,
    status,
    clientName: "Sample Client",
    address: `${orderNumber} Sample Street, Conroe, TX`,
    sample: true,
    ...(service ? { services: [{ name: service }] } : {}),
  };
}

function deriveCandidates(input: TaskBoardInput, staff: TaskAssignee[]): TaskBoardTask[] {
  const requests = withIds(input.orderRequests);
  const orders = withIds(input.orders);
  const listings = withIds(input.listings);
  const galleries = withIds(input.galleries);
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...requests, ...orders, ...listings]) byId.set(text(row.id), row);

  const deliver = deliverCandidates(galleries, listings, requests, orders, byId);
  const deliverOrderIds = new Set(deliver.map((task) => orderIdFromKey(task.pipelineKey)).filter(Boolean));
  const tasks: TaskBoardTask[] = [...deliver];

  for (const row of requests) {
    if (!needsSchedule(row) || deliverOrderIds.has(text(row.id))) continue;
    tasks.push(scheduleTask(row, "orderRequest", staff));
  }
  const requestIds = new Set(requests.map((row) => text(row.id)));
  for (const row of orders) {
    const id = text(row.id);
    const linkedRequest = text(row.orderRequestId);
    if (!needsSchedule(row) || deliverOrderIds.has(id)) continue;
    if (requestIds.has(id) || (linkedRequest && requestIds.has(linkedRequest))) continue;
    if (requests.some((request) => text(request.convertedToOrderId) === id || text(request.orderId) === id)) continue;
    tasks.push(scheduleTask(row, "order", staff));
  }

  for (const row of requests) {
    if (needsSchedule(row) || adminOrderQueue(row) === "archived") continue;
    if (deliverOrderIds.has(text(row.id))) continue;
    tasks.push(...productionTasks(row, staff, "orderRequest"));
  }
  for (const row of orders) {
    const id = text(row.id);
    if (needsSchedule(row) || adminOrderQueue(row) === "archived") continue;
    if (deliverOrderIds.has(id) || requestIds.has(id)) continue;
    if (requests.some((request) => text(request.convertedToOrderId) === id || text(request.orderId) === id)) continue;
    tasks.push(...productionTasks(row, staff, "order"));
  }

  tasks.push(...editRequestTasks(withIds(input.editRequests), byId));
  tasks.push(...photoEditTasks(listings, byId));
  tasks.push(...messageTasks(withIds(input.messages), byId));
  tasks.push(...threadTasks(input.contactThreads || []));
  tasks.push(...emailTasks(input.emails || [], byId));

  const byPipeline = new Map<string, TaskBoardTask>();
  for (const task of tasks) {
    const current = byPipeline.get(task.pipelineKey);
    if (!current || STAGE_RANK[task.stage] >= STAGE_RANK[current.stage]) byPipeline.set(task.pipelineKey, task);
  }
  return [...byPipeline.values()];
}

function mergeCandidates(candidates: TaskBoardTask[], overlays: TaskBoardOverlay[]): TaskBoardTask[] {
  const byPipeline = new Map(candidates.map((task) => [task.pipelineKey, task]));
  const seen = new Set<string>();
  const merged: TaskBoardTask[] = [];

  for (const overlay of overlays) {
    if (overlay.manual) {
      if (overlay.dismissed) continue;
      seen.add(overlay.pipelineKey);
      merged.push(taskFromOverlay(overlay));
      continue;
    }
    const candidate = byPipeline.get(overlay.pipelineKey);
    if (!candidate) {
      if (overlay.dismissed || overlay.status !== "done") continue;
      seen.add(overlay.pipelineKey);
      merged.push(taskFromOverlay(overlay));
      continue;
    }
    seen.add(overlay.pipelineKey);
    if (overlay.dismissed && overlay.fingerprint === candidate.fingerprint) continue;
    merged.push(mergeOverlay(candidate, overlay));
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.pipelineKey)) continue;
    merged.push(candidate);
  }
  return merged;
}

function mergeOverlay(candidate: TaskBoardTask, overlay: TaskBoardOverlay): TaskBoardTask {
  const stage = overlay.stageLocked ? overlay.stage : candidate.stage;
  const status = overlay.status === "done" ? "done" : "open";
  return {
    ...candidate,
    stage: status === "done" ? "delivered" : stage,
    stageLocked: overlay.stageLocked,
    resumeStage: overlay.resumeStage,
    status,
    assigneeId: overlay.assigneeTouched ? overlay.assigneeId : candidate.assigneeId,
    assigneeName: overlay.assigneeTouched ? overlay.assigneeName : candidate.assigneeName,
    priority: overlay.priority || candidate.priority,
    dueOn: overlay.dueTouched ? overlay.dueOn : candidate.dueOn,
    sort: overlay.sort,
    dismissed: false,
    fingerprint: candidate.fingerprint,
    activity: overlay.activity,
    sample: candidate.sample || overlay.sample,
    contentKind: overlay.contentKind || candidate.contentKind || null,
    contentStage: overlay.contentStage || candidate.contentStage || null,
    publishOn: overlay.publishTouched ? overlay.publishOn || null : candidate.publishOn || null,
    insightId: overlay.insightId || candidate.insightId || null,
  };
}

function taskFromOverlay(overlay: TaskBoardOverlay): TaskBoardTask {
  return {
    id: overlay.sourceKey,
    pipelineKey: overlay.pipelineKey,
    origin: overlay.origin,
    service: overlay.service,
    stage: overlay.status === "done" ? "delivered" : overlay.stage,
    stageLocked: overlay.stageLocked,
    resumeStage: overlay.resumeStage,
    status: overlay.status,
    title: overlay.title,
    sourceLine: overlay.sourceLine,
    primaryHref: overlay.primaryHref,
    primaryHrefLabel: overlay.primaryHrefLabel,
    orderHref: overlay.orderHref,
    orderLabel: overlay.orderLabel,
    galleryHref: overlay.galleryHref,
    galleryLabel: overlay.galleryLabel,
    deliveryHref: overlay.deliveryHref,
    deliveryLabel: overlay.deliveryLabel,
    clientRequest: overlay.clientRequest,
    clientRequestFrom: overlay.clientRequestFrom,
    clientRequestAt: overlay.clientRequestAt,
    assigneeId: overlay.assigneeId,
    assigneeName: overlay.assigneeName,
    priority: overlay.priority,
    dueOn: overlay.dueOn,
    sort: overlay.sort,
    dismissed: false,
    fingerprint: overlay.fingerprint,
    sample: overlay.sample,
    manual: overlay.manual,
    activity: overlay.activity,
    contentKind: overlay.contentKind || null,
    contentStage: overlay.contentStage || null,
    publishOn: overlay.publishOn || null,
    insightId: overlay.insightId || null,
  };
}

function deliverCandidates(
  galleries: Array<Record<string, unknown>>,
  listings: Array<Record<string, unknown>>,
  requests: Array<Record<string, unknown>>,
  orders: Array<Record<string, unknown>>,
  byId: Map<string, Record<string, unknown>>,
): TaskBoardTask[] {
  const rows = buildMediaDeliveryQueue({
    galleries: galleries.map(toGallerySource),
    listings: listings.map(toListingSource),
  });
  const rawGallery = new Map(galleries.map((gallery) => [text(gallery.id), gallery]));
  const tasks: TaskBoardTask[] = [];
  const seenOrders = new Set<string>();
  for (const row of rows) {
    if (row.deliveryStatus !== "undelivered") continue;
    const raw = row.galleryId ? rawGallery.get(row.galleryId) : undefined;
    const order = resolveOrder(raw, requests, orders, byId, row.orderId, row.listingId);
    const orderId = text(order?.id) || text(raw?.orderId) || row.orderId || "";
    const pipelineKey = orderId ? `order:${orderId}:deliver` : `gallery:${row.galleryId || row.id}:deliver`;
    if (orderId && seenOrders.has(orderId)) continue;
    if (orderId) seenOrders.add(orderId);
    const label = orderLabel(order) || orderLabel(raw);
    const listingId = row.listingId;
    const sample = raw?.sample === true || order?.sample === true;
    tasks.push(baseTask({
      pipelineKey,
      origin: "delivery",
      service: "deliver",
      stage: "ready",
      title: label ? `Deliver order ${label}` : `Deliver ${row.address}`,
      sourceLine: "Delivery · Ready for review",
      primaryHref: deliveryHref(listingId),
      primaryHrefLabel: "Open deliveries",
      orderHref: orderHref(order),
      orderLabel: label || null,
      galleryHref: listingId ? `/admin/listing/${encodeURIComponent(listingId)}` : null,
      galleryLabel: listingId ? "Project" : null,
      deliveryHref: deliveryHref(listingId),
      deliveryLabel: "Deliveries",
      clientRequest: null,
      clientRequestFrom: null,
      clientRequestAt: null,
      assignee: null,
      dueOn: firstDate(order, ["dueDate", "deliverBy"]) || firstDate(raw, ["dueDate", "deliverBy"]),
      fingerprint: `deliver|${pipelineKey}|${row.galleryStatus}|${orderId}`,
      sample,
    }));
  }
  return tasks;
}

function scheduleTask(row: Record<string, unknown>, kind: "orderRequest" | "order", staff: TaskAssignee[]): TaskBoardTask {
  const id = text(row.id);
  const label = orderLabel(row) || id;
  const work = workText(row);
  return baseTask({
    pipelineKey: `order:${id}:schedule`,
    origin: "schedule",
    service: "schedule",
    stage: "queued",
    title: `Schedule order ${label}`,
    sourceLine: "Order · Unscheduled",
    primaryHref: kind === "orderRequest" ? adminOrderDetailHref(id) : `/admin/order/${encodeURIComponent(id)}`,
    primaryHrefLabel: "Open order",
    orderHref: kind === "orderRequest" ? adminOrderDetailHref(id) : `/admin/order/${encodeURIComponent(id)}`,
    orderLabel: label,
    galleryHref: text(row.listingId) ? `/admin/listing/${encodeURIComponent(text(row.listingId))}` : null,
    galleryLabel: text(row.listingId) ? "Project" : null,
    deliveryHref: text(row.listingId) ? deliveryHref(text(row.listingId)) : null,
    deliveryLabel: text(row.listingId) ? "Deliveries" : null,
    clientRequest: null,
    clientRequestFrom: null,
    clientRequestAt: null,
    assignee: suggestedAssignee(work, staff),
    dueOn: firstDate(row, ["dueDate", "requestedDate", "deliverBy"]),
    fingerprint: `schedule|${id}|${text(row.status)}|${label}`,
    sample: row.sample === true,
  });
}

function productionTasks(
  row: Record<string, unknown>,
  staff: TaskAssignee[],
  kind: "orderRequest" | "order",
): TaskBoardTask[] {
  const id = text(row.id);
  const label = orderLabel(row) || id;
  const lines = orderServiceLines(row).map((line) => line.name);
  const blob = `${workText(row)} ${lines.join(" ")}`;
  const tasks: TaskBoardTask[] = [];
  if (/\bpodcasts?\b/i.test(blob)) {
    tasks.push(productionTask(row, id, label, "podcast", `Podcast episode · order ${label}`, "Podcast · Episode", suggestedAssignee("podcast", staff), kind));
  }
  if (/\b(videos?|reels?)\b/i.test(blob)) {
    const reel = /\breels?\b/i.test(blob);
    tasks.push(productionTask(
      row,
      id,
      label,
      "video",
      reel ? `Edit listing reel · order ${label}` : `Video · order ${label}`,
      reel ? "Video · Listing reel" : "Video · Production",
      suggestedAssignee("video", staff),
      kind,
    ));
  }
  return tasks;
}

function productionTask(
  row: Record<string, unknown>,
  id: string,
  label: string,
  service: "video" | "podcast",
  title: string,
  sourceLine: string,
  assignee: TaskAssignee | null,
  kind: "orderRequest" | "order",
): TaskBoardTask {
  const href = kind === "order"
    ? `/admin/order/${encodeURIComponent(id)}`
    : adminOrderDetailHref(id);
  const task = baseTask({
    pipelineKey: `order:${id}:${service}`,
    origin: "production",
    service,
    stage: "production",
    title,
    sourceLine,
    primaryHref: href,
    primaryHrefLabel: "Open order",
    orderHref: href,
    orderLabel: label,
    galleryHref: text(row.listingId) ? `/admin/listing/${encodeURIComponent(text(row.listingId))}` : null,
    galleryLabel: text(row.listingId) ? "Project" : null,
    deliveryHref: text(row.listingId) ? deliveryHref(text(row.listingId)) : null,
    deliveryLabel: text(row.listingId) ? "Deliveries" : null,
    clientRequest: null,
    clientRequestFrom: null,
    clientRequestAt: null,
    assignee,
    dueOn: firstDate(row, ["dueDate", "deliverBy", "appointmentDate", "requestedDate"]),
    fingerprint: `${service}|${id}|${text(row.status)}|${label}`,
    sample: row.sample === true,
  });
  if (service !== "podcast") return task;
  return {
    ...task,
    contentKind: "podcast",
    contentStage: "edit",
    primaryHref: contentSectionHref("podcast", task.id),
    primaryHrefLabel: "Open podcast",
  };
}

function editRequestTasks(rows: Array<Record<string, unknown>>, byId: Map<string, Record<string, unknown>>): TaskBoardTask[] {
  const tasks: TaskBoardTask[] = [];
  for (const row of rows) {
    const status = text(row.status).toLowerCase();
    if (CLOSED_EDIT.has(status)) continue;
    const id = text(row.id);
    if (!id) continue;
    const order = byId.get(text(row.orderId)) || byId.get(text(row.orderRequestId));
    const label = orderLabel(order) || orderLabel(row);
    const note = text(row.note) || text(row.message) || text(row.description) || text(row.body);
    const listingId = text(row.listingId) || text(order?.listingId);
    tasks.push(baseTask({
      pipelineKey: `edit:${id}`,
      origin: "edit",
      service: "edit",
      stage: "review",
      title: label ? `Edit request · order ${label}` : "Edit request",
      sourceLine: note ? `Edit · ${clip(note, 48)}` : "Edit · Client request",
      primaryHref: orderHref(order) || (listingId ? `/admin/listing/${encodeURIComponent(listingId)}` : null),
      primaryHrefLabel: order ? "Open order" : "Open project",
      orderHref: orderHref(order),
      orderLabel: label || null,
      galleryHref: listingId ? `/admin/listing/${encodeURIComponent(listingId)}` : null,
      galleryLabel: listingId ? "Project" : null,
      deliveryHref: listingId ? deliveryHref(listingId) : null,
      deliveryLabel: listingId ? "Deliveries" : null,
      clientRequest: note || null,
      clientRequestFrom: text(row.clientName) || text(row.senderName) || null,
      clientRequestAt: text(row.createdAt) || null,
      assignee: null,
      dueOn: firstDate(row, ["dueDate"]),
      fingerprint: `edit|${id}|${status}|${note}`,
      sample: row.sample === true || order?.sample === true,
    }));
  }
  return tasks;
}

function photoEditTasks(listings: Array<Record<string, unknown>>, byId: Map<string, Record<string, unknown>>): TaskBoardTask[] {
  const tasks: TaskBoardTask[] = [];
  for (const listing of listings) {
    const listingId = text(listing.id);
    const order = byId.get(text(listing.orderRequestId)) || byId.get(text(listing.orderId)) || listing;
    const label = orderLabel(order);
    for (const request of readPhotoEditRequests(listing.photoEditRequests)) {
      if (request.status === "received_back") continue;
      tasks.push(baseTask({
        pipelineKey: `photo:${request.id}`,
        origin: "edit",
        service: "edit",
        stage: "review",
        title: label ? `Edit request · order ${label}` : `Edit request · ${request.photoName}`,
        sourceLine: `Edit · ${request.photoName}`,
        primaryHref: listingId ? `/admin/listing/${encodeURIComponent(listingId)}` : null,
        primaryHrefLabel: "Open project",
        orderHref: orderHref(order === listing ? null : order) || (text(listing.orderRequestId) ? adminOrderDetailHref(text(listing.orderRequestId)) : null),
        orderLabel: label || null,
        galleryHref: listingId ? `/admin/listing/${encodeURIComponent(listingId)}` : null,
        galleryLabel: "Project",
        deliveryHref: listingId ? deliveryHref(listingId) : null,
        deliveryLabel: "Deliveries",
        clientRequest: request.note,
        clientRequestFrom: null,
        clientRequestAt: request.createdAt,
        assignee: null,
        dueOn: null,
        fingerprint: `photo|${request.id}|${request.status}|${request.note}`,
        sample: listing.sample === true,
      }));
    }
  }
  return tasks;
}

function messageTasks(rows: Array<Record<string, unknown>>, byId: Map<string, Record<string, unknown>>): TaskBoardTask[] {
  const tasks: TaskBoardTask[] = [];
  for (const row of rows) {
    const sender = text(row.senderType) || text(row.sender);
    if (sender !== "client") continue;
    if (row.isRead === true || row.read === true) continue;
    const id = text(row.id);
    if (!id) continue;
    const order = byId.get(text(row.orderId)) || byId.get(text(row.orderRequestId));
    const label = orderLabel(order);
    const body = text(row.content) || text(row.body) || text(row.text);
    const sms = text(row.channel) === "sms";
    tasks.push(baseTask({
      pipelineKey: `message:${id}`,
      origin: "question",
      service: "question",
      stage: "queued",
      title: label ? `Client question · order ${label}` : "Client question",
      sourceLine: `${sms ? "Text" : "Message"} · ${clip(body, 42) || "Client question"}`,
      primaryHref: "/admin/communications",
      primaryHrefLabel: "Open inbox",
      orderHref: orderHref(order),
      orderLabel: label || null,
      galleryHref: null,
      galleryLabel: null,
      deliveryHref: null,
      deliveryLabel: null,
      clientRequest: body || null,
      clientRequestFrom: text(row.senderName) || null,
      clientRequestAt: text(row.createdAt) || null,
      assignee: null,
      dueOn: null,
      fingerprint: `message|${id}|${body}`,
      sample: row.sample === true || order?.sample === true,
    }));
  }
  return tasks;
}

function threadTasks(threads: ContactThreadView[]): TaskBoardTask[] {
  const tasks: TaskBoardTask[] = [];
  for (const thread of threads) {
    const last = thread.messages[thread.messages.length - 1];
    if (!last || last.sender !== "client") continue;
    const id = text(thread.id);
    if (!id) continue;
    tasks.push(baseTask({
      pipelineKey: `thread:${id}`,
      origin: "question",
      service: "question",
      stage: "queued",
      title: `Client question from ${thread.name || "a client"}`,
      sourceLine: `Chat · ${clip(last.text, 42) || "Waiting on a reply"}`,
      primaryHref: "/admin/communications",
      primaryHrefLabel: "Open inbox",
      orderHref: null,
      orderLabel: null,
      galleryHref: null,
      galleryLabel: null,
      deliveryHref: null,
      deliveryLabel: null,
      clientRequest: last.text,
      clientRequestFrom: last.senderName || thread.name,
      clientRequestAt: last.createdAt,
      assignee: null,
      dueOn: null,
      fingerprint: `thread|${id}|${last.id}|${last.text}`,
      sample: false,
    }));
  }
  return tasks;
}

function emailTasks(emails: InboundClientEmail[], byId: Map<string, Record<string, unknown>>): TaskBoardTask[] {
  const tasks: TaskBoardTask[] = [];
  for (const email of emails) {
    const id = text(email.id);
    if (!id) continue;
    const label = email.orderNumber ? orderLabel({ orderNumber: email.orderNumber }) : "";
    const orderHits = label ? [...byId.values()].filter((row) => orderLabel(row) === label && (row.orderNumber != null || row.status != null)) : [];
    const order = orderHits.length === 1 ? orderHits[0] : undefined;
    tasks.push(baseTask({
      pipelineKey: `email:${id}`,
      origin: "email",
      service: "email",
      stage: "queued",
      title: label ? `Email question · order ${label}` : `Email · ${clip(email.subject, 60) || "Client message"}`,
      sourceLine: `Email · ${PHOTOS_MAILBOX}`,
      primaryHref: orderHref(order) || "/admin/communications",
      primaryHrefLabel: order ? "Open order" : "Open inbox",
      orderHref: orderHref(order),
      orderLabel: label || null,
      galleryHref: null,
      galleryLabel: null,
      deliveryHref: null,
      deliveryLabel: null,
      clientRequest: email.body,
      clientRequestFrom: email.fromName || email.fromEmail,
      clientRequestAt: email.receivedAt,
      assignee: null,
      dueOn: null,
      fingerprint: `email|${id}|${email.subject}|${email.body}`,
      sample: email.sample === true,
    }));
  }
  return tasks;
}

function baseTask(input: {
  pipelineKey: string;
  origin: TaskOrigin;
  service: string;
  stage: TaskStage;
  title: string;
  sourceLine: string;
  primaryHref: string | null;
  primaryHrefLabel: string | null;
  orderHref: string | null;
  orderLabel: string | null;
  galleryHref: string | null;
  galleryLabel: string | null;
  deliveryHref: string | null;
  deliveryLabel: string | null;
  clientRequest: string | null;
  clientRequestFrom: string | null;
  clientRequestAt: string | null;
  assignee: TaskAssignee | null;
  dueOn: string | null;
  fingerprint: string;
  sample: boolean;
}): TaskBoardTask {
  return {
    id: input.pipelineKey,
    pipelineKey: input.pipelineKey,
    origin: input.origin,
    service: input.service,
    stage: input.stage,
    stageLocked: false,
    resumeStage: null,
    status: "open",
    title: input.title,
    sourceLine: input.sourceLine,
    primaryHref: input.primaryHref,
    primaryHrefLabel: input.primaryHrefLabel,
    orderHref: input.orderHref,
    orderLabel: input.orderLabel,
    galleryHref: input.galleryHref,
    galleryLabel: input.galleryLabel,
    deliveryHref: input.deliveryHref,
    deliveryLabel: input.deliveryLabel,
    clientRequest: input.clientRequest,
    clientRequestFrom: input.clientRequestFrom,
    clientRequestAt: input.clientRequestAt,
    assigneeId: input.assignee?.id || null,
    assigneeName: input.assignee?.name || null,
    priority: "normal",
    dueOn: input.dueOn,
    sort: null,
    dismissed: false,
    fingerprint: input.fingerprint,
    sample: input.sample,
    manual: false,
    activity: [],
  };
}

function needsSchedule(row: Record<string, unknown>): boolean {
  return adminOrderQueue(row) === "action";
}

function suggestedAssignee(work: string, staff: TaskAssignee[]): TaskAssignee | null {
  const blob = work.toLowerCase();
  if (/\bpodcasts?\b/.test(blob)) return soleFirstName(staff, "daniel");
  if (/\b(videos?|reels?)\b/.test(blob)) return soleFirstName(staff, "mike");
  return null;
}

function soleFirstName(staff: TaskAssignee[], first: string): TaskAssignee | null {
  const hits = staff.filter((person) => shortName(person.name).toLowerCase() === first);
  return hits.length === 1 ? hits[0] : null;
}

function workText(row: Record<string, unknown>): string {
  return [
    ...orderServiceLines(row).map((line) => line.name),
    text(row.packageName),
    text(row.package),
    text(row.selectedService),
  ].join(" ");
}

function orderLabel(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const label = adminOrderNumberLabel(row);
  if (!label || label === "—") return "";
  return label;
}

function orderHref(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const id = text(row.id);
  if (!id) return null;
  if (row.orderRequestId || row.services || row.orderNumber) {
    if (text(row.collection) === "orders") return `/admin/order/${encodeURIComponent(id)}`;
  }
  return adminOrderDetailHref(id);
}

function orderIdFromKey(pipelineKey: string): string {
  const match = pipelineKey.match(/^order:([^:]+):deliver$/);
  return match?.[1] || "";
}

function resolveOrder(
  raw: Record<string, unknown> | undefined,
  requests: Array<Record<string, unknown>>,
  orders: Array<Record<string, unknown>>,
  byId: Map<string, Record<string, unknown>>,
  orderId: string | null,
  listingId: string | null,
): Record<string, unknown> | null {
  const id = text(raw?.orderId) || orderId || "";
  if (id && byId.has(id)) return byId.get(id) || null;
  const listing = listingId ? byId.get(listingId) : undefined;
  const linked = text(listing?.orderRequestId) || text(listing?.orderId) || text(raw?.orderRequestId);
  if (linked && byId.has(linked)) return byId.get(linked) || null;
  const request = requests.find((row) => text(row.listingId) === listingId && listingId);
  if (request) return request;
  const order = orders.find((row) => text(row.id) === id);
  return order || null;
}

function deliveryHref(listingId: string | null): string | null {
  if (!listingId) return `${OPS_PATH}?stage=review`;
  const params = new URLSearchParams({ stage: "review", job: listingId });
  return `${OPS_PATH}?${params.toString()}`;
}

function firstDate(row: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const value = calendarDateKey(row[key]);
    if (value) return value;
  }
  return null;
}

function toGallerySource(row: Record<string, unknown>): DeliveryGallerySource {
  return {
    id: text(row.id),
    status: text(row.status) || text(row.galleryStatus),
    listingId: text(row.listingId),
    orderId: text(row.orderId),
    clientName: text(row.clientName),
    addressLabel: row.addressLabel || row.address || addressText(row.address),
    title: row.title,
    mediaCount: Number(row.mediaCount) || 0,
  };
}

function toListingSource(row: Record<string, unknown>): DeliveryListingSource {
  return {
    id: text(row.id),
    address: row.address,
    shootLocation: row.shootLocation,
    galleryId: text(row.galleryId),
  };
}

function withIds(rows: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> {
  return (rows || []).filter((row) => text(row.id));
}

function matchesFilter(task: TaskBoardTask, filter: TaskFilter, meId: string | null, today: string): boolean {
  if (filter === "all") return true;
  if (task.status === "done") return false;
  if (filter === "mine") return Boolean(meId) && task.assigneeId === meId;
  if (filter === "unassigned") return !task.assigneeId;
  return isOverdue(task, today);
}

function compareManual(a: TaskBoardTask, b: TaskBoardTask): number {
  const aUnset = a.sort == null;
  const bUnset = b.sort == null;
  if (aUnset && bUnset) {
    return STAGE_RANK[columnStage(a)] - STAGE_RANK[columnStage(b)] || a.title.localeCompare(b.title);
  }
  if (aUnset) return 1;
  if (bUnset) return -1;
  return (a.sort as number) - (b.sort as number) || a.title.localeCompare(b.title);
}

function comparePriority(a: TaskBoardTask, b: TaskBoardTask): number {
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rank !== 0) return rank;
  if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
  if (a.dueOn && !b.dueOn) return -1;
  if (!a.dueOn && b.dueOn) return 1;
  return compareManual(a, b);
}

function appendActivity(activity: TaskActivity[], at: string, textValue: string): TaskActivity[] {
  const next = [...activity, { at, text: textValue }];
  return next.slice(-20);
}

function readActivity(value: unknown): TaskActivity[] {
  if (!Array.isArray(value)) return [];
  const entries: TaskActivity[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const at = text(row.at);
    const line = text(row.text);
    if (!at || !line) continue;
    entries.push({ at, text: line, ...(row.sample === true ? { sample: true } : {}) });
  }
  return entries.slice(-20);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function clip(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trim()}…`;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function nullableText(value: unknown): string | null {
  const clean = text(value);
  return clean || null;
}

function dateOnly(value: unknown): string | null {
  const clean = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

function isOrigin(value: unknown): value is TaskOrigin {
  return value === "schedule" || value === "delivery" || value === "production" || value === "edit" || value === "question" || value === "email" || value === "manual";
}

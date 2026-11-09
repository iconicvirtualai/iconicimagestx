/**
 * Podcast and marketing content share one task record with the checklist.
 * Listing and client videos stay on the operations board.
 * Insights social posts can be tracked once. This does not post or email.
 */

import {
  CONTENT_STAGE_LABEL,
  boardStageForContent,
  contentSectionHref,
  createContentItem,
  withContentStage,
  withPublishOn,
  type ContentKind,
  type ContentStage,
  type TaskBoardTask,
} from "./taskBoard.ts";

export interface ContentInsight {
  id: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string;
  readyForSocial: boolean;
  categories: string[];
}

export interface CalendarMark {
  id: string;
  date: string;
  title: string;
  kind: ContentKind | "insight";
  href: string;
  taskId: string | null;
  sample: boolean;
}

export function isPodcastTask(task: TaskBoardTask): boolean {
  return task.contentKind === "podcast" || task.service === "podcast";
}

export function isPromoTask(task: TaskBoardTask): boolean {
  return task.contentKind === "promo" || task.service === "promo";
}

/** Listing and client videos. Not podcasts and not Iconic promo videos. */
export function isListingVideoTask(task: TaskBoardTask): boolean {
  return task.service === "video" && task.contentKind !== "promo";
}

export function contentTasks(tasks: TaskBoardTask[], kind: ContentKind): TaskBoardTask[] {
  const match = kind === "podcast" ? isPodcastTask : isPromoTask;
  return tasks.filter(match).sort((a, b) => (a.publishOn || a.dueOn || "9999").localeCompare(b.publishOn || b.dueOn || "9999") || a.title.localeCompare(b.title));
}

export function checklistHref(taskId: string): string {
  return `/admin/tasks?task=${encodeURIComponent(taskId)}`;
}

export function insightTaskId(insightId: string): string {
  return `insight:${insightId}`;
}

/**
 * One content record per Insight. A second call updates nothing and does not add a row.
 */
export function trackInsight(
  tasks: TaskBoardTask[],
  insight: ContentInsight,
  at: string,
): { tasks: TaskBoardTask[]; id: string } {
  const id = insightTaskId(insight.id);
  const existing = tasks.find((task) => task.pipelineKey === id || task.insightId === insight.id);
  if (existing) return { tasks, id: existing.id };
  const blob = `${insight.title} ${insight.categories.join(" ")}`.toLowerCase();
  const kind: ContentKind = /\bpodcasts?\b/.test(blob) ? "podcast" : "promo";
  const created = createContentItem({
    id,
    kind,
    title: insight.title || "Insights social",
    contentStage: insight.publishedAt ? "published" : "idea",
    publishOn: dateOnly(insight.publishedAt) || dateOnly(insight.updatedAt),
    assignee: null,
    sample: false,
    insightId: insight.id,
    at,
  });
  if (created.ok === false) return { tasks, id };
  return { tasks: [...tasks, created.task], id: created.task.id };
}

export function setContentStage(tasks: TaskBoardTask[], id: string, stage: ContentStage, at: string): TaskBoardTask[] {
  return withContentStage(tasks, id, stage, at);
}

export function setPublishDate(tasks: TaskBoardTask[], id: string, publishOn: string | null, at: string): TaskBoardTask[] {
  return withPublishOn(tasks, id, publishOn, at);
}

export function contentCalendar(
  tasks: TaskBoardTask[],
  insights: ContentInsight[],
  month: string,
): CalendarMark[] {
  const marks: CalendarMark[] = [];
  const trackedInsights = new Set(tasks.map((task) => task.insightId).filter((id): id is string => Boolean(id)));
  for (const task of tasks) {
    if (!isPodcastTask(task) && !isPromoTask(task)) continue;
    const date = task.publishOn || task.dueOn;
    if (!date || !date.startsWith(month)) continue;
    const kind: ContentKind = isPodcastTask(task) ? "podcast" : "promo";
    marks.push({
      id: task.id,
      date,
      title: task.title,
      kind,
      href: contentSectionHref(kind, task.id),
      taskId: task.id,
      sample: task.sample,
    });
  }
  for (const insight of insights) {
    if (trackedInsights.has(insight.id)) continue;
    if (!insight.readyForSocial && !insight.publishedAt) continue;
    const date = dateOnly(insight.publishedAt) || dateOnly(insight.updatedAt);
    if (!date || !date.startsWith(month)) continue;
    marks.push({
      id: `insight:${insight.id}`,
      date,
      title: insight.title || "Insights post",
      kind: "insight",
      href: `/admin/insights?post=${encodeURIComponent(insight.id)}`,
      taskId: null,
      sample: false,
    });
  }
  return marks.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function monthGrid(month: string): string[][] {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: string[] = [];
  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(isoDay(year, monthNumber - 1, 1 - (firstWeekday - index)));
  }
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(isoDay(year, monthNumber - 1, day));
  while (cells.length % 7 !== 0) {
    const [y, m, d] = cells[cells.length - 1].split("-").map(Number);
    cells.push(isoDay(y, m - 1, d + 1));
  }
  const weeks: string[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

function isoDay(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function sampleContentInsights(today: string): ContentInsight[] {
  return [{
    id: "sample-insight-social",
    title: "From the shoot — sample social pack",
    publishedAt: null,
    updatedAt: `${today}T18:00:00.000Z`,
    readyForSocial: true,
    categories: ["VIDEO"],
  }];
}

export function contentStageName(stage: ContentStage): string {
  return CONTENT_STAGE_LABEL[stage];
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export { boardStageForContent };

/**
 * Admin task board.
 * Reads orders, deliveries, edits, questions, and photos@ when that inbox is connected.
 * Writes taskBoardItems, and the assignee unread counter when someone else is assigned.
 * Does not email or text anyone.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { TaskBoardView } from "@/components/taskBoard/TaskBoardView";
import { useAdminUnread } from "@/components/admin/AdminUnreadProvider";
import { useTaskBoardData } from "@/lib/useTaskBoardData";
import {
  createManualTask,
  reorderTasks,
  withAssignee,
  withDue,
  withPriority,
  withRestored,
  withStage,
  withToggled,
  withoutTask,
  withoutTasks,
  type TaskPriority,
  type TaskStage,
} from "@shared/taskBoard";

export default function AdminTaskBoard() {
  const data = useTaskBoardData();
  const unread = useAdminUnread();
  const onSeenAssignments = useCallback(() => {
    if (!data.sample) void unread.markSeen("tasks");
  }, [data.sample, unread.markSeen]);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "board" ? "board" : "list";
  const [selectedId, setSelectedId] = useState<string | null>(params.get("task"));

  useEffect(() => {
    const requested = params.get("task");
    if (requested) setSelectedId(requested);
  }, [params]);

  const select = (id: string | null) => {
    setSelectedId(id);
    const updated = new URLSearchParams(params);
    if (id) updated.set("task", id);
    else updated.delete("task");
    setParams(updated, { replace: true });
  };

  const setView = (next: "list" | "board") => {
    const updated = new URLSearchParams(params);
    if (next === "board") updated.set("view", "board");
    else updated.delete("view");
    setParams(updated, { replace: true });
  };

  const { tasks, commit } = data;
  const stamp = () => new Date().toISOString();

  return (
    <AdminLayout title="Task board">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {data.sample
            ? "These rows are sample data so the layout can be reviewed. They are not live orders."
            : "Live tasks come from orders, deliveries, edits, messages, and photos@ when that inbox is connected."}
        </p>
        <div className="flex gap-3">
          <Link to={data.sample ? "/admin/content?sample=1" : "/admin/content"} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">Content</Link>
          <Link to={data.sample ? "/admin/tasks" : "/admin/tasks?sample=1"} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">
            {data.sample ? "Live tasks" : "View sample"}
          </Link>
        </div>
      </div>
      {data.loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
        </div>
      ) : (
        <>
          {data.inboxPrerequisites.length > 0 ? (
            <ul className="mb-4 max-w-3xl list-disc space-y-1 pl-5 text-xs text-slate-500">
              {data.inboxPrerequisites.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
          <TaskBoardView
            tasks={tasks}
            staff={data.staff}
            today={data.today}
            meId={data.meId}
            sample={data.sample}
            assignmentUnread={data.sample ? 0 : unread.counts.tasks}
            onSeenAssignments={onSeenAssignments}
            emailNotice={data.emailNotice}
            sourceErrors={data.sourceErrors}
            cleared={data.cleared}
            view={view}
            selectedId={selectedId}
            onView={setView}
            onSelect={select}
            onToggle={(id) => commit(withToggled(tasks, id, stamp()))}
            onDelete={(id) => {
              const result = withoutTask(tasks, id);
              if (!result.removed) return;
              commit(result.tasks, [{ task: result.removed, mode: result.removed.manual ? "delete" : "clear" }]);
              toast(result.removed.manual ? "Task deleted." : "Removed from the board. The order stays.");
            }}
            onClear={(ids) => {
              const result = withoutTasks(tasks, ids);
              if (result.removed.length === 0) return;
              commit(result.tasks, result.removed.map((task) => ({ task, mode: "clear" as const })));
              toast(`Cleared ${result.removed.length} from the board.`, {
                action: {
                  label: "Undo",
                  onClick: () => commit(withRestored(result.tasks, result.removed, result.removed.map((task) => task.id))),
                },
              });
            }}
            onRestore={(ids) => commit(withRestored(tasks, data.cleared, ids))}
            onAssign={(id, assignee) => commit(withAssignee(tasks, id, assignee, stamp()))}
            onPriority={(id, priority) => commit(withPriority(tasks, id, priority, stamp()))}
            onDue={(id, dueOn) => commit(withDue(tasks, id, dueOn, stamp()))}
            onStage={(id, stage) => commit(withStage(tasks, id, stage, stamp()))}
            onReorder={(activeId, overId) => commit(reorderTasks(tasks, activeId, overId))}
            onCreate={(input) => {
              const created = createManualTask({
                id: `manual:${crypto.randomUUID()}`,
                title: input.title,
                stage: input.stage,
                priority: input.priority,
                dueOn: input.dueOn,
                assignee: input.assignee,
                sample: data.sample,
                sort: nextSort(tasks),
                at: stamp(),
              });
              if (created.ok === false) {
                toast.error(created.error);
                return;
              }
              commit([...tasks, created.task]);
              select(created.task.id);
              toast("Task added.");
            }}
          />
        </>
      )}
    </AdminLayout>
  );
}

function nextSort(tasks: { sort: number | null }[]): number {
  const numbers = tasks.map((task) => task.sort).filter((sort): sort is number => sort != null);
  if (numbers.length === 0) return 10;
  return Math.min(...numbers) - 10;
}

export type { TaskPriority, TaskStage };

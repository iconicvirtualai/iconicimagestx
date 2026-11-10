import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { DragGhost, dragDropClass, type DragGhostModel } from "@/components/drag/DragGhost";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STAGE_LABEL,
  TASK_STAGES,
  TASK_TRACK,
  columnStage,
  displayTasks,
  dueLabel,
  isOverdue,
  isTaskStage,
  manualOrderSaved,
  shortName,
  taskBoardStats,
  taskFilterCounts,
  type TaskAssignee,
  type TaskBoardTask,
  type TaskFilter,
  type TaskPriority,
  type TaskStage,
} from "@shared/taskBoard";

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "mine", label: "My tasks" },
  { id: "unassigned", label: "Unassigned" },
  { id: "overdue", label: "Overdue" },
];

export function TaskBoardView({
  tasks,
  staff,
  today,
  meId,
  sample,
  emailNotice,
  sourceErrors,
  cleared,
  view,
  selectedId,
  onView,
  onSelect,
  onToggle,
  onDelete,
  onAssign,
  onPriority,
  onDue,
  onStage,
  onReorder,
  onCreate,
  onClear,
  onRestore,
}: {
  tasks: TaskBoardTask[];
  staff: TaskAssignee[];
  today: string;
  meId: string | null;
  sample: boolean;
  emailNotice: string;
  sourceErrors: string[];
  cleared: TaskBoardTask[];
  view: "list" | "board";
  selectedId: string | null;
  onView: (view: "list" | "board") => void;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAssign: (id: string, assignee: TaskAssignee | null) => void;
  onPriority: (id: string, priority: TaskPriority) => void;
  onDue: (id: string, dueOn: string | null) => void;
  onStage: (id: string, stage: TaskStage) => void;
  onReorder: (activeId: string, overId: string) => void;
  onCreate: (input: { title: string; assignee: TaskAssignee | null; priority: TaskPriority; dueOn: string | null; stage: TaskStage }) => void;
  onClear: (ids: string[]) => void;
  onRestore: (ids: string[]) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [prioritySort, setPrioritySort] = useState(false);
  const [adding, setAdding] = useState(false);
  const [hiddenDetail, setHiddenDetail] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ghost, setGhost] = useState<DragGhostModel | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; column: string } | null>(null);
  const suppressClick = useRef(false);
  const stats = taskBoardStats(tasks, today);
  const counts = taskFilterCounts(tasks, meId, today);
  const shown = showCleared
    ? [...tasks, ...cleared.filter((task) => !tasks.some((item) => item.id === task.id))]
    : tasks;
  const visible = displayTasks(shown, { filter, meId, today, query, prioritySort });
  const visibleIds = visible.map((task) => task.id);
  const clearIds = picked.filter((id) => visible.some((task) => task.id === id && !task.dismissed));
  const restoreIds = picked.filter((id) => visible.some((task) => task.id === id && task.dismissed));
  const selected = hiddenDetail
    ? null
    : tasks.find((task) => task.id === selectedId)
      || tasks.find((task) => task.clientRequest)
      || tasks[0]
      || null;
  const saved = manualOrderSaved(tasks);

  const choose = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setHiddenDetail(false);
    onSelect(id);
  };

  const togglePick = (id: string) => {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const selectIds = (ids: string[]) => {
    setPicked((current) => {
      const all = ids.length > 0 && ids.every((id) => current.includes(id));
      if (all) return current.filter((id) => !ids.includes(id));
      return [...new Set([...current, ...ids])];
    });
  };

  const startPointerDrag = (event: ReactPointerEvent, task: TaskBoardTask) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("a, input, select, textarea, label")) return;
    if (target instanceof Element && target.closest("button") && !target.closest("[data-drag-handle]")) return;
    const originX = event.clientX;
    const originY = event.clientY;
    let active = false;
    const move = (pointer: PointerEvent) => {
      if (!active && Math.hypot(pointer.clientX - originX, pointer.clientY - originY) < 8) return;
      active = true;
      const hit = document.elementFromPoint(pointer.clientX, pointer.clientY);
      const card = hit instanceof Element ? hit.closest("[data-task-id]") : null;
      const column = hit instanceof Element ? hit.closest("[data-task-column]") : null;
      const overId = card?.getAttribute("data-task-id") || "";
      setDropTarget({
        id: overId === task.id ? "" : overId,
        column: column?.getAttribute("data-task-column") || "",
      });
      setGhost({ x: pointer.clientX, y: pointer.clientY, title: task.title, subtitle: task.sourceLine });
    };
    const up = (pointer: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setGhost(null);
      setDropTarget(null);
      if (!active) return;
      suppressClick.current = true;
      const hit = document.elementFromPoint(pointer.clientX, pointer.clientY);
      const card = hit instanceof Element ? hit.closest("[data-task-id]") : null;
      const column = hit instanceof Element ? hit.closest("[data-task-column]") : null;
      const overId = card?.getAttribute("data-task-id") || "";
      const overColumn = column?.getAttribute("data-task-column") || "";
      const overTask = tasks.find((item) => item.id === overId) || cleared.find((item) => item.id === overId);
      if (view === "board") {
        const nextStage = overTask ? columnStage(overTask) : (isTaskStage(overColumn) ? overColumn : null);
        if (nextStage && nextStage !== columnStage(task)) onStage(task.id, nextStage);
        else if (!prioritySort && overId && overId !== task.id) onReorder(task.id, overId);
        return;
      }
      if (!prioritySort && overId && overId !== task.id) onReorder(task.id, overId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div data-testid="task-board" className="min-w-0 text-slate-900">
      <DragGhost ghost={ghost} />
      {confirmClear ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-52" role="dialog" aria-modal="true" aria-labelledby="task-clear-title" data-testid="task-clear-confirm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="task-clear-title" className="text-lg font-semibold text-slate-950">Clear {clearIds.length} from the board?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This hides the selected cards. Orders, galleries, and deliveries stay. Turn on Show cleared to bring them back.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
              <button
                type="button"
                data-testid="task-clear-confirm-button"
                onClick={() => {
                  const ids = clearIds;
                  setConfirmClear(false);
                  setPicked((current) => current.filter((id) => !ids.includes(id)));
                  onClear(ids);
                }}
                className="rounded-xl bg-black px-4 py-2 text-xs font-bold text-white"
              >
                Clear {clearIds.length}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {sample ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-800">
                Sample data
              </span>
            ) : null}
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {sample ? "Layout review · not live orders" : "Admin only"}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.75rem]">
            Your entire operation. One checklist.
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Orders, production, deliveries and client conversations — organized around the next action.
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">{emailNotice} Nothing on this page texts the team or clients.</p>
        </div>
        <button
          type="button"
          data-testid="task-add"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2.5 text-xs font-bold text-white hover:bg-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add manual task
        </button>
      </div>

      {sourceErrors.length > 0 ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {sourceErrors.join(" ")} Counts below use only the sources that loaded.
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat testId="task-stat-open" label="Open tasks" value={stats.open.value} detail={stats.open.label} tone="slate" />
        <Stat testId="task-stat-production" label="In production" value={stats.production.value} detail={stats.production.label} tone="teal" />
        <Stat testId="task-stat-ready" label="Ready to deliver" value={stats.ready.value} detail={stats.ready.label} tone="green" />
        <Stat testId="task-stat-overdue" label="Overdue" value={stats.overdue.value} detail={stats.overdue.label} tone={stats.overdue.value ? "red" : "slate"} />
      </div>

      <div className={`grid items-start gap-4 ${view === "list" ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Unified checklist</h3>
              <p className="text-[11px] text-slate-400" data-testid="task-counts">
                {stats.active} active · {stats.completed} completed
              </p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Checklist layout">
              <button type="button" role="tab" aria-selected={view === "list"} data-testid="task-view-list" onClick={() => onView("list")} className={tabClass(view === "list")}>List</button>
              <button type="button" role="tab" aria-selected={view === "board"} data-testid="task-view-board" onClick={() => onView("board")} className={tabClass(view === "board")}>Board</button>
            </div>
          </div>

          <div className="space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${filter === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {item.label} {counts[item.id]}
                </button>
              ))}
              <button
                type="button"
                data-testid="task-select-all"
                aria-pressed={visibleIds.length > 0 && visibleIds.every((id) => picked.includes(id))}
                onClick={() => selectIds(visibleIds)}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700"
              >
                Select all
              </button>
              <button
                type="button"
                data-testid="task-show-cleared"
                aria-pressed={showCleared}
                onClick={() => setShowCleared((current) => !current)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${showCleared ? "bg-[#0d9488] text-white" : "border border-slate-200 text-slate-600"}`}
              >
                Show cleared {cleared.length ? `(${cleared.length})` : ""}
              </button>
              {clearIds.length > 0 ? (
                <button
                  type="button"
                  data-testid="task-clear-selected"
                  onClick={() => setConfirmClear(true)}
                  className="rounded-full bg-black px-3 py-1 text-[11px] font-semibold text-white"
                >
                  Clear selected ({clearIds.length})
                </button>
              ) : null}
              {restoreIds.length > 0 ? (
                <button
                  type="button"
                  data-testid="task-restore-selected"
                  onClick={() => {
                    onRestore(restoreIds);
                    setPicked((current) => current.filter((id) => !restoreIds.includes(id)));
                  }}
                  className="rounded-full border border-[#0d9488] px-3 py-1 text-[11px] font-semibold text-[#0d9488]"
                >
                  Restore selected ({restoreIds.length})
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tasks, orders or conversations"
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-[#0d9488]"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                  {saved ? "Manual order · saved" : "Manual order"}
                </span>
                <button
                  type="button"
                  data-testid="task-priority-sort"
                  aria-pressed={prioritySort}
                  onClick={() => setPrioritySort((current) => !current)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600"
                >
                  Priority sort {prioritySort ? "ON" : "OFF"}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              {prioritySort
                ? "Priority sort is a view. It does not change the saved queue."
                : "Drag to reorder the saved queue. Change a stage to move the work."}
            </p>
            {adding ? (
              <AddTaskForm
                staff={staff}
                onCancel={() => setAdding(false)}
                onCreate={(input) => {
                  onCreate(input);
                  setAdding(false);
                }}
              />
            ) : null}
          </div>

          {visible.length === 0 ? (
            <p className="px-4 pb-6 text-sm text-slate-500">No tasks in this view.</p>
          ) : view === "list" ? (
            <TaskList
              sample={sample}
              tasks={visible}
              staff={staff}
              today={today}
              selectedId={selected?.id || null}
              prioritySort={prioritySort}
              picked={picked}
              dropId={dropTarget?.id || ""}
              onSelect={choose}
              onToggle={onToggle}
              onTogglePick={togglePick}
              onDelete={onDelete}
              onRestore={onRestore}
              onAssign={onAssign}
              onPriority={onPriority}
              onDue={onDue}
              onStage={onStage}
              onDragStart={startPointerDrag}
            />
          ) : (
            <TaskBoard
              sample={sample}
              tasks={visible}
              today={today}
              selectedId={selected?.id || null}
              picked={picked}
              dropTarget={dropTarget}
              onSelect={choose}
              onTogglePick={togglePick}
              onSelectColumn={(ids) => selectIds(ids)}
              onDragStart={startPointerDrag}
              prioritySort={prioritySort}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-[#0d9488]">
              + Add a task to this queue
            </button>
            <span className="text-[11px] text-slate-400">
              {sample ? `${tasks.length} sample tasks` : `${tasks.length} tasks`}
            </span>
          </div>
        </section>

        <TaskDetail
          task={selected}
          staff={staff}
          today={today}
          onClose={() => setHiddenDetail(true)}
          onAssign={onAssign}
          onPriority={onPriority}
          onDue={onDue}
          onStage={onStage}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function TaskList({
  sample,
  tasks,
  staff,
  today,
  selectedId,
  prioritySort,
  picked,
  dropId,
  onSelect,
  onToggle,
  onTogglePick,
  onDelete,
  onRestore,
  onAssign,
  onPriority,
  onDue,
  onStage,
  onDragStart,
}: {
  sample: boolean;
  tasks: TaskBoardTask[];
  staff: TaskAssignee[];
  today: string;
  selectedId: string | null;
  prioritySort: boolean;
  picked: string[];
  dropId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onTogglePick: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string[]) => void;
  onAssign: (id: string, assignee: TaskAssignee | null) => void;
  onPriority: (id: string, priority: TaskPriority) => void;
  onDue: (id: string, dueOn: string | null) => void;
  onStage: (id: string, stage: TaskStage) => void;
  onDragStart: (event: ReactPointerEvent, task: TaskBoardTask) => void;
}) {
  return (
    <div data-testid="task-list">
      <div className="hidden grid-cols-[28px_28px_28px_minmax(0,1.5fr)_132px_88px_88px_118px_32px] gap-2 px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:grid">
        <span />
        <span />
        <span />
        <span>Task / source</span>
        <span>Assignee</span>
        <span>Priority</span>
        <span>Due</span>
        <span>Stage</span>
        <span />
      </div>
      <ul className="divide-y divide-slate-100">
        {tasks.map((task) => {
          const selected = task.id === selectedId;
          const done = task.status === "done";
          const landing = dropId === task.id;
          return (
            <li
              key={task.id}
              data-testid="task-row"
              data-task-id={task.id}
              data-completed={done ? "true" : "false"}
              data-drop={landing ? "true" : "false"}
              data-cleared={task.dismissed ? "true" : "false"}
              style={{ touchAction: "pan-y" }}
              className={`px-3 py-2.5 md:px-4 ${selected ? "border-l-2 border-[#0d9488] bg-[#f0fdfa]" : "border-l-2 border-transparent"} ${landing ? "mt-3" : ""} ${dragDropClass(landing)}`}
            >
              <div className="grid grid-cols-[24px_24px_24px_minmax(0,1fr)_auto] items-start gap-2 md:grid-cols-[28px_28px_28px_minmax(0,1.5fr)_132px_88px_88px_118px_32px] md:items-center">
                <button
                  type="button"
                  data-drag-handle
                  aria-label={`Drag ${task.title}`}
                  title={prioritySort ? "Turn off priority sort to reorder the saved queue" : "Drag to reorder"}
                  onPointerDown={(event) => {
                    if (prioritySort) return;
                    onDragStart(event, task);
                  }}
                  className="mt-0.5 cursor-grab touch-none text-slate-300 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <input
                  type="checkbox"
                  checked={picked.includes(task.id)}
                  data-testid="task-select"
                  aria-label={`Select ${task.title}`}
                  onChange={() => onTogglePick(task.id)}
                  className="mt-0.5 h-4 w-4 accent-slate-900"
                />
                <input
                  type="checkbox"
                  checked={done}
                  data-testid="task-complete"
                  aria-label={done ? `Mark ${task.title} open` : `Mark ${task.title} complete`}
                  onChange={() => onToggle(task.id)}
                  className="mt-0.5 h-4 w-4 accent-[#0d9488]"
                />
                <button type="button" onClick={() => onSelect(task.id)} className="min-w-0 text-left">
                  <span className={`block text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`} data-testid="task-title">
                    {task.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-slate-400">
                    <span>{task.sourceLine}</span>
                    {task.dismissed ? <span className="font-semibold text-amber-700">Cleared</span> : null}
                    {task.primaryHref && task.primaryHrefLabel ? (
                        <Link to={keepSample(task.primaryHref, sample)} data-testid="task-link" className="whitespace-nowrap font-semibold text-[#0d9488] hover:underline" onClick={(event) => event.stopPropagation()}>
                        {task.primaryHrefLabel}
                      </Link>
                    ) : null}
                  </span>
                </button>
                <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:contents">
                  <AssigneeSelect task={task} staff={staff} onAssign={onAssign} />
                  <PrioritySelect task={task} onPriority={onPriority} />
                  <DueField task={task} today={today} onDue={onDue} />
                  <StageSelect task={task} onStage={onStage} />
                </div>
                {task.dismissed ? (
                  <button type="button" aria-label={`Restore ${task.title}`} onClick={() => onRestore([task.id])} className="text-[10px] font-bold text-[#0d9488]">Restore</button>
                ) : (
                  <button type="button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task.id)} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TaskBoard({
  sample,
  tasks,
  today,
  selectedId,
  picked,
  dropTarget,
  prioritySort,
  onSelect,
  onTogglePick,
  onSelectColumn,
  onDragStart,
}: {
  sample: boolean;
  tasks: TaskBoardTask[];
  today: string;
  selectedId: string | null;
  picked: string[];
  dropTarget: { id: string; column: string } | null;
  prioritySort: boolean;
  onSelect: (id: string) => void;
  onTogglePick: (id: string) => void;
  onSelectColumn: (ids: string[]) => void;
  onDragStart: (event: ReactPointerEvent, task: TaskBoardTask) => void;
}) {
  return (
    <div data-testid="task-board-columns" className="grid grid-cols-1 gap-3 px-3 pb-4 sm:grid-cols-2 xl:grid-cols-5">
      {TASK_STAGES.map((stage) => {
        const column = tasks.filter((task) => columnStage(task) === stage);
        const columnIds = column.map((task) => task.id);
        const columnHot = Boolean(dropTarget && dropTarget.column === stage);
        return (
          <section
            key={stage}
            aria-label={TASK_STAGE_LABEL[stage]}
            data-task-column={stage}
            data-drop={columnHot ? "true" : "false"}
            className={`min-w-0 rounded-xl bg-slate-50 p-2 ${columnHot && !dropTarget?.id ? dragDropClass(true) : ""}`}
          >
            <header className="mb-2 flex items-center justify-between gap-2 px-1">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{TASK_STAGE_LABEL[stage]}</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`task-select-column-${stage}`}
                  onClick={() => onSelectColumn(columnIds)}
                  className="text-[10px] font-semibold text-slate-500"
                >
                  {columnIds.length > 0 && columnIds.every((id) => picked.includes(id)) ? "Clear" : "Select all"}
                </button>
                <span className="text-[11px] font-semibold text-slate-400">{column.length}</span>
              </div>
            </header>
            <div className="space-y-2">
              {column.length === 0 ? <p className="px-1 py-3 text-[11px] text-slate-400">Nothing in this stage.</p> : null}
              {column.map((task) => {
                const landing = dropTarget?.id === task.id;
                return (
                  <article
                    key={task.id}
                    data-testid="task-card"
                    data-task-id={task.id}
                    data-completed={task.status === "done" ? "true" : "false"}
                    data-drop={landing ? "true" : "false"}
                    onPointerDown={(event) => onDragStart(event, task)}
                    onClick={() => onSelect(task.id)}
                    style={{ touchAction: "none" }}
                    className={`cursor-pointer rounded-xl border bg-white p-3 shadow-sm ${task.id === selectedId ? "border-[#0d9488]" : "border-slate-200"} ${landing ? "mt-3" : ""} ${dragDropClass(landing)} ${prioritySort ? "" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <input
                        type="checkbox"
                        checked={picked.includes(task.id)}
                        data-testid="task-select"
                        aria-label={`Select ${task.title}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => onTogglePick(task.id)}
                        className="h-4 w-4 accent-slate-900"
                      />
                      {task.dismissed ? <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Cleared</span> : null}
                    </div>
                    <p className={`break-words text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"}`} data-testid="task-title">{task.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{task.sourceLine}</p>
                    {task.primaryHref && task.primaryHrefLabel ? (
                      <Link to={keepSample(task.primaryHref, sample)} data-testid="task-link" className="mt-1 inline-block text-[11px] font-semibold text-[#0d9488]" onClick={(event) => event.stopPropagation()}>
                        {task.primaryHrefLabel}
                      </Link>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                      <span data-testid="task-assignee" className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{shortName(task.assigneeName) || "Unassigned"}</span>
                      <span className={priorityClass(task.priority)}>{TASK_PRIORITY_LABEL[task.priority]}</span>
                      <span className={isOverdue(task, today) ? "text-red-600" : "text-slate-400"}>{dueLabel(task.dueOn, task.status, today)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskDetail({
  task,
  staff,
  today,
  onClose,
  onAssign,
  onPriority,
  onDue,
  onStage,
  onDelete,
}: {
  task: TaskBoardTask | null;
  staff: TaskAssignee[];
  today: string;
  onClose: () => void;
  onAssign: (id: string, assignee: TaskAssignee | null) => void;
  onPriority: (id: string, priority: TaskPriority) => void;
  onDue: (id: string, dueOn: string | null) => void;
  onStage: (id: string, stage: TaskStage) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside data-testid="task-detail" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Task details</p>
        <button type="button" aria-label="Close details" onClick={onClose} className="text-slate-400">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!task ? (
        <p className="text-sm text-slate-500">Select a task.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{originLabel(task)}</span>
            {task.sample ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Sample</span> : null}
          </div>
          <div>
            <h3 className={`text-lg font-semibold ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-950"}`}>{task.title}</h3>
            {task.orderLabel ? <p className="text-xs text-slate-400">Order {task.orderLabel}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Assignee
              <AssigneeSelect task={task} staff={staff} onAssign={onAssign} block />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Priority
              <PrioritySelect task={task} onPriority={onPriority} block />
            </label>
          </div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Due
            <input
              type="date"
              value={task.dueOn || ""}
              aria-label={`Due date for ${task.title}`}
              onChange={(event) => onDue(task.id, event.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700"
            />
            <span className={`mt-1 block normal-case tracking-normal ${isOverdue(task, today) ? "text-red-600" : "text-slate-400"}`}>
              {dueLabel(task.dueOn, task.status, today)}
            </span>
          </label>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Related work</p>
            <RelatedRow label={task.orderLabel ? `Order ${task.orderLabel}` : "Order"} href={task.orderHref} linkLabel="Open order" />
            <RelatedRow label={task.galleryLabel || "Gallery"} href={task.galleryHref} linkLabel="Open gallery" />
            <RelatedRow label={task.deliveryLabel || "Delivery"} href={task.deliveryHref} linkLabel="Open delivery" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Client request {task.sample ? "· sample" : ""}
            </p>
            {task.clientRequest ? (
              <blockquote className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                “{task.clientRequest}”
                <footer className="mt-2 text-[10px] text-slate-400">
                  {[task.clientRequestFrom || (task.sample ? "Sample client" : ""), requestWhen(task.clientRequestAt)].filter(Boolean).join(" · ")}
                </footer>
              </blockquote>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No client request on this task.</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Production progress</p>
            <ol className="mt-3 flex items-center justify-between gap-1">
              {TASK_TRACK.map((step, index) => {
                const current = columnStage(task) === step.stage;
                const reached = TASK_STAGES.indexOf(columnStage(task)) >= index;
                return (
                  <li key={step.stage} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move to ${step.label}`}
                      aria-current={current ? "step" : undefined}
                      onClick={() => onStage(task.id, step.stage)}
                      className={`h-2.5 w-2.5 rounded-full ${reached ? "bg-[#0d9488]" : "bg-slate-200"} ${current ? "ring-2 ring-[#0d9488]/30" : ""}`}
                    />
                    <span className={`text-center text-[9px] font-semibold ${current ? "text-slate-900" : "text-slate-400"}`}>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Activity {task.activity.some((entry) => entry.sample) ? "· sample" : ""}
            </p>
            {task.activity.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No activity recorded yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {task.activity.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-[11px] text-slate-500">
                    <span className="text-slate-400">{requestWhen(entry.at) || "Recorded"}</span>
                    {" · "}
                    {entry.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Delete removes this task only. The order, gallery, and delivery stay.</p>
          <button type="button" onClick={() => onDelete(task.id)} className="text-xs font-semibold text-red-600">
            Delete task
          </button>
        </div>
      )}
    </aside>
  );
}

function AddTaskForm({
  staff,
  onCancel,
  onCreate,
}: {
  staff: TaskAssignee[];
  onCancel: () => void;
  onCreate: (input: { title: string; assignee: TaskAssignee | null; priority: TaskPriority; dueOn: string | null; stage: TaskStage }) => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueOn, setDueOn] = useState("");
  const [stage, setStage] = useState<TaskStage>("queued");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Add a task title.");
      return;
    }
    onCreate({
      title,
      assignee: staff.find((person) => person.id === assigneeId) || null,
      priority,
      dueOn: dueOn || null,
      stage,
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-5">
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Task title"
        aria-label="Manual task title"
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs md:col-span-2"
      />
      <select aria-label="Manual task assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
        <option value="">Unassigned</option>
        {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
      <select aria-label="Manual task priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
        {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{TASK_PRIORITY_LABEL[item]}</option>)}
      </select>
      <input type="date" aria-label="Manual task due date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
      <select aria-label="Manual task stage" value={stage} onChange={(event) => setStage(event.target.value as TaskStage)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
        {TASK_STAGES.map((item) => <option key={item} value={item}>{TASK_STAGE_LABEL[item]}</option>)}
      </select>
      <div className="flex items-center gap-2 md:col-span-5">
        <button type="submit" className="rounded-lg bg-[#0d9488] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white">Add task</button>
        <button type="button" onClick={onCancel} className="text-[11px] font-semibold text-slate-500">Cancel</button>
        {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
      </div>
    </form>
  );
}

function Stat({
  testId,
  label,
  value,
  detail,
  tone,
}: {
  testId: string;
  label: string;
  value: number | null;
  detail: string;
  tone: "slate" | "teal" | "green" | "red";
}) {
  const color = tone === "teal" ? "text-[#0d9488]" : tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-slate-900";
  return (
    <article data-testid={testId} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value == null ? "—" : value}</p>
      <p className="text-[11px] text-slate-400">{detail}</p>
    </article>
  );
}

function AssigneeSelect({
  task,
  staff,
  onAssign,
  block = false,
}: {
  task: TaskBoardTask;
  staff: TaskAssignee[];
  onAssign: (id: string, assignee: TaskAssignee | null) => void;
  block?: boolean;
}) {
  const known = staff.some((person) => person.id === task.assigneeId);
  return (
    <select
      aria-label={`Assignee for ${task.title}`}
      data-testid="task-assignee"
      value={task.assigneeId || ""}
      onChange={(event) => onAssign(task.id, staff.find((person) => person.id === event.target.value) || null)}
      className={`${block ? "mt-1 w-full" : ""} max-w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-200`}
    >
      <option value="">Unassigned</option>
      {!known && task.assigneeId ? <option value={task.assigneeId}>{task.assigneeName || "Assigned"}</option> : null}
      {staff.map((person) => <option key={person.id} value={person.id}>{shortName(person.name) || person.name}</option>)}
    </select>
  );
}

function PrioritySelect({
  task,
  onPriority,
  block = false,
}: {
  task: TaskBoardTask;
  onPriority: (id: string, priority: TaskPriority) => void;
  block?: boolean;
}) {
  return (
    <select
      aria-label={`Priority for ${task.title}`}
      value={task.priority}
      onChange={(event) => onPriority(task.id, event.target.value as TaskPriority)}
      className={`${block ? "mt-1 w-full" : ""} rounded-full border-0 px-2 py-1 text-[10px] font-bold ${priorityClass(task.priority)}`}
    >
      {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{TASK_PRIORITY_LABEL[item]}</option>)}
    </select>
  );
}

function DueField({
  task,
  today,
  onDue,
}: {
  task: TaskBoardTask;
  today: string;
  onDue: (id: string, dueOn: string | null) => void;
}) {
  const label = dueLabel(task.dueOn, task.status, today);
  return (
    <label className={`relative text-[11px] font-semibold ${label === "Overdue" ? "text-red-600" : "text-slate-500"}`}>
      <span>{label}</span>
      <input
        type="date"
        value={task.dueOn || ""}
        aria-label={`Due date for ${task.title}`}
        onChange={(event) => onDue(task.id, event.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function StageSelect({ task, onStage }: { task: TaskBoardTask; onStage: (id: string, stage: TaskStage) => void }) {
  const stage = columnStage(task);
  return (
    <select
      aria-label={`Stage for ${task.title}`}
      value={stage}
      onChange={(event) => onStage(task.id, event.target.value as TaskStage)}
      className={`rounded-full border-0 px-2 py-1 text-[10px] font-bold ${stageClass(stage)}`}
    >
      {TASK_STAGES.map((item) => <option key={item} value={item}>{TASK_STAGE_LABEL[item]}</option>)}
    </select>
  );
}

function RelatedRow({ label, href, linkLabel }: { label: string; href: string | null; linkLabel: string }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-slate-600">{label}</span>
      {href ? (
        <Link to={href} className="shrink-0 font-semibold text-[#0d9488]">{linkLabel}</Link>
      ) : (
        <span className="shrink-0 text-slate-300">Not linked</span>
      )}
    </div>
  );
}

function tabClass(active: boolean): string {
  return `rounded-md px-3 py-1 text-[11px] font-semibold ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`;
}

function priorityClass(priority: TaskPriority): string {
  if (priority === "urgent") return "bg-rose-50 text-rose-700";
  if (priority === "high") return "bg-amber-50 text-amber-700";
  if (priority === "low") return "bg-slate-50 text-slate-500";
  return "bg-slate-100 text-slate-600";
}

function stageClass(stage: TaskStage): string {
  if (stage === "production") return "bg-sky-50 text-sky-700";
  if (stage === "review") return "bg-violet-50 text-violet-700";
  if (stage === "ready" || stage === "delivered") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function originLabel(task: TaskBoardTask): string {
  if (task.origin === "edit") return "Edit request";
  if (task.origin === "question") return "Client question";
  if (task.origin === "email") return "Email";
  if (task.origin === "delivery") return "Delivery";
  if (task.origin === "production") return "Production";
  if (task.origin === "manual") return "Manual";
  return "Order";
}

function keepSample(href: string, sample: boolean): string {
  if (!sample) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("sample", "1");
  return `${path}?${params.toString()}`;
}

function requestWhen(at: string | null): string {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} CT`;
}

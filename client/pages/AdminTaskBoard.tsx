/**
 * Admin task board.
 * Reads orders, deliveries, edits, and client questions.
 * Writes taskBoardItems only. Does not email or text anyone.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { TaskBoardView } from "@/components/taskBoard/TaskBoardView";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import type { ContactThreadView } from "@shared/contactThread";
import { disconnectedInboundEmailAdapter } from "@shared/inboundEmail";
import {
  TASK_BOARD_COLLECTION,
  buildTaskBoard,
  chicagoToday,
  createManualTask,
  readTaskAssignees,
  readTaskBoardOverlay,
  reorderTasks,
  sampleTaskBoard,
  taskBoardDocId,
  taskRemovalWrite,
  taskToOverlay,
  withAssignee,
  withDue,
  withPriority,
  withStage,
  withToggled,
  withoutTask,
  type TaskAssignee,
  type TaskBoardOverlay,
  type TaskBoardTask,
  type TaskPriority,
  type TaskStage,
} from "@shared/taskBoard";

const emailAdapter = disconnectedInboundEmailAdapter();

export default function AdminTaskBoard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const sample = params.get("sample") === "1";
  const view = params.get("view") === "board" ? "board" : "list";
  const today = chicagoToday();
  const sampleModel = useMemo(() => sampleTaskBoard(today), [today]);

  const [orderRequests, setOrderRequests] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [galleries, setGalleries] = useState<Array<Record<string, unknown>>>([]);
  const [listings, setListings] = useState<Array<Record<string, unknown>>>([]);
  const [editRequests, setEditRequests] = useState<Array<Record<string, unknown>>>([]);
  const [messages, setMessages] = useState<Array<Record<string, unknown>>>([]);
  const [threads, setThreads] = useState<ContactThreadView[]>([]);
  const [staff, setStaff] = useState<TaskAssignee[]>([]);
  const [overlays, setOverlays] = useState<TaskBoardOverlay[]>([]);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(!sample);
  const [draft, setDraft] = useState<TaskBoardTask[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const live = useMemo(() => buildTaskBoard({
    orderRequests,
    orders,
    galleries,
    listings,
    editRequests,
    messages,
    contactThreads: threads,
    emails: emailAdapter.list(),
    emailConnected: emailAdapter.connected,
    staff,
    overlays,
  }), [orderRequests, orders, galleries, listings, editRequests, messages, threads, staff, overlays]);

  const model = sample ? sampleModel : live;
  const tasks = draft ?? model.tasks;

  useEffect(() => {
    setDraft(null);
  }, [model]);

  useEffect(() => {
    if (sample) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const errors: string[] = [];
    const pending = new Set(["requests", "orders", "galleries", "listings", "edits", "messages", "staff", "tasks"]);
    const note = (name: string, message: string) => {
      errors.push(message);
      setSourceErrors([...errors]);
      pending.delete(name);
      if (pending.size === 0) setLoading(false);
    };
    const ready = (name: string) => {
      pending.delete(name);
      if (pending.size === 0) setLoading(false);
    };
    const watch = (
      name: string,
      ref: ReturnType<typeof collection> | ReturnType<typeof query>,
      apply: (rows: Array<Record<string, unknown>>) => void,
      failure: string,
    ) => onSnapshot(ref, (snap) => {
      apply(snap.docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) })));
      ready(name);
    }, () => note(name, failure));

    const unsubscribers = [
      watch("requests", collection(db, "orderRequests"), setOrderRequests, "Orders could not be loaded."),
      watch("orders", collection(db, "orders"), setOrders, "The orders collection could not be loaded."),
      watch("galleries", collection(db, "galleries"), setGalleries, "Galleries could not be loaded."),
      watch("listings", collection(db, "listings"), setListings, "Projects could not be loaded."),
      watch("edits", collection(db, "editRequests"), setEditRequests, "Edit requests could not be loaded."),
      watch("messages", query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(200)), setMessages, "Recent messages could not be loaded."),
      watch("staff", collection(db, "staff"), (rows) => setStaff(readTaskAssignees(rows)), "The team list could not be loaded."),
      watch("tasks", collection(db, TASK_BOARD_COLLECTION), (rows) => {
        setOverlays(rows.map((row) => readTaskBoardOverlay(String(row.id), row)).filter((row): row is TaskBoardOverlay => Boolean(row)));
      }, "Saved tasks could not be loaded."),
    ];
    return () => {
      unsubscribers.forEach((stop) => stop());
    };
  }, [sample]);

  useEffect(() => {
    if (sample || !user) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/contact/staff/threads", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Contact chats could not be loaded.");
        if (!cancelled) setThreads(Array.isArray(body.threads) ? body.threads : []);
      } catch (error) {
        if (!cancelled) {
          setThreads([]);
          setSourceErrors((current) => [...current, error instanceof Error ? error.message : "Contact chats could not be loaded."]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sample, user]);

  const commit = (next: TaskBoardTask[], removed: TaskBoardTask | null = null) => {
    setDraft(next);
    if (sample) return;
    void persist(tasks, next, removed);
  };

  const setView = (next: "list" | "board") => {
    const updated = new URLSearchParams(params);
    if (next === "board") updated.set("view", "board");
    else updated.delete("view");
    setParams(updated, { replace: true });
  };

  return (
    <AdminLayout title="Task board">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {sample
            ? "These rows are sample data so the layout can be reviewed. They are not live orders."
            : "Live tasks come from orders, deliveries, edits, and messages."}
        </p>
        <Link to={sample ? "/admin/tasks" : "/admin/tasks?sample=1"} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">
          {sample ? "Live tasks" : "View sample"}
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
        </div>
      ) : (
        <TaskBoardView
          tasks={tasks}
          staff={sample ? sampleModel.staff : staff}
          today={today}
          meId={user?.uid || null}
          sample={sample}
          emailNotice={model.emailNotice}
          sourceErrors={sample ? [] : sourceErrors}
          view={view}
          selectedId={selectedId}
          onView={setView}
          onSelect={setSelectedId}
          onToggle={(id) => commit(withToggled(tasks, id, stamp()))}
          onDelete={(id) => {
            const result = withoutTask(tasks, id);
            commit(result.tasks, result.removed);
            toast(result.removed?.manual ? "Task deleted." : "Removed from the board. The order stays.");
          }}
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
              sample,
              sort: nextSort(tasks),
              at: stamp(),
            });
            if (created.ok === false) {
              toast.error(created.error);
              return;
            }
            commit([...tasks, created.task]);
            setSelectedId(created.task.id);
            toast("Task added.");
          }}
        />
      )}
    </AdminLayout>
  );
}

function stamp(): string {
  return new Date().toISOString();
}

function nextSort(tasks: TaskBoardTask[]): number {
  const numbers = tasks.map((task) => task.sort).filter((sort): sort is number => sort != null);
  if (numbers.length === 0) return 10;
  return Math.min(...numbers) - 10;
}

async function persist(previous: TaskBoardTask[], next: TaskBoardTask[], removed: TaskBoardTask | null) {
  const previousJson = new Map(previous.map((task) => [task.id, JSON.stringify(task)]));
  const changed = next.filter((task) => previousJson.get(task.id) !== JSON.stringify(task));
  try {
    if (removed) {
      const write = taskRemovalWrite(removed);
      const ref = doc(db, write.collection, write.id);
      if (write.deleteDoc) await deleteDoc(ref);
      else {
        await setDoc(ref, {
          ...taskToOverlay({ ...removed, dismissed: true }),
          dismissed: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    }
    await Promise.all(changed.map(async (task) => {
      const ref = doc(db, TASK_BOARD_COLLECTION, taskBoardDocId(task.id));
      const created = previousJson.has(task.id) ? {} : { createdAt: serverTimestamp() };
      await setDoc(ref, {
        ...taskToOverlay(task),
        ...created,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }));
  } catch (error) {
    console.error("[TaskBoard] Save failed.", error);
    toast.error("Could not save the task board.");
  }
}

export type { TaskPriority, TaskStage };

/**
 * One task list for the checklist and the content workspace.
 * Writes taskBoardItems, and the assignee unread counter when someone else is assigned.
 * Does not email or text anyone.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { bumpTaskAssignments } from "@/lib/adminUnreadStore";
import { newlyAssignedStaffIds } from "@shared/adminUnread";
import type { ContactThreadView } from "@shared/contactThread";
import {
  PHOTOS_INBOX_PREREQUISITES,
  photosInboxNotice,
  type InboundClientEmail,
} from "@shared/inboundEmail";
import { sampleEventPlanTasks } from "@shared/officeEvents";
import {
  TASK_BOARD_BATCH_LIMIT,
  TASK_BOARD_COLLECTION,
  buildTaskBoard,
  chicagoToday,
  chunkItems,
  describeTaskBoardSaveError,
  readTaskAssignees,
  readTaskBoardOverlay,
  sampleTaskBoard,
  taskBoardDocId,
  taskBoardWriteData,
  type TaskAssignee,
  type TaskBoardOverlay,
  type TaskBoardRemoval,
  type TaskBoardTask,
} from "@shared/taskBoard";

const SAMPLE_DRAFT_KEY = "iconic-task-board-sample-v2";

export function useTaskBoardData() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const sample = params.get("sample") === "1";
  const today = chicagoToday();
  const sampleModel = useMemo(() => {
    const board = sampleTaskBoard(today);
    return { ...board, tasks: [...board.tasks, ...sampleEventPlanTasks(today)] };
  }, [today]);
  const [orderRequests, setOrderRequests] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [galleries, setGalleries] = useState<Array<Record<string, unknown>>>([]);
  const [listings, setListings] = useState<Array<Record<string, unknown>>>([]);
  const [editRequests, setEditRequests] = useState<Array<Record<string, unknown>>>([]);
  const [messages, setMessages] = useState<Array<Record<string, unknown>>>([]);
  const [threads, setThreads] = useState<ContactThreadView[]>([]);
  const [emails, setEmails] = useState<InboundClientEmail[]>([]);
  const [emailConnected, setEmailConnected] = useState(false);
  const [inboxPrerequisites, setInboxPrerequisites] = useState<string[]>([...PHOTOS_INBOX_PREREQUISITES]);
  const [staff, setStaff] = useState<TaskAssignee[]>([]);
  const [overlays, setOverlays] = useState<TaskBoardOverlay[]>([]);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(!sample);
  const [draft, setDraft] = useState<TaskBoardTask[] | null>(() => (sample ? readSampleDraft()?.tasks ?? null : null));
  const [clearedDraft, setClearedDraft] = useState<TaskBoardTask[] | null>(() => (sample ? readSampleDraft()?.cleared ?? null : null));
  const saveGeneration = useRef(0);

  const live = useMemo(() => buildTaskBoard({
    orderRequests,
    orders,
    galleries,
    listings,
    editRequests,
    messages,
    contactThreads: threads,
    emails,
    emailConnected,
    staff,
    overlays,
  }), [orderRequests, orders, galleries, listings, editRequests, messages, threads, emails, emailConnected, staff, overlays]);

  const model = sample ? sampleModel : live;
  const tasks = draft ?? model.tasks;
  const cleared = clearedDraft ?? model.cleared;

  useEffect(() => {
    if (sample) return;
    setDraft(null);
    setClearedDraft(null);
  }, [model, sample]);

  useEffect(() => {
    if (sample) {
      setLoading(false);
      setEmailConnected(false);
      setEmails([]);
      setInboxPrerequisites([...PHOTOS_INBOX_PREREQUISITES]);
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
        const response = await fetch("/api/contact/staff/threads", { headers: { Authorization: `Bearer ${token}` } });
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

  useEffect(() => {
    if (sample || !user) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/task-board/inbox", { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "photos@ could not be checked.");
        if (cancelled) return;
        setEmailConnected(body.connected === true);
        setEmails(Array.isArray(body.messages) ? body.messages : []);
        setInboxPrerequisites(Array.isArray(body.prerequisites) ? body.prerequisites : []);
      } catch {
        if (!cancelled) {
          setEmailConnected(false);
          setEmails([]);
          setInboxPrerequisites([...PHOTOS_INBOX_PREREQUISITES]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sample, user]);

  const commit = (next: TaskBoardTask[], removed: TaskBoardRemoval[] = []) => {
    const nextIds = new Set(next.map((task) => task.id));
    const deletedIds = new Set(removed.filter((item) => item.mode === "delete").map((item) => item.task.id));
    const clearedById = new Map<string, TaskBoardTask>();
    for (const task of cleared) {
      if (nextIds.has(task.id) || deletedIds.has(task.id)) continue;
      clearedById.set(task.id, task);
    }
    for (const item of removed) {
      if (item.mode !== "clear" || nextIds.has(item.task.id)) continue;
      clearedById.set(item.task.id, { ...item.task, dismissed: true });
    }
    const clearedAfter = [...clearedById.values()];
    setDraft(next);
    setClearedDraft(clearedAfter);
    if (sample) {
      writeSampleDraft(next, clearedAfter);
      return;
    }
    const generation = ++saveGeneration.current;
    const previous = tasks;
    void persist(user, previous, next, removed).then((ok) => {
      if (!ok && saveGeneration.current === generation) {
        setDraft(null);
        setClearedDraft(null);
      }
    });
  };

  return {
    sample,
    today,
    meId: user?.uid || null,
    user,
    loading,
    tasks,
    cleared,
    staff: sample ? sampleModel.staff : staff,
    emailNotice: sample ? photosInboxNotice(false) : model.emailNotice,
    inboxPrerequisites: sample || emailConnected ? [] : inboxPrerequisites,
    sourceErrors: sample ? [] : sourceErrors,
    commit,
  };
}

function readSampleDraft(): { tasks: TaskBoardTask[]; cleared: TaskBoardTask[] } | null {
  try {
    const raw = sessionStorage.getItem(SAMPLE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskBoardTask[] | { tasks?: TaskBoardTask[]; cleared?: TaskBoardTask[] };
    if (Array.isArray(parsed)) return { tasks: parsed, cleared: [] };
    if (parsed && Array.isArray(parsed.tasks)) {
      return { tasks: parsed.tasks, cleared: Array.isArray(parsed.cleared) ? parsed.cleared : [] };
    }
    return null;
  } catch {
    return null;
  }
}

function writeSampleDraft(tasks: TaskBoardTask[], cleared: TaskBoardTask[]) {
  try {
    sessionStorage.setItem(SAMPLE_DRAFT_KEY, JSON.stringify({ tasks, cleared }));
  } catch {
    /* The sample still updates in this view. */
  }
}

type BoardWrite =
  | { kind: "delete"; id: string }
  | { kind: "set"; id: string; data: Record<string, unknown> };

async function persist(user: User | null, previous: TaskBoardTask[], next: TaskBoardTask[], removed: TaskBoardRemoval[]): Promise<boolean> {
  const previousJson = new Map(previous.map((task) => [task.id, JSON.stringify(task)]));
  const changed = next.filter((task) => previousJson.get(task.id) !== JSON.stringify(task));
  const writes: BoardWrite[] = [];
  for (const item of removed) {
    const id = taskBoardDocId(item.task.id);
    if (item.mode === "delete" && item.task.manual) {
      writes.push({ kind: "delete", id });
      continue;
    }
    writes.push({
      kind: "set",
      id,
      data: {
        ...taskBoardWriteData({ ...item.task, dismissed: true }),
        dismissed: true,
        updatedAt: serverTimestamp(),
      },
    });
  }
  for (const task of changed) {
    writes.push({
      kind: "set",
      id: taskBoardDocId(task.id),
      data: {
        ...taskBoardWriteData(task),
        ...(previousJson.has(task.id) ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
    });
  }
  if (writes.length === 0) return true;
  try {
    await assertStaffToken(user);
    const batches = chunkItems(writes, TASK_BOARD_BATCH_LIMIT);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = writeBatch(db);
      for (const write of batches[index]) {
        const ref = doc(db, TASK_BOARD_COLLECTION, write.id);
        if (write.kind === "delete") batch.delete(ref);
        else batch.set(ref, write.data, { merge: true });
      }
      try {
        await batch.commit();
      } catch (error) {
        const described = describeTaskBoardSaveError(error);
        console.error(`[TaskBoard] Save failed (${described.code}) on batch ${index + 1} of ${batches.length}.`, error);
        toast.error(`Could not save the task board. ${described.summary}`);
        return false;
      }
    }
    const assigned = newlyAssignedStaffIds(previous, next, user?.uid || null);
    if (assigned.length > 0) void bumpTaskAssignments(assigned);
    return true;
  } catch (error) {
    const described = describeTaskBoardSaveError(error);
    console.error(`[TaskBoard] Save failed (${described.code}).`, error);
    toast.error(`Could not save the task board. ${described.summary}`);
    return false;
  }
}

async function assertStaffToken(user: User | null): Promise<void> {
  if (!user || !auth.currentUser || auth.currentUser.uid !== user.uid) {
    throw Object.assign(new Error("missing staff auth token"), { code: "unauthenticated" });
  }
  const token = await auth.currentUser.getIdToken();
  if (!token) throw Object.assign(new Error("missing staff auth token"), { code: "unauthenticated" });
}

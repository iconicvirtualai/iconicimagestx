/**
 * One task list for the checklist and the content workspace.
 * Writes taskBoardItems only. Does not email or text anyone.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import type { ContactThreadView } from "@shared/contactThread";
import {
  PHOTOS_INBOX_PREREQUISITES,
  photosInboxNotice,
  type InboundClientEmail,
} from "@shared/inboundEmail";
import {
  TASK_BOARD_COLLECTION,
  buildTaskBoard,
  chicagoToday,
  readTaskAssignees,
  readTaskBoardOverlay,
  sampleTaskBoard,
  taskBoardDocId,
  taskRemovalWrite,
  taskToOverlay,
  type TaskAssignee,
  type TaskBoardOverlay,
  type TaskBoardTask,
} from "@shared/taskBoard";

const SAMPLE_DRAFT_KEY = "iconic-task-board-sample-v2";

export function useTaskBoardData() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const sample = params.get("sample") === "1";
  const today = chicagoToday();
  const sampleModel = useMemo(() => sampleTaskBoard(today), [today]);
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
  const [draft, setDraft] = useState<TaskBoardTask[] | null>(() => (sample ? readSampleDraft() : null));

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

  useEffect(() => {
    if (sample) return;
    setDraft(null);
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

  const commit = (next: TaskBoardTask[], removed: TaskBoardTask | null = null) => {
    setDraft(next);
    if (sample) {
      writeSampleDraft(next);
      return;
    }
    void persist(tasks, next, removed);
  };

  return {
    sample,
    today,
    meId: user?.uid || null,
    user,
    loading,
    tasks,
    staff: sample ? sampleModel.staff : staff,
    emailNotice: sample ? photosInboxNotice(false) : model.emailNotice,
    inboxPrerequisites: sample || emailConnected ? [] : inboxPrerequisites,
    sourceErrors: sample ? [] : sourceErrors,
    commit,
  };
}

function readSampleDraft(): TaskBoardTask[] | null {
  try {
    const raw = sessionStorage.getItem(SAMPLE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskBoardTask[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSampleDraft(tasks: TaskBoardTask[]) {
  try {
    sessionStorage.setItem(SAMPLE_DRAFT_KEY, JSON.stringify(tasks));
  } catch {
    /* The sample still updates in this view. */
  }
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

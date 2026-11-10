import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ADMIN_UNREAD_CHANNELS_DOC,
  ADMIN_UNREAD_COUNTERS_COLLECTION,
  ADMIN_UNREAD_TASKS_DOC,
  STAFF_UNREAD_COLLECTION,
  emptyAdminUnreadCounts,
  shellUnreadTotal,
  unreadCounts,
  type AdminUnreadCounts,
  type AdminUnreadKey,
} from "@shared/adminUnread";
import { db } from "@/lib/firebase";
import { markStaffUnreadSeen } from "@/lib/adminUnreadStore";

interface AdminUnreadValue {
  counts: AdminUnreadCounts;
  total: number;
  markSeen: (key: AdminUnreadKey) => Promise<void>;
}

const EMPTY: AdminUnreadValue = {
  counts: emptyAdminUnreadCounts(),
  total: 0,
  markSeen: async () => undefined,
};

const AdminUnreadContext = createContext<AdminUnreadValue>(EMPTY);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numeric(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function AdminUnreadProvider({
  uid,
  role,
  children,
}: {
  uid: string | null;
  role: string;
  children: ReactNode;
}) {
  const enabled = (role === "admin" || role === "coordinator") && Boolean(uid);
  const [channels, setChannels] = useState<Record<string, unknown>>({});
  const [tasks, setTasks] = useState<Record<string, unknown>>({});
  const [seen, setSeen] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!enabled || !uid) return undefined;
    const stopChannels = onSnapshot(
      doc(db, ADMIN_UNREAD_COUNTERS_COLLECTION, ADMIN_UNREAD_CHANNELS_DOC),
      (snap) => setChannels(asRecord(snap.data())),
      () => setChannels({}),
    );
    const stopTasks = onSnapshot(
      doc(db, ADMIN_UNREAD_COUNTERS_COLLECTION, ADMIN_UNREAD_TASKS_DOC),
      (snap) => setTasks(asRecord(snap.data())),
      () => setTasks({}),
    );
    const stopSeen = onSnapshot(
      doc(db, STAFF_UNREAD_COLLECTION, uid),
      (snap) => setSeen(asRecord(snap.data()?.seen)),
      () => setSeen({}),
    );
    return () => {
      stopChannels();
      stopTasks();
      stopSeen();
    };
  }, [enabled, uid]);

  const counts = useMemo(
    () => unreadCounts({
      channels: channels as Partial<Record<AdminUnreadKey, unknown>>,
      taskTotals: tasks,
      seen: seen as Partial<Record<AdminUnreadKey, unknown>>,
      uid,
    }),
    [channels, tasks, seen, uid],
  );

  const markSeen = useCallback(async (key: AdminUnreadKey) => {
    if (!enabled || !uid) return;
    const current = key === "tasks" ? numeric(tasks, uid) : numeric(channels, key);
    if (numeric(seen, key) >= current) return;
    await markStaffUnreadSeen(uid, key, current);
  }, [channels, enabled, seen, tasks, uid]);

  const value = useMemo<AdminUnreadValue>(() => ({
    counts: enabled ? counts : emptyAdminUnreadCounts(),
    total: enabled ? shellUnreadTotal(counts, role) : 0,
    markSeen,
  }), [counts, enabled, markSeen, role]);

  return <AdminUnreadContext.Provider value={value}>{children}</AdminUnreadContext.Provider>;
}

export function useAdminUnread(): AdminUnreadValue {
  return useContext(AdminUnreadContext);
}

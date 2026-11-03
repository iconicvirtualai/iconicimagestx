/**
 * Staff test-data cleanup against Firestore.
 * Dry run reads. Apply writes a backup first and refuses to archive if that
 * write fails. No email, SMS, Square cancel, or client notice is sent.
 * Calendar deletes use sendUpdates "none".
 */

import admin from "firebase-admin";
import { google } from "googleapis";
import { calendarAuthFromAccount, firebaseServiceAccount } from "./apprenticeshipCalendar";
import { deleteHolidayCalendarEvent } from "./holidayCalendar";
import {
  CLEANUP_COLLECTIONS,
  applyTestDataCleanup,
  classifyTestData,
  formatCleanupPlainList,
  jsonSafeRecord,
  unarchiveTestData,
  type CleanupBackup,
  type CleanupRecord,
  type HoldCancelRequest,
} from "../../shared/testDataCleanup";

const INLINE_BACKUP_LIMIT = 700_000;

export interface CleanupHooks {
  list: () => Promise<CleanupRecord[]>;
  writeBackup: (backup: CleanupBackup) => Promise<{ location: string }>;
  readBackup: (runId: string) => Promise<CleanupBackup | null>;
  update: (collection: string, id: string, patch: Record<string, unknown>) => Promise<void>;
  replace: (collection: string, id: string, data: Record<string, unknown>) => Promise<void>;
  removeHold?: (hold: HoldCancelRequest) => Promise<void>;
}

let testHooks: CleanupHooks | null = null;

export function setTestCleanupHooks(hooks: CleanupHooks | null) {
  testHooks = hooks;
}

function testMode(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function hooks(): CleanupHooks {
  if (testHooks) return testHooks;
  if (testMode()) throw new Error("Test cleanup store was not set.");
  return firestoreHooks();
}

export async function dryRunTestData() {
  const records = await hooks().list();
  const report = classifyTestData(records);
  return {
    mode: "dry-run" as const,
    plainList: formatCleanupPlainList(report),
    matched: report.matched,
    borderline: report.borderline,
    squareInvoices: report.squareInvoices,
    archiveCount: report.archiveRecords.length,
    notificationsSent: [] as [],
  };
}

export async function applyTestData(actor: string) {
  const active = hooks();
  const records = await active.list();
  const runId = `cleanup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let location = "";
  const result = await applyTestDataCleanup({
    records,
    actor,
    runId,
    writeBackup: async (backup) => {
      const written = await active.writeBackup(backup);
      location = written.location;
    },
    update: (collection, id, patch) => active.update(collection, id, patch),
    removeHold: active.removeHold
      ? (hold) => active.removeHold!(hold)
      : (testMode() ? undefined : (hold) => removeHoldSilent(hold)),
  });
  const report = classifyTestData(records);
  return {
    ...result,
    location,
    plainList: formatCleanupPlainList(report),
    backup: result.applied ? report.backupRecords.map((record) => ({
      collection: record.collection,
      id: record.id,
      data: jsonSafeRecord(record.data),
    })) : [],
  };
}

export async function unarchiveTestDataRun(runId: string) {
  const backup = await hooks().readBackup(runId);
  if (!backup) return null;
  const restored = await unarchiveTestData({
    backup,
    replace: (collection, id, data) => hooks().replace(collection, id, data),
  });
  return { runId, ...restored };
}

export async function readCleanupBackup(runId: string) {
  return hooks().readBackup(runId);
}

async function removeHoldSilent(hold: HoldCancelRequest) {
  await deleteHolidayCalendarEvent({
    calendarId: hold.calendarId,
    eventId: hold.eventId,
    remove: async (input) => {
      if (input.sendUpdates !== "none") {
        throw new Error("Calendar hold cancel refused because sendUpdates was not none.");
      }
      const auth = calendarAuthFromAccount(firebaseServiceAccount(process.env), process.env);
      if (!auth) throw new Error("Calendar credentials are not configured.");
      const calendar = google.calendar({ version: "v3", auth });
      await calendar.events.delete({
        calendarId: input.calendarId,
        eventId: input.eventId,
        sendUpdates: "none",
      });
    },
  });
}

function firestoreHooks(): CleanupHooks {
  const db = () => admin.firestore();
  return {
    async list() {
      const batches = await Promise.all(CLEANUP_COLLECTIONS.map(async (collection) => {
        try {
          const snap = await db().collection(collection).get();
          return snap.docs.map((doc) => ({
            collection,
            id: doc.id,
            data: doc.data() as Record<string, unknown>,
          }));
        } catch (err) {
          console.error(`[test-data] Skipped ${collection}:`, err);
          return [];
        }
      }));
      return batches.flat();
    },
    async writeBackup(backup) {
      const json = JSON.stringify(backup);
      const ref = db().collection("cleanupBackups").doc(backup.runId);
      if (json.length <= INLINE_BACKUP_LIMIT) {
        await ref.set({ ...backup, stored: "firestore" });
        return { location: `firestore:cleanupBackups/${backup.runId}` };
      }
      const path = `cleanupBackups/${backup.runId}.json`;
      await admin.storage().bucket().file(path).save(json, {
        contentType: "application/json",
        resumable: false,
      });
      await ref.set({
        runId: backup.runId,
        createdAt: backup.createdAt,
        createdBy: backup.createdBy,
        stored: "storage",
        storagePath: path,
        bytes: json.length,
        squareInvoices: backup.squareInvoices,
      });
      return { location: `storage:${path}` };
    },
    async readBackup(runId) {
      const snap = await db().collection("cleanupBackups").doc(runId).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      if (data.stored === "storage" && typeof data.storagePath === "string") {
        const [buffer] = await admin.storage().bucket().file(data.storagePath).download();
        return JSON.parse(buffer.toString("utf8")) as CleanupBackup;
      }
      if (!Array.isArray(data.records)) return null;
      return data as unknown as CleanupBackup;
    },
    async update(collection, id, patch) {
      await db().collection(collection).doc(id).update(patch);
    },
    async replace(collection, id, data) {
      await db().collection(collection).doc(id).set(data);
    },
  };
}

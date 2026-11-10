import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { bumpAdminUnreadChannel, bumpAdminUnreadTasks, type AdminUnreadDb } from "./adminUnread.ts";

function fakeDb() {
  const writes: Array<{ path: string; data: Record<string, unknown>; merge?: boolean }> = [];
  const db: AdminUnreadDb = {
    collection(name) {
      return {
        doc(id) {
          return {
            async set(data, options) {
              writes.push({ path: `${name}/${id}`, data, merge: options?.merge });
            },
          };
        },
      };
    },
  };
  return { db, writes };
}

describe("admin unread counter writes", () => {
  it("merges a channel increment and ignores an empty bump", async () => {
    const { db, writes } = fakeDb();
    await bumpAdminUnreadChannel("orders", 1, db);
    await bumpAdminUnreadChannel("events", 0, db);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("adminUnreadCounters/channels");
    expect(writes[0].merge).toBe(true);
    expect(writes[0].data.orders).toBeTruthy();
  });

  it("merges task assignment increments per staff id", async () => {
    const { db, writes } = fakeDb();
    await bumpAdminUnreadTasks({ cadi: 2, "": 4 }, db);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("adminUnreadCounters/tasks");
    expect(writes[0].merge).toBe(true);
    expect(Object.keys(writes[0].data)).toEqual(["cadi"]);
  });

  it("does nothing when Firestore admin is not configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await bumpAdminUnreadChannel("chat", 1, null);
    await bumpAdminUnreadTasks({ cadi: 1 }, null);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("publishes staff-only rules for the counter docs", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const countersStart = rules.indexOf("match /adminUnreadCounters/{docId}");
    const seenStart = rules.indexOf("match /staffUnread/{uid}");
    const counters = rules.slice(countersStart, seenStart);
    const seen = rules.slice(seenStart, rules.indexOf("match /{document=**}"));
    expect(counters).toContain("allow read: if isCoordinator()");
    expect(counters).toContain("docId in ['channels', 'tasks']");
    expect(counters).not.toContain("allow read: if true");
    expect(seen).toContain("request.auth.uid == uid");
    expect(seen).toContain("allow delete: if false");
  });
});

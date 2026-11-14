import { describe, expect, it } from "vitest";
import {
  allows,
  buildOutbound,
  groupDelivery,
  matchProfileNames,
  permissionWriteBlocked,
  previewGroups,
  previewPeopleAllowed,
  previewProfiles,
  previewThreads,
  threadsForFolder,
  uniqueWrites,
  type DeskActor,
} from "./peopleProfiles.ts";

const admin: DeskActor = {
  uid: "temp-admin-uid",
  email: "temp-admin@iconicimagestx.com",
  kind: "staff",
  role: "admin",
  leadAdmin: true,
  permissions: null,
};

describe("people profile permissions", () => {
  it("keeps today's access when a person has no permission map", () => {
    expect(allows("coordinator", null, "orders.view")).toBe(true);
    expect(allows("photographer", null, "permissions.manage")).toBe(false);
    expect(allows("editor", undefined, "tasks.view")).toBe(true);
  });

  it("honors an explicit deny without turning off keys that were left unset", () => {
    expect(allows("admin", { "messages.view": false }, "messages.view")).toBe(false);
    expect(allows("admin", { "messages.view": false }, "orders.view")).toBe(true);
  });

  it("does not let a save remove the owner", () => {
    expect(permissionWriteBlocked("cadi@iconicimagestx.com", "coordinator", null)).toMatch(/owner/i);
    expect(permissionWriteBlocked("cadi@iconicimagestx.com", "admin", { "permissions.manage": false })).toMatch(/owner/i);
    expect(permissionWriteBlocked("mike@iconicimagestx.com", "photographer", null)).toBeNull();
  });
});

describe("group delivery", () => {
  const groups = previewGroups();
  const adminGroup = groups.find((group) => group.name === "Admin Group")!;
  const video = groups.find((group) => group.name === "Video group")!;

  it("delivers an Admin Group message only to Cadi, Cora, and Jane Doe", () => {
    const delivery = groupDelivery(adminGroup, "sample-riley");
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) return;
    expect(delivery.notifyUids.sort()).toEqual(["sample-cadi", "sample-cora", "sample-jane"]);
    expect(delivery.notifyUids).not.toContain("temp-admin-uid");
    expect(delivery.notifyUids).not.toContain("sample-mike");
    expect(delivery.participantUids).toContain("sample-riley");
  });

  it("refuses someone who cannot message the group", () => {
    const delivery = groupDelivery(video, "temp-admin-uid");
    expect(delivery.ok).toBe(false);
  });

  it("lets a lead admin read a group thread without being notified", () => {
    const threads = threadsForFolder(previewThreads(), admin, "all-groups");
    const videoThread = threads.find((thread) => thread.groupName === "Video group");
    expect(videoThread?.notified).toBe(false);
    expect(threadsForFolder(previewThreads(), admin, "inbox")).toHaveLength(0);
  });

  it("shows Jane her Admin Group thread and not the video thread", () => {
    const jane: DeskActor = { uid: "sample-jane", email: "jane.doe@example.com", kind: "client", role: "client", leadAdmin: false, permissions: null };
    const inbox = threadsForFolder(previewThreads(), jane, "inbox");
    expect(inbox.map((thread) => thread.groupName)).toEqual(["Admin Group"]);
    expect(inbox[0].notified).toBe(true);
  });
});

describe("compose stays inside the chosen recipients", () => {
  it("does not add a lead admin who is not a member", () => {
    const riley: DeskActor = { uid: "sample-riley", email: "riley.broker@example.com", kind: "client", role: "client", leadAdmin: false, permissions: null };
    const built = buildOutbound(riley, { groupId: "preview-admin", body: "Hello desk" }, previewProfiles(), previewGroups(), "2026-11-14T18:00:00.000Z");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.thread.notifyUids.sort()).toEqual(["sample-cadi", "sample-cora", "sample-jane"]);
    expect(built.thread.status).toBe("sent");
  });
});

describe("name migration", () => {
  const profiles = previewProfiles();

  it("links a unique name and leaves ambiguous and unknown names unmatched", () => {
    const report = matchProfileNames(profiles, [
      { source: "order", recordId: "o1", field: "assignedPhotographerName", name: "Mike Luna" },
      { source: "task", recordId: "t1", field: "assigneeName", name: "  daniel   adaclog " },
      { source: "message", recordId: "m1", field: "senderName", name: "Someone New" },
      { source: "order", recordId: "o2", field: "photographerName", name: "Alex" },
    ]);
    expect(report.unique.map((row) => row.profileId).sort()).toEqual(["staff:sample-daniel", "staff:sample-mike"]);
    expect(report.unmatched.map((row) => row.name)).toEqual(["Someone New", "Alex"]);
    expect(report.wrote).toEqual([]);
    expect(uniqueWrites(report).map((row) => row.sighting.name)).not.toContain("Alex");
  });

  it("does not write when two profiles share a name", () => {
    const twins = profiles.map((profile) => profile.id === "client:sample-riley"
      ? { ...profile, displayName: "Jane Doe", legalName: "Jane Doe" }
      : profile);
    const report = matchProfileNames(twins, [
      { source: "task", recordId: "t2", field: "assigneeName", name: "Jane Doe" },
    ]);
    expect(report.unique).toEqual([]);
    expect(report.ambiguous).toHaveLength(1);
    expect(uniqueWrites(report)).toEqual([]);
  });
});

describe("preview seed", () => {
  it("is on for preview and local runs and off for production", () => {
    expect(previewPeopleAllowed({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
    expect(previewPeopleAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(previewPeopleAllowed({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
    expect(previewPeopleAllowed({ NODE_ENV: "production" })).toBe(false);
  });
});

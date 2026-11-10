import { describe, expect, it } from "vitest";
import { disconnectedInboundEmailAdapter } from "./inboundEmail";
import {
  buildTaskBoard,
  columnStage,
  createManualTask,
  displayTasks,
  dueLabel,
  readTaskBoardOverlay,
  reorderTasks,
  sampleTaskBoard,
  chunkItems,
  describeTaskBoardSaveError,
  taskBoardStats,
  taskBoardWriteData,
  taskFilterCounts,
  taskRemovalWrite,
  taskToOverlay,
  withRestored,
  withStage,
  withoutTasks,
  type TaskBoardTask,
} from "./taskBoard";

const TODAY = "2026-11-08";

function unscheduled(id = "order-123", orderNumber = 123) {
  return {
    id,
    orderNumber,
    status: "unscheduled",
    clientName: "Sample Client",
    address: "100 Sample Street, Conroe, TX",
  };
}

describe("task board derivation", () => {
  it("builds one schedule task with an order link and does not duplicate it", () => {
    const input = { orderRequests: [unscheduled()] };
    const first = buildTaskBoard(input);
    const again = buildTaskBoard({ ...input, overlays: first.tasks.map(taskToOverlay) });
    expect(first.tasks).toHaveLength(1);
    expect(first.tasks[0]).toMatchObject({
      title: "Schedule order #123",
      stage: "queued",
      primaryHref: "/admin/order-request/order-123",
      primaryHrefLabel: "Open order",
    });
    expect(again.tasks.map((task) => task.id)).toEqual(first.tasks.map((task) => task.id));
  });

  it("keeps a dismissal until the source issue changes", () => {
    const input = { orderRequests: [unscheduled()] };
    const task = buildTaskBoard(input).tasks[0];
    const hidden = buildTaskBoard({
      ...input,
      overlays: [{ ...taskToOverlay(task), dismissed: true, fingerprint: task.fingerprint }],
    });
    expect(hidden.tasks).toHaveLength(0);
    expect(hidden.cleared).toHaveLength(1);
    expect(hidden.cleared[0].dismissed).toBe(true);
    expect(hidden.cleared[0].orderHref).toBe(task.orderHref);

    const returned = buildTaskBoard({
      orderRequests: [{ ...unscheduled(), status: "new" }],
      overlays: [{ ...taskToOverlay(task), dismissed: true, fingerprint: task.fingerprint }],
    });
    expect(returned.tasks).toHaveLength(1);
    expect(returned.tasks[0].id).toBe(task.id);
    expect(returned.tasks[0].dismissed).toBe(false);
  });

  it("creates the deliver task once and does not also schedule that order", () => {
    const order = { ...unscheduled("order-128", 128), status: "scheduled" };
    const gallery = {
      id: "gallery-128",
      status: "ready_for_review",
      listingId: "listing-128",
      orderId: "order-128",
      addressLabel: "200 Sample Avenue",
      mediaCount: 10,
    };
    const pending = {
      id: "gallery-pending",
      status: "editing",
      listingId: "listing-pending",
      orderId: "order-pending",
      addressLabel: "10 Oak",
    };
    const delivered = {
      id: "gallery-done",
      status: "delivered",
      listingId: "listing-done",
      orderId: "order-done",
      addressLabel: "8 Cedar",
    };
    const duplicate = { ...gallery, id: "gallery-128-copy" };
    const input = {
      orderRequests: [order, unscheduled()],
      galleries: [gallery, duplicate, pending, delivered],
      listings: [{ id: "listing-128", address: "200 Sample Avenue" }],
    };
    const first = buildTaskBoard(input);
    const deliver = first.tasks.filter((task) => task.service === "deliver");
    expect(deliver).toHaveLength(1);
    expect(deliver[0].title).toBe("Deliver order #128");
    expect(deliver[0].primaryHref).toContain("/admin/ops?stage=review");
    expect(first.tasks.some((task) => task.title === "Schedule order #128")).toBe(false);
    expect(first.tasks.some((task) => task.title === "Schedule order #123")).toBe(true);
    expect(first.tasks.some((task) => task.pipelineKey.includes("gallery-pending"))).toBe(false);
    expect(first.tasks.some((task) => task.pipelineKey.includes("order-done"))).toBe(false);

    const second = buildTaskBoard({ ...input, overlays: first.tasks.map(taskToOverlay) });
    expect(second.tasks.filter((task) => task.service === "deliver")).toHaveLength(1);
    expect(second.tasks.filter((task) => task.id === deliver[0].id)).toHaveLength(1);
  });

  it("moves a task to the next stage without creating another row", () => {
    const input = { orderRequests: [unscheduled()] };
    const original = buildTaskBoard(input).tasks;
    const moved = withStage(original, original[0].id, "production", "2026-11-08T15:00:00.000Z");
    expect(moved).toHaveLength(1);
    expect(moved[0].id).toBe(original[0].id);
    expect(moved[0].stage).toBe("production");
    const again = buildTaskBoard({ ...input, overlays: moved.map(taskToOverlay) });
    expect(again.tasks).toHaveLength(1);
    expect(again.tasks[0].stage).toBe("production");
    expect(columnStage(again.tasks[0])).toBe("production");
  });

  it("assigns one video task to Mike and one podcast task to Daniel", () => {
    const staff = [
      { id: "mike", name: "Mike Luna" },
      { id: "mike-2", name: "Mike Smith" },
      { id: "daniel", name: "Daniel Adaclog" },
    ];
    const board = buildTaskBoard({
      staff,
      orderRequests: [
        { ...unscheduled("vid", 127), status: "scheduled", services: [{ name: "Listing video reel" }] },
        { ...unscheduled("pod", 129), status: "in_progress", services: [{ name: "Podcast episode" }] },
      ],
    });
    expect(board.tasks.find((task) => task.service === "video")?.assigneeName).toBeNull();
    expect(board.tasks.find((task) => task.service === "podcast")?.assigneeName).toBe("Daniel Adaclog");
    const onlyMike = buildTaskBoard({
      staff: staff.filter((person) => person.id !== "mike-2"),
      orderRequests: [
        { ...unscheduled("vid", 127), status: "scheduled", services: [{ name: "Listing video reel" }] },
      ],
    });
    expect(onlyMike.tasks[0].assigneeName).toBe("Mike Luna");
  });

  it("turns an edit, a question, and a stubbed email into queue rows", () => {
    const board = buildTaskBoard({
      orderRequests: [{ ...unscheduled("order-126", 126), status: "scheduled" }],
      editRequests: [{
        id: "edit-1",
        orderId: "order-126",
        status: "open",
        note: "Warm the sky.",
        sample: true,
      }],
      messages: [{
        id: "message-1",
        senderType: "client",
        isRead: false,
        content: "Can we add a twilight?",
        orderId: "order-126",
      }],
      contactThreads: [{
        id: "thread-1",
        name: "Sample Agent",
        createdAt: "2026-11-08T12:00:00.000Z",
        updatedAt: "2026-11-08T12:00:00.000Z",
        messages: [{
          id: "m1",
          sender: "client",
          senderName: "Sample Agent",
          text: "Can we move the shoot?",
          createdAt: "2026-11-08T12:00:00.000Z",
        }],
      }],
      emails: disconnectedInboundEmailAdapter().list(),
    });
    expect(board.emailConnected).toBe(false);
    expect(board.emailNotice).toMatch(/not connected/i);
    expect(board.tasks.map((task) => task.origin).sort()).toEqual(["edit", "question", "question"]);
    const withMail = buildTaskBoard({
      emails: [{
        id: "mail-1",
        fromName: "Sample Client",
        fromEmail: "sample@example.com",
        subject: "Question about the gallery",
        body: "Is the gallery ready?",
        receivedAt: "2026-11-08T15:00:00.000Z",
        orderNumber: null,
        sample: true,
      }],
    });
    expect(withMail.tasks).toHaveLength(1);
    expect(withMail.tasks[0].sample).toBe(true);
    expect(withMail.tasks[0].origin).toBe("email");
  });

  it("keeps manual order separate from priority sort", () => {
    const board = sampleTaskBoard(TODAY);
    const before = board.tasks.map((task) => task.sort);
    const byPriority = displayTasks(board.tasks, {
      filter: "all",
      meId: null,
      today: TODAY,
      query: "",
      prioritySort: true,
    });
    expect(board.tasks.map((task) => task.sort)).toEqual(before);
    expect(byPriority[0].priority).toBe("urgent");
    expect(byPriority.map((task) => task.id)).not.toEqual(board.tasks.map((task) => task.id));

    const manual = displayTasks(board.tasks, {
      filter: "all",
      meId: null,
      today: TODAY,
      query: "",
      prioritySort: false,
    });
    expect(manual.map((task) => task.title)[0]).toBe("Schedule order #123");
    const reordered = reorderTasks(board.tasks, manual[0].id, manual[2].id);
    expect(reordered.find((task) => task.id === manual[0].id)?.sort).not.toBe(manual[0].sort);
    expect(board.tasks.map((task) => task.sort)).toEqual(before);
  });

  it("clears selected tasks without dropping order links and restores them", () => {
    const board = sampleTaskBoard(TODAY);
    const ids = board.tasks.filter((task) => task.origin === "schedule").map((task) => task.id);
    const cleared = withoutTasks(board.tasks, ids);
    expect(cleared.removed.length).toBe(ids.length);
    expect(cleared.removed.every((task) => task.dismissed && task.orderHref)).toBe(true);
    expect(cleared.tasks.some((task) => ids.includes(task.id))).toBe(false);
    const restored = withRestored(cleared.tasks, cleared.removed, ids);
    expect(restored.some((task) => ids.includes(task.id) && !task.dismissed)).toBe(true);
    expect(chunkItems(ids.concat(ids), 3)).toHaveLength(Math.ceil((ids.length * 2) / 3));
  });

  it("writes a Firestore document without undefined fields", () => {
    const task = sampleTaskBoard(TODAY).tasks[0];
    const dirty = {
      ...task,
      sort: Number.NaN,
      contentKind: undefined,
      activity: [{ at: "2026-11-08T15:00:00.000Z", text: "Moved", sample: undefined }],
    } as TaskBoardTask;
    const data = taskBoardWriteData(dirty);
    expect(JSON.stringify(data)).not.toContain("undefined");
    expect(data.sort).toBeNull();
    expect(data.eventId).toBeNull();
    const activity = data.activity as Array<Record<string, unknown>>;
    expect(activity[0]).toEqual({ at: "2026-11-08T15:00:00.000Z", text: "Moved" });
    expect("sample" in activity[0]).toBe(false);
  });

  it("names the save failure", () => {
    expect(describeTaskBoardSaveError(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })).summary)
      .toContain("permission-denied");
    expect(describeTaskBoardSaveError(Object.assign(new Error("Unsupported field value: undefined"), { code: "invalid-argument" })).summary)
      .toContain("validation");
    expect(describeTaskBoardSaveError(Object.assign(new Error("missing staff auth token"), { code: "unauthenticated" })).summary)
      .toContain("unauthenticated");
  });

  it("removes the task record only", () => {
    const manual = createManualTask({
      id: "manual:lockbox",
      title: "Drop off the lockbox",
      stage: "queued",
      priority: "normal",
      dueOn: null,
      assignee: null,
      sample: false,
      sort: 10,
      at: "2026-11-08T15:00:00.000Z",
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;
    const auto = sampleTaskBoard(TODAY).tasks.find((task) => task.origin === "schedule") as TaskBoardTask;
    expect(taskRemovalWrite(manual.task)).toEqual({
      collection: "taskBoardItems",
      id: "manual_lockbox",
      deleteDoc: true,
    });
    expect(taskRemovalWrite(auto).collection).toBe("taskBoardItems");
    expect(taskRemovalWrite(auto).deleteDoc).toBe(false);
  });

  it("counts the sample board from its rows and labels every row as sample", () => {
    const board = sampleTaskBoard(TODAY);
    expect(board.tasks.every((task) => task.sample)).toBe(true);
    const stats = taskBoardStats(board.tasks, TODAY);
    expect(stats.open.value).toBe(8);
    expect(stats.production).toEqual({ value: 2, label: "Mike + Daniel" });
    expect(stats.ready.value).toBe(2);
    expect(stats.overdue.value).toBe(1);
    expect(stats.completed).toBe(1);
    expect(board.tasks.find((task) => task.manual && task.status === "open")?.title).toBe("Prepare weekly team agenda");
    expect(board.tasks.find((task) => task.status === "done")?.title).toBe("Approve gallery · order #122");
    expect(dueLabel(board.tasks.find((task) => task.status === "done")?.dueOn || null, "done", TODAY)).toBe("Done");
    const counts = taskFilterCounts(board.tasks, "sample-cadi", TODAY);
    expect(counts).toEqual({ all: 9, mine: 3, unassigned: 2, overdue: 1 });
    const listIds = displayTasks(board.tasks, {
      filter: "all",
      meId: null,
      today: TODAY,
      query: "",
      prioritySort: false,
    }).map((task) => task.id);
    const boardIds = [...board.tasks].sort((a, b) => a.title.localeCompare(b.title)).map((task) => task.id).sort();
    expect([...listIds].sort()).toEqual(boardIds);
  });

  it("leaves overdue empty when no task has a due date", () => {
    const board = buildTaskBoard({ orderRequests: [unscheduled()] });
    expect(taskBoardStats(board.tasks, TODAY).overdue).toEqual({
      value: null,
      label: "No due dates yet",
    });
  });

  it("reads a saved overlay without inventing fields", () => {
    const overlay = readTaskBoardOverlay("order_order-123_schedule", {
      sourceKey: "order:order-123:schedule",
      pipelineKey: "order:order-123:schedule",
      title: "Schedule order #123",
      stage: "queued",
      status: "open",
      dismissed: false,
      sort: 10,
    });
    expect(overlay?.sort).toBe(10);
    expect(overlay?.dueOn).toBeNull();
    expect(overlay?.assigneeName).toBeNull();
  });
});

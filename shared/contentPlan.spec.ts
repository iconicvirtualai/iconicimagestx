import { describe, expect, it } from "vitest";
import {
  contentCalendar,
  contentTasks,
  isListingVideoTask,
  isPodcastTask,
  monthGrid,
  trackInsight,
} from "./contentPlan";
import { checklistHref } from "./contentPlan";
import {
  createContentItem,
  sampleTaskBoard,
  taskBoardStats,
  taskFilterCounts,
  withContentStage,
  withStage,
} from "./taskBoard";
import { explicitOrderNumber, linkEmailToOrder, photosInboxConfig, dedupeInboundEmails, inboundEmailFromParts } from "./inboundEmail";

const TODAY = "2026-11-08";

describe("content plan", () => {
  it("keeps a podcast on the checklist and in its own section as one record", () => {
    const board = sampleTaskBoard(TODAY);
    const podcast = board.tasks.find((task) => task.service === "podcast");
    const video = board.tasks.find((task) => task.service === "video");
    expect(podcast?.title).toBe("Podcast episode · order #129");
    expect(podcast?.primaryHref).toContain("/admin/content?section=podcast");
    expect(podcast?.primaryHrefLabel).toBe("Open podcast");
    expect(podcast?.orderHref).toContain("/admin/order-request/sample-order-129");
    expect(checklistHref(podcast!.id)).toBe(`/admin/tasks?task=${encodeURIComponent(podcast!.id)}`);
    expect(contentTasks(board.tasks, "podcast").map((task) => task.id)).toEqual([podcast!.id]);
    expect(isListingVideoTask(video!)).toBe(true);
    expect(isPodcastTask(video!)).toBe(false);
    expect(contentTasks(board.tasks, "promo").map((task) => task.title)).toEqual(["Iconic promo · Market week"]);
    expect(contentTasks(board.tasks, "promo")[0].publishOn).toBe("2026-11-13");
  });

  it("moves podcast stage on the board and in the content section together", () => {
    const board = sampleTaskBoard(TODAY);
    const id = board.tasks.find((task) => isPodcastTask(task))!.id;
    const fromBoard = withStage(board.tasks, id, "review", "2026-11-08T16:00:00.000Z");
    expect(fromBoard.find((task) => task.id === id)).toMatchObject({ stage: "review", contentStage: "review" });
    expect(fromBoard.filter((task) => task.pipelineKey === `order:sample-order-129:podcast`)).toHaveLength(1);
    const fromContent = withContentStage(fromBoard, id, "record", "2026-11-08T17:00:00.000Z");
    expect(fromContent.find((task) => task.id === id)).toMatchObject({ contentStage: "record", stage: "production", status: "open" });
    expect(fromContent).toHaveLength(board.tasks.length);
  });

  it("tracks an Insights post once", () => {
    const first = trackInsight([], {
      id: "post-1",
      title: "Spring podcast",
      publishedAt: null,
      updatedAt: "2026-11-08T18:00:00.000Z",
      readyForSocial: true,
      categories: ["VIDEO"],
    }, "2026-11-08T18:00:00.000Z");
    const second = trackInsight(first.tasks, {
      id: "post-1",
      title: "Spring podcast renamed",
      publishedAt: null,
      updatedAt: "2026-11-09T18:00:00.000Z",
      readyForSocial: true,
      categories: ["VIDEO"],
    }, "2026-11-09T18:00:00.000Z");
    expect(first.tasks).toHaveLength(1);
    expect(second.tasks).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(first.tasks[0].contentKind).toBe("podcast");
  });

  it("puts podcast, promo, and an untracked Insights post on the calendar", () => {
    const board = sampleTaskBoard(TODAY);
    const marks = contentCalendar(board.tasks, [{
      id: "sample-insight-social",
      title: "From the shoot — sample social pack",
      publishedAt: null,
      updatedAt: `${TODAY}T18:00:00.000Z`,
      readyForSocial: true,
      categories: ["VIDEO"],
    }], "2026-11");
    expect(marks.map((mark) => mark.kind).sort()).toEqual(["insight", "podcast", "promo"]);
    expect(marks.find((mark) => mark.kind === "insight")?.href).toContain("/admin/insights?post=");
    expect(monthGrid("2026-11").flat().filter((day) => day.startsWith("2026-11"))).toHaveLength(30);
  });

  it("counts the promo on the checklist without a second checkbox", () => {
    const board = sampleTaskBoard(TODAY);
    const stats = taskBoardStats(board.tasks, TODAY);
    expect(stats.open.value).toBe(8);
    expect(stats.ready.value).toBe(2);
    expect(stats.production).toEqual({ value: 2, label: "Mike + Daniel" });
    expect(taskFilterCounts(board.tasks, "sample-cadi", TODAY)).toEqual({ all: 9, mine: 3, unassigned: 2, overdue: 1 });
    const promo = createContentItem({
      id: "content:again",
      kind: "promo",
      title: "Iconic promo · Market week",
      contentStage: "scheduled",
      publishOn: "2026-11-13",
      assignee: null,
      sample: true,
      at: "2026-11-08T12:00:00.000Z",
    });
    expect(promo.ok).toBe(true);
  });
});

describe("photos inbox", () => {
  it("does not treat the address, the calendar key, or SMTP as a connection", () => {
    expect(photosInboxConfig({})).toBeNull();
    expect(photosInboxConfig({
      PHOTOS_INBOX_CLIENT_EMAIL: "calendar@example.iam.gserviceaccount.com",
      PHOTOS_INBOX_PRIVATE_KEY: "key",
      PHOTOS_INBOX_IMPERSONATE: "photos@iconicimagestx.com",
      GOOGLE_CALENDAR_CLIENT_EMAIL: "calendar@example.iam.gserviceaccount.com",
    })).toBeNull();
    expect(photosInboxConfig({
      PHOTOS_INBOX_CLIENT_EMAIL: "photos@iconicimagestx.com",
      PHOTOS_INBOX_PRIVATE_KEY: "key",
      PHOTOS_INBOX_IMPERSONATE: "photos@iconicimagestx.com",
      SMTP_USER: "photos@iconicimagestx.com",
    })).toBeNull();
    expect(photosInboxConfig({
      PHOTOS_INBOX_CLIENT_EMAIL: "inbox-reader@example.iam.gserviceaccount.com",
      PHOTOS_INBOX_PRIVATE_KEY: "key",
      PHOTOS_INBOX_IMPERSONATE: "someone@example.com",
    })).toBeNull();
  });

  it("dedupes a thread and links only an explicit order number", () => {
    const first = inboundEmailFromParts({
      threadId: "thread-1",
      fromName: "Sample Client",
      fromEmail: "client@example.com",
      subject: "Question about order #123",
      body: "Can you warm the sky?",
      receivedAt: "2026-11-08T12:00:00.000Z",
    });
    const newer = inboundEmailFromParts({
      threadId: "thread-1",
      fromName: "Sample Client",
      fromEmail: "client@example.com",
      subject: "Question about order #123",
      body: "And the kitchen too.",
      receivedAt: "2026-11-08T13:00:00.000Z",
    });
    const own = inboundEmailFromParts({
      threadId: "thread-2",
      fromName: "Iconic",
      fromEmail: "photos@iconicimagestx.com",
      subject: "Re: order #123",
      body: "We sent this.",
      receivedAt: "2026-11-08T14:00:00.000Z",
    });
    expect(own).toBeNull();
    expect(explicitOrderNumber("orders #123 and #124")).toBeNull();
    const rows = dedupeInboundEmails([first!, newer!]);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("kitchen");
    expect(linkEmailToOrder(rows[0], [
      { id: "a", orderNumber: 123 },
      { id: "b", orderNumber: 123 },
    ])).toBeNull();
    expect(linkEmailToOrder(rows[0], [{ id: "only", orderNumber: 123 }])).toMatchObject({
      id: "only",
      label: "#123",
      href: "/admin/order-request/only",
    });
  });
});

import { describe, expect, it } from "vitest";
import { buildUnifiedThreads } from "./communications/threads.ts";
import {
  previewThreads,
  type DeskActor,
  type InboxThread,
} from "./peopleProfiles.ts";
import {
  buildPortalInbox,
  folderCounts,
  inboxTimeLabel,
  isUnread,
  itemsInFolder,
  listingChip,
  mergeFlag,
  orderChip,
  parseFlagPatch,
  searchInbox,
  unreadInboxCount,
} from "./portalInbox.ts";

const jane: DeskActor = {
  uid: "sample-jane",
  email: "jane.doe@example.com",
  kind: "client",
  role: "client",
  leadAdmin: false,
  permissions: null,
};

function conversation(partial: {
  id: string;
  title: string;
  body: string;
  at: string;
  senderType?: string;
  orderNumber?: string;
  orderId?: string;
  listingId?: string;
  listingLabel?: string;
  source?: "messages" | "orderRequest";
}) {
  return buildUnifiedThreads({
    messages:
      partial.source === "orderRequest"
        ? []
        : [
            {
              id: `${partial.id}-m`,
              threadId: partial.id,
              clientId: jane.uid,
              senderId: partial.senderType === "client" ? jane.uid : "desk",
              senderType: partial.senderType || "staff",
              senderName: partial.title,
              content: partial.body,
              orderId: partial.orderId || "",
              orderNumber: partial.orderNumber || "",
              listingId: partial.listingId || "",
              listingAddress: partial.listingLabel || "",
              address: "should-not-become-a-listing",
              channel: "in-app",
              direction:
                partial.senderType === "client" ? "inbound" : "outbound",
              createdAt: partial.at,
            },
          ],
    orderRequests:
      partial.source === "orderRequest"
        ? [
            {
              id: partial.id.replace(/^lead:/, ""),
              clientId: jane.uid,
              clientName: partial.title,
              message: partial.body,
              createdAt: partial.at,
              address: "26410 Oakridge Dr",
              listingId: partial.listingId || "",
              orderNumber: partial.orderNumber || "",
            },
          ]
        : [],
  }).filter(
    (thread) =>
      !thread.connectorNeeded &&
      thread.id ===
        (partial.source === "orderRequest" ? partial.id : partial.id),
  );
}

describe("portal inbox", () => {
  it("keeps star, unread, and folder on the person who set them", () => {
    const now = "2026-11-15T18:00:00.000Z";
    const janeFlag = mergeFlag(
      undefined,
      { threadKey: "comm:order:1", starred: true, folder: "archived" },
      now,
    );
    const other = mergeFlag(
      janeFlag,
      { threadKey: "comm:order:1", folder: "trash" },
      now,
    );
    expect(other.starred).toBe(true);
    expect(other.folder).toBe("trash");
    expect(
      parseFlagPatch({ threadKey: "comm:../other", starred: true }),
    ).toBeNull();
    expect(
      parseFlagPatch({
        threadKey: "direct:preview-thread-admin",
        forceUnread: true,
      })?.forceUnread,
    ).toBe(true);
    expect(
      isUnread(
        "2026-11-15T17:00:00.000Z",
        true,
        mergeFlag(
          undefined,
          { threadKey: "comm:a", readAt: "2026-11-15T17:00:00.000Z" },
          now,
        ),
      ),
    ).toBe(false);
    expect(
      isUnread(
        "2026-11-15T17:00:00.000Z",
        true,
        mergeFlag(
          undefined,
          {
            threadKey: "comm:a",
            forceUnread: true,
            readAt: "2026-11-15T18:00:00.000Z",
          },
          now,
        ),
      ),
    ).toBe(true);
  });

  it("merges conversations and direct threads into one inbox", () => {
    const threads = conversation({
      id: "order:1",
      title: "Mike Luna",
      body: "Lights on by 5:15",
      at: "2026-11-10T18:00:00.000Z",
      orderNumber: "2",
    });
    const items = buildPortalInbox(threads, previewThreads(), jane, []);
    expect(items.some((item) => item.title === "Mike Luna")).toBe(true);
    expect(
      items.some(
        (item) =>
          item.groupName === "Admin Group" || item.title === "Admin Group",
      ),
    ).toBe(true);
    expect(items.some((item) => item.groupName === "Video group")).toBe(false);
    expect(folderCounts(items).inbox).toBeGreaterThan(0);
    expect(itemsInFolder(items, "drafts")).toHaveLength(0);
  });

  it("shows an order or listing chip only when the thread is linked", () => {
    const linked = conversation({
      id: "order:9",
      title: "Desk",
      body: "Gallery is ready",
      at: "2026-11-12T15:00:00.000Z",
      orderNumber: "3",
      listingId: "listing-9",
      listingLabel: "26410 Oakridge Dr",
    })[0];
    const plain = conversation({
      id: "note:1",
      title: "Iconic desk",
      body: "Hello",
      at: "2026-11-09T15:00:00.000Z",
    })[0];
    const request = conversation({
      id: "lead:req-1",
      title: "Marty Byrd",
      body: "New order request",
      at: "2026-11-12T15:00:00.000Z",
      source: "orderRequest",
    })[0];
    const orderItem = buildPortalInbox([linked], [], jane, [])[0];
    const plainItem = buildPortalInbox([plain], [], jane, [])[0];
    const requestItem = buildPortalInbox([request], [], jane, [])[0];
    expect(orderChip(orderItem)?.label).toBe("#003");
    expect(listingChip(orderItem)?.label).toBe("Listing · 26410 Oakridge Dr");
    expect(orderChip(plainItem)).toBeNull();
    expect(listingChip(plainItem)).toBeNull();
    expect(plainItem.listingLabel).toBe("");
    expect(orderChip(requestItem)?.label).toBe("Order request");
    expect(listingChip(requestItem)).toBeNull();
  });

  it("files a conversation for one person without removing it for anyone else", () => {
    const threads = conversation({
      id: "order:1",
      title: "Mike Luna",
      body: "See you Thursday",
      at: "2026-11-10T18:00:00.000Z",
    });
    const archived = mergeFlag(
      undefined,
      { threadKey: "comm:order:1", folder: "archived" },
      "2026-11-15T18:00:00.000Z",
    );
    const janeInbox = buildPortalInbox(threads, [], jane, [archived]);
    const other = buildPortalInbox(
      threads,
      [],
      { ...jane, uid: "someone-else" },
      [],
    );
    expect(itemsInFolder(janeInbox, "archived")).toHaveLength(1);
    expect(itemsInFolder(janeInbox, "inbox")).toHaveLength(0);
    expect(itemsInFolder(other, "inbox")).toHaveLength(1);
    expect(itemsInFolder(janeInbox, "starred")).toHaveLength(0);
    const starred = buildPortalInbox(threads, [], jane, [
      mergeFlag(
        archived,
        { threadKey: "comm:order:1", starred: true },
        "2026-11-15T18:00:00.000Z",
      ),
    ]);
    expect(itemsInFolder(starred, "starred").map((item) => item.title)).toEqual(
      ["Mike Luna"],
    );
    expect(unreadInboxCount(starred)).toBe(0);
  });

  it("searches only the threads passed in and formats a real timestamp", () => {
    const threads = conversation({
      id: "order:1",
      title: "homeschool5384@gmail.com",
      body: "This message is being sent through the messages portal",
      at: "2026-11-15T02:41:00.000Z",
    });
    const items = buildPortalInbox(threads, [], jane, []);
    expect(searchInbox(items, "portal")).toHaveLength(1);
    expect(searchInbox(items, "video group")).toHaveLength(0);
    const label = inboxTimeLabel(
      "2026-11-15T20:41:00.000Z",
      new Date("2026-11-15T15:00:00.000Z"),
    );
    expect(label).toMatch(/PM/);
    expect(label).not.toMatch(/sample/i);
  });

  it("hides a purged direct copy and keeps the other person's folder", () => {
    const thread: InboxThread = {
      ...previewThreads()[1],
      folderByUid: { "sample-jane": "purged", "sample-riley": "inbox" },
    };
    expect(buildPortalInbox([], [thread], jane, [])).toHaveLength(0);
    const riley: DeskActor = {
      ...jane,
      uid: "sample-riley",
      email: "riley.broker@example.com",
    };
    expect(buildPortalInbox([], [thread], riley, [])).toHaveLength(1);
  });

  it("keeps a direct thread in Trash from the saved flag after the thread copy reloads", () => {
    const thread: InboxThread = {
      ...previewThreads()[1],
      folderByUid: { "sample-jane": "inbox" },
    };
    const key = `direct:${thread.id}`;
    const filed = buildPortalInbox([], [thread], jane, [{
      threadKey: key,
      folder: "trash",
      starred: true,
      readAt: "2026-11-01T00:00:00.000Z",
      forceUnread: false,
      updatedAt: "2026-11-01T00:00:00.000Z",
    }]);
    expect(itemsInFolder(filed, "trash").map((item) => item.id)).toContain(thread.id);
    expect(itemsInFolder(filed, "inbox").map((item) => item.id)).not.toContain(thread.id);
    expect(filed.find((item) => item.id === thread.id)?.starred).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHOTOS_MAILBOX } from "../../shared/inboundEmail";
import { readPhotosInbox } from "./photosInbox";

describe("photos inbox reader", () => {
  it("stays disconnected until a dedicated read-only account is configured", async () => {
    const snapshot = await readPhotosInbox({});
    expect(snapshot.connected).toBe(false);
    expect(snapshot.mailbox).toBe(PHOTOS_MAILBOX);
    expect(snapshot.messages).toEqual([]);
    expect(snapshot.notice).toMatch(/does not open the mailbox/i);
    expect(snapshot.prerequisites.join(" ")).toMatch(/gmail.readonly/);
    expect(snapshot.prerequisites.join(" ")).toMatch(/calendar key/i);
  });

  it("reads threads and does not call a send or modify method", async () => {
    const calls: string[] = [];
    const snapshot = await readPhotosInbox({
      PHOTOS_INBOX_CLIENT_EMAIL: "inbox-reader@example.iam.gserviceaccount.com",
      PHOTOS_INBOX_PRIVATE_KEY: "test-key",
      PHOTOS_INBOX_IMPERSONATE: PHOTOS_MAILBOX,
    }, {
      async list() {
        calls.push("list");
        return [{ id: "msg-1", threadId: "thread-9" }];
      },
      async get() {
        calls.push("get");
        return {
          id: "msg-1",
          threadId: "thread-9",
          internalDate: String(Date.parse("2026-11-08T15:00:00.000Z")),
          payload: {
            headers: [
              { name: "From", value: "Sample Client <client@example.com>" },
              { name: "Subject", value: "Edit request for #130" },
            ],
            body: { data: Buffer.from("Please replace the opening photo.").toString("base64url") },
          },
        };
      },
    });
    expect(calls).toEqual(["list", "get"]);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]).toMatchObject({
      id: "thread-9",
      orderNumber: "#130",
      fromEmail: "client@example.com",
    });
    expect(snapshot.notice).toMatch(/does not send/i);
  });

  it("has no send, modify, calendar, or SMTP path in the reader", () => {
    const source = readFileSync("server/services/photosInbox.ts", "utf8");
    const route = readFileSync("server/routes/photosInbox.ts", "utf8");
    expect(source).not.toMatch(/messages\.(send|modify|trash|delete)|users\.drafts|GOOGLE_CALENDAR_|SMTP_/);
    expect(source).toContain("PHOTOS_INBOX_READONLY_SCOPE");
    expect(readFileSync("shared/inboundEmail.ts", "utf8")).toContain("gmail.readonly");
    expect(route).toContain("requireAdmin");
    expect(route).not.toMatch(/messages\.(send|modify|trash|delete)/);
  });
});

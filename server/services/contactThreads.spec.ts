import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import {
  appendStaffReply,
  continueClientThread,
  listContactThreads,
  readClientThread,
  resetContactThreadStoreForTests,
  startClientThread,
} from "./contactThreads";

const visitor = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "281-555-0199",
  message: "Can you shoot a listing on Thursday?",
};

beforeEach(() => {
  process.env.CONTACT_THREAD_STORE = "memory";
  resetContactThreadStoreForTests();
});

describe("contact threads", () => {
  it("keeps a staff reply on the same thread the visitor can read", async () => {
    const started = await startClientThread(visitor);
    const reply = await appendStaffReply(started.thread.id, "Thursday morning works.");
    const seen = await readClientThread(started.thread.id, started.accessToken);

    expect(reply?.messages.map((message) => message.text)).toEqual([
      visitor.message,
      "Thursday morning works.",
    ]);
    expect(reply?.messages[1].sender).toBe("staff");
    expect(seen?.messages[1].text).toBe("Thursday morning works.");
    expect(JSON.stringify(seen)).not.toContain(started.accessToken);
    expect(JSON.stringify(await listContactThreads())).not.toContain(started.accessToken);
  });

  it("rejects a visitor token that does not belong to the thread", async () => {
    const started = await startClientThread(visitor);
    const wrong = await continueClientThread(started.thread.id, "not-the-token", {
      ...visitor,
      message: "This should not land.",
    });
    const seen = await readClientThread(started.thread.id, "not-the-token");

    expect(wrong).toBeNull();
    expect(seen).toBeNull();
    expect((await readClientThread(started.thread.id, started.accessToken))?.messages).toHaveLength(1);
  });

  it("appends a later visitor message onto the open thread", async () => {
    const started = await startClientThread(visitor);
    const next = await continueClientThread(started.thread.id, started.accessToken, {
      ...visitor,
      message: "Morning is better.",
    });
    expect(next?.thread.messages.map((message) => message.sender)).toEqual(["client", "client"]);
    expect(next?.accessToken).toBe(started.accessToken);
  });
});

describe("contact thread delivery boundary", () => {
  it("does not call the email or text path", () => {
    const service = readFileSync(new URL("./contactThreads.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../routes/contactThreads.ts", import.meta.url), "utf8");
    const widget = readFileSync(new URL("../../client/components/ChatWidget.tsx", import.meta.url), "utf8");
    const combined = `${service}\n${route}\n${widget}`;

    expect(service).not.toContain("sendEmail");
    expect(service).not.toContain("sendSMS");
    expect(service).not.toContain("deliverLiveChat");
    expect(route).not.toContain("sendEmail");
    expect(route).not.toContain("sendSMS");
    expect(route).not.toContain("deliverLiveChat");
    expect(route).not.toContain("/api/campaigns");
    expect(widget).toContain('fetch("/api/contact/threads"');
    expect(widget).not.toContain("/api/contact/live-chat");
    expect(widget).not.toContain("/api/sms");
    expect(widget).not.toContain("/api/campaigns");
    expect(widget).not.toContain("setTimeout");
    expect(combined).not.toContain("contact_confirmation");
    expect(combined).not.toContain("BOOKING_NOTIFY_LIVE");
  });
});

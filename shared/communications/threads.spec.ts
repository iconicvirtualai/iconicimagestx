import { describe, expect, it } from "vitest";
import { canUseAssistants } from "./access";
import { buildUnifiedThreads, filterThreads, threadVisibleTo, type PortalScope } from "./threads";

const clientScope = (uid: string, email = ""): PortalScope => ({ kind: "client", uid, email, phone: "" });
const photographerScope = (uid: string, phone = ""): PortalScope => ({ kind: "photographer", uid, email: "", phone });

describe("unified communications threads", () => {
  const threads = buildUnifiedThreads({
    messages: [
      {
        id: "m1",
        orderId: "order-1",
        clientId: "client-a",
        senderId: "client-a",
        senderType: "client",
        senderName: "Ada Agent",
        content: "Where is the gallery?",
        email: "ada@example.com",
        channel: "in-app",
        direction: "inbound",
        createdAt: "2026-10-19T15:00:00.000Z",
      },
      {
        id: "m2",
        threadId: "order:order-1",
        clientId: "client-a",
        senderId: "staff-1",
        senderType: "staff",
        senderName: "Iconic Images",
        content: "It is ready.",
        channel: "email",
        direction: "outbound",
        delivery: "sent",
        createdAt: "2026-10-19T16:00:00.000Z",
      },
      {
        id: "m3",
        photographerId: "photo-1",
        senderId: "photo-1",
        senderType: "photographer",
        senderName: "Casey",
        content: "Uploaded the shoot.",
        channel: "in-app",
        direction: "inbound",
        createdAt: "2026-10-19T17:00:00.000Z",
      },
    ],
    conversations: [
      {
        id: "convo-1",
        orderId: "order-9",
        photographerId: "photo-1",
        photographerName: "Casey",
        photographerPhone: "+12815550100",
        clientId: "client-a",
        clientName: "Ada Agent",
        clientPhone: "+12815550199",
        status: "active",
        createdAt: { seconds: 1_760_000_000 },
      },
    ],
    smsLogs: [
      { id: "sms-1", orderId: "order-1", body: "Where is the gallery?", direction: "inbound", senderType: "client" },
      { id: "sms-2", body: "New lead text", direction: "inbound", from: "+12815550222", senderType: "client" },
    ],
    contactThreads: [
      {
        id: "abc",
        name: "Bea Broker",
        email: "bea@example.com",
        phone: "2815550200",
        createdAt: "2026-10-19T12:00:00.000Z",
        updatedAt: "2026-10-19T12:05:00.000Z",
        messages: [{ id: "c1", sender: "client", senderName: "Bea Broker", text: "Need a twilight shoot", createdAt: "2026-10-19T12:05:00.000Z" }],
      },
    ],
    orderRequests: [
      { id: "req-1", firstName: "Cam", lastName: "Cole", email: "cam@example.com", phone: "2815550300", message: "Book a listing", createdAt: "2026-10-18T12:00:00.000Z" },
    ],
  });

  it("filters clients, leads, photographers, and connector-needed socials", () => {
    expect(filterThreads(threads, "clients").some((thread) => thread.title === "Ada Agent")).toBe(true);
    const leads = filterThreads(threads, "leads");
    expect(leads.map((thread) => thread.title).sort()).toEqual(["+12815550222", "Bea Broker", "Cam Cole"].sort());
    expect(leads.find((thread) => thread.title === "+12815550222")?.preview).toBe("New lead text");
    expect(filterThreads(threads, "photographers").some((thread) => thread.title.includes("Casey"))).toBe(true);
    const socials = filterThreads(threads, "socials");
    expect(socials.map((thread) => thread.title)).toEqual(["Instagram", "Facebook", "TikTok", "Google Business"]);
    expect(socials.every((thread) => thread.connectorNeeded && thread.subtitle === "Connector needed")).toBe(true);
    expect(socials.every((thread) => /DMs and comments/.test(thread.preview))).toBe(true);
  });

  it("does not duplicate an SMS that is already on the order thread", () => {
    const order = threads.find((thread) => thread.id === "order:order-1");
    expect(order?.messages.filter((message) => message.body === "Where is the gallery?")).toHaveLength(1);
  });

  it("shows a client only their own threads", () => {
    const ada = threads.filter((thread) => threadVisibleTo(thread, clientScope("client-a", "ada@example.com")));
    expect(ada.some((thread) => thread.id === "order:order-1")).toBe(true);
    expect(ada.some((thread) => thread.id === "conversation:convo-1")).toBe(true);
    expect(ada.some((thread) => thread.email === "bea@example.com")).toBe(false);
    expect(ada.some((thread) => thread.audiences.includes("socials"))).toBe(false);
    const stranger = threads.filter((thread) => threadVisibleTo(thread, clientScope("client-b", "stranger@example.com")));
    expect(stranger).toHaveLength(0);
  });

  it("shows a photographer only their own threads", () => {
    const casey = threads.filter((thread) => threadVisibleTo(thread, photographerScope("photo-1", "+12815550100")));
    expect(casey.some((thread) => thread.id === "conversation:convo-1")).toBe(true);
    expect(casey.some((thread) => thread.id === "message:m3" || thread.photographerId === "photo-1")).toBe(true);
    expect(casey.some((thread) => thread.email === "bea@example.com")).toBe(false);
    const other = threads.filter((thread) => threadVisibleTo(thread, photographerScope("photo-2")));
    expect(other).toHaveLength(0);
  });
});

describe("assistant access", () => {
  it("allows admin and the owner allowlist only", () => {
    expect(canUseAssistants({ role: "admin", email: "someone@example.com", ownerEmails: ["owner@iconicimagestx.com"] })).toBe(true);
    expect(canUseAssistants({ role: "coordinator", email: "owner@iconicimagestx.com", ownerEmails: ["owner@iconicimagestx.com"] })).toBe(true);
    expect(canUseAssistants({ role: "coordinator", email: "desk@example.com", ownerEmails: ["owner@iconicimagestx.com"] })).toBe(false);
    expect(canUseAssistants({ role: "photographer", email: "casey@example.com", ownerEmails: [] })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { contactThreadIdFromSearch, type ContactThreadView } from "@shared/contactThread";
import { ContactChatDesk, waitingCount } from "./ContactLiveChat";

const openId = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const quietId = "0123456789abcdef0123456789abcdef";

const openThread: ContactThreadView = {
  id: openId,
  name: "Alexandra Montgomery-Worthington",
  email: "alexandra.montgomery.worthington@longbrokerage.example",
  phone: "(281) 555-0148",
  createdAt: "2026-11-16T14:02:00.000Z",
  updatedAt: "2026-11-16T14:12:00.000Z",
  messages: [
    {
      id: "m1",
      sender: "client",
      senderName: "Alexandra Montgomery-Worthington",
      text: "2:30 please. The lockbox code is in the listing remarks.",
      createdAt: "2026-11-16T14:12:00.000Z",
    },
  ],
};

const quietThread: ContactThreadView = {
  id: quietId,
  name: "Jordan Lee",
  email: "jordan.lee@example.com",
  createdAt: "2026-11-15T18:00:00.000Z",
  updatedAt: "2026-11-15T18:20:00.000Z",
  messages: [
    {
      id: "j1",
      sender: "client",
      senderName: "Jordan Lee",
      text: "Do you shoot vacant land?",
      createdAt: "2026-11-15T18:00:00.000Z",
    },
    {
      id: "j2",
      sender: "staff",
      senderName: "Iconic Images",
      text: "Yes. Send the address and we will quote it.",
      createdAt: "2026-11-15T18:20:00.000Z",
    },
  ],
};

function desk(selectedId: string | null, filter: "all" | "unread" = "all") {
  return renderToString(
    <ContactChatDesk
      threads={[openThread, quietThread]}
      selectedId={selectedId}
      filter={filter}
      error=""
      reply=""
      sending={false}
      onFilter={() => undefined}
      onSelect={() => undefined}
      onBack={() => undefined}
      onReplyChange={() => undefined}
      onSend={() => undefined}
    />,
  );
}

describe("website chat desk", () => {
  it("reads only a 32-character thread id from the email link", () => {
    expect(contactThreadIdFromSearch(`?tab=contact&thread=${openId}`)).toBe(openId);
    expect(contactThreadIdFromSearch("tab=contact")).toBeNull();
    expect(contactThreadIdFromSearch("?thread=not-a-thread")).toBeNull();
    expect(waitingCount(openThread)).toBe(1);
    expect(waitingCount(quietThread)).toBe(0);
  });

  it("shows the conversation list until a chat is opened", () => {
    const html = desk(null);
    expect(html).toContain("Website");
    expect(html).toContain("Alexandra Montgomery-Worthington");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain('data-testid="website-chat-unread"');
    expect(html).toContain('class="hidden min-h-0 min-w-0 flex-1 flex-col bg-gray-950 md:flex" data-testid="contact-thread"');
  });

  it("opens one chat with a back button, a truncated address, and a pinned reply box", () => {
    const html = desk(openId);
    expect(html).toContain('data-testid="contact-thread"');
    expect(html).toContain('data-testid="contact-reply"');
    expect(html).toContain('aria-label="Back to conversations"');
    expect(html).toContain("safe-area-inset-bottom");
    expect(html).toContain("truncate");
    expect(html).toContain("alexandra.montgomery.worthington@longbrokerage.example");
    expect(html).toContain("Reply in this chat...");
    expect(html).toContain("does not send email or text");
    expect(html).toContain('class="hidden min-h-0 w-full');
  });
});

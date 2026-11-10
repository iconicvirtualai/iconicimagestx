import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { navGroups } from "@/lib/adminNav";
import { unreadCounts } from "@shared/adminUnread";
import { UnreadBadge } from "./UnreadBadge";
import { AdminSidebarNav } from "./AdminSidebarNav";
import { CommunicationsTabBar } from "@/components/communications/CommunicationsTabBar";

const counts = unreadCounts({
  channels: { chat: 1, inbox: 12, sms: 2, botroom: 1, orders: 3, events: 4 },
  taskTotals: { admin: 2 },
  uid: "admin",
});

describe("unread badge", () => {
  it("hides a zero count and shows 9+ in the circle", () => {
    expect(renderToString(<UnreadBadge count={0} />)).toBe("");
    const html = renderToString(<UnreadBadge count={12} testId="badge" />);
    expect(html).toContain("9+");
    expect(html).toContain('aria-label="12 unread"');
    expect(html).toContain("bg-red-600");
  });

  it("puts the parent sum on Communications and the child counts on its tabs", () => {
    const nav = renderToString(
      <MemoryRouter>
        <AdminSidebarNav
          groups={navGroups}
          activeHref="/admin/communications"
          role="admin"
          counts={counts}
        />
      </MemoryRouter>,
    );
    expect(nav).toContain('data-testid="nav-unread-/admin/communications"');
    expect(nav).toContain("9+");
    expect(nav).toContain('data-testid="nav-unread-/admin/orders"');
    expect(nav).toContain('data-testid="nav-unread-/admin/tasks"');
    expect(nav).toContain('data-testid="nav-unread-/admin/events"');
    expect(nav).toContain('data-testid="nav-unread-/admin/botroom"');
    expect(nav).not.toContain('data-testid="nav-unread-/admin/dashboard"');
    expect(nav).not.toContain('data-testid="nav-unread-/admin/communications/email"');

    const tabs = renderToString(
      <CommunicationsTabBar tab="sweep" isAdmin counts={counts} onSelect={() => undefined} />,
    );
    expect(tabs).toContain('data-testid="communications-unread-chat"');
    expect(tabs).toContain('data-testid="communications-unread-inbox"');
    expect(tabs).toContain('data-testid="communications-unread-sms"');
    expect(tabs).toContain('data-testid="communications-unread-botroom"');
    expect(tabs).toContain(">1<");
    expect(tabs).toContain(">2<");
    expect(tabs).not.toContain('data-testid="communications-unread-sweep"');
    expect(tabs).not.toContain("Campaigns");
    expect(nav).not.toContain('data-testid="nav-unread-/admin/marketing"');
  });
});

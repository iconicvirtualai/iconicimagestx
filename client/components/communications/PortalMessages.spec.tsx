import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, userType: null }),
}));

import { PortalMessages } from "./PortalMessages";

describe("portal messages inbox", () => {
  it("shows one inbox with compose, folders, and a real order number", () => {
    const html = renderToString(
      <MemoryRouter>
        <PortalMessages example />
      </MemoryRouter>,
    );
    expect(html).toContain('data-testid="portal-messages"');
    expect(html).toContain("Compose");
    expect(html).toContain("Inbox");
    expect(html).toContain("Drafts");
    expect(html).toContain("Archived");
    expect(html).toContain("Trash");
    expect(html).toContain("Starred");
    expect(html).toContain("Search messages");
    expect(html).toContain(
      "This stays in the app. It does not email or text anyone.",
    );
    expect(html).toContain("Mike Luna");
    expect(html).toContain("#002");
    expect(html).not.toContain("Direct messages");
    expect(html).not.toContain("Sample times");
    expect(html).not.toContain(">Proposed<");
  });
});

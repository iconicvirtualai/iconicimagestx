/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientPortalComingSoon, ClientPortalSurface } from "./ClientPortalComingSoon";

const auth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  userType: null as "staff" | "client" | null,
  staffProfile: null as { role?: string } | null,
  loading: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/components/Footer", () => ({ default: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const saved = process.env.CLIENT_PORTAL_ENABLED;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  auth.user = null;
  auth.userType = null;
  auth.staffProfile = null;
  auth.loading = false;
  if (saved === undefined) delete process.env.CLIENT_PORTAL_ENABLED;
  else process.env.CLIENT_PORTAL_ENABLED = saved;
});

async function renderAt(path: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<ClientPortalSurface><h1>Sign in form</h1></ClientPortalSurface>} />
          <Route path="/portal/home" element={<ClientPortalSurface><h1>Portal home</h1></ClientPortalSurface>} />
          <Route path="/admin/dashboard" element={<h1>Staff dashboard</h1>} />
          <Route path="/admin/login" element={<h1>Staff login</h1>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe("client portal coming soon", () => {
  it("replaces /login and portal pages and links staff to /admin/login", async () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    await renderAt("/login");
    expect(container?.textContent).toContain("Client portal coming soon");
    expect(container?.textContent).toContain("photos@iconicimagestx.com");
    expect(container?.textContent).not.toContain("Sign in form");
    expect(container?.querySelector("input")).toBeNull();
    const staff = container?.querySelector("a[href='/admin/login']");
    expect(staff?.textContent).toContain("Staff sign in");
    expect(container?.textContent).not.toContain("aryeo");

    act(() => root?.unmount());
    container?.remove();
    await renderAt("/portal/home");
    expect(container?.textContent).toContain("Client portal coming soon");
    expect(container?.textContent).not.toContain("Portal home");
  });

  it("sends an active staff session on /login to the staff home", async () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    auth.user = { uid: "staff-1" };
    auth.userType = "staff";
    auth.staffProfile = { role: "admin" };
    await renderAt("/login");
    expect(container?.textContent).toContain("Staff dashboard");
  });

  it("restores the login form when the flag is on", async () => {
    process.env.CLIENT_PORTAL_ENABLED = "true";
    await renderAt("/login");
    expect(container?.textContent).toContain("Sign in form");
    expect(container?.textContent).not.toContain("Client portal coming soon");
  });
});

describe("coming soon page copy", () => {
  it("does not render a media link until one is configured", async () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <ClientPortalComingSoon />
        </MemoryRouter>,
      );
    });
    expect(container.querySelector("a[href='/admin/login']")).toBeTruthy();
    expect(container.textContent).not.toContain("Open your media");
  });
});

/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChangePassword from "./ChangePassword";

const auth = vi.hoisted(() => ({
  user: { uid: "photo-1", email: "dummy.photo@example.com", getIdToken: vi.fn(async () => "photo-token") } as { uid: string; email?: string; getIdToken: (force?: boolean) => Promise<string> } | null,
  loading: false,
  userType: "staff" as "staff" | "client" | null,
  staffProfile: { role: "photographer", mustChangePassword: true } as { role?: string; mustChangePassword?: boolean } | null,
  clientProfile: null as { mustChangePassword?: boolean } | null,
  mustChangePassword: true,
  refreshProfile: vi.fn(async () => undefined),
  notePasswordChanged: vi.fn(),
  signIn: vi.fn(async () => undefined),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function path() {
  return container?.querySelector("#where")?.textContent;
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/change-password"]}>
        <Routes>
          <Route path="/change-password" element={<><ChangePassword /><Where /></>} />
          <Route path="/admin/photographer" element={<h1 id="where">Photographer home</h1>} />
          <Route path="/portal/home" element={<h1 id="where">Portal home</h1>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

function Where() {
  return null;
}

async function fill(id: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing ${id}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  auth.user = { uid: "photo-1", email: "dummy.photo@example.com", getIdToken: vi.fn(async () => "photo-token") };
  auth.signIn.mockClear();
  auth.loading = false;
  auth.userType = "staff";
  auth.staffProfile = { role: "photographer", mustChangePassword: true };
  auth.clientProfile = null;
  auth.mustChangePassword = true;
  auth.refreshProfile.mockClear();
  auth.notePasswordChanged.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("change password", () => {
  it("blocks a mismatch and then opens the photographer portal after a successful change", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, mustChangePassword: false }), { status: 200 }));
    await renderPage();
    expect(container?.textContent).toContain("before the portal opens");
    await fill("new-password", "chosen-password");
    await fill("confirm-password", "different");
    const form = container?.querySelector("form");
    if (!form) throw new Error("form missing");
    await act(async () => {
      form.requestSubmit();
    });
    expect(container?.textContent).toContain("Passwords do not match.");
    expect(fetch).not.toHaveBeenCalled();

    await fill("confirm-password", "chosen-password");
    await act(async () => {
      form.requestSubmit();
    });
    expect(fetch).toHaveBeenCalledWith("/api/account/password", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ password: "chosen-password" }),
    }));
    expect(auth.notePasswordChanged).toHaveBeenCalled();
    expect(auth.signIn).toHaveBeenCalledWith("dummy.photo@example.com", "chosen-password");
    expect(auth.user?.getIdToken).toHaveBeenCalledWith(true);
    expect(auth.refreshProfile).toHaveBeenCalled();
    expect(path()).toBe("Photographer home");
  });
});

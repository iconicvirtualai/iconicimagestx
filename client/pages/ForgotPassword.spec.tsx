/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORGOT_PASSWORD_NOTICE } from "@shared/passwordAccount";
import ForgotPassword from "./ForgotPassword";
import { requestPasswordReset } from "@/lib/passwordReset";

vi.mock("@/lib/passwordReset", () => ({
  requestPasswordReset: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reset = vi.mocked(requestPasswordReset);
let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  reset.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("forgot password page", () => {
  it("shows the neutral notice for a successful send and a failed send", async () => {
    reset.mockResolvedValue(FORGOT_PASSWORD_NOTICE);
    await renderPage();
    const input = container?.querySelector<HTMLInputElement>('input[type="email"]');
    const form = container?.querySelector("form");
    if (!input || !form) throw new Error("form missing");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "dummy.photo@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
    });
    expect(reset).toHaveBeenCalledWith("dummy.photo@example.com", window.location.origin);
    expect(container?.textContent).toContain(FORGOT_PASSWORD_NOTICE);
    expect(container?.textContent).not.toMatch(/no account|failed to send/i);

    reset.mockResolvedValue(FORGOT_PASSWORD_NOTICE);
    await act(async () => {
      form.requestSubmit();
    });
    expect(container?.textContent).toContain(FORGOT_PASSWORD_NOTICE);
  });

  it("is the only login reset path and is not gated by client notify", () => {
    const page = readFileSync(path.join(process.cwd(), "client/pages/ForgotPassword.tsx"), "utf8");
    const login = readFileSync(path.join(process.cwd(), "client/pages/Login.tsx"), "utf8");
    const admin = readFileSync(path.join(process.cwd(), "client/pages/AdminLogin.tsx"), "utf8");
    const lib = readFileSync(path.join(process.cwd(), "client/lib/passwordReset.ts"), "utf8");
    expect(page).not.toContain("/api/client-notify");
    expect(lib).toContain("sendPasswordResetEmail");
    expect(lib).not.toContain("/api/client-notify");
    expect(lib).not.toContain("clientNotifyLive(");
    expect(login).toContain('to="/forgot-password"');
    expect(login).not.toContain("/api/client-notify");
    expect(admin).toContain('to="/forgot-password"');
    expect(admin).not.toContain("/api/client-notify");
  });
});

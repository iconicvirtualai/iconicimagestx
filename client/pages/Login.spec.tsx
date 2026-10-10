/**
 * @vitest-environment happy-dom
 */
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Login, { accountCreationDestination } from "./Login";

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  user: null as { uid: string } | null,
  userType: null as "staff" | "client" | null,
  staffProfile: null as { role?: string } | null,
  loading: false,
  resetPassword: vi.fn(),
  registerClient: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/components/Footer", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let refresh: () => void = () => {};

function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div id="where">{location.pathname}</div>
      <button type="button" id="back" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

function path() {
  return container?.querySelector("#where")?.textContent;
}

function buttonByText(label: string) {
  return [...(container?.querySelectorAll("button") || [])].find(
    (button) => button.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

function submitButton() {
  return container?.querySelector("form button[type='submit']") as HTMLButtonElement | null;
}

function LoginHarness() {
  const [, setTick] = useState(0);
  useEffect(() => {
    refresh = () => setTick((tick) => tick + 1);
  });
  return (
    <MemoryRouter initialEntries={["/login"]}>
      <HistoryProbe />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal/home" element={<h1>Portal home</h1>} />
        <Route path="/admin/dashboard" element={<h1>Staff dashboard</h1>} />
        <Route path="/admin/photographer" element={<h1>Photographer home</h1>} />
        <Route path="/admin/editor" element={<h1>Editor home</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

async function renderLogin() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<LoginHarness />);
  });
}

async function fill(placeholder: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!input) throw new Error(`Missing input ${placeholder}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openSignupForm() {
  const opener = buttonByText("Create account");
  if (!opener) throw new Error("Create account button missing");
  await act(async () => {
    opener.click();
  });
  await fill("First name", "Ada");
  await fill("Last name", "Lovelace");
  await fill("Email address", "ada@example.com");
  await fill("Phone (optional)", "555-0100");
  await fill("Password", "secret1");
  await fill("Confirm password", "secret1");
}

async function submitForm() {
  const form = container?.querySelector("form");
  if (!form) throw new Error("Signup form missing");
  await act(async () => {
    form.requestSubmit();
  });
}

beforeEach(() => {
  auth.signIn.mockReset();
  auth.resetPassword.mockReset();
  auth.registerClient.mockReset();
  auth.user = null;
  auth.userType = null;
  auth.staffProfile = null;
  auth.loading = false;
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("account creation destination", () => {
  it("sends a new client to the portal home", () => {
    expect(accountCreationDestination({
      loading: false,
      user: null,
      userType: null,
    })).toBe("/portal/home");
  });

  it("sends staff to the same home as sign-in", () => {
    expect(accountCreationDestination({
      loading: false,
      user: { uid: "staff-1" },
      userType: "staff",
      staffProfile: { role: "photographer" },
    })).toBe("/admin/photographer");
    expect(accountCreationDestination({
      loading: false,
      user: { uid: "staff-2" },
      userType: "staff",
      staffProfile: { role: "editor" },
    })).toBe("/admin/editor");
    expect(accountCreationDestination({
      loading: false,
      user: { uid: "staff-3" },
      userType: "staff",
      staffProfile: { role: "coordinator" },
    })).toBe("/admin/dashboard");
  });
});

describe("create account", () => {
  it("shows a success toast and replaces history with /portal/home", async () => {
    auth.registerClient.mockResolvedValue(undefined);
    await renderLogin();
    await openSignupForm();
    await submitForm();

    expect(auth.registerClient).toHaveBeenCalledTimes(1);
    expect(auth.registerClient).toHaveBeenCalledWith("ada@example.com", "secret1", {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "555-0100",
    });
    expect(toast.success).toHaveBeenCalledWith("Account created. Welcome in.");
    expect(toast.error).not.toHaveBeenCalled();
    expect(path()).toBe("/portal/home");
    expect(container?.textContent).toContain("Portal home");

    await act(async () => {
      buttonByText("Back")?.click();
    });
    expect(path()).toBe("/portal/home");
  });

  it("waits for signup side effects, and keeps the button disabled while they run", async () => {
    let resolveRegister: (() => void) | undefined;
    auth.registerClient.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveRegister = resolve;
      }),
    );
    await renderLogin();
    await openSignupForm();
    await submitForm();

    expect(auth.registerClient).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(path()).toBe("/login");
    const pendingButton = submitButton();
    expect(pendingButton?.disabled).toBe(true);
    expect(pendingButton?.textContent).toContain("Creating account...");

    await act(async () => {
      resolveRegister?.();
    });

    expect(toast.success).toHaveBeenCalledWith("Account created. Welcome in.");
    expect(path()).toBe("/portal/home");
  });

  it("stays on /login and shows the error toast when creation fails", async () => {
    auth.registerClient.mockRejectedValue(new Error("An account with this email already exists."));
    await renderLogin();
    await openSignupForm();
    await submitForm();

    expect(toast.error).toHaveBeenCalledWith("An account with this email already exists.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(path()).toBe("/login");
    expect(container?.textContent).toContain("Create account");
    expect(submitButton()?.disabled).toBe(false);
    expect(submitButton()?.textContent).toContain("Create account");
  });

  it("does not send a second registration while the first is still submitting", async () => {
    let resolveRegister: (() => void) | undefined;
    auth.registerClient.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveRegister = resolve;
      }),
    );
    await renderLogin();
    await openSignupForm();
    await submitForm();
    expect(auth.registerClient).toHaveBeenCalledTimes(1);
    expect(submitButton()?.disabled).toBe(true);

    await act(async () => {
      submitButton()?.click();
    });
    expect(auth.registerClient).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRegister?.();
    });
    expect(path()).toBe("/portal/home");
  });

  it("follows the staff home when signup resolves an active staff session", async () => {
    let continueSignup: (() => void) | undefined;
    auth.registerClient.mockImplementation(
      () => new Promise<void>((resolve) => {
        continueSignup = resolve;
      }),
    );

    await renderLogin();
    await openSignupForm();
    await submitForm();
    expect(path()).toBe("/login");

    auth.user = { uid: "staff-1" };
    auth.userType = "staff";
    auth.staffProfile = { role: "photographer" };
    auth.loading = false;
    await act(async () => {
      refresh();
    });
    await act(async () => {
      continueSignup?.();
    });

    expect(toast.success).toHaveBeenCalledWith("Account created. Welcome in.");
    expect(path()).toBe("/admin/photographer");
    expect(container?.textContent).toContain("Photographer home");
  });

  it("still routes an already signed-in staff member to their staff home", async () => {
    auth.user = { uid: "staff-9" };
    auth.userType = "staff";
    auth.staffProfile = { role: "coordinator" };
    auth.loading = false;
    await renderLogin();
    expect(path()).toBe("/admin/dashboard");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

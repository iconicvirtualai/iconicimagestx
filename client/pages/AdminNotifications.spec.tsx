/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AdminNotificationsPanel, type NotificationSettingsPayload } from "./AdminNotifications";

vi.mock("@/components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>Footer</footer> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const payload: NotificationSettingsPayload = {
  live: false,
  testSink: "ops+deliveryqa@iconicimagestx.com",
  timeZone: "America/Chicago",
  reminderHoursBefore: 24,
  reminderAssumption: "Aryeo hides the offset. Default is 24 hours.",
  overdueDays: 3,
  notifications: [
    {
      key: "customer_order_confirmation",
      label: "Order Confirmation",
      audience: "customer",
      trigger: "Order placed",
      wired: true,
      wireNote: "",
      enabled: true,
      subject: "New order confirmation #1042",
      gaps: [{ tag: "order.status_url", reason: "No public status URL on this sample." }],
    },
    {
      key: "customer_user_verification",
      label: "User Verification",
      audience: "account",
      trigger: "First login code",
      wired: false,
      wireNote: "The portal has no first-login verification code.",
      enabled: false,
      subject: "Important: Account Verification Code",
      gaps: [],
    },
  ],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("notification settings page", () => {
  it("lists each notice, previews it, and offers a test send", async () => {
    const onToggle = vi.fn(async () => undefined);
    const onPreview = vi.fn(async () => ({ subject: "New order confirmation #1042", html: "<p>Order received</p>" }));
    const onTest = vi.fn(async () => ({ status: "sent", note: "QA only" }));
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <AdminNotificationsPanel
            initial={payload}
            onToggle={onToggle}
            onHours={async () => undefined}
            onPreview={onPreview}
            onTest={onTest}
          />
        </MemoryRouter>,
      );
    });
    expect(host?.textContent).toContain("Order Confirmation");
    expect(host?.textContent).toContain("ops+deliveryqa@iconicimagestx.com");
    expect(host?.textContent).toContain("The portal has no first-login verification code.");
    expect(onPreview).toHaveBeenCalled();
    const test = host?.querySelector("button");
    const send = [...(host?.querySelectorAll("button") || [])].find((button) => button.textContent?.includes("Send test to me"));
    expect(send).toBeTruthy();
    await act(async () => {
      send?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTest).toHaveBeenCalledWith("customer_order_confirmation");
    expect(test).toBeTruthy();
  });
});

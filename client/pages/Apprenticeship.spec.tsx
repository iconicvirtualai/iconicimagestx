/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Apprenticeship from "./Apprenticeship";
import {
  APPRENTICESHIP_BALANCE_LINE,
  APPRENTICESHIP_BOOKING_FEE_LINE,
  APPRENTICESHIP_CALENDAR_FALLBACK,
} from "@shared/apprenticeship";
import { APPRENTICESHIP_RULES } from "@shared/bookingCatalog";
import { BOOKING_PROCESSING_LABEL } from "@shared/invoiceProcessing";
import { BUSINESS_CONTACT } from "@shared/businessContact";

const authState = vi.hoisted(() => ({
  isStaff: false,
  user: null as null | { getIdToken: () => Promise<string> },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

const SLOT = {
  start: "2026-10-14T14:00:00.000Z",
  end: "2026-10-14T14:20:00.000Z",
  date: "2026-10-14",
  time: "9:00 AM",
  label: "Wed, Oct 14 · 9:00 AM",
};

function callsTo(fragment: string) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes(fragment));
}

async function renderPage(url = "/apprenticeship") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[url]}>
        <Apprenticeship />
      </MemoryRouter>,
    );
  });
}

function setValue(id: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing #${id}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  authState.isStaff = false;
  authState.user = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const target = String(url);
    if (target.includes("/api/apprenticeship/slots")) {
      return {
        ok: true,
        json: async () => ({ available: true, slots: [SLOT], fallback: null, durationMinutes: 20 }),
      };
    }
    if (target.includes("/api/bookings/catalog")) {
      return { ok: true, json: async () => ({ packages: [], processingEnabled: true }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  document.body.innerHTML = "";
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

describe("apprenticeship landing", () => {
  it("shows the catalog packages, rules, booking fee, processing line, and footer contact", async () => {
    await renderPage();
    const text = container?.textContent || "";
    expect(text).toContain("The Apprenticeship Program");
    expect(text).toContain("25 photos");
    expect(text).toContain("$75");
    expect(text).toContain("20 Minute Appointment ONLY");
    expect(text).toContain("50 photos");
    expect(text).toContain("$125");
    expect(text).toContain("1 Hour Appointment ONLY");
    expect(text).toContain("$25 per 15-minute increment");
    for (const rule of APPRENTICESHIP_RULES) expect(text).toContain(rule);
    expect(text).toContain(APPRENTICESHIP_BOOKING_FEE_LINE);
    expect(text).toContain(APPRENTICESHIP_BALANCE_LINE);
    expect(text).toContain(BOOKING_PROCESSING_LABEL);
    expect(text).toContain("$2.10");
    expect(text).toContain(BUSINESS_CONTACT.line);
    expect(text.toLowerCase()).not.toContain("not configured");
    expect(text).not.toContain("cadi@");
    expect(container?.querySelector("[data-testid=\"apprenticeship-admin-setup\"]")).toBeNull();
    expect(container?.querySelector("[data-testid=\"slot-2026-10-14T14:00:00.000Z\"]")).toBeTruthy();
  });

  it("uses a public fallback when open times are unavailable", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/apprenticeship/slots")) {
        return {
          ok: true,
          json: async () => ({
            available: false,
            slots: [],
            fallback: APPRENTICESHIP_CALENDAR_FALLBACK,
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    await renderPage();
    expect(container?.textContent).toContain(APPRENTICESHIP_CALENDAR_FALLBACK);
    expect(container?.textContent?.toLowerCase()).not.toContain("not configured");
    expect(container?.querySelector("[data-testid=\"apprenticeship-admin-setup\"]")).toBeNull();
    expect(callsTo("/api/apprenticeship/setup")).toHaveLength(0);
  });

  it("shows the calendar setup note only for staff", async () => {
    authState.isStaff = true;
    authState.user = { getIdToken: async () => "staff-token" };
    fetchMock.mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/apprenticeship/setup")) {
        return {
          ok: true,
          json: async () => ({
            setupNote: "Steven needs to share steven@iconicimagestx.com with firebase@project.iam.gserviceaccount.com, or set up domain-wide delegation.",
          }),
        };
      }
      if (target.includes("/api/apprenticeship/slots")) {
        return { ok: true, json: async () => ({ available: false, slots: [], fallback: APPRENTICESHIP_CALENDAR_FALLBACK }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    await renderPage();
    const note = container?.querySelector("[data-testid=\"apprenticeship-admin-setup\"]");
    expect(note?.textContent).toMatch(/domain-wide delegation/);
    expect(callsTo("/api/apprenticeship/setup")).toHaveLength(1);
    expect(callsTo("/api/apprenticeship/setup")[0][1].headers.Authorization).toBe("Bearer staff-token");
  });

  it("starts the existing Square deposit checkout for the $25 booking fee", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    await renderPage();
    await act(async () => {
      setValue("apprentice-name", "Ada Lovelace");
      setValue("apprentice-email", "ada@example.com");
      setValue("apprentice-phone", "281-555-0199");
      setValue("apprentice-address", "100 Oak St, Spring, TX 77380");
      container?.querySelector<HTMLButtonElement>("[data-testid=\"slot-2026-10-14T14:00:00.000Z\"]")?.click();
    });
    fetchMock.mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/apprenticeship/order")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            orderNumber: "#042",
            invoiceId: "inv-ap",
            payToken: "tok",
            checkoutReady: true,
            depositAmount: 25,
          }),
        };
      }
      if (target.includes("/deposit-checkout")) {
        return { ok: true, json: async () => ({ checkoutUrl: "https://square.test/pay", provider: "square" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    await act(async () => {
      container?.querySelector<HTMLFormElement>("[data-testid=\"apprenticeship-form\"]")?.requestSubmit();
    });
    expect(callsTo("/api/apprenticeship/order")).toHaveLength(1);
    const orderBody = JSON.parse(String(callsTo("/api/apprenticeship/order")[0][1].body));
    expect(orderBody.packageId).toBe("apprentice-25");
    expect(orderBody.slotStart).toBe(SLOT.start);
    expect(callsTo("/deposit-checkout")).toHaveLength(1);
    expect(String(callsTo("/deposit-checkout")[0][0])).toBe("/api/payments/invoice/inv-ap/deposit-checkout");
    expect(assign).toHaveBeenCalledWith("https://square.test/pay");
    assign.mockRestore();
  });

  it("keeps the new page off client notification switches", () => {
    const page = readFileSync(path.resolve("client/pages/Apprenticeship.tsx"), "utf8");
    const route = readFileSync(path.resolve("server/routes/apprenticeship.ts"), "utf8");
    expect(page).not.toMatch(/not configured/i);
    expect(page).not.toContain("cadi@");
    expect(route).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(route).not.toContain("cadi@");
    expect(route).not.toMatch(/not configured/i);
  });
});

/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TisTheSeason from "./TisTheSeason";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { HOLIDAY_GIFT, HOLIDAY_HOOK, HOLIDAY_LEAD_RULE, HOLIDAY_PROMO_CODE, HOLIDAY_PROMO_NAME } from "@shared/holidayPromo";
import { PUBLIC_PROCESSING_NOTE } from "@shared/publicRequests";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setValue(id: string, value: string) {
  const input = container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!input) throw new Error(`Missing #${id}`);
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <TisTheSeason />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/settings")) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ success: true }) };
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

describe("tis the season page", () => {
  it("renders the locked promo, package math, processing note, and legal contact", async () => {
    await renderPage();
    const text = container?.textContent || "";
    expect(text).toContain(HOLIDAY_PROMO_NAME);
    expect(text).toContain(HOLIDAY_HOOK);
    expect(text).toContain(HOLIDAY_GIFT);
    expect(text).toContain("Single Shoots");
    expect(text).toContain("$99");
    expect(text).toContain("Studio Party");
    expect(text).toContain("$400+");
    expect(text).toContain("$416");
    expect(text).toContain("Studio Celebration");
    expect(text).toContain("$650+");
    expect(text).toContain("$694");
    expect(text).toContain(HOLIDAY_PROMO_CODE);
    expect(text).toContain(HOLIDAY_LEAD_RULE);
    expect(text).toContain("Half Chef menu");
    expect(text).toContain("Balloon arch");
    expect(container?.querySelector("[data-testid=\"holiday-video\"]")?.className).toContain("aspect-video");
    const date = container?.querySelector<HTMLInputElement>("#holiday-date");
    expect(date?.getAttribute("max")).toBe("2026-12-14");
    expect(date?.min >= "2026-11-27").toBe(true);
    expect(text).toContain("Chef dessert menu");
    expect(text).toContain(PUBLIC_PROCESSING_NOTE);
    expect(text).toContain(LEGAL_BUSINESS_NAME);
    expect(text).toContain(BUSINESS_CONTACT.line);
    expect(text).not.toContain("cadi@");
    expect(text).not.toContain("vercel.app");
    expect(text).not.toContain("squareup.com");
  });

  it("validates the form before it writes", async () => {
    await renderPage();
    const form = container?.querySelector<HTMLFormElement>("[data-testid=\"holiday-booking-form\"]");
    await act(async () => {
      form?.requestSubmit();
    });
    expect(container?.querySelector("[data-testid=\"holiday-error\"]")?.textContent).toBe("Enter your name.");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/public-campaigns"))).toBe(false);
  });

  it("requests a booking and shows the office confirmation", async () => {
    await renderPage();
    await act(async () => {
      setValue("holiday-name", "Ada Lovelace");
      setValue("holiday-email", "ada@example.com");
      setValue("holiday-phone", "281-555-0100");
      setValue("holiday-date", "2026-12-01");
    });
    const form = container?.querySelector<HTMLFormElement>("[data-testid=\"holiday-booking-form\"]");
    await act(async () => {
      form?.requestSubmit();
    });
    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes("/api/public-campaigns/holiday"));
    expect(call?.[0]).toBe("/api/public-campaigns/holiday");
    expect(container?.querySelector("[data-testid=\"holiday-received\"]")?.textContent).toContain("Request received");
    expect(container?.textContent).not.toContain("cadi@");
  });
});

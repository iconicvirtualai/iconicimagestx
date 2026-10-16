/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IconicStudios from "./IconicStudios";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { FOUNDING_PASS_DRAFT_LABEL, STUDIOS_CALENDAR_NOTE } from "@shared/iconicStudiosPublic";
import { PUBLIC_PROCESSING_NOTE } from "@shared/publicRequests";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setValue(id: string, value: string) {
  const input = container?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`);
  if (!input) throw new Error(`Missing #${id}`);
  const prototype = input instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
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
        <IconicStudios />
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

describe("iconic studios page", () => {
  it("renders both rooms, draft passes, holiday links, and the legal line", async () => {
    await renderPage();
    const text = container?.textContent || "";
    expect(text).toContain("Iconic Studios");
    expect(text).toContain(`Part of ${LEGAL_BUSINESS_NAME}`);
    expect(text).toContain("Studio Noir");
    expect(text).toContain("Dark / dramatic");
    expect(text).toContain("Studio Blanc");
    expect(text).toContain("Bright / white");
    expect(text).toContain(FOUNDING_PASS_DRAFT_LABEL);
    expect(text).toContain("$199/mo");
    expect(text).toContain("$499/mo");
    expect(text).toContain("$999/mo");
    expect(text).toContain("not final");
    expect(text).toContain(PUBLIC_PROCESSING_NOTE);
    expect(text).toContain(STUDIOS_CALENDAR_NOTE);
    expect(text).toContain(BUSINESS_CONTACT.email);
    expect(container?.querySelector("a[href=\"/tis-the-season\"]")).toBeTruthy();
    expect(container?.querySelector("a[href=\"/thankful\"]")).toBeTruthy();
    expect(text).not.toContain("cadi@");
    expect(text).not.toContain("vercel.app");
    expect(text).not.toContain("squareup.com");
  });

  it("validates a session request before writing", async () => {
    await renderPage();
    const form = container?.querySelector<HTMLFormElement>("[data-testid=\"studios-request-form\"]");
    await act(async () => {
      form?.requestSubmit();
    });
    expect(container?.querySelector("[data-testid=\"studios-error\"]")?.textContent).toBe("Enter your name.");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/public-campaigns"))).toBe(false);
  });

  it("saves a Noir session request", async () => {
    await renderPage();
    await act(async () => {
      setValue("studios-room", "noir");
      setValue("studios-date", "2026-11-20");
      setValue("studios-time", "15:00");
      setValue("studios-length", "60");
      setValue("studios-name", "Grace Hopper");
      setValue("studios-email", "grace@example.com");
      setValue("studios-phone", "281-555-0199");
    });
    const form = container?.querySelector<HTMLFormElement>("[data-testid=\"studios-request-form\"]");
    await act(async () => {
      form?.requestSubmit();
    });
    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes("/api/public-campaigns/studios"));
    expect(call?.[0]).toBe("/api/public-campaigns/studios");
    const payload = JSON.parse(String(call?.[1].body));
    expect(payload).toMatchObject({ kind: "session", roomId: "noir", lengthId: "60" });
    expect(container?.querySelector("[data-testid=\"studios-received\"]")?.textContent).toContain("Request received");
  });
});

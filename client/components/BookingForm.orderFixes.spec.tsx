/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BOOKING_PROCESSING_LABEL } from "@shared/invoiceProcessing";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const omit = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
    const { initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...rest } = props;
    return React.createElement("div", rest, children);
  };
  return {
    motion: new Proxy({}, { get: () => omit }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  getDocs: () => Promise.resolve({ docs: [] }),
}));
vi.mock("@/lib/createOrder", () => ({
  createOrder: vi.fn(),
}));

import BookingForm from "./BookingForm";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderForm() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/book"]}>
        <BookingForm />
      </MemoryRouter>,
    );
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
});

describe("/book estimator processing line", () => {
  it("adds Processing (2.8%) on top of a $75 package", async () => {
    await renderForm();
    const basics = Array.from(container?.querySelectorAll("button") || []).find((button) =>
      button.textContent?.includes("The Basics (Photos-Only)"),
    );
    expect(basics).toBeTruthy();
    await act(async () => {
      basics?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const apprentice = container?.querySelector<HTMLButtonElement>('[data-testid="apprentice-25"]');
    expect(apprentice).toBeTruthy();
    await act(async () => {
      apprentice?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const estimator = container?.querySelector('[data-testid="booking-estimator"]');
    const text = estimator?.textContent || "";
    expect(text).toContain(BOOKING_PROCESSING_LABEL);
    expect(text).toContain("$75");
    expect(text).toContain("$2.10");
    expect(text).toContain("$77.10");
    expect(text.indexOf(BOOKING_PROCESSING_LABEL)).toBeLessThan(text.indexOf("Total Estimate"));
    expect(text.indexOf("$2.10")).toBeLessThan(text.indexOf("$77.10"));
    const line = container?.querySelector('[data-testid="booking-processing-line"]');
    expect(line?.textContent).toContain(BOOKING_PROCESSING_LABEL);
    expect(line?.textContent).toContain("$2.10");
  });
});

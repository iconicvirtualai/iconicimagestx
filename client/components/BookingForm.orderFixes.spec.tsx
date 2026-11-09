/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { BOOKING_PROCESSING_LABEL } from "@shared/invoiceProcessing";

const PROCESSING_ESTIMATE_LABEL = `${BOOKING_PROCESSING_LABEL}, charged on the invoice`;

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
  it("adds Processing (2.8%) on top of the apprentice 25 package", async () => {
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
    expect(text).toContain(PROCESSING_ESTIMATE_LABEL);
    expect(text).toContain("$85");
    expect(text).toContain("$2.38");
    expect(text).toContain("$87.38");
    expect(text.indexOf(PROCESSING_ESTIMATE_LABEL)).toBeLessThan(text.indexOf("Total Estimate"));
    expect(text.indexOf("$2.38")).toBeLessThan(text.indexOf("$87.38"));
    const line = container?.querySelector('[data-testid="booking-processing-line"]');
    expect(line?.textContent).toContain(PROCESSING_ESTIMATE_LABEL);
    expect(line?.textContent).toContain("$2.38");
  });

  it("shows Luxe Video and its price on the final step, with processing on its own line", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/book?package=luxe-video&example=1&pacPreview=1"]}>
          <BookingForm />
        </MemoryRouter>,
      );
    });

    async function clickNext() {
      const next = Array.from(container?.querySelectorAll("button") || []).find((button) =>
        button.textContent?.includes("Next Stage"),
      );
      expect(next).toBeTruthy();
      await act(async () => {
        next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    await clickNext();
    const skipFinish = Array.from(document.body.querySelectorAll("button") || []).find((button) =>
      button.textContent?.includes("No thanks"),
    );
    if (skipFinish) {
      await act(async () => {
        skipFinish.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    await clickNext();
    const address = container?.querySelector<HTMLInputElement>("#service-location");
    expect(address).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(address, "123 Luxury Lane, Houston, TX");
      address?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickNext();
    await clickNext();

    const summary = container?.querySelector('[data-testid="order-summary-before-submit"]');
    const text = summary?.textContent || "";
    const packageLine = summary?.querySelector('[data-testid="order-summary-package"]');
    const processing = summary?.querySelector('[data-testid="booking-processing-line"]');
    expect(packageLine?.textContent).toContain("Luxe Video");
    expect(packageLine?.textContent).toContain("$785.00");
    expect(processing?.textContent).toContain(PROCESSING_ESTIMATE_LABEL);
    expect(processing?.textContent).toContain("$21.98");
    expect(text.indexOf("Luxe Video")).toBeLessThan(text.indexOf(PROCESSING_ESTIMATE_LABEL));
    expect(text.indexOf(PROCESSING_ESTIMATE_LABEL)).toBeLessThan(text.indexOf("Total estimate"));
    expect(text).toContain("$806.98");

    const pay = container?.querySelector('[data-testid="pay-at-close-option"]');
    const payText = pay?.textContent || "";
    expect(payText).toContain("Pay by card after the shoot");
    expect(payText).toContain("Nothing is charged today. After your shoot we send your invoice with a secure Square card link. Card processing applies when it is turned on.");
    expect(payText).not.toContain("Square checkout on this same invoice.");
  });

  it("keeps the processing percent dynamic and does not say the card is charged at booking", () => {
    const source = readFileSync("client/components/BookingForm.tsx", "utf8");
    expect(source).toContain("processingFeeLabel(percent)");
    expect(source).toContain("percent={pricing.processingPercent}");
    expect(source).toContain(", charged on the invoice");
    expect(source).toContain("Pay by card after the shoot");
    expect(source).not.toContain(">Pay by card</span>");
    expect(source).not.toContain("Square checkout on this same invoice.");
  });

  it("shows 30 Images in the Showcase details popup and keeps the $549 price", async () => {
    await renderForm();
    const showcase = Array.from(container?.querySelectorAll("button") || []).find((button) =>
      button.textContent?.includes("The Showcase"),
    );
    expect(showcase).toBeTruthy();
    await act(async () => {
      showcase?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("30 Images");
    expect(dialog?.textContent).not.toContain("50 Images");
    expect(dialog?.textContent).toContain("$549");
  });
});

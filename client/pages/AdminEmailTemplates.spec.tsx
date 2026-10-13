/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
}));

vi.mock("@/lib/firebase", () => ({ db: { kind: "test" } }));
vi.mock("@/components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>Footer</footer> }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, name: string, id: string) => ({ name, id }),
  onSnapshot: (_ref: unknown, onNext: (snapshot: { forEach: (fn: (row: { id: string; data: () => Record<string, unknown> }) => void) => void }) => void) => {
    onNext({
      forEach: (fn) => {
        for (const row of firestore.docs) fn(row);
      },
    });
    return () => undefined;
  },
  setDoc: firestore.setDoc,
  deleteDoc: firestore.deleteDoc,
}));

import { MemoryRouter } from "react-router-dom";
import AdminEmailTemplates, { ClientEmailTemplateStudio } from "./AdminEmailTemplates";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  firestore.docs = [];
  firestore.setDoc.mockClear();
  firestore.deleteDoc.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

function clickTemplate(id: string) {
  const button = document.querySelector(`[data-template="${id}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`Missing template ${id}`);
  button.click();
}

describe("client email template editor", () => {
  it("lists every client email and previews the built-in copy before Firestore returns", async () => {
    await act(async () => {
      root?.render(<ClientEmailTemplateStudio />);
    });
    for (const id of [
      "booking_received",
      "account_password_setup",
      "order_confirmed",
      "gallery_delivery",
      "invoice",
      "payment_receipt",
      "contact_confirmation",
      "clientConfirmation",
    ]) {
      expect(document.querySelector(`[data-template="${id}"]`)).toBeTruthy();
    }
    const booking = document.querySelector('[data-email-subject="booking_received"]')?.textContent || "";
    expect(booking).toContain("was received");
    expect(booking).not.toMatch(/confirmed/i);
    expect(document.querySelector('[data-email-preview="booking_received"] iframe')?.getAttribute("srcdoc")).toContain(
      "Processing (2.8%)",
    );

    await act(async () => {
      clickTemplate("payment_receipt");
    });
    const receipt = document.querySelector('[data-email-preview="payment_receipt"] iframe')?.getAttribute("srcdoc") || "";
    expect(receipt).toContain("RECEIPT");
    expect(receipt).toContain("Processing (2.8%)");
    expect(receipt).toContain("tel:+12813560965");
    expect(receipt).toContain("mailto:photos@iconicimagestx.com");

    await act(async () => {
      clickTemplate("clientConfirmation");
    });
    const created = document.querySelector('[data-email-subject="clientConfirmation"]')?.textContent || "";
    expect(created).toContain("#104");
    expect(created).not.toContain("firestore");
  });

  it("deletes a default save and writes subject plus htmlBody for an edit", async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <AdminEmailTemplates />
        </MemoryRouter>,
      );
    });
    const save = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Save template"));
    if (!save) throw new Error("Save button missing");
    await act(async () => {
      save.click();
    });
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ name: "emailTemplates", id: "booking_received" });
    expect(firestore.setDoc).not.toHaveBeenCalled();

    const subject = document.getElementById("booking_received-subject") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(subject, "Request received for {{address}}");
      subject.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      save.click();
    });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { name: "emailTemplates", id: "booking_received" },
      expect.objectContaining({
        subject: "Request received for {{address}}",
        htmlBody: expect.stringContaining("{{clientName}}"),
      }),
    );

    const reset = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Reset to default"));
    await act(async () => {
      reset?.click();
    });
    expect((document.getElementById("booking_received-subject") as HTMLInputElement).value).toContain("{{orderNumber}}");
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ name: "emailTemplates", id: "booking_received" });
  });

  it("loads a valid override and ignores a legacy body field", async () => {
    firestore.docs = [
      {
        id: "invoice",
        data: () => ({ subject: "Invoice {{invoiceNumber}}", htmlBody: "<p>Pay {{amount}}</p>" }),
      },
      {
        id: "contact_confirmation",
        data: () => ({ subject: "Old", body: "Hi {name}" }),
      },
    ];
    await act(async () => {
      root?.render(<ClientEmailTemplateStudio initialKey="invoice" />);
    });
    expect((document.getElementById("invoice-subject") as HTMLInputElement).value).toBe("Invoice {{invoiceNumber}}");
    const preview = document.querySelector('[data-email-subject="invoice"]')?.textContent || "";
    expect(preview).toContain("Invoice INV-104");
    expect(document.querySelector('[data-email-preview="invoice"] iframe')?.getAttribute("srcdoc")).toContain("Pay $564.37");

    await act(async () => {
      clickTemplate("contact_confirmation");
    });
    expect((document.getElementById("contact_confirmation-subject") as HTMLInputElement).value).toContain("We received your message");
  });
});

/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { VIRTUAL_STAGING_PRO_RATE_LINE } from "@shared/virtualStagingPro";

vi.mock("@/hooks/useSiteSettings", () => ({
  useSiteSettings: () => ({
    global: { showPromoBar: false, logoText: "ICONIC", promoBarText: "" },
  }),
}));

import VirtualStagingProOrder from "./VirtualStagingProOrder";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <VirtualStagingProOrder />
      </MemoryRouter>,
    );
  });
}

function setValue(id: string, value: string) {
  const input = container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!input) throw new Error(`Missing #${id}`);
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function addPhotos(count: number, name = "living-room.jpg") {
  const input = container?.querySelector<HTMLInputElement>('[data-testid="virtual-staging-pro-files"]');
  if (!input) throw new Error("Missing file input");
  const transfer = new DataTransfer();
  for (let index = 0; index < count; index += 1) {
    const fileName = count === 1 ? name : `room-${index}.jpg`;
    transfer.items.add(new File([new Uint8Array([1, 2, 3, 4])], fileName, { type: "image/jpeg" }));
  }
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.body.innerHTML = "";
  await renderPage();
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

describe("virtual staging pro order", () => {
  it("shows the 10-photo bundle and a live total", async () => {
    expect(container?.textContent).toContain(VIRTUAL_STAGING_PRO_RATE_LINE);
    expect(container?.querySelector('[data-testid="virtual-staging-pro-total"]')?.textContent).toBe("$0");
    await act(async () => {
      addPhotos(5);
    });
    expect(container?.querySelector('[data-testid="virtual-staging-pro-total"]')?.textContent).toBe("$125");
    await act(async () => {
      addPhotos(5);
    });
    expect(container?.querySelector('[data-testid="virtual-staging-pro-total"]')?.textContent).toBe("$200");
    await act(async () => {
      addPhotos(2);
    });
    expect(container?.querySelector('[data-testid="virtual-staging-pro-total"]')?.textContent).toBe("$250");
  });

  it("submits the order and shows the invoice-after-review confirmation", async () => {
    await act(async () => {
      addPhotos(1);
      setValue("vs-pro-name", "Ada Lovelace");
      setValue("vs-pro-email", "ada@woodlandsrealty.com");
      setValue("vs-pro-phone", "281-555-0199");
      setValue("vs-pro-address", "100 Oak St, Spring, TX 77380");
      setValue("vs-pro-instructions", "Dark wood in the living room.");
    });

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target === "/api/virtual-staging-pro/order") {
        const body = JSON.parse(String(init?.body));
        expect(body.total).toBeUndefined();
        expect(body.unitPrice).toBeUndefined();
        expect(body.photos).toEqual([
          expect.objectContaining({
            fileName: "living-room.jpg",
            contentType: "image/jpeg",
            roomType: "Living Room",
            byteSize: 4,
          }),
        ]);
        expect(body.photos[0].dataBase64).toBeUndefined();
        return new Response(JSON.stringify({
          success: true,
          orderId: "order1234abcd",
          orderNumber: "#441",
          photoToken: "token",
          total: 25,
          uploads: [{
            storagePath: "virtual-staging-pro/order1234abcd/0_living-room.jpg",
            uploadUrl: "https://storage.example/upload",
            contentType: "image/jpeg",
            roomType: "Living Room",
            fileName: "living-room.jpg",
          }],
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      if (target === "https://storage.example/upload") {
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 200 });
      }
      if (target === "/api/virtual-staging-pro/orders/order1234abcd/photos") {
        const body = JSON.parse(String(init?.body));
        expect(body.photoToken).toBe("token");
        expect(body.photos).toEqual([{ storagePath: "virtual-staging-pro/order1234abcd/0_living-room.jpg" }]);
        return new Response(JSON.stringify({ success: true, orderNumber: "#441", total: 25 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="virtual-staging-pro-submit"]')?.click();
    });

    const confirmation = container?.querySelector('[data-testid="virtual-staging-pro-confirmation"]');
    expect(confirmation?.textContent).toContain("Order #441 received");
    expect(confirmation?.textContent?.toLowerCase()).toContain("we'll email your invoice after review");
    expect(fetchMock).toHaveBeenCalledWith("/api/virtual-staging-pro/order", expect.objectContaining({ method: "POST" }));
  });

  it("shows the office phone when submit fails", async () => {
    await act(async () => {
      addPhotos(1);
      setValue("vs-pro-name", "Ada Lovelace");
      setValue("vs-pro-email", "ada@woodlandsrealty.com");
      setValue("vs-pro-phone", "281-555-0199");
      setValue("vs-pro-address", "100 Oak St, Spring, TX 77380");
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Enter a valid email." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="virtual-staging-pro-submit"]')?.click();
    });

    const alert = container?.querySelector('[data-testid="virtual-staging-pro-error"]');
    expect(alert?.textContent).toContain("Enter a valid email.");
    expect(alert?.textContent).toContain(BUSINESS_CONTACT.phoneDisplay);
    expect(container?.querySelector('[data-testid="virtual-staging-pro-confirmation"]')).toBeNull();
  });
});

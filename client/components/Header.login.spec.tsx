/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import Header from "./Header";
import Footer from "./Footer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const saved = process.env.CLIENT_PORTAL_ENABLED;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  if (saved === undefined) delete process.env.CLIENT_PORTAL_ENABLED;
  else process.env.CLIENT_PORTAL_ENABLED = saved;
});

async function renderChrome() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <Header />
        <Footer />
      </MemoryRouter>,
    );
  });
}

function text() {
  return container?.textContent || "";
}

describe("client login chrome", () => {
  it("hides Log in in the header, mobile menu, and footer while the portal is off", async () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    await renderChrome();
    expect(text()).not.toContain("Log in");
    expect(text()).not.toContain("Client Login");
    expect(text()).toContain("Book Now");
    const menu = container?.querySelector("button[aria-label='Toggle menu']") as HTMLButtonElement;
    await act(async () => {
      menu.click();
    });
    expect(text()).toContain("Contact Us");
    expect(text()).not.toContain("Log in");
    expect(text()).not.toContain("Client Login");
    expect(container?.querySelector("a[href='/login']")).toBeNull();
  });

  it("restores Log in and Client Login when the flag is exactly true", async () => {
    process.env.CLIENT_PORTAL_ENABLED = "true";
    await renderChrome();
    expect(text()).toContain("Log in");
    expect(text()).toContain("Client Login");
    expect(container?.querySelector("a[href='/login']")).toBeTruthy();
  });
});

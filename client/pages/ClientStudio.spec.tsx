/**
 * @vitest-environment happy-dom
 * @vitest-environment-options {"url": "http://localhost:3000/studio/listing1234abcd"}
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientStudio from "./ClientStudio";

const authState = vi.hoisted(() => ({
  user: null as null | { getIdToken: () => Promise<string> },
  loading: false,
}));

const fetchListing = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/listingUpload", () => ({
  fetchListing,
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;
const writeText = vi.fn(async (_url: string) => undefined);

const LISTING = "listing1234abcd";

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function renderStudio() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/studio/${LISTING}`]}>
        <Routes>
          <Route path="/studio/:listingId" element={<ClientStudio />} />
          <Route path="/gallery/:galleryId" element={<p>Delivery gallery</p>} />
          <Route path="/portal" element={<p>Portal home</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  authState.user = null;
  authState.loading = false;
  fetchListing.mockReset();
  fetchMock.mockReset();
  writeText.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
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

describe("client studio access", () => {
  it("asks a signed-out visitor to sign in and does not render a leaked project", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {
      code: "auth_required",
      message: "Sign in to open this studio.",
      project: {
        address: "SECRET LANE",
        images: [{ url: "https://cdn.example/secret.jpg" }],
      },
    }));
    await renderStudio();
    const text = container?.textContent || "";
    expect(container?.querySelector("[data-studio-access]")?.getAttribute("data-studio-access")).toBe("sign-in");
    expect(text).toContain("Sign in");
    expect(text).toContain("Sign in to open this studio.");
    expect(container?.querySelector('a[href="/portal"]')?.textContent).toContain("Go to your portal");
    expect(text).not.toContain("SECRET LANE");
    expect(text).not.toContain("cdn.example");
    expect(fetchListing).not.toHaveBeenCalled();
  });

  it("tells another client the studio is not theirs", async () => {
    authState.user = { getIdToken: async () => "other-token" };
    fetchMock.mockResolvedValue(jsonResponse(403, {
      code: "studio_forbidden",
      message: "This studio belongs to another client.",
      project: { address: "SECRET LANE", tourUrl: "https://my.matterport.com/show/?m=secret" },
    }));
    await renderStudio();
    const text = container?.textContent || "";
    expect(container?.querySelector("[data-studio-access]")?.getAttribute("data-studio-access")).toBe("other-client");
    expect(text).toContain("This studio belongs to another client");
    expect(container?.querySelector('a[href="/portal"]')).toBeTruthy();
    expect(text).not.toContain("SECRET LANE");
    expect(text).not.toContain("matterport");
    expect(fetchListing).not.toHaveBeenCalled();
  });

  it("shows the owner project and copies the presentation link", async () => {
    authState.user = { getIdToken: async () => "owner-token" };
    fetchMock.mockResolvedValue(jsonResponse(200, {
      kind: "listing",
      sharePath: "/present/abcdefghijklmnopqrstuv",
      project: {
        view: "owner",
        address: "100 Playtest Lane",
        agentName: "Ada Agent",
        images: [],
        videos: [],
        floorPlans: [],
      },
    }));
    await renderStudio();
    expect(container?.textContent).toContain("100 Playtest Lane");
    const button = container?.querySelector<HTMLButtonElement>("[data-testid=\"studio-copy-share\"]");
    expect(button?.textContent).toContain("Copy share link");
    await act(async () => {
      button?.click();
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/present/abcdefghijklmnopqrstuv`);
    expect(writeText.mock.calls.some((call) => String(call[0]).includes("/studio/"))).toBe(false);
  });

  it("still redirects the owner when the gallery is released", async () => {
    authState.user = { getIdToken: async () => "owner-token" };
    fetchMock.mockResolvedValue(jsonResponse(200, {
      kind: "gallery",
      released: true,
      galleryId: "gallery1234abcd",
    }));
    await renderStudio();
    expect(container?.textContent).toContain("Delivery gallery");
  });

  it("keeps the signed-in listing fallback when the lookup is unavailable", async () => {
    authState.user = { getIdToken: async () => "owner-token" };
    fetchListing.mockResolvedValue({
      address: "Fallback Lane",
      presentationToken: "abcdefghijklmnopqrstuv",
      presentationEnabled: true,
    });
    fetchMock.mockResolvedValue(jsonResponse(503, {
      code: "lookup_unavailable",
      message: "Gallery lookup is not configured on this server (Firebase Admin). This is not a missing gallery id.",
    }));
    await renderStudio();
    expect(fetchListing).toHaveBeenCalledWith(LISTING);
    expect(container?.textContent).toContain("Fallback Lane");
    expect(container?.textContent).not.toContain("Sign in to open this studio.");
    const button = container?.querySelector<HTMLButtonElement>("[data-testid=\"studio-copy-share\"]");
    await act(async () => {
      button?.click();
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/present/abcdefghijklmnopqrstuv`);
  });
});

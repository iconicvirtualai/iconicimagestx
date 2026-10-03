import { describe, expect, it, vi } from "vitest";
import { buildPortalListingDetail } from "@shared/portalListingDetail";
import { loadPortalListingView } from "./portalListingRead";

const detail = buildPortalListingDetail({
  listing: {
    id: "listing1234",
    status: "scheduled",
    address: { street: "18 Oak Hollow", city: "Spring", state: "TX", zip: "77389" },
  },
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("loadPortalListingView", () => {
  it("reads a listing for a logged-out visitor and does not grant edits", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("/api/portal/listings/listing1234");
      return jsonResponse(200, detail);
    });
    const loaded = await loadPortalListingView({
      listingId: "listing1234",
      asClient: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(loaded).toMatchObject({ kind: "ready", canEdit: false, detail: { id: "listing1234" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps edits for the owning client session", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("/api/clients/me/listings/listing1234");
      return jsonResponse(200, detail);
    });
    const loaded = await loadPortalListingView({
      listingId: "listing1234",
      asClient: true,
      token: "owner-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(loaded).toMatchObject({ kind: "ready", canEdit: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("shows a non-owner client the public listing without edits", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("/api/clients/me/")) return jsonResponse(403, { error: "You do not have access to this listing." });
      return jsonResponse(200, detail);
    });
    const loaded = await loadPortalListingView({
      listingId: "listing1234",
      asClient: true,
      token: "other-client",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(loaded).toMatchObject({ kind: "ready", canEdit: false, detail: { title: detail.title } });
  });

  it("does not invent a listing when the id is missing or unknown", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "Listing not found." }));
    expect(await loadPortalListingView({
      listingId: "no",
      asClient: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).toEqual({ kind: "missing" });
    expect(fetchImpl).not.toHaveBeenCalled();

    expect(await loadPortalListingView({
      listingId: "listing1234",
      asClient: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).toEqual({ kind: "missing" });
  });

  it("reports a failed read instead of a placeholder listing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT." }));
    const loaded = await loadPortalListingView({
      listingId: "listing1234",
      asClient: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(loaded).toEqual({
      kind: "error",
      message: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT.",
    });
  });
});

import {
  portalListingId,
  portalListingOwnerApiPath,
  portalListingPublicApiPath,
  type PortalListingDetail,
} from "@shared/portalListingDetail";

export type PortalListingLoad =
  | { kind: "missing" }
  | { kind: "ready"; canEdit: boolean; detail: PortalListingDetail }
  | { kind: "error"; message: string };

function isDetail(value: unknown): value is PortalListingDetail {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PortalListingDetail>;
  return typeof row.id === "string"
    && row.id.length > 0
    && typeof row.title === "string"
    && row.address != null
    && row.website != null
    && Array.isArray(row.photos);
}

/**
 * Owning clients use the session route. Everyone else, including a client who
 * does not own this listing, gets the public link read and cannot edit it.
 * A missing listing is not filled in.
 */
export async function loadPortalListingView(input: {
  listingId: string;
  asClient: boolean;
  token?: string;
  fetchImpl?: typeof fetch;
}): Promise<PortalListingLoad> {
  const id = portalListingId(input.listingId);
  if (!id) return { kind: "missing" };
  const fetchImpl = input.fetchImpl ?? fetch;

  if (input.asClient && input.token) {
    const owned = await fetchImpl(portalListingOwnerApiPath(id), {
      headers: { Authorization: `Bearer ${input.token}` },
    });
    if (owned.status === 200) {
      const data = await owned.json().catch(() => null);
      if (!isDetail(data)) return { kind: "error", message: "Could not load this listing." };
      return { kind: "ready", canEdit: true, detail: data };
    }
    if (owned.status === 404) return { kind: "missing" };
  }

  const shared = await fetchImpl(portalListingPublicApiPath(id));
  if (shared.status === 404 || shared.status === 400) return { kind: "missing" };
  if (shared.status !== 200) {
    const data = await shared.json().catch(() => null);
    const message = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : "Could not load this listing.";
    return { kind: "error", message };
  }
  const data = await shared.json().catch(() => null);
  if (!isDetail(data)) return { kind: "error", message: "Could not load this listing." };
  return { kind: "ready", canEdit: false, detail: data };
}

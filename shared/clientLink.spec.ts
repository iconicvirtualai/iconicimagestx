import { describe, expect, it } from "vitest";
import { knownClientIds, recordLinkedToClient, recordVisibleToIdentity } from "./clientLink";
import { visibleToPortalClient } from "./listingWrite";

const cadi = { ids: ["cadi-uid"], email: "cadi.north@example.com" };
const other = knownClientIds([{ id: "other-real", firebaseUid: "uid-other" }], cadi.ids);

describe("recordVisibleToIdentity email fallback", () => {
  it("shows a same-email order whose clientId is stale or unknown", () => {
    const order = { clientId: "deleted-old-client", clientEmail: "Cadi.North@example.com", orderNumber: "#221" };
    expect(visibleToPortalClient(order, { ...cadi, otherClientIds: other })).toBe(true);
    expect(recordVisibleToIdentity(order, { ...cadi, otherClientIds: [] })).toBe(true);
  });

  it("hides an order whose clientId belongs to a different real client", () => {
    const order = { clientId: "other-real", email: "cadi.north@example.com", orderNumber: "#222" };
    expect(visibleToPortalClient(order, { ...cadi, otherClientIds: other })).toBe(false);
    expect(recordVisibleToIdentity(
      { firebaseUid: "uid-other", clientEmail: "cadi.north@example.com" },
      { ...cadi, otherClientIds: other },
    )).toBe(false);
    expect(recordVisibleToIdentity(
      { clientProfileId: "client:other-real", clientEmail: "cadi.north@example.com" },
      { ...cadi, otherClientIds: other },
    )).toBe(false);
  });

  it("still blocks a stored id when the caller has not checked known clients", () => {
    expect(recordVisibleToIdentity(
      { clientId: "deleted-old-client", clientEmail: "cadi.north@example.com" },
      cadi,
    )).toBe(false);
  });

  it("keeps an order on the admin client when the email matches and the id is stale", () => {
    const client = { id: "cadi-uid", email: "cadi.north@example.com", firebaseUid: "cadi-uid" };
    const stale = { clientId: "deleted-old-client", clientEmail: "cadi.north@example.com" };
    const foreign = { clientId: "other-real", email: "cadi.north@example.com" };
    expect(recordLinkedToClient(stale, client, other)).toBe(true);
    expect(recordLinkedToClient(foreign, client, other)).toBe(false);
  });
});

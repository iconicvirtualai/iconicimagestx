import { describe, expect, it } from "vitest";
import { createMemoryFirestore } from "../lib/memoryFirestore";
import { visibleToPortalClient } from "../../shared/listingWrite";
import { otherKnownClientIds } from "./knownClients";

describe("otherKnownClientIds", () => {
  it("treats a missing client id as stale and a real client doc as someone else", async () => {
    const memory = createMemoryFirestore();
    memory.seed("clients", "other-real", { email: "other.person@example.com", firebaseUid: "uid-other" });
    const identity = { ids: ["cadi-uid"], email: "cadi.north@example.com" };
    const stale = { clientId: "deleted-old-client", clientEmail: "cadi.north@example.com", orderNumber: "#221" };
    const foreign = { clientId: "other-real", clientEmail: "cadi.north@example.com", orderNumber: "#222" };
    const otherClientIds = await otherKnownClientIds(memory.db, [stale, foreign], identity.ids);

    expect(visibleToPortalClient(stale, { ...identity, otherClientIds })).toBe(true);
    expect(visibleToPortalClient(foreign, { ...identity, otherClientIds })).toBe(false);
    expect(visibleToPortalClient(
      { clientId: "cadi-uid", clientEmail: "someone@example.com" },
      { ...identity, otherClientIds },
    )).toBe(true);
  });
});

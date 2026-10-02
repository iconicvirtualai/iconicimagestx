import { describe, expect, it } from "vitest";
import { bareClientRouteKind, bareClientRouteMessage, isBareClientRoute } from "./bareClientRoute";

describe("bare client routes", () => {
  it("matches only studio and gallery with no id", () => {
    expect(bareClientRouteKind("/studio")).toBe("studio");
    expect(bareClientRouteKind("/studio/")).toBe("studio");
    expect(bareClientRouteKind("/studio?from=email")).toBe("studio");
    expect(bareClientRouteKind("/gallery")).toBe("gallery");
    expect(bareClientRouteKind("/gallery/")).toBe("gallery");
    expect(isBareClientRoute("/gallery#top")).toBe(true);
  });

  it("leaves id links and public studio pages alone", () => {
    for (const path of [
      "/studio/V92oe4gWihszc95tEcVQ",
      "/studio/V92oe4gWihszc95tEcVQ/",
      "/gallery/playtest-gallery-1",
      "/studio-105",
      "/admin/studio",
      "/api/studio",
      "/api/galleries/link/V92oe4gWihszc95tEcVQ",
      "/",
    ]) {
      expect(isBareClientRoute(path)).toBe(false);
    }
  });

  it("names the missing id without the soft-404 oops copy", () => {
    expect(bareClientRouteMessage("studio")).toContain("studio link includes an ID");
    expect(bareClientRouteMessage("gallery")).toContain("gallery link includes an ID");
    expect(bareClientRouteMessage("studio")).not.toContain("Oops!");
    expect(bareClientRouteMessage("gallery")).not.toContain("Oops!");
  });
});

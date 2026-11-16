import { describe, expect, it } from "vitest";
import { portalPortrait } from "./portalAvatar";

describe("portalPortrait", () => {
  it("uses the headshot before a logo", () => {
    expect(portalPortrait({
      headshotUrl: "https://cdn.example/head.jpg",
      companyLogoUrl: "https://cdn.example/logo.png",
    })).toEqual({ url: "https://cdn.example/head.jpg", kind: "headshot" });
  });

  it("falls back to the company logo, then the brokerage logo", () => {
    expect(portalPortrait({ companyLogoUrl: "/api/clients/profile-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toEqual({
      url: "/api/clients/profile-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "logo",
    });
    expect(portalPortrait({ brokerageLogoUrl: "https://cdn.example/broker.png" }).kind).toBe("logo");
  });

  it("does not treat a stored logo copy as a headshot", () => {
    const logo = "https://cdn.example/logo.png";
    expect(portalPortrait({ photoUrl: logo, companyLogoUrl: logo })).toEqual({ url: logo, kind: "logo" });
  });

  it("uses initials when nothing is stored", () => {
    expect(portalPortrait({})).toEqual({ url: "", kind: "initials" });
  });
});

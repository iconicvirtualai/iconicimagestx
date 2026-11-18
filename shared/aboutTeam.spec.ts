import { describe, expect, it } from "vitest";
import { BOOKING_PHOTOGRAPHERS } from "../server/services/bookingPhotographers.ts";
import {
  ABOUT_OWNER,
  ABOUT_TEAM,
  aboutMonogram,
  aboutTeamFromItems,
  orderedAboutTeam,
  safeAboutPhoto,
} from "./aboutTeam.ts";

describe("about team roster", () => {
  it("uses the public booking names and keeps Cadi as owner only", () => {
    const booking = new Map(BOOKING_PHOTOGRAPHERS.map((person) => [person.id, person.name]));
    expect(ABOUT_OWNER.name).toBe(booking.get("cadi-torres"));
    expect(ABOUT_TEAM.map((member) => member.name)).toEqual([
      booking.get("mike-luna"),
      booking.get("armando-martinez"),
      booking.get("daniel-adaclog"),
      booking.get("steven-banda"),
      booking.get("pedro-hernandez"),
      booking.get("david-gonzalez"),
    ]);
    expect(ABOUT_TEAM.map((member) => member.id)).not.toContain("cadi");
    expect(ABOUT_TEAM.every((member) => member.bioIsPlaceholder)).toBe(true);
  });

  it("refuses the Jazmin reference photos and falls back to a monogram letter", () => {
    expect(safeAboutPhoto("/about-banner/ref/cadi_1.jpg")).toBe("");
    expect(safeAboutPhoto("/media/about-banner/ref/cadi_2.jpg?v=1")).toBe("");
    expect(safeAboutPhoto("https://cdn.example.com/cadi_3.jpg")).toBe("");
    expect(safeAboutPhoto("/holiday-2026/crew-cadi.jpg")).toBe("/holiday-2026/crew-cadi.jpg");
    expect(ABOUT_TEAM.map((member) => safeAboutPhoto(member.photo))).not.toContain("");
    expect(aboutMonogram("Armando Martinez")).toBe("A");
    expect(aboutMonogram("")).toBe("I");
  });

  it("sorts by the order field and keeps a cleared bio cleared", () => {
    const sorted = aboutTeamFromItems([
      { id: "david", fields: [{ id: "name", value: "David Gonzalez" }, { id: "order", value: "1" }, { id: "bio", value: "" }, { id: "photo", value: "/about-banner/ref/cadi_1.jpg" }] },
      { id: "mike", fields: [{ id: "name", value: "Mike Luna" }, { id: "order", value: "2" }] },
    ]);
    expect(sorted.map((member) => member.name)).toEqual(["David Gonzalez", "Mike Luna"]);
    expect(sorted[0]?.bio).toBe("");
    expect(sorted[0]?.photo).toBe("");
    expect(sorted[1]?.role).toBe("Media Producer · Videographer");
    expect(orderedAboutTeam(ABOUT_TEAM).map((member) => member.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

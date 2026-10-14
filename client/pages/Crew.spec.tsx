import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CREW, CREW_JOIN_HREF } from "@/content/crew";

const page = readFileSync(new URL("./Crew.tsx", import.meta.url), "utf8");
const data = readFileSync(new URL("../content/crew.ts", import.meta.url), "utf8");

describe("iconic crew", () => {
  it("lists everyone shown on the current Wix crew page", () => {
    expect(CREW.map((person) => [person.name, person.roles.join(", ")])).toEqual([
      ["Armando", "Photographer, Videographer, Drone Operator, 3D Tours, Reels & Social Media, *Bi-Lingual*"],
      ["Daniel", "Photographer, Videographer, Drone Operator, 3D Tours, Reels & Social Media"],
      ["Pedro", "Photographer, Drone Operator, 3D Tours, Reels & Social Media, *Bi-Lingual*"],
      ["David", "Photographer, Videographer, Drone Operator, 3D Tours"],
      ["Mike", "Media Producer, Videographer"],
      ["Cadi", "Owner"],
      ["Janie", "Marketing Assistant, Content Creation & Special Projects"],
    ]);
    expect(CREW.filter((person) => !person.photo)).toEqual([]);
    expect(CREW.find((person) => person.name === "Janie")?.bio).toBe("");
    expect(CREW.filter((person) => person.name !== "Janie").every((person) => person.bio.length > 40)).toBe(true);
  });

  it("sends joiners to the apprenticeship and keeps personal contact off the page", () => {
    expect(CREW_JOIN_HREF).toBe("/apprenticeship");
    expect(page).toContain("useSiteHref(\"crew\", \"join\", \"label\", CREW_JOIN_HREF)");
    expect(`${page}\n${data}`).not.toMatch(/cadi@/i);
    expect(`${page}\n${data}`).not.toMatch(/mailto:/i);
    expect(`${page}\n${data}`).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  });
});

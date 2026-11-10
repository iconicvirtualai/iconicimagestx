import { describe, expect, it } from "vitest";
import { editWantsGrass, promptRequestsGrass, stripGrassInstructions } from "./grassEdit";
import { ICONIC_POLISH_INSTRUCTION } from "./orderEditPlan";

describe("grass prompt guard", () => {
  it("removes add-grass sentences and keeps the rest of a polish request", () => {
    const prompt = `${ICONIC_POLISH_INSTRUCTION} Add grass. Keep the mailbox.`;
    expect(promptRequestsGrass("Add grass")).toBe(true);
    expect(promptRequestsGrass(ICONIC_POLISH_INSTRUCTION)).toBe(false);
    const stripped = stripGrassInstructions(prompt);
    expect(stripped).not.toMatch(/\badd grass\b/i);
    expect(stripped).toMatch(/mailbox/i);
    expect(stripped).toMatch(/foliage/i);
    expect(editWantsGrass(ICONIC_POLISH_INSTRUCTION)).toBe(true);
    expect(editWantsGrass("Balance the color.", { grassReplacement: false })).toBe(false);
    expect(editWantsGrass("Balance the color.", { grassReplacement: true })).toBe(true);
  });
});

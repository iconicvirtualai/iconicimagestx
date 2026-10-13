import { describe, expect, it } from "vitest";
import { BOT_ROUTINES } from "./botRoutines";

describe("bot routines", () => {
  it("lists each bot in plain language", () => {
    expect(BOT_ROUTINES.map((bot) => bot.name)).toEqual(["Rex", "Quinn", "Cadi 2.0", "Sam", "Sasha", "Cody"]);
    for (const bot of BOT_ROUTINES) {
      expect(bot.summary.endsWith(".")).toBe(true);
      expect(["Active", "Paused", "On request"]).toContain(bot.status);
    }
    expect(BOT_ROUTINES.find((bot) => bot.name === "Rex")).toMatchObject({
      when: "On request",
      status: "On request",
    });
    expect(BOT_ROUTINES.filter((bot) => bot.name !== "Rex").every((bot) => bot.when === "Schedule to confirm")).toBe(true);
  });
});

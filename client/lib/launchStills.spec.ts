import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_STILLS } from "./launchStills";

const BANNED = [/chase/i, /harvill/i, /hockley/i, /hunters/i, /1175/, /fotello/i, /hereford/i];

describe("launch stills", () => {
  it("keeps captions Iconic-only and ships each file", () => {
    expect(LAUNCH_STILLS).toHaveLength(15);
    for (const still of LAUNCH_STILLS) {
      for (const pattern of BANNED) {
        expect(`${still.title} ${still.alt}`, still.id).not.toMatch(pattern);
      }
      const file = path.join(process.cwd(), "public", still.src.replace(/^\//, ""));
      expect(fs.existsSync(file), still.src).toBe(true);
      const size = fs.statSync(file).size;
      expect(size, still.src).toBeGreaterThan(20_000);
      expect(size, still.src).toBeLessThan(700_000);
    }
  });
});

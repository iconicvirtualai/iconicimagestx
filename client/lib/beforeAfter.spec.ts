import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_BEFORE_AFTER,
  AERIAL_STILLS,
  PRIMARY_SUITE_STILL,
  marketingCopy,
} from "./beforeAfter";

const BANNED = [/chase/i, /harvill/i, /hockley/i, /hunters/i, /1175/, /fotello/i, /hereford/i];

describe("public before/after media", () => {
  it("uses marketing labels only", () => {
    for (const line of marketingCopy()) {
      for (const pattern of BANNED) {
        expect(line, line).not.toMatch(pattern);
      }
    }
  });

  it("ships each still under public/media", () => {
    const srcs = [
      ...AI_BEFORE_AFTER.flatMap((pair) => [pair.before.src, pair.after.src]),
      ...AERIAL_STILLS.map((still) => still.src),
      PRIMARY_SUITE_STILL.src,
    ];
    for (const src of srcs) {
      const file = path.join(process.cwd(), "public", src.replace(/^\//, ""));
      expect(fs.existsSync(file), src).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(20_000);
      expect(fs.statSync(file).size).toBeLessThan(700_000);
    }
  });
});

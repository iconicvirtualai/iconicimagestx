import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["client/pages", "client/components", "client/hooks"];
const BANNED = [/i\.pravatar\.cc/i, /images\.unsplash\.com/i, /videos\.pexels\.com/i, /cdn\.builder\.io/i];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("launch media inventory", () => {
  it("keeps public UI source off stock hosts and fake avatars", () => {
    const files = ROOTS.flatMap((root) => walk(path.join(process.cwd(), root)));
    const hits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const pattern of BANNED) {
        if (pattern.test(text)) hits.push(`${file} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

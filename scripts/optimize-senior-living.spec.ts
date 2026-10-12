import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { SENIOR_LIVING_WIDTHS } from "../client/content/seniorLiving";
import { optimizeSeniorLivingSources } from "./optimize-senior-living";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("optimize senior living photos", () => {
  it("writes WebP widths and a JPEG fallback from one original", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "senior-living-"));
    dirs.push(root);
    const inputDir = path.join(root, "in");
    const outputDir = path.join(root, "out");
    await mkdir(inputDir, { recursive: true });
    await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .jpeg()
      .toFile(path.join(inputDir, "community-lobby.jpg"));

    const written = await optimizeSeniorLivingSources({ inputDir, outputDir });
    expect(written).toHaveLength(1);
    expect(written[0].stem).toBe("community-lobby");
    expect(written[0].warned).toBeNull();

    for (const width of SENIOR_LIVING_WIDTHS) {
      const meta = await sharp(
        path.join(outputDir, `community-lobby-${width}.webp`),
      ).metadata();
      expect(meta.width).toBe(width);
      expect(meta.format).toBe("webp");
    }
    const jpg = await sharp(
      path.join(outputDir, "community-lobby.jpg"),
    ).metadata();
    expect(jpg.width).toBe(SENIOR_LIVING_WIDTHS[0]);
    expect(jpg.format).toBe("jpeg");
    const bytes = await readFile(
      path.join(outputDir, "community-lobby-640.webp"),
    );
    expect(bytes.length).toBeGreaterThan(20);
  });
});

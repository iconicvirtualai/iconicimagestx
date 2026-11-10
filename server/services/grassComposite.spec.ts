import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compositeGrass, segmentLawn } from "./grassComposite";

const referencePath = path.join(process.cwd(), "public/studio/grass-reference.jpg");

async function jpegFrom(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  return { jpeg, raw };
}

function outsideIsExact(original: Uint8Array, edited: Uint8Array, alpha: Uint8Array) {
  let outside = 0;
  let exact = 0;
  let inside = 0;
  let changed = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    const p = i * 3;
    const same = original[p] === edited[p] && original[p + 1] === edited[p + 1] && original[p + 2] === edited[p + 2];
    if (alpha[i] === 0) {
      outside += 1;
      if (same) exact += 1;
    } else if (alpha[i] >= 200) {
      inside += 1;
      if (!same) changed += 1;
    }
  }
  return { outside, exact, inside, changed };
}

describe("grass composite", () => {
  it("replaces the lawn and leaves sky, house, and canopy pixels exact", async () => {
    const width = 320;
    const height = 240;
    const { jpeg } = await jpegFrom(width, height, (x, y) => {
      const tree = (x - 48) ** 2 + (y - 36) ** 2 < 28 ** 2;
      if (tree) return [20, 70, 25];
      if (y < 90) return [70, 140, 220];
      if (y < 150 && x > 90 && x < 250) return [150, 110, 80];
      if (x > 140 && x < 175) return [170, 170, 165];
      return [50, 130 + (x % 5), 45];
    });
    const reference = await fs.readFile(referencePath);
    const result = await compositeGrass({ photo: jpeg, reference, retainRaw: true });
    expect(result.applied).toBe(true);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(result.note).toMatch(/grass reference/i);
    const decoded = await sharp(jpeg).rotate().removeAlpha().raw().toBuffer();
    const counts = outsideIsExact(new Uint8Array(decoded), result.raw!, result.alpha!);
    expect(counts.exact).toBe(counts.outside);
    expect(counts.changed / counts.inside).toBeGreaterThan(0.8);
    expect(result.alpha![10 * width + 10]).toBe(0);
    expect(result.alpha![120 * width + 160]).toBe(0);
    expect(result.alpha![30 * width + 48]).toBe(0);
    expect(result.alpha![210 * width + 20]).toBeGreaterThan(200);
  });

  it("includes bare dirt at the bottom of the lawn and still skips the walk", () => {
    const width = 120;
    const height = 90;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const walk = x > 50 && x < 68;
        if (y < 28) {
          rgb[i] = 80; rgb[i + 1] = 150; rgb[i + 2] = 220;
        } else if (walk) {
          rgb[i] = 176; rgb[i + 1] = 176; rgb[i + 2] = 172;
        } else if (y > 72) {
          rgb[i] = 158; rgb[i + 1] = 124; rgb[i + 2] = 68;
        } else {
          rgb[i] = 48; rgb[i + 1] = 132; rgb[i + 2] = 46;
        }
      }
    }
    const mask = segmentLawn(rgb, width, height);
    expect(mask).not.toBeNull();
    expect(mask![80 * width + 12]).toBe(255);
    expect(mask![80 * width + 58]).toBe(0);
    expect(mask![8 * width + 12]).toBe(0);
  });

  it("composites only the masked lawn from a model frame and keeps the original resolution", async () => {
    const width = 200;
    const height = 140;
    const { jpeg } = await jpegFrom(width, height, (_x, y) => (y < 50 ? [80, 150, 210] : [40, 110, 42]));
    const reference = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 30, g: 120, b: 40 } },
    }).jpeg().toBuffer();
    const model = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();
    const result = await compositeGrass({
      photo: jpeg,
      reference,
      retainRaw: true,
      inpaint: async () => model,
    });
    expect(result.applied).toBe(true);
    expect(result.note).toMatch(/masked inpaint/i);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    const decoded = await sharp(jpeg).removeAlpha().raw().toBuffer();
    const counts = outsideIsExact(new Uint8Array(decoded), result.raw!, result.alpha!);
    expect(counts.exact).toBe(counts.outside);
    const lawn = 110 * width + 20;
    expect(result.alpha![lawn]).toBeGreaterThan(200);
    expect(result.raw![lawn * 3]).not.toBe(255);
    expect(result.raw![lawn * 3 + 1]).toBeGreaterThan(20);
  });

  it("uses a staff mask and does not paint outside it", async () => {
    const width = 200;
    const height = 160;
    const { jpeg } = await jpegFrom(width, height, (_x, y) => (y < 50 ? [80, 150, 210] : [40, 120, 40]));
    const mask = await sharp({
      create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([{
        input: await sharp({
          create: { width: 60, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } },
        }).png().toBuffer(),
        left: 20,
        top: 100,
      }])
      .png()
      .toBuffer();
    const reference = await fs.readFile(referencePath);
    const result = await compositeGrass({ photo: jpeg, reference, mask, retainRaw: true });
    expect(result.applied).toBe(true);
    const decoded = await sharp(jpeg).rotate().removeAlpha().raw().toBuffer();
    const counts = outsideIsExact(new Uint8Array(decoded), result.raw!, result.alpha!);
    expect(counts.exact).toBe(counts.outside);
    expect(result.alpha![110 * width + 40]).toBeGreaterThan(200);
    expect(result.alpha![110 * width + 140]).toBe(0);
  });

  it("leaves an interior unchanged when no lawn is detected", async () => {
    const photo = await fs.readFile(path.join(process.cwd(), "public/media/photos/luxury-exterior.jpg"));
    const reference = await fs.readFile(referencePath);
    const result = await compositeGrass({ photo, reference });
    expect(result.applied).toBe(false);
    expect(result.bytes).toBe(photo);
    expect(result.note).toMatch(/No lawn detected/);
    expect(result.note).toMatch(/unchanged/);
  });

  it("keeps trees and the house off the mask on real listing photos", async () => {
    const reference = await fs.readFile(referencePath);
    const photos = [
      ["hero-day-exterior-front", "public/media/launch/hero_day_exterior_front.jpg"],
      ["exterior-entry-day", "public/media/launch/exterior_entry_day.jpg"],
      ["marias-front-day", "public/media/pay-at-close/luxury/marias/01-front-day.jpg"],
      ["forest-heights-twilight", "public/media/photos/forest-heights-twilight-front.jpg"],
    ] as const;
    const artifactDir = process.env.GRASS_WRITE_ARTIFACTS === "1" ? "/opt/cursor/artifacts/grass" : "";
    if (artifactDir) await fs.mkdir(artifactDir, { recursive: true });

    for (const [name, rel] of photos) {
      const photo = await fs.readFile(path.join(process.cwd(), rel));
      const oriented = await sharp(photo).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const result = await compositeGrass({ photo, reference, retainRaw: true });
      expect(result.applied, name).toBe(true);
      expect(result.width).toBe(oriented.info.width);
      expect(result.height).toBe(oriented.info.height);
      const counts = outsideIsExact(new Uint8Array(oriented.data), result.raw!, result.alpha!);
      expect(counts.exact, name).toBe(counts.outside);
      expect(counts.changed / counts.inside, name).toBeGreaterThan(0.5);

      const height = result.height;
      const width = result.width;
      const topRows = Math.floor(height * 0.12);
      let top = 0;
      let topOn = 0;
      for (let y = 0; y < topRows; y += 1) {
        for (let x = 0; x < width; x += 1) {
          top += 1;
          if (result.alpha![y * width + x] >= 128) topOn += 1;
        }
      }
      expect(topOn / top, name).toBeLessThan(0.01);

      if (artifactDir) {
        await fs.writeFile(path.join(artifactDir, `${name}-before.jpg`), photo);
        await fs.writeFile(path.join(artifactDir, `${name}-after.jpg`), result.bytes);
        await fs.writeFile(path.join(artifactDir, `${name}-mask.png`), result.maskPng!);
      }
    }
  }, 120_000);
});

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

function meanLuma(
  raw: Uint8Array,
  alpha: Uint8Array,
  width: number,
  pick: (x: number, y: number) => boolean,
) {
  let sum = 0;
  let n = 0;
  const height = alpha.length / width;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (alpha[i] < 180 || !pick(x, y)) continue;
      const p = i * 3;
      sum += raw[p] * 0.2126 + raw[p + 1] * 0.7152 + raw[p + 2] * 0.0722;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

function repeatPeak(samples: number[]) {
  const n = samples.length;
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= n;
  let energy = 0;
  const centered = samples.map((value) => {
    const delta = value - mean;
    energy += delta * delta;
    return delta;
  });
  if (energy < 1) return 0;
  let peak = 0;
  for (let lag = 3; lag <= 16; lag += 1) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i + lag < n; i += 1) {
      corr += centered[i] * centered[i + lag];
      count += 1;
    }
    peak = Math.max(peak, corr / (energy * (count / n)));
  }
  return peak;
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

  it("keeps a wide pale driveway out of the mask, including Marias", async () => {
    const width = 180;
    const height = 120;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const driveway = y > 62 && y < 82;
        if (y < 36) {
          rgb[i] = 90; rgb[i + 1] = 160; rgb[i + 2] = 220;
        } else if (driveway) {
          rgb[i] = 214; rgb[i + 1] = 202; rgb[i + 2] = 184;
        } else {
          rgb[i] = 46 + (x % 3); rgb[i + 1] = 128; rgb[i + 2] = 44;
        }
      }
    }
    const synthetic = segmentLawn(rgb, width, height);
    expect(synthetic).not.toBeNull();
    expect(synthetic![50 * width + 40]).toBe(255);
    expect(synthetic![100 * width + 40]).toBe(255);
    expect(synthetic![72 * width + 90]).toBe(0);
    let driveOn = 0;
    let drive = 0;
    for (let y = 64; y < 80; y += 1) {
      for (let x = 8; x < width - 8; x += 1) {
        drive += 1;
        if (synthetic![y * width + x] >= 128) driveOn += 1;
      }
    }
    expect(driveOn / drive).toBe(0);

    const photo = await fs.readFile(path.join(process.cwd(), "public/media/pay-at-close/luxury/marias/01-front-day.jpg"));
    const oriented = await sharp(photo).rotate().resize({ width: 640, height: 640, fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = segmentLawn(new Uint8Array(oriented.data), oriented.info.width, oriented.info.height);
    expect(mask).not.toBeNull();
    const photoWidth = oriented.info.width;
    const photoHeight = oriented.info.height;
    let concrete = 0;
    let concreteMasked = 0;
    let foreground = 0;
    let foregroundMasked = 0;
    for (let y = 0; y < photoHeight; y += 1) {
      for (let x = 0; x < photoWidth; x += 1) {
        const i = y * photoWidth + x;
        const p = i * 3;
        const r = oriented.data[p];
        const g = oriented.data[p + 1];
        const b = oriented.data[p + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const beige = sat <= 0.22 && max > 150 && r + 4 >= g && g + 4 >= b && Math.abs(r - g) < 28;
        const lawnGreen = g > r + 10 && g > b + 12 && sat > 0.18;
        const on = mask![i] >= 128;
        if (beige && y > photoHeight * 0.46 && y < photoHeight * 0.64 && x > photoWidth * 0.08 && x < photoWidth * 0.92) {
          concrete += 1;
          if (on) concreteMasked += 1;
        }
        if (lawnGreen && y > photoHeight * 0.75) {
          foreground += 1;
          if (on) foregroundMasked += 1;
        }
      }
    }
    expect(concrete).toBeGreaterThan(200);
    expect(concreteMasked / concrete).toBeLessThan(0.04);
    expect(foregroundMasked / foreground).toBeGreaterThan(0.75);
  });

  it("keeps the original cast shadow when the model paints flat light", async () => {
    const width = 160;
    const height = 120;
    const { jpeg } = await jpegFrom(width, height, (x, y) => {
      if (y < 40) return [80, 150, 220];
      const shadow = x > 70 && x < 108;
      return shadow ? [18, 48, 20] : [70, 150, 55];
    });
    const reference = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 40, g: 130, b: 50 } },
    }).jpeg().toBuffer();
    const flat = await sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 190, g: 230, b: 120 } },
    }).png().toBuffer();
    const result = await compositeGrass({
      photo: jpeg,
      reference,
      retainRaw: true,
      inpaint: async () => flat,
    });
    expect(result.applied).toBe(true);
    const decoded = new Uint8Array(await sharp(jpeg).rotate().removeAlpha().raw().toBuffer());
    const shadow = meanLuma(result.raw!, result.alpha!, width, (x, y) => y > 70 && x > 78 && x < 100);
    const sun = meanLuma(result.raw!, result.alpha!, width, (x, y) => y > 70 && x > 20 && x < 50);
    const originalShadow = meanLuma(decoded, result.alpha!, width, (x, y) => y > 70 && x > 78 && x < 100);
    const originalSun = meanLuma(decoded, result.alpha!, width, (x, y) => y > 70 && x > 20 && x < 50);
    expect(sun).toBeGreaterThan(shadow * 1.6);
    expect(shadow / sun).toBeLessThan((originalShadow / originalSun) * 1.2);
    expect(shadow / sun).toBeGreaterThan((originalShadow / originalSun) * 0.8);
  });

  it("drops a repeating crosshatch instead of seating it on the lawn", async () => {
    const width = 160;
    const height = 120;
    const { jpeg } = await jpegFrom(width, height, (_x, y) => (y < 36 ? [80, 150, 220] : [55, 125, 48]));
    const reference = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 40, g: 120, b: 45 } },
    }).jpeg().toBuffer();
    const grid = Buffer.alloc(96 * 72 * 3);
    for (let y = 0; y < 72; y += 1) {
      for (let x = 0; x < 96; x += 1) {
        const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
        const i = (y * 96 + x) * 3;
        grid[i] = on ? 210 : 90;
        grid[i + 1] = on ? 230 : 120;
        grid[i + 2] = on ? 140 : 60;
      }
    }
    const model = await sharp(grid, { raw: { width: 96, height: 72, channels: 3 } }).png().toBuffer();
    const result = await compositeGrass({
      photo: jpeg,
      reference,
      retainRaw: true,
      inpaint: async () => model,
    });
    expect(result.applied).toBe(true);
    const row: number[] = [];
    const y = 90;
    for (let x = 30; x < 130; x += 1) {
      const p = (y * width + x) * 3;
      row.push(result.raw![p] * 0.2126 + result.raw![p + 1] * 0.7152 + result.raw![p + 2] * 0.0722);
    }
    expect(repeatPeak(row)).toBeLessThan(0.35);
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

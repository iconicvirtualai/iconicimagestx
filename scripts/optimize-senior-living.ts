/**
 * Build responsive Sundale photos for /senior-living.
 *
 *   pnpm optimize:senior-living
 *
 * Reads JPEG, PNG, or WebP originals from incoming/senior-living/.
 * Each file should be at least 1600 pixels wide. The stem is the filename
 * without its extension (sundale-lobby.jpg → sundale-lobby).
 *
 * Writes into public/senior-living/:
 *   {stem}-1600.webp
 *   {stem}-1024.webp
 *   {stem}-640.webp
 *   {stem}.jpg          1600-pixel JPEG fallback
 *
 * Then add each stem and alt text to client/content/seniorLiving.ts.
 */

import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SENIOR_LIVING_WIDTHS } from "../client/content/seniorLiving.ts";

const SOURCE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const JPG_WIDTH = SENIOR_LIVING_WIDTHS[0];

export interface OptimizeSeniorLivingOptions {
  inputDir: string;
  outputDir: string;
}

export interface OptimizedSeniorLivingFile {
  stem: string;
  source: string;
  outputs: string[];
  warned: string | null;
}

export async function optimizeSeniorLivingSources(
  options: OptimizeSeniorLivingOptions,
): Promise<OptimizedSeniorLivingFile[]> {
  const entries = await readdir(options.inputDir, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        SOURCE_EXT.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort();

  await mkdir(options.outputDir, { recursive: true });
  const written: OptimizedSeniorLivingFile[] = [];

  for (const name of files) {
    const stem = path.basename(name, path.extname(name)).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem)) {
      throw new Error(
        `${name} needs a lowercase stem with letters, numbers, and hyphens, such as sundale-lobby.jpg.`,
      );
    }
    const source = path.join(options.inputDir, name);
    const meta = await sharp(source).metadata();
    const sourceWidth = meta.width ?? 0;
    const warned =
      sourceWidth > 0 && sourceWidth < JPG_WIDTH
        ? `${name} is ${sourceWidth}px wide. Use an original at least ${JPG_WIDTH}px wide so the large size stays sharp.`
        : null;
    const outputs: string[] = [];
    for (const width of SENIOR_LIVING_WIDTHS) {
      const dest = path.join(options.outputDir, `${stem}-${width}.webp`);
      await sharp(source)
        .rotate()
        .resize({ width, withoutEnlargement: false })
        .webp({ quality: 78 })
        .toFile(dest);
      outputs.push(dest);
    }
    const jpg = path.join(options.outputDir, `${stem}.jpg`);
    await sharp(source)
      .rotate()
      .resize({ width: JPG_WIDTH, withoutEnlargement: false })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(jpg);
    outputs.push(jpg);
    written.push({ stem, source, outputs, warned });
  }

  return written;
}

function manifestSnippet(stem: string): string {
  return `  { stem: "${stem}", alt: "Describe this Sundale Senior Living photo" },`;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const inputDir = path.resolve(
    process.argv[2] || path.join(root, "incoming/senior-living"),
  );
  const outputDir = path.resolve(
    process.argv[3] || path.join(root, "public/senior-living"),
  );
  let written: OptimizedSeniorLivingFile[];
  try {
    written = await optimizeSeniorLivingSources({ inputDir, outputDir });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.error(
        `Put originals in ${inputDir} and run pnpm optimize:senior-living again.`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (written.length === 0) {
    console.log(`No JPEG, PNG, or WebP files in ${inputDir}.`);
    return;
  }
  console.log(`Wrote ${written.length} photo set(s) to ${outputDir}.`);
  console.log(
    "Add these entries to SENIOR_LIVING_PHOTOS in client/content/seniorLiving.ts:",
  );
  for (const file of written) {
    if (file.warned) console.warn(file.warned);
    console.log(manifestSnippet(file.stem));
  }
}

const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

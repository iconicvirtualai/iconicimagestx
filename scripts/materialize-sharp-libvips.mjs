/**
 * sharp 0.35 loads libvips through pnpm symlinks. Vercel rejects a
 * serverless package that contains files reached through a symlink.
 * Replace the linux-x64 links with real copies after install, before tracing.
 * Lawn compositing traces sharp into api/index.mjs, and display images trace
 * it into api/media-display.mjs.
 */
import { cp, lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

const store = path.resolve("node_modules/.pnpm");
let entries = [];
try {
  entries = await readdir(store);
} catch {
  process.exit(0);
}

async function materialize(linkPath) {
  let info;
  try {
    info = await lstat(linkPath);
  } catch {
    return;
  }
  if (!info.isSymbolicLink()) return;
  const target = await realpath(linkPath);
  await rm(linkPath);
  await cp(target, linkPath, { recursive: true, dereference: true });
}

const addon = entries.find((name) => name.startsWith("@img+sharp-linux-x64@"));
if (addon) {
  await materialize(path.join(store, addon, "node_modules", "@img", "sharp-libvips-linux-x64"));
}

for (const entry of entries) {
  if (!entry.startsWith("sharp@")) continue;
  const img = path.join(store, entry, "node_modules", "@img");
  await materialize(path.join(img, "sharp-linux-x64"));
  await materialize(path.join(img, "sharp-libvips-linux-x64"));
}

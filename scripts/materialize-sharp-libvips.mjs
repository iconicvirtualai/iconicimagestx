/**
 * sharp 0.35 loads libvips through a pnpm symlink. Vercel rejects a
 * serverless package that contains files reached through a symlink.
 * Replace that one link with a real copy after install, before tracing.
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

const addon = entries.find((name) => name.startsWith("@img+sharp-linux-x64@"));
if (!addon) process.exit(0);

const linkPath = path.join(store, addon, "node_modules", "@img", "sharp-libvips-linux-x64");
let info;
try {
  info = await lstat(linkPath);
} catch {
  process.exit(0);
}
if (!info.isSymbolicLink()) process.exit(0);

const target = await realpath(linkPath);
await rm(linkPath);
await cp(target, linkPath, { recursive: true, dereference: true });

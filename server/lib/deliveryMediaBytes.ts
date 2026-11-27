/**
 * Read one delivery asset for a preview or a paid download.
 * Callers decide the variant. This file does not write storage.
 */

import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DeliveryAsset } from "../../shared/clientDelivery";
import { readB2Object } from "../services/b2Storage";

const MAX_BYTES = 25 * 1024 * 1024;

function mediaRoot(): string {
  return path.resolve(process.cwd(), "public", "media");
}

async function readLocal(relative: string): Promise<Buffer | null> {
  if (!relative || relative.includes("..") || relative.includes("\\") || path.isAbsolute(relative)) return null;
  const root = mediaRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(resolved);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_BYTES) return null;
    const realRoot = await realpath(root);
    const real = await realpath(resolved);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return null;
    return await readFile(real);
  } catch {
    return null;
  }
}

async function readHttps(url: string): Promise<Buffer | null> {
  if (!url.startsWith("https://")) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    return bytes;
  } catch {
    return null;
  }
}

export async function readDeliveryAsset(asset: DeliveryAsset, storageDownload?: (storagePath: string) => Promise<Buffer | null>): Promise<Buffer | null> {
  if (asset.localFile) {
    const local = await readLocal(asset.localFile);
    if (local) return local;
  }
  if (asset.b2Key) {
    const b2 = await readB2Object(asset.b2Key);
    if (b2?.length) return b2;
  }
  if (asset.storagePath && storageDownload) {
    const stored = await storageDownload(asset.storagePath);
    if (stored?.length) return stored;
  }
  if (asset.httpsUrl) return readHttps(asset.httpsUrl);
  return null;
}

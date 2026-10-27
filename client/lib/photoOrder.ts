import { sequenceKeptShots, shotKey, type SequenceShot } from "@shared/gallerySequence";
import { zipStored } from "@shared/zipStore";

export interface WorkingShot {
  key: string;
  name: string;
  url: string;
  path?: string;
  culled: boolean;
  shotAt?: number;
  sortOrder?: number;
  file?: File;
}

const ORDER_PREFIX = "iconic-photo-order:";

export interface StoredShot {
  key: string;
  name: string;
  culled: boolean;
  shotAt?: number;
  path?: string;
  dataUrl?: string;
}

export function photoOrderStorageKey(listingId: string): string {
  return `${ORDER_PREFIX}${listingId || "draft"}`;
}

function readStoredRecord(listingId: string): { shots: StoredShot[]; address: string } {
  if (typeof localStorage === "undefined") return { shots: [], address: "" };
  try {
    const raw = localStorage.getItem(photoOrderStorageKey(listingId));
    if (!raw) return { shots: [], address: "" };
    const parsed = JSON.parse(raw) as { shots?: StoredShot[]; address?: unknown };
    return {
      shots: Array.isArray(parsed.shots) ? parsed.shots : [],
      address: typeof parsed.address === "string" ? parsed.address : "",
    };
  } catch {
    return { shots: [], address: "" };
  }
}

export function readStoredPhotoOrder(listingId: string): StoredShot[] {
  return readStoredRecord(listingId).shots;
}

export function readStoredSequenceAddress(listingId: string): string {
  return readStoredRecord(listingId).address;
}

export function writeStoredPhotoOrder(listingId: string, shots: WorkingShot[], address?: string) {
  if (typeof localStorage === "undefined") return;
  const previous = readStoredRecord(listingId);
  const stored: StoredShot[] = shots.map((shot) => ({
    key: shot.key,
    name: shot.name,
    culled: shot.culled,
    shotAt: shot.shotAt,
    path: shot.path,
    dataUrl: shot.url.startsWith("data:") && shot.url.length < 400_000 ? shot.url : undefined,
  }));
  localStorage.setItem(photoOrderStorageKey(listingId), JSON.stringify({
    shots: stored,
    address: address ?? previous.address,
  }));
}

/** Listing images, culled shots included, in the stored array order. */
export function shotsFromListingImages(images: unknown): WorkingShot[] {
  if (!Array.isArray(images)) return [];
  return images.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : "";
    if (!url) return [];
    const path = typeof row.path === "string" ? row.path : "";
    const name = [row.name, row.fileName, row.title].find((value) => typeof value === "string" && value.trim());
    return [{
      key: shotKey(row, index),
      name: typeof name === "string" ? name : `photo-${index + 1}.jpg`,
      url,
      path: path || undefined,
      culled: row.culled === true,
      shotAt: typeof row.shotAt === "number" ? row.shotAt : undefined,
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : undefined,
    }];
  });
}

/** Local draft order wins. Server shots the draft does not mention stay at the end. */
export function mergeStoredOrder(server: WorkingShot[], stored: StoredShot[]): WorkingShot[] {
  if (!stored.length) return server;
  const byKey = new Map(server.map((shot) => [shot.key, shot]));
  const used = new Set<string>();
  const next: WorkingShot[] = [];
  for (const row of stored) {
    const found = byKey.get(row.key);
    if (found) {
      used.add(row.key);
      next.push({ ...found, culled: row.culled, shotAt: row.shotAt ?? found.shotAt });
      continue;
    }
    if (!row.dataUrl) continue;
    next.push({
      key: row.key,
      name: row.name,
      url: row.dataUrl,
      path: row.path,
      culled: row.culled,
      shotAt: row.shotAt,
    });
  }
  for (const shot of server) {
    if (!used.has(shot.key)) next.push(shot);
  }
  return next;
}

export function reorderWorkingShots(shots: WorkingShot[], fromKey: string, toKey: string): WorkingShot[] {
  if (!fromKey || fromKey === toKey) return shots;
  const from = shots.findIndex((shot) => shot.key === fromKey);
  const to = shots.findIndex((shot) => shot.key === toKey);
  if (from < 0 || to < 0) return shots;
  const next = shots.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function cullWorkingShot(shots: WorkingShot[], key: string, culled: boolean): WorkingShot[] {
  return shots.map((shot) => (shot.key === key ? { ...shot, culled } : shot));
}

export function sequenceNamesFor(shots: WorkingShot[], address: string) {
  return sequenceKeptShots(shots as SequenceShot[], address).map((row) => ({
    key: shotKey(row.shot),
    name: row.deliveryName,
    sortOrder: row.sortOrder,
  }));
}

export async function zipWorkingShots(shots: WorkingShot[], address: string): Promise<Uint8Array> {
  const named = sequenceKeptShots(shots as SequenceShot[], address);
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (const row of named) {
    const shot = shots.find((item) => shotKey(item) === shotKey(row.shot));
    const source = shot?.file || null;
    let bytes: Uint8Array | null = null;
    if (source) bytes = new Uint8Array(await source.arrayBuffer());
    else if (shot?.url) {
      const response = await fetch(shot.url);
      if (response.ok) bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (!bytes) continue;
    entries.push({ name: row.deliveryName, data: bytes });
  }
  if (!entries.length) throw new Error("No kept photos could be packaged.");
  return zipStored(entries);
}

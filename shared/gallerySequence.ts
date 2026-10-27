/**
 * Photographer delivery order.
 * Kept shots get an explicit sortOrder and a download name
 * like 001_123-main-st.jpg. Culled shots stay on the listing
 * and stay out of the gallery, the zip, and the client grid.
 */

export interface SequenceShot {
  id?: unknown;
  path?: unknown;
  url?: unknown;
  name?: unknown;
  fileName?: unknown;
  title?: unknown;
  culled?: unknown;
  sortOrder?: unknown;
  deliveryName?: unknown;
  shotAt?: unknown;
}

export function addressSlug(address: string): string {
  const street = address.split(",")[0] || address;
  const slug = street
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "listing";
}

export function fileExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  const ext = match?.[1] || "jpg";
  if (ext === "jpeg") return "jpg";
  if (ext === "tiff") return "tif";
  if (["jpg", "png", "webp", "gif", "tif"].includes(ext)) return ext;
  return "jpg";
}

/** 1-based index, at least three digits, plus the street slug. */
export function sequenceFileName(index: number, addressOrSlug: string, originalName: string): string {
  const n = Math.max(1, Math.floor(Number.isFinite(index) ? index : 1));
  const padded = String(n).padStart(3, "0");
  return `${padded}_${addressSlug(addressOrSlug)}.${fileExtension(originalName)}`;
}

export function shotKey(shot: SequenceShot, index = 0): string {
  for (const value of [shot.id, shot.path, shot.url, shot.fileName, shot.name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `idx-${index}`;
}

export function shotName(shot: SequenceShot, index = 0): string {
  for (const value of [shot.name, shot.fileName, shot.title]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const path = typeof shot.path === "string" ? shot.path.split("/").pop() : "";
  return path || `photo-${index + 1}.jpg`;
}

function finiteOrder(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function isCulledShot(shot: SequenceShot): boolean {
  return shot.culled === true;
}

/** Kept shots. Explicit sortOrder wins. Otherwise the stored array order stays. */
export function keptShots<T extends SequenceShot>(items: T[]): T[] {
  const rows = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isCulledShot(item));
  const any = rows.some(({ item }) => finiteOrder(item.sortOrder) != null);
  if (!any) return rows.map(({ item }) => item);
  return rows
    .sort((a, b) => {
      const ao = finiteOrder(a.item.sortOrder);
      const bo = finiteOrder(b.item.sortOrder);
      const aKey = ao == null ? Number.MAX_SAFE_INTEGER : ao;
      const bKey = bo == null ? Number.MAX_SAFE_INTEGER : bo;
      return aKey - bKey || a.index - b.index;
    })
    .map(({ item }) => item);
}

export interface SequencedShot<T> {
  shot: T;
  sortOrder: number;
  deliveryName: string;
}

export function sequenceKeptShots<T extends SequenceShot>(items: T[], address: string): Array<SequencedShot<T>> {
  return keptShots(items).map((shot, index) => ({
    shot,
    sortOrder: index + 1,
    deliveryName: sequenceFileName(index + 1, address, shotName(shot, index)),
  }));
}

export function deliveryFileName(shot: SequenceShot, index = 0): string {
  if (typeof shot.deliveryName === "string" && shot.deliveryName.trim()) return shot.deliveryName.trim();
  return shotName(shot, index);
}

/**
 * Rewrite listing images to the photographer's order.
 * `order` is the full working set, culled shots included, in the new order.
 * Images the client did not mention stay at the end, unchanged except sortOrder.
 */
export function applyPhotoOrder<T extends Record<string, unknown>>(
  images: T[],
  order: Array<{ key: string; culled?: boolean }>,
): T[] {
  const byKey = new Map<string, { image: T; index: number }>();
  images.forEach((image, index) => {
    byKey.set(shotKey(image, index), { image, index });
  });
  const used = new Set<string>();
  const next: T[] = [];
  for (const entry of order) {
    const found = byKey.get(entry.key);
    if (!found || used.has(entry.key)) continue;
    used.add(entry.key);
    next.push({ ...found.image, culled: entry.culled === true });
  }
  images.forEach((image, index) => {
    const key = shotKey(image, index);
    if (used.has(key)) return;
    next.push(image);
  });
  let kept = 0;
  return next.map((image) => {
    if (image.culled === true) {
      const rest = { ...image };
      delete rest.deliveryName;
      return { ...rest, culled: true } as T;
    }
    kept += 1;
    return { ...image, culled: false, sortOrder: kept } as T;
  });
}

/** Gallery rows: drop culled photos, then honor sortOrder. */
export function orderedGalleryMedia<T extends SequenceShot>(items: T[]): T[] {
  return keptShots(items);
}

const BRACKET_SUFFIX = /(?:[_+-](?:ev)?[+-]?\d+(?:\.\d+)?ev?|[_-][abc])$/i;

function numericStem(name: string): { stem: string; n: number } | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const match = base.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  return { stem: match[1].toLowerCase(), n: Number(match[2]) };
}

function exposureStem(name: string): string | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  if (!BRACKET_SUFFIX.test(base)) return null;
  return base.replace(BRACKET_SUFFIX, "").toLowerCase();
}

export interface BracketMember {
  id: string;
  name: string;
  shotAt?: number;
}

/**
 * HDR brackets already shot as a burst.
 * A shared exposure stem (kitchen-2ev / kitchen-0ev / kitchen+2ev) is one group.
 * Otherwise only neighbors shot within 2.5s whose filenames count by 1 or 2.
 */
export function hdrBracketGroups(shots: BracketMember[]): string[][] {
  const groups: string[][] = [];
  const used = new Set<string>();
  const byStem = new Map<string, string[]>();
  for (const shot of shots) {
    const stem = exposureStem(shot.name);
    if (!stem) continue;
    const list = byStem.get(stem) || [];
    list.push(shot.id);
    byStem.set(stem, list);
  }
  for (const ids of byStem.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id) => used.add(id));
    groups.push(ids);
  }

  const timed = shots.filter((shot) => !used.has(shot.id) && typeof shot.shotAt === "number" && shot.shotAt > 0);
  const ordered = [...timed].sort((a, b) => (a.shotAt || 0) - (b.shotAt || 0) || a.name.localeCompare(b.name));
  let current: BracketMember[] = [];
  const flush = () => {
    if (current.length >= 2) groups.push(current.map((shot) => shot.id));
    current = [];
  };
  for (const shot of ordered) {
    const prev = current[current.length - 1];
    const close = prev && Math.abs((shot.shotAt || 0) - (prev.shotAt || 0)) <= 2500;
    const left = prev ? numericStem(prev.name) : null;
    const right = numericStem(shot.name);
    const stepped = Boolean(left && right && left.stem === right.stem && Math.abs(left.n - right.n) > 0 && Math.abs(left.n - right.n) <= 2);
    if (prev && close && stepped) current.push(shot);
    else {
      flush();
      current = [shot];
    }
  }
  flush();
  return groups;
}

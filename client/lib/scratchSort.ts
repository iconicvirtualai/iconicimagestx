export type ScratchSortMode =
  | "name-asc"
  | "name-desc"
  | "date-asc"
  | "date-desc"
  | "size-desc"
  | "size-asc"
  | "upload";

export const SCRATCH_SORT_DEFAULT: ScratchSortMode = "name-asc";

export interface ScratchSortable {
  name: string;
  shotAt: number;
  byteSize: number;
  uploadIndex: number;
}

function nameChunks(value: string): string[] {
  return value.toLowerCase().match(/\d+|\D+/g) ?? [];
}

/** IMG_2 before IMG_10. Numeric chunks compare as numbers. */
export function naturalNameCompare(a: string, b: string): number {
  const left = nameChunks(a);
  const right = nameChunks(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const partA = left[index] ?? "";
    const partB = right[index] ?? "";
    const numA = /^\d+$/.test(partA);
    const numB = /^\d+$/.test(partB);
    if (numA && numB) {
      const diff = Number(partA) - Number(partB);
      if (diff) return diff;
      if (partA.length !== partB.length) return partA.length - partB.length;
    } else {
      const diff = partA.localeCompare(partB);
      if (diff) return diff;
    }
  }
  return 0;
}

export function compareScratchItems(
  mode: ScratchSortMode,
  a: ScratchSortable,
  b: ScratchSortable,
): number {
  const tie = a.uploadIndex - b.uploadIndex;
  if (mode === "upload") return tie;
  if (mode === "name-asc" || mode === "name-desc") {
    const diff = naturalNameCompare(a.name, b.name);
    return (mode === "name-asc" ? diff : -diff) || tie;
  }
  if (mode === "date-asc" || mode === "date-desc") {
    const diff = a.shotAt - b.shotAt;
    return (mode === "date-asc" ? diff : -diff) || tie;
  }
  const diff =
    mode === "size-desc" ? b.byteSize - a.byteSize : a.byteSize - b.byteSize;
  return diff || tie;
}

export function sortScratchItems<T extends ScratchSortable>(
  mode: ScratchSortMode,
  items: T[],
): T[] {
  return [...items].sort((a, b) => compareScratchItems(mode, a, b));
}

/**
 * Staff order for a listing's photos, video, tours, floor plans, and files.
 *
 * The portal used to save a drag order only on portalMedia preferences.
 * Listing sites, the presentation, and client downloads read sortOrder and
 * deliveryName, so that drag never showed up after a reload. Saving an
 * arrangement stamps those fields, section by section. A section marked
 * hideFromListingSites stays in the client gallery and in downloads.
 */

import { addressSlug } from "./gallerySequence.ts";

export type ArrangementKind = "photo" | "video" | "floorplan" | "tour" | "file";

export interface ArrangementMedia {
  id: string;
  kind: ArrangementKind;
  name: string;
  path: string;
  url: string;
  culled: boolean;
  bucket: string;
  index: number;
}

export interface MediaSection {
  id: string;
  name: string;
  order: number;
  hideFromListingSites: boolean;
}

export interface MediaPlacement {
  id: string;
  sectionId: string;
  order: number;
}

export interface MediaArrangement {
  sections: MediaSection[];
  placements: MediaPlacement[];
}

export interface SequencedArrangementItem extends ArrangementMedia {
  sectionId: string;
  sortOrder: number;
  deliveryName: string;
}

export type ArrangementWrite =
  | { ok: true; arrangement: MediaArrangement }
  | { ok: false; error: string };

const SECTION_ID = /^s[a-z0-9]{4,16}$/;
const SECTION_LIMIT = 24;
const PLACEMENT_LIMIT = 400;
const FILE_EXT = new Set(["jpg", "png", "webp", "gif", "tif", "mp4", "mov", "m4v", "webm", "pdf", "svg"]);

export function emptyMediaArrangement(): MediaArrangement {
  return { sections: [], placements: [] };
}

export function sectionIdOk(value: string): boolean {
  return SECTION_ID.test(value);
}

function text(value: unknown, limit = 180): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, limit);
}

function httpUrl(value: unknown): string {
  const url = text(value, 2000);
  return /^https?:\/\//i.test(url) ? url : "";
}

export function arrangementFileName(index: number, addressOrSlug: string, originalName: string): string {
  const n = Math.max(1, Math.floor(Number.isFinite(index) ? index : 1));
  const match = originalName.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  let ext = match?.[1] || "jpg";
  if (ext === "jpeg" || ext === "heic" || ext === "heif") ext = "jpg";
  if (ext === "tiff") ext = "tif";
  if (!FILE_EXT.has(ext)) ext = "jpg";
  return `${String(n).padStart(3, "0")}_${addressSlug(addressOrSlug)}.${ext}`;
}

function rowId(row: Record<string, unknown>, fallback: string): string {
  for (const key of ["id", "path", "storagePath", "url", "shareUrl"]) {
    const value = text(row[key]);
    if (value) return value.slice(0, 180);
  }
  return fallback.slice(0, 180);
}

function rowName(row: Record<string, unknown>, fallback: string): string {
  return text(row.name) || text(row.fileName) || text(row.title) || fallback;
}

function isVideoRow(row: Record<string, unknown>): boolean {
  const content = text(row.contentType).toLowerCase();
  if (content.startsWith("video/")) return true;
  const name = `${rowName(row, "")} ${text(row.path)} ${text(row.url)}`;
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(name);
}

function pushRow(
  out: ArrangementMedia[],
  seen: Set<string>,
  row: Record<string, unknown>,
  kind: ArrangementKind,
  bucket: string,
  index: number,
  fallbackName: string,
) {
  const url = httpUrl(row.url) || httpUrl(row.shareUrl) || httpUrl(row.embedUrl);
  if (!url) return;
  const id = rowId(row, `${kind}-${index}`);
  if (!id || seen.has(id)) return;
  seen.add(id);
  out.push({
    id,
    kind,
    name: rowName(row, fallbackName),
    path: text(row.path) || text(row.storagePath),
    url,
    culled: row.culled === true,
    bucket,
    index,
  });
}

function rowsOf(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

/** Same ids the client portal uses for listing files that already have a url. */
export function collectArrangementMedia(listing: Record<string, unknown> | null | undefined): ArrangementMedia[] {
  const source = listing || {};
  const out: ArrangementMedia[] = [];
  const seen = new Set<string>();
  const seenTourUrls = new Set<string>();

  rowsOf(source.images).forEach((row, index) => {
    pushRow(out, seen, row, isVideoRow(row) ? "video" : "photo", "images", index, `Photo ${index + 1}`);
  });
  rowsOf(source.videos).forEach((row, index) => {
    pushRow(out, seen, row, "video", "videos", index, `Video ${index + 1}`);
  });
  rowsOf(source.floorplans).forEach((row, index) => {
    pushRow(out, seen, row, "floorplan", "floorplans", index, `Floor plan ${index + 1}`);
  });
  rowsOf(source.floorPlans).forEach((row, index) => {
    pushRow(out, seen, row, "floorplan", "floorPlans", index, `Floor plan ${index + 1}`);
  });

  for (const key of ["tourUrl", "matterportUrl", "virtualTourUrl", "virtualTour", "threeDTourUrl", "tourLink"]) {
    const url = httpUrl(source[key]);
    if (!url || seenTourUrls.has(url)) continue;
    seenTourUrls.add(url);
    pushRow(out, seen, { id: key, url, name: "Virtual tour", type: "tour" }, "tour", "", -1, "Virtual tour");
  }
  rowsOf(source.tours).forEach((row, index) => {
    const url = httpUrl(row.url) || httpUrl(row.shareUrl) || httpUrl(row.embedUrl);
    if (!url || seenTourUrls.has(url)) return;
    seenTourUrls.add(url);
    pushRow(out, seen, row, "tour", "tours", index, "Virtual tour");
  });
  rowsOf(source.files).forEach((row, index) => {
    pushRow(out, seen, row, "file", "files", index, `File ${index + 1}`);
  });
  rowsOf(source.clientPortalUploads).forEach((row, index) => {
    const kind = text(row.kind);
    const arrangementKind: ArrangementKind = kind === "video" ? "video" : "file";
    pushRow(out, seen, row, arrangementKind, "clientPortalUploads", index, `File ${index + 1}`);
  });
  return out;
}

function sectionName(value: unknown): string {
  return text(value, 60);
}

export function readMediaArrangement(value: unknown): MediaArrangement {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const sections: MediaSection[] = [];
  const seenSections = new Set<string>();
  if (Array.isArray(row.sections)) {
    for (const item of row.sections) {
      if (!item || typeof item !== "object") continue;
      const section = item as Record<string, unknown>;
      const id = text(section.id, 32);
      const name = sectionName(section.name);
      if (!sectionIdOk(id) || !name || seenSections.has(id)) continue;
      seenSections.add(id);
      sections.push({
        id,
        name,
        order: typeof section.order === "number" && Number.isFinite(section.order) ? section.order : sections.length,
        hideFromListingSites: section.hideFromListingSites === true,
      });
      if (sections.length >= SECTION_LIMIT) break;
    }
  }
  sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  sections.forEach((section, order) => {
    section.order = order;
  });
  const known = new Set(sections.map((section) => section.id));
  const placements: MediaPlacement[] = [];
  const seenIds = new Set<string>();
  const counters = new Map<string, number>();
  if (Array.isArray(row.placements)) {
    const draft: Array<MediaPlacement & { index: number }> = [];
    for (const item of row.placements) {
      if (!item || typeof item !== "object") continue;
      const placement = item as Record<string, unknown>;
      const id = text(placement.id);
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const sectionId = text(placement.sectionId, 32);
      draft.push({
        id,
        sectionId: known.has(sectionId) ? sectionId : "",
        order: typeof placement.order === "number" && Number.isFinite(placement.order) ? placement.order : draft.length,
        index: draft.length,
      });
      if (draft.length >= PLACEMENT_LIMIT) break;
    }
    draft.sort((a, b) => a.order - b.order || a.index - b.index);
    for (const placement of draft) {
      const order = counters.get(placement.sectionId) || 0;
      counters.set(placement.sectionId, order + 1);
      placements.push({ id: placement.id, sectionId: placement.sectionId, order });
    }
  }
  return { sections, placements };
}

export function arrangementActive(arrangement: MediaArrangement): boolean {
  return arrangement.sections.length > 0 || arrangement.placements.length > 0;
}

function newSectionId(existing: string[]): string {
  const taken = new Set(existing);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = `s${Math.random().toString(36).slice(2, 10)}`;
    if (sectionIdOk(id) && !taken.has(id)) return id;
  }
  const fallback = `s${Date.now().toString(36).slice(-8)}`;
  return taken.has(fallback) ? `${fallback}a`.slice(0, 17) : fallback;
}

export function createSection(
  arrangement: MediaArrangement,
  name: string,
  ids: string[] = [],
  explicitId = "",
): ArrangementWrite {
  const current = readMediaArrangement(arrangement);
  if (current.sections.length >= SECTION_LIMIT) {
    return { ok: false, error: "This listing already has 24 sections." };
  }
  const label = sectionName(name);
  if (!label) return { ok: false, error: "Name the section." };
  const id = explicitId ? text(explicitId, 32) : newSectionId(current.sections.map((section) => section.id));
  if (!sectionIdOk(id)) return { ok: false, error: "That section id is not valid." };
  if (current.sections.some((section) => section.id === id)) return { ok: false, error: "That section already exists." };
  const sections = [...current.sections, { id, name: label, order: current.sections.length, hideFromListingSites: false }];
  const chosen = new Set(ids);
  const placements = current.placements.map((placement) => (
    chosen.has(placement.id) ? { ...placement, sectionId: id } : placement
  ));
  for (const mediaId of ids) {
    if (!placements.some((placement) => placement.id === mediaId)) {
      placements.push({ id: mediaId, sectionId: id, order: 0 });
    }
  }
  return { ok: true, arrangement: readMediaArrangement({ sections, placements }) };
}

export function renameSection(arrangement: MediaArrangement, id: string, name: string): ArrangementWrite {
  const current = readMediaArrangement(arrangement);
  const label = sectionName(name);
  if (!label) return { ok: false, error: "Name the section." };
  const sections = current.sections.map((section) => section.id === id ? { ...section, name: label } : section);
  if (!sections.some((section) => section.id === id)) return { ok: false, error: "That section is not on this listing." };
  return { ok: true, arrangement: { ...current, sections } };
}

export function deleteSection(arrangement: MediaArrangement, id: string): ArrangementWrite {
  const current = readMediaArrangement(arrangement);
  if (!current.sections.some((section) => section.id === id)) {
    return { ok: false, error: "That section is not on this listing." };
  }
  const sections = current.sections.filter((section) => section.id !== id).map((section, order) => ({ ...section, order }));
  const placements = current.placements.map((placement) => (
    placement.sectionId === id ? { ...placement, sectionId: "" } : placement
  ));
  return { ok: true, arrangement: readMediaArrangement({ sections, placements }) };
}

export function reorderSections(arrangement: MediaArrangement, ids: string[]): MediaArrangement {
  const current = readMediaArrangement(arrangement);
  const rank = new Map(ids.map((id, index) => [id, index]));
  const sections = [...current.sections]
    .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || a.order - b.order)
    .map((section, order) => ({ ...section, order }));
  return { ...current, sections };
}

export function setSectionHidden(arrangement: MediaArrangement, id: string, hideFromListingSites: boolean): ArrangementWrite {
  const current = readMediaArrangement(arrangement);
  if (!current.sections.some((section) => section.id === id)) {
    return { ok: false, error: "That section is not on this listing." };
  }
  return {
    ok: true,
    arrangement: {
      ...current,
      sections: current.sections.map((section) => (
        section.id === id ? { ...section, hideFromListingSites } : section
      )),
    },
  };
}

export interface FlatPlacement {
  id: string;
  sectionId: string;
}

/** Visual order: files with no section, then each section. Culled shots stay out. */
export function flatArrangement(media: ArrangementMedia[], arrangement: MediaArrangement): FlatPlacement[] {
  const current = readMediaArrangement(arrangement);
  const live = media.filter((item) => !item.culled);
  const byId = new Map(live.map((item) => [item.id, item]));
  const placed = new Set<string>();
  const unsectioned: string[] = [];
  const bySection = new Map<string, string[]>();
  const ranked = [...current.placements].sort((a, b) => a.order - b.order);
  for (const placement of ranked) {
    if (!byId.has(placement.id) || placed.has(placement.id)) continue;
    placed.add(placement.id);
    if (placement.sectionId) {
      const list = bySection.get(placement.sectionId) || [];
      list.push(placement.id);
      bySection.set(placement.sectionId, list);
    } else {
      unsectioned.push(placement.id);
    }
  }
  for (const item of live) {
    if (!placed.has(item.id)) unsectioned.push(item.id);
  }
  const flat: FlatPlacement[] = unsectioned.map((id) => ({ id, sectionId: "" }));
  for (const section of current.sections) {
    for (const id of bySection.get(section.id) || []) flat.push({ id, sectionId: section.id });
  }
  return flat;
}

export function placeMedia(arrangement: MediaArrangement, placed: FlatPlacement[]): MediaArrangement {
  const current = readMediaArrangement(arrangement);
  const known = new Set(current.sections.map((section) => section.id));
  const seen = new Set<string>();
  const counters = new Map<string, number>();
  const placements: MediaPlacement[] = [];
  for (const row of placed) {
    const id = text(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const sectionId = known.has(row.sectionId) ? row.sectionId : "";
    const order = counters.get(sectionId) || 0;
    counters.set(sectionId, order + 1);
    placements.push({ id, sectionId, order });
    if (placements.length >= PLACEMENT_LIMIT) break;
  }
  return { ...current, placements };
}

export function moveSelection(
  rows: FlatPlacement[],
  selectedIds: string[],
  targetId: string,
  position: "before" | "after",
): FlatPlacement[] {
  const selected = new Set(selectedIds);
  if (!selected.size || !rows.some((row) => row.id === targetId)) return rows;
  if (selected.has(targetId) && selected.size === 1) return rows;
  const moving = rows.filter((row) => selected.has(row.id));
  const rest = rows.filter((row) => !selected.has(row.id));
  const target = rows.find((row) => row.id === targetId);
  const sectionId = target?.sectionId || "";
  const block = moving.map((row) => ({ id: row.id, sectionId }));
  const index = rest.findIndex((row) => row.id === targetId);
  if (index < 0) return rows;
  rest.splice(position === "after" ? index + 1 : index, 0, ...block);
  return rest;
}

export function moveIntoSection(
  media: ArrangementMedia[],
  arrangement: MediaArrangement,
  ids: string[],
  sectionId: string,
): ArrangementWrite {
  const current = readMediaArrangement(arrangement);
  if (sectionId && !current.sections.some((section) => section.id === sectionId)) {
    return { ok: false, error: "That section is not on this listing." };
  }
  const moving = new Set(ids);
  if (![...moving].some((id) => media.some((item) => item.id === id && !item.culled))) {
    return { ok: false, error: "Choose files to move." };
  }
  const flat = flatArrangement(media, current);
  const stay = flat.filter((row) => !moving.has(row.id));
  const block = flat.filter((row) => moving.has(row.id)).map((row) => ({ id: row.id, sectionId }));
  const targetRank = sectionId ? current.sections.findIndex((section) => section.id === sectionId) : -1;
  const rankOf = (row: FlatPlacement) => (
    row.sectionId ? current.sections.findIndex((section) => section.id === row.sectionId) : -1
  );
  let insertAt = stay.findIndex((row) => rankOf(row) > targetRank);
  if (insertAt < 0) insertAt = stay.length;
  stay.splice(insertAt, 0, ...block);
  return { ok: true, arrangement: placeMedia(current, stay) };
}

/**
 * Files are numbered in visual order. Tours keep a place in that order and
 * do not take a filename, so a zip stays 001, 002, 003 with no gaps.
 */
export function sequenceArrangement(
  media: ArrangementMedia[],
  arrangement: MediaArrangement,
  address: string,
): SequencedArrangementItem[] {
  const byId = new Map(media.filter((item) => !item.culled).map((item) => [item.id, item]));
  let fileIndex = 0;
  let position = 0;
  const sequenced: SequencedArrangementItem[] = [];
  for (const row of flatArrangement(media, arrangement)) {
    const item = byId.get(row.id);
    if (!item) continue;
    position += 1;
    const file = item.kind !== "tour";
    if (file) fileIndex += 1;
    sequenced.push({
      ...item,
      sectionId: row.sectionId,
      sortOrder: position,
      deliveryName: file ? arrangementFileName(fileIndex, address, item.name) : "",
    });
  }
  return sequenced;
}

export function hiddenSectionIdSet(arrangement: MediaArrangement): Set<string> {
  return new Set(
    readMediaArrangement(arrangement).sections.filter((section) => section.hideFromListingSites).map((section) => section.id),
  );
}

export function isHiddenFromListingSites(
  listing: { mediaArrangement?: unknown } | null | undefined,
  row: Record<string, unknown>,
): boolean {
  const arrangement = readMediaArrangement(listing?.mediaArrangement);
  const hidden = hiddenSectionIdSet(arrangement);
  if (hidden.size === 0) return false;
  const sectionId = text(row.sectionId, 32);
  if (sectionId && hidden.has(sectionId)) return true;
  const id = text(row.id) || text(row.path) || text(row.storagePath) || text(row.url);
  if (!id) return false;
  return arrangement.placements.some((placement) => placement.id === id && hidden.has(placement.sectionId));
}

const STAMP_BUCKETS = ["images", "videos", "floorplans", "floorPlans", "tours", "files", "clientPortalUploads"] as const;

export function syncPortalMedia(
  current: unknown,
  sequenced: SequencedArrangementItem[],
  sections: MediaSection[],
): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  const keys = { photo: "photos", video: "videos", floorplan: "floorplans", tour: "tours" } as const;
  for (const key of Object.values(keys)) {
    const existing = base[key] && typeof base[key] === "object" && !Array.isArray(base[key])
      ? { ...(base[key] as Record<string, unknown>) }
      : {};
    base[key] = existing;
  }
  for (const item of sequenced) {
    const key = keys[item.kind as keyof typeof keys];
    if (!key) continue;
    const bucket = base[key] as Record<string, unknown>;
    const prev = bucket[item.id] && typeof bucket[item.id] === "object"
      ? bucket[item.id] as Record<string, unknown>
      : {};
    bucket[item.id] = {
      hidden: prev.hidden === true,
      order: item.sortOrder,
      groupId: item.kind === "photo" ? item.sectionId : "",
    };
  }
  base.photoGroups = sections.map((section) => ({
    id: section.id,
    name: section.name,
    order: section.order,
    hideFromListingSites: section.hideFromListingSites,
  }));
  return base;
}

export function stampListingArrangement(
  listing: Record<string, unknown>,
  arrangement: MediaArrangement,
  address: string,
): { listing: Record<string, unknown>; names: string[]; sequenced: SequencedArrangementItem[] } {
  const media = collectArrangementMedia(listing);
  const current = readMediaArrangement(arrangement);
  const sequenced = sequenceArrangement(media, current, address);
  const byKey = new Map(sequenced.filter((item) => item.bucket).map((item) => [`${item.bucket}:${item.index}`, item]));
  const next: Record<string, unknown> = {
    ...listing,
    mediaArrangement: current,
  };
  for (const bucket of STAMP_BUCKETS) {
    if (!Array.isArray(listing[bucket])) continue;
    next[bucket] = (listing[bucket] as unknown[]).map((row, index) => {
      if (!row || typeof row !== "object") return row;
      const copy = { ...(row as Record<string, unknown>) };
      const hit = byKey.get(`${bucket}:${index}`);
      if (!hit) {
        if (copy.culled === true) delete copy.deliveryName;
        return copy;
      }
      copy.sortOrder = hit.sortOrder;
      copy.order = hit.sortOrder;
      copy.sectionId = hit.sectionId;
      if (hit.deliveryName) copy.deliveryName = hit.deliveryName;
      else delete copy.deliveryName;
      return copy;
    });
  }
  next.portalMedia = syncPortalMedia(listing.portalMedia, sequenced, current.sections);
  return {
    listing: next,
    names: sequenced.map((item) => item.deliveryName).filter(Boolean),
    sequenced,
  };
}

export function stampGalleryMediaItems<T extends Record<string, unknown>>(
  items: T[],
  sequenced: SequencedArrangementItem[],
): T[] {
  const byPath = new Map<string, SequencedArrangementItem>();
  const byId = new Map<string, SequencedArrangementItem>();
  const byUrl = new Map<string, SequencedArrangementItem>();
  for (const row of sequenced) {
    if (!row.deliveryName) continue;
    byId.set(row.id, row);
    if (row.path) byPath.set(row.path, row);
    if (row.url) byUrl.set(row.url, row);
  }
  return items.map((item) => {
    const path = text(item.storagePath) || text(item.path);
    const id = text(item.id);
    const url = text(item.url) || text(item.shareUrl);
    const hit = (path && byPath.get(path)) || (id && byId.get(id)) || (url && byUrl.get(url)) || undefined;
    if (!hit) return item;
    return {
      ...item,
      sortOrder: hit.sortOrder,
      order: hit.sortOrder,
      deliveryName: hit.deliveryName,
      fileName: hit.deliveryName,
      name: hit.deliveryName,
      title: hit.deliveryName,
      sectionId: hit.sectionId,
    };
  });
}

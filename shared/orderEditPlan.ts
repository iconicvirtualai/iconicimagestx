/**
 * Order-driven Iconic Studio edits.
 *
 * The agent buys a package. The line items already say what to produce
 * (Showcase includes two twilight renders, aerials, reels, same-day delivery).
 * Photographers do not pick a preset per frame. They may toggle Iconic Polish
 * before they submit the upload. That flag adds polish instructions on top
 * of the order.
 *
 * This module only plans image edits and records the other deliverables.
 * It does not call OpenAI and it does not send a gallery. The upload
 * auto-queue and the gallery release gate both call this plan. Release
 * stays on hold_until_order_complete until approved finals match it.
 */

import { services } from "../client/lib/services.ts";

export const ORDER_GALLERY_RELEASE = "hold_until_order_complete" as const;

/**
 * Cadi locked Showcase delivery at 30 approved photos.
 * The live catalog feature still says "50 Images". The order plan and the
 * gallery gate both use this count instead of that catalog figure.
 */
export const SHOWCASE_PHOTO_COUNT = 30;

export const ICONIC_POLISH_INSTRUCTION =
  "Iconic Polish: if a fireplace is visible, add a realistic fire; if a driveway, street, or curb is visible, remove vehicles and debris and repair the pavement; remove clutter and personal items. Keep the architecture.";

const PHOTO_BASE =
  "Prepare this listing photo. Balance color, clear window glare, and replace a blown-out sky when the sky is visible. Keep the architecture, furnishings, and camera angle.";

export interface TwilightSlot {
  slot: string;
  role: string;
  prompt: string;
}

export interface OrderDeliverable {
  id: string;
  label: string;
  /** Not an Images API edit. Capture, video, floor plan, or delivery. */
  kind: "capture" | "video" | "floorplan" | "delivery";
  /**
   * Expected file count when the package states one.
   * Null means the full uploaded set (Full Aerials). Omitted for items that are one file.
   */
  count?: number | null;
}

export interface OrderEditPlan {
  packageName: string;
  iconicPolish: boolean;
  /** True when the order itself includes Iconic Finish or Iconic Polish. */
  polishFromOrder: boolean;
  photoPrompt: string;
  /** Package still count. Null when the scope is "full" or "none". */
  photoCount: number | null;
  /** count = package number, full = every uploaded photo, none = no photo requirement. */
  photoScope: "count" | "full" | "none";
  twilight: TwilightSlot[];
  deliverables: OrderDeliverable[];
  galleryRelease: typeof ORDER_GALLERY_RELEASE;
  notes: string[];
}

export interface OrderEditSource {
  name: string;
  path: string;
  url: string;
  raw?: boolean;
  previewable?: boolean;
}

export interface OrderEditDraft {
  slot: string;
  origin: "order";
  type: "twilight" | "photo";
  label: string;
  prompt: string;
  sourcePath: string;
  imageUrl: string;
  fileName: string;
  waitingNote: string;
}

export interface OrderEditInput {
  lineItems?: unknown;
  services?: unknown;
  serviceIds?: unknown;
  iconicPolish?: boolean;
}

interface NamedItem {
  id: string;
  name: string;
}

function asItems(value: unknown): NamedItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const name = entry.trim();
      return name ? [{ id: "", name }] : [];
    }
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const name = String(row.name || row.label || "").trim();
    return id || name ? [{ id, name }] : [];
  });
}

function asIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function packageByIdOrName(id: string, name: string) {
  const idKey = id.toLowerCase();
  const nameKey = name.toLowerCase();
  return services.find((service) => service.id === id || (nameKey && service.name.toLowerCase() === nameKey) || service.id === idKey);
}

function twilightPrompt(role: string, polish: boolean): string {
  const place = role === "front"
    ? "front exterior"
    : role === "back"
      ? "rear exterior"
      : "exterior";
  const request = [
    `Convert this ${place} listing photo into a photoreal twilight.`,
    "Turn on warm interior lights and landscape lighting.",
    "Keep the architecture, landscaping, and camera angle.",
    "Use a natural evening sky. Do not add people or text.",
  ];
  if (polish) request.push(ICONIC_POLISH_INSTRUCTION);
  return request.join(" ");
}

function photoPrompt(polish: boolean): string {
  return polish ? `${PHOTO_BASE} ${ICONIC_POLISH_INSTRUCTION}` : PHOTO_BASE;
}

function twilightRole(index: number): string {
  if (index === 0) return "front";
  if (index === 1) return "back";
  return `exterior-${index + 1}`;
}

function isShowcaseItem(id: string, name: string, catalogId?: string): boolean {
  const blob = `${id} ${name} ${catalogId || ""}`.toLowerCase();
  return blob.includes("listing-showcase") || blob.includes("the showcase");
}

function collectTexts(input: OrderEditInput): { texts: string[]; packageName: string; polishFromOrder: boolean; showcase: boolean } {
  const texts: string[] = [];
  const packageNames: string[] = [];
  let polishFromOrder = false;
  let showcase = false;
  const items = [...asItems(input.lineItems), ...asItems(input.services)];
  for (const id of asIds(input.serviceIds)) items.push({ id, name: "" });

  for (const item of items) {
    if (item.name) texts.push(item.name);
    const catalog = packageByIdOrName(item.id, item.name);
    if (catalog) {
      packageNames.push(catalog.name);
      for (const feature of catalog.features || []) texts.push(feature);
    }
    if (isShowcaseItem(item.id, item.name, catalog?.id)) showcase = true;
    const blob = `${item.id} ${item.name}`.toLowerCase();
    if (blob.includes("iconic finish") || blob.includes("iconic polish") || blob.includes("iconic-finish")) {
      polishFromOrder = true;
    }
  }
  return {
    texts,
    packageName: packageNames[0] || items.find((item) => item.name)?.name || "Custom order",
    polishFromOrder,
    showcase,
  };
}

export function planOrderEdits(input: OrderEditInput = {}): OrderEditPlan {
  const collected = collectTexts(input);
  let twilightCount = 0;
  let photoCount: number | null = null;
  let photoFull = false;
  let polishFromOrder = collected.polishFromOrder;
  const deliverables = new Map<string, OrderDeliverable>();

  for (const text of collected.texts) {
    const twilight = text.match(/(\d+)\s+(?:iconic\s+)?twilight/i);
    if (twilight) twilightCount = Math.max(twilightCount, Number(twilight[1]));
    else if (/twilight/i.test(text)) twilightCount = Math.max(twilightCount, 1);

    const photos = text.match(/(\d+)\s+(?:high-end\s+|iconic\s+)?(?:images|photos)\b/i);
    if (photos) photoCount = Math.max(photoCount || 0, Number(photos[1]));
    if (/full images/i.test(text)) photoFull = true;

    const aerials = text.match(/(\d+)\s+aerial/i);
    if (aerials || /full aerials|aerial drone/i.test(text)) {
      const previous = deliverables.get("aerials");
      const stated = aerials ? Number(aerials[1]) : null;
      const count = stated != null ? Math.max(stated, previous?.count || 0) : (previous?.count ?? null);
      deliverables.set("aerials", {
        id: "aerials",
        label: count ? `${count} aerial stills` : "Aerial stills",
        kind: "capture",
        count,
      });
    }
    if (/snap/i.test(text) && /reel/i.test(text)) {
      deliverables.set("snap-reel", { id: "snap-reel", label: "Snap reel", kind: "video" });
    }
    if (/animated reel|walk-?through reel|3d animated/i.test(text)) {
      deliverables.set("animated-reel", { id: "animated-reel", label: "Animated walk-through reel", kind: "video" });
    }
    if (/cinematic/i.test(text) && /video/i.test(text)) {
      deliverables.set("cinematic-video", { id: "cinematic-video", label: "Cinematic property video", kind: "video" });
    }
    if (/floor\s*plan|floorplan/i.test(text)) {
      deliverables.set("floorplan", { id: "floorplan", label: "Floor plan", kind: "floorplan" });
    }
    if (/matterport|\b3d tour\b/i.test(text)) {
      deliverables.set("tour-3d", { id: "tour-3d", label: "3D tour", kind: "capture" });
    }
    if (/same[- ]day/i.test(text)) {
      deliverables.set("same-day", { id: "same-day", label: "Same-day delivery", kind: "delivery" });
    }
    if (/iconic finish|iconic polish/i.test(text)) polishFromOrder = true;
  }

  const iconicPolish = input.iconicPolish === true || polishFromOrder;
  if (collected.showcase) {
    photoCount = SHOWCASE_PHOTO_COUNT;
    photoFull = false;
  }
  const count = Math.min(8, Math.max(0, twilightCount));
  const twilight = Array.from({ length: count }, (_, index) => {
    const role = twilightRole(index);
    return { slot: `twilight-${role}`, role, prompt: twilightPrompt(role, iconicPolish) };
  });

  return {
    packageName: collected.packageName,
    iconicPolish,
    polishFromOrder,
    photoPrompt: photoPrompt(iconicPolish),
    photoCount: photoFull ? null : photoCount,
    photoScope: photoFull ? "full" : photoCount != null ? "count" : "none",
    twilight,
    deliverables: [...deliverables.values()],
    galleryRelease: ORDER_GALLERY_RELEASE,
    notes: [
      "Image edits use the order. Photographers do not pick a preset per photo.",
      "Reels, aerial capture, floor plans, and delivery are not OpenAI image edits.",
      "The gallery stays held until the order is complete. This plan does not send it.",
    ],
  };
}

function sourceScore(name: string, role: string): number {
  const normalized = name.toLowerCase();
  if (role === "front" && /front|facade|elevation/.test(normalized)) return 5;
  if (role === "back" && /back|rear|pool/.test(normalized)) return 5;
  if (/exterior|outside/.test(normalized)) {
    if (role === "front" || role === "back") return 2;
    return 4;
  }
  if (/aerial|drone/.test(normalized)) return 0;
  return 0;
}

function previewable(frame: OrderEditSource): boolean {
  if (frame.raw) return false;
  if (frame.previewable === false) return false;
  return Boolean(frame.path);
}

/** Pair twilight slots with filenames. Interiors are left waiting instead of guessed. */
export function orderEditDrafts(plan: OrderEditPlan, frames: OrderEditSource[]): OrderEditDraft[] {
  const usable = frames.filter(previewable);
  const used = new Set<string>();
  const drafts: OrderEditDraft[] = [];

  for (const slot of plan.twilight) {
    let best: OrderEditSource | null = null;
    let bestScore = 0;
    for (const frame of usable) {
      if (used.has(frame.path)) continue;
      const score = sourceScore(frame.name || frame.path, slot.role);
      if (score > bestScore) {
        best = frame;
        bestScore = score;
      }
    }
    if (best && bestScore > 0) used.add(best.path);
    const waiting = !best;
    drafts.push({
      slot: slot.slot,
      origin: "order",
      type: "twilight",
      label: `Twilight · ${slot.role}`,
      prompt: slot.prompt,
      sourcePath: best?.path || "",
      imageUrl: best?.url || "",
      fileName: best?.name || `${slot.slot}.jpg`,
      waitingNote: waiting
        ? `Waiting for a ${slot.role} exterior. The photographer is not asked to pick the edit.`
        : "",
    });
  }

  for (const frame of usable) {
    drafts.push({
      slot: photoSlot(frame.path),
      origin: "order",
      type: "photo",
      label: plan.iconicPolish ? "Photo · Iconic Polish" : "Photo",
      prompt: plan.photoPrompt,
      sourcePath: frame.path,
      imageUrl: frame.url,
      fileName: frame.name || "photo.jpg",
      waitingNote: "",
    });
  }
  return drafts;
}

export function photoSlot(storagePath: string): string {
  let hash = 2166136261;
  for (const char of storagePath) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `photo_${(hash >>> 0).toString(16)}`;
}

export function orderEditDocId(listingId: string, slot: string): string {
  const clean = `${listingId}_${slot}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 700);
  return `order_${clean}`;
}

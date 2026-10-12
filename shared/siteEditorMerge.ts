/**
 * Merge a saved page over the hardcoded defaults.
 * Unknown pages, blocks, and fields are dropped. Known field ids keep the saved copy.
 */

import {
  type ContentBlock,
  type ContentField,
  type ContentItem,
  type ContentPage,
  stripPage,
} from "./siteEditor.ts";
import { defaultPage } from "./siteEditorDefaults.ts";

const MAX_TEXT = 20000;
const MAX_ITEMS = 80;

function cleanField(field: ContentField, fallback?: ContentField): ContentField | null {
  const kind = field?.kind || fallback?.kind;
  if (!kind || !field?.id) return null;
  const value = String(field.value ?? fallback?.value ?? "").slice(0, MAX_TEXT);
  const next: ContentField = { id: String(field.id), label: String(field.label || fallback?.label || field.id), kind, value };
  if (kind === "link" || field.href != null || fallback?.href != null) {
    next.href = String(field.href ?? fallback?.href ?? "").slice(0, 2000);
  }
  return next;
}

function cleanItem(item: ContentItem, allowed: Set<string> | null): ContentItem | null {
  if (!item?.id || !Array.isArray(item.fields)) return null;
  const fields = item.fields
    .map((field) => cleanField(field))
    .filter((field): field is ContentField => Boolean(field))
    .filter((field) => !allowed || allowed.has(field.id));
  if (!fields.length) return null;
  return { id: String(item.id).slice(0, 80), fields };
}

function cleanBlock(block: ContentBlock, fallback?: ContentBlock): ContentBlock | null {
  if (!block?.id) return null;
  const baseFields = fallback?.fields ?? [];
  const fields = baseFields.map((field) => {
    const incoming = block.fields?.find((item) => item.id === field.id);
    return cleanField(incoming || field, field)!;
  });
  const allowedItemFields = new Set((fallback?.items ?? []).flatMap((item) => item.fields.map((field) => field.id)));
  const items = fallback?.items
    ? (Array.isArray(block.items)
      ? block.items.map((item) => cleanItem(item, allowedItemFields)).filter((item): item is ContentItem => Boolean(item)).slice(0, MAX_ITEMS)
      : fallback.items)
    : undefined;
  return {
    id: String(block.id),
    label: String(block.label || fallback?.label || block.id),
    hidden: block.hidden === true,
    fields,
    ...(items ? { items } : {}),
  };
}

/** Saved copy wins per field. Blocks missing from the save keep their default. */
export function mergeContent(overlay: ContentPage | null | undefined): ContentPage | null {
  if (!overlay?.id) return null;
  const base = defaultPage(overlay.id);
  if (!base) return null;
  const order = Array.isArray(overlay.blocks) ? overlay.blocks.map((block) => block.id) : [];
  const blocks = base.blocks.map((block) => {
    const incoming = overlay.blocks?.find((item) => item.id === block.id);
    return incoming ? cleanBlock(incoming, block)! : cleanBlock(block, block)!;
  });
  blocks.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return stripPage({
    ...base,
    seoTitle: String(overlay.seoTitle ?? base.seoTitle).slice(0, 300),
    seoDescription: String(overlay.seoDescription ?? base.seoDescription).slice(0, 500),
    blocks,
  });
}

export function samePage(a: ContentPage | null | undefined, b: ContentPage | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(stripPage(a)) === JSON.stringify(stripPage(b));
}

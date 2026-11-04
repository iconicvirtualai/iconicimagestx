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

/**
 * Default items are the slots. A saved item with the same id keeps its copy.
 * Items that are no longer in the defaults drop out, and new slots appear.
 */
function mergeItems(saved: ContentItem[] | undefined, fallback: ContentItem[]): ContentItem[] {
  const savedById = new Map((saved ?? []).map((item) => [item.id, item]));
  return fallback.slice(0, MAX_ITEMS).map((base) => {
    const incoming = savedById.get(base.id);
    if (!incoming) return { id: base.id, fields: base.fields.map((field) => ({ ...field })) };
    const fields = base.fields.map((field) => {
      const found = incoming.fields?.find((item) => item.id === field.id);
      return cleanField(found || field, field)!;
    });
    return { id: base.id, fields };
  });
}

function cleanBlock(block: ContentBlock, fallback?: ContentBlock): ContentBlock | null {
  if (!block?.id) return null;
  const baseFields = fallback?.fields ?? [];
  const fields = baseFields.map((field) => {
    const incoming = block.fields?.find((item) => item.id === field.id);
    return cleanField(incoming || field, field)!;
  });
  const items = fallback?.items ? mergeItems(block.items, fallback.items) : undefined;
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

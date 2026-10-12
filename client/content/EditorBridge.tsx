import { useEffect } from "react";
import type { ContentPage } from "@shared/siteEditor";
import { useSiteContent } from "./siteContent";

function writeField(pages: ContentPage[], pageId: string, blockId: string, fieldId: string, value: string, itemId?: string): ContentPage[] {
  return pages.map((page) => {
    if (page.id !== pageId) return page;
    return {
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (itemId) {
          return {
            ...block,
            items: (block.items || []).map((item) => item.id === itemId
              ? { ...item, fields: item.fields.map((field) => field.id === fieldId ? { ...field, value } : field) }
              : item),
          };
        }
        return {
          ...block,
          fields: block.fields.map((field) => field.id === fieldId ? { ...field, value } : field),
        };
      }),
    };
  });
}

/** Runs inside the editor preview frame. Clicks edit the draft and tell the parent. */
export default function EditorBridge() {
  const { pages, setPages } = useSiteContent();

  useEffect(() => {
    const publish = (next: ContentPage[]) => {
      setPages(next);
      window.parent.postMessage({ type: "site-editor-update", pages: next }, window.location.origin);
    };

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-site-field]");
      if (!target) return;
      const kind = target.dataset.siteKind;
      if (kind === "image" || kind === "video") {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({
          type: "site-select",
          page: target.dataset.sitePage,
          block: target.dataset.siteBlock,
          field: target.dataset.siteField,
          item: target.dataset.siteItem || "",
          kind,
        }, window.location.origin);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      target.contentEditable = "true";
      target.focus();
    };

    const onBlur = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.dataset?.siteField || target.dataset.siteKind === "image" || target.dataset.siteKind === "video") return;
      target.contentEditable = "false";
      const next = writeField(
        pages,
        target.dataset.sitePage || "",
        target.dataset.siteBlock || "",
        target.dataset.siteField || "",
        target.textContent || "",
        target.dataset.siteItem || undefined,
      );
      publish(next);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("focusout", onBlur, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusout", onBlur, true);
    };
  }, [pages, setPages]);

  return (
    <style>{`
      [data-site-field]:hover { outline: 2px solid #0d9488; outline-offset: 2px; cursor: text; }
      [data-site-kind="image"]:hover, [data-site-kind="video"]:hover { cursor: pointer; }
    `}</style>
  );
}

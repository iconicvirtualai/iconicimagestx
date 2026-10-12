import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import EditorBridge from "./EditorBridge";
import { useSearchParams } from "react-router-dom";
import {
  type ContentItem,
  type ContentPage,
  findField,
  itemField,
} from "@shared/siteEditor";

export const SITE_DRAFT_KEY = "iconic-site-draft";

type SiteContentValue = {
  pages: ContentPage[];
  editor: boolean;
  preview: boolean;
  setPages: (pages: ContentPage[]) => void;
};

const SiteContentContext = createContext<SiteContentValue>({
  pages: [],
  editor: false,
  preview: false,
  setPages: () => undefined,
});

export function useSiteContent() {
  return useContext(SiteContentContext);
}

export function useSitePage(id: string): ContentPage | null {
  return useSiteContent().pages.find((page) => page.id === id) ?? null;
}

export function useSiteText(pageId: string, blockId: string, fieldId: string, fallback: string): string {
  const page = useSitePage(pageId);
  if (!page) return fallback;
  const field = findField(page, blockId, fieldId);
  return field ? field.value : fallback;
}

export function useSiteHref(pageId: string, blockId: string, fieldId: string, fallback: string): string {
  const page = useSitePage(pageId);
  if (!page) return fallback;
  const field = findField(page, blockId, fieldId);
  return field?.href || fallback;
}

export function useBlockHidden(pageId: string, blockId: string): boolean {
  const page = useSitePage(pageId);
  if (!page) return false;
  return page.blocks.find((block) => block.id === blockId)?.hidden === true;
}

export function useSiteItems(pageId: string, blockId: string): ContentItem[] | null {
  const page = useSitePage(pageId);
  if (!page) return null;
  const block = page.blocks.find((item) => item.id === blockId);
  return block?.items ?? null;
}

export function itemText(item: ContentItem, fieldId: string, fallback = ""): string {
  return itemField(item, fieldId)?.value ?? fallback;
}

export function itemLink(item: ContentItem, fieldId: string, fallback = ""): string {
  return itemField(item, fieldId)?.href || fallback;
}

function readDraft(): ContentPage[] {
  try {
    const raw = sessionStorage.getItem(SITE_DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const editor = params.get("editor") === "1";
  const preview = params.get("draft") === "1" || editor;
  const [pages, setPagesState] = useState<ContentPage[]>([]);

  const setPages = (next: ContentPage[]) => {
    setPagesState(next);
    if (preview) sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    if (preview) {
      setPagesState(readDraft());
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === "site-draft-pages" && Array.isArray(event.data.pages)) {
          setPagesState(event.data.pages);
          sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(event.data.pages));
        }
      };
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }
    let cancel = false;
    fetch("/api/site-content")
      .then((response) => (response.ok ? response.json() : { pages: [] }))
      .then((data) => {
        if (!cancel) setPagesState(Array.isArray(data.pages) ? data.pages : []);
      })
      .catch(() => {
        if (!cancel) setPagesState([]);
      });
    return () => {
      cancel = true;
    };
  }, [preview]);

  return (
    <SiteContentContext.Provider value={{ pages, editor, preview, setPages }}>
      {editor ? <EditorBridge /> : null}
      {preview && !editor ? (
        <div className="fixed left-0 right-0 top-0 z-[80] bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black">
          Previewing draft — not live
        </div>
      ) : null}
      {children}
    </SiteContentContext.Provider>
  );
}

type TextProps = {
  page: string;
  block: string;
  field: string;
  fallback: string;
  className?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
};

export function SiteText({ page, block, field, fallback, className, as = "span" }: TextProps) {
  const value = useSiteText(page, block, field, fallback);
  const Tag = as;
  return (
    <Tag data-site-page={page} data-site-block={block} data-site-field={field} data-site-kind="text" className={className}>
      {value}
    </Tag>
  );
}

export function SiteMedia({
  page,
  block,
  field,
  fallback,
  kind,
  className,
  alt,
}: {
  page: string;
  block: string;
  field: string;
  fallback: string;
  kind: "image" | "video";
  className?: string;
  alt?: string;
}) {
  const src = useSiteText(page, block, field, fallback);
  const shared = {
    "data-site-page": page,
    "data-site-block": block,
    "data-site-field": field,
    "data-site-kind": kind,
    className,
  };
  if (kind === "video") {
    return <video src={src} {...shared} autoPlay muted loop playsInline />;
  }
  return <img src={src} alt={alt || ""} {...shared} />;
}

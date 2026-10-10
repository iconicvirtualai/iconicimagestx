import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { metaPlan, type MetaPlan } from "@shared/siteSeo";

const CLEAR_SELECTOR = [
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'link[rel="canonical"]',
].join(", ");

function clearSeo(doc: Document) {
  doc.head.querySelectorAll(CLEAR_SELECTOR).forEach((node) => node.remove());
}

function upsertMeta(doc: Document, attr: "name" | "property", key: string, content: string) {
  const el = doc.createElement("meta");
  el.setAttribute(attr, key);
  el.setAttribute("content", content);
  el.setAttribute("data-site-seo", "1");
  doc.head.appendChild(el);
}

export function applyMetaPlan(doc: Document, plan: MetaPlan) {
  if (plan.kind === "hands-off") return;
  if (plan.kind === "preserve-title") {
    clearSeo(doc);
    return;
  }
  clearSeo(doc);
  doc.title = plan.title;
  if (plan.kind === "noindex") {
    upsertMeta(doc, "name", "robots", "noindex, nofollow");
    return;
  }
  if (plan.kind === "generic") return;
  upsertMeta(doc, "name", "description", plan.description);
  const canonical = doc.createElement("link");
  canonical.setAttribute("rel", "canonical");
  canonical.setAttribute("href", plan.canonical);
  canonical.setAttribute("data-site-seo", "1");
  doc.head.appendChild(canonical);
  upsertMeta(doc, "property", "og:type", "website");
  upsertMeta(doc, "property", "og:title", plan.title);
  upsertMeta(doc, "property", "og:description", plan.description);
  upsertMeta(doc, "property", "og:url", plan.canonical);
  upsertMeta(doc, "property", "og:image", plan.image);
  upsertMeta(doc, "name", "twitter:card", "summary_large_image");
  upsertMeta(doc, "name", "twitter:title", plan.title);
  upsertMeta(doc, "name", "twitter:description", plan.description);
  upsertMeta(doc, "name", "twitter:image", plan.image);
}

export default function SiteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    let cancelled = false;
    // Run after page effects (Go and presentations set their own titles).
    queueMicrotask(() => {
      if (!cancelled) applyMetaPlan(document, metaPlan(pathname));
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  return null;
}

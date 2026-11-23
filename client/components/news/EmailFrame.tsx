import { useEffect, useMemo, useRef } from "react";
import { prepareEmailSrcDoc } from "@shared/news";

/**
 * The email's CSS stays inside this frame. The frame grows to the message,
 * so the newsletter has no inner scrollbar. Only the page scrolls.
 */
export default function EmailFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const srcDoc = useMemo(() => prepareEmailSrcDoc(html, origin), [html, origin]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const applyHeight = (height: number) => {
      if (!Number.isFinite(height) || height < 1 || height > 200000) return;
      frame.style.height = `${Math.ceil(height)}px`;
    };
    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      frame.style.height = "1px";
      doc.querySelectorAll("a[href]").forEach((node) => {
        const link = node as HTMLAnchorElement;
        const href = link.getAttribute("href") || "";
        if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      });
      const body = doc.body;
      const root = doc.documentElement;
      applyHeight(Math.max(body?.scrollHeight || 0, body?.offsetHeight || 0, root?.scrollHeight || 0, root?.offsetHeight || 0));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type === "news-email-height") applyHeight(Number(data.height));
    };
    frame.addEventListener("load", measure);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      frame.removeEventListener("load", measure);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", measure);
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      scrolling="no"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full max-w-[600px] overflow-hidden rounded-[1.75rem] border-0 bg-[#f4eee4] shadow-[0_18px_50px_rgba(20,20,20,0.08)]"
      style={{ height: 1, overflow: "hidden" }}
    />
  );
}

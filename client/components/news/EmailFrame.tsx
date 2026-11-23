import { useEffect, useMemo, useRef } from "react";
import { prepareEmailSrcDoc } from "@shared/news";

/**
 * The send-ready email keeps its own inline CSS. The iframe is the boundary
 * so those rules do not restyle the site. allow-scripts is on so animated
 * GIFs keep playing; script tags are stripped before the HTML is inserted.
 */
export default function EmailFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const srcDoc = useMemo(() => prepareEmailSrcDoc(html, origin), [html, origin]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.querySelectorAll("a[href]").forEach((node) => {
        const link = node as HTMLAnchorElement;
        const href = link.getAttribute("href") || "";
        if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      });
      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", fit, { once: true });
      });
      const height = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0);
      if (height > 0) frame.style.height = `${height + 4}px`;
    };
    frame.addEventListener("load", fit);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      frame.removeEventListener("load", fit);
      window.removeEventListener("resize", fit);
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full max-w-[600px] overflow-hidden rounded-[1.75rem] border-0 bg-[#f4eee4] shadow-[0_18px_50px_rgba(20,20,20,0.08)]"
      style={{ height: 960 }}
    />
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PublicPresentation } from "@shared/presentation";

const SERIF = '"Cormorant Garamond", "Iowan Old Style", Palatino, Georgia, serif';

function applyMeta(presentation: PublicPresentation) {
  document.title = presentation.meta.title;
  const tags: Array<[string, string, string]> = [
    ["name", "description", presentation.meta.description],
    ["name", "robots", "noindex, nofollow"],
    ["property", "og:type", "website"],
    ["property", "og:title", presentation.meta.title],
    ["property", "og:description", presentation.meta.description],
    ["property", "og:url", presentation.meta.url || window.location.href],
    ["property", "og:image", presentation.meta.image],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", presentation.meta.title],
    ["name", "twitter:description", presentation.meta.description],
    ["name", "twitter:image", presentation.meta.image],
  ];
  for (const [attr, key, content] of tags) {
    if (!content) continue;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }
}

export function PresentationView({
  presentation,
  shareUrl,
  activeIndex,
  copied,
  onCopy,
}: {
  presentation: PublicPresentation;
  shareUrl: string;
  activeIndex: number;
  copied: boolean;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const title = presentation.street || (presentation.seeded ? "Sample presentation" : "Your listing");
  const countLabel = `${presentation.photos.length} photograph${presentation.photos.length === 1 ? "" : "s"}`;
  const facts = [presentation.beds && `${presentation.beds} bed`, presentation.baths && `${presentation.baths} bath`, presentation.price]
    .filter(Boolean);

  useEffect(() => {
    if (open == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((current) => current == null ? current : Math.min(presentation.photos.length - 1, current + 1));
      if (event.key === "ArrowLeft") setOpen((current) => current == null ? current : Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, presentation.photos.length]);

  return (
    <div className="min-h-screen bg-[#070708] text-[#f6f3ee]" data-testid="listing-presentation">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" />
      <style>{`
        @keyframes iconic-ken { from { transform: scale(1.08); } to { transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) { .iconic-ken { animation: none !important; } }
      `}</style>

      <div className="fixed inset-x-0 top-0 z-40 h-0.5 bg-white/10">
        <div
          className="h-full bg-[#0d9488]"
          style={{ width: `${presentation.photos.length ? ((activeIndex + 1) / presentation.photos.length) * 100 : 0}%` }}
        />
      </div>

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <img src="/media/logos/logo-white-large.png" alt="Iconic Images" className="h-7 w-auto sm:h-8" />
        <div className="flex items-center gap-2 sm:gap-3">
          {presentation.photos.length > 0 && (
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.28em] text-white/80 sm:block">
              {String(activeIndex + 1).padStart(2, "0")} / {String(presentation.photos.length).padStart(2, "0")}
            </p>
          )}
          <button
            type="button"
            onClick={onCopy}
            data-testid="presentation-copy"
            className={`rounded-full px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.22em] ${copied ? "bg-white text-black" : "border border-white/30 bg-black/45 text-white backdrop-blur-md"}`}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </header>

      {presentation.photos.length === 0 ? (
        <section className="flex min-h-[100svh] flex-col justify-end px-6 pb-16 pt-28 sm:px-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Iconic Images</p>
          <h1 className="mt-4 max-w-4xl text-balance font-medium leading-[0.92] [overflow-wrap:normal] [word-break:normal]" style={{ fontFamily: SERIF, fontSize: "clamp(3.2rem, 9vw, 7rem)" }}>
            {title}
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">Photographs are still being finished. This private link is already yours.</p>
        </section>
      ) : (
        <main data-testid="presentation-feed">
          {presentation.photos.map((photo, index) => {
            const roomStarts = index === 0 || photo.room !== presentation.photos[index - 1]?.room;
            return (
              <section
                key={photo.id}
                data-frame={index}
                className="relative min-h-[100svh] snap-start"
              >
                <button
                  type="button"
                  aria-label={photo.alt}
                  onClick={() => setOpen(index)}
                  className="block h-[100svh] w-full overflow-hidden"
                >
                  <img
                    src={photo.url}
                    alt={photo.alt}
                    className={`h-[100svh] w-full object-cover ${index === 0 ? "iconic-ken" : ""}`}
                    style={index === 0 ? { animation: "iconic-ken 22s ease-out both" } : undefined}
                  />
                </button>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] sm:px-10 sm:pb-10">
                  {index === 0 ? (
                    <div className="max-w-5xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-white/75">
                        {presentation.seeded ? "Private preview" : "Private presentation"}
                      </p>
                      <h1
                        className="mt-3 max-w-5xl text-balance font-medium leading-[0.9] [overflow-wrap:normal] [word-break:normal]"
                        style={{ fontFamily: SERIF, fontSize: "clamp(3.4rem, 8.6vw, 8rem)" }}
                      >
                        {title}
                      </h1>
                      {presentation.locality && (
                        <p className="mt-3 text-lg text-white/80 sm:text-2xl" style={{ fontFamily: SERIF }}>{presentation.locality}</p>
                      )}
                      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
                        <span>{countLabel}</span>
                        {facts.map((fact) => <span key={fact}>{fact}</span>)}
                        {presentation.agentName && <span>With {presentation.agentName}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        {roomStarts && (
                          <p className="mt-1 text-4xl italic leading-none sm:text-6xl" style={{ fontFamily: SERIF }}>
                            {photo.room || "The home"}
                          </p>
                        )}
                      </div>
                      <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </main>
      )}

      <section className="flex min-h-[100svh] flex-col items-start justify-end px-6 pb-16 pt-28 sm:px-12" data-frame={presentation.photos.length}>
        <img src="/media/logos/logo-white-large.png" alt="" className="mb-8 h-8 w-auto" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/55">Iconic Images</p>
        <h2 className="mt-4 max-w-3xl font-medium leading-[0.92] [overflow-wrap:normal] [word-break:normal]" style={{ fontFamily: SERIF, fontSize: "clamp(3rem, 7vw, 6rem)" }}>
          {presentation.address || (presentation.seeded ? "Sample presentation" : "Private presentation")}
        </h2>
        <div className="mt-6 space-y-1 text-sm text-white/70">
          {presentation.clientName && <p>Prepared for {presentation.clientName}</p>}
          {presentation.agentName && <p>{presentation.agentName}</p>}
          <p>{countLabel}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="mt-8 rounded-full bg-[#f6f3ee] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black"
        >
          {copied ? "Link copied" : "Copy share link"}
        </button>
        {shareUrl && <p className="mt-4 max-w-xl break-all text-xs text-white/40">{shareUrl}</p>}
        <p className="mt-8 max-w-md text-xs leading-relaxed text-white/45">
          This page is a private presentation. Send the link yourself. Iconic does not email or text it from here.
        </p>
        <p className="mt-10 text-[10px] uppercase tracking-[0.28em] text-white/35">
          <Link to="/privacy" className="underline">Privacy</Link>
          <span> · </span>
          <Link to="/terms" className="underline">Terms</Link>
        </p>
      </section>

      {copied && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-lg">
          Link copied
        </div>
      )}

      {open != null && presentation.photos[open] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Photograph">
          <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 rounded-full border border-white/20 p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setOpen((current) => Math.max(0, (current || 0) - 1))} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 p-2" aria-label="Previous photograph">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <img src={presentation.photos[open].url} alt={presentation.photos[open].alt} className="max-h-[100svh] w-full object-contain" />
          <button type="button" onClick={() => setOpen((current) => Math.min(presentation.photos.length - 1, (current || 0) + 1))} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 p-2" aria-label="Next photograph">
            <ChevronRight className="h-5 w-5" />
          </button>
          <p className="absolute bottom-5 left-5 text-2xl italic" style={{ fontFamily: SERIF }}>
            {presentation.photos[open].room || title}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ListingPresentation() {
  const { token = "" } = useParams();
  const [presentation, setPresentation] = useState<PublicPresentation | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const shareUrl = useMemo(() => (typeof window === "undefined" ? "" : window.location.href), [token]);

  useEffect(() => {
    let cancelled = false;
    setPresentation(null);
    setError("");
    fetch(`/api/presentations/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "This presentation link is not active.");
        return data as PublicPresentation;
      })
      .then((data) => {
        if (cancelled) return;
        setPresentation(data);
        applyMeta(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This presentation link is not active.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!presentation) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-frame]"));
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = Number((visible.target as HTMLElement).dataset.frame);
      if (Number.isFinite(index)) setActiveIndex(Math.min(index, Math.max(presentation.photos.length - 1, 0)));
    }, { threshold: [0.55] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [presentation]);

  const copy = () => {
    const url = window.location.href;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 12000);
    const fallback = () => {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "true");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    };
    if (!navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(url).catch(fallback);
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-start justify-end bg-[#070708] px-6 pb-16 text-[#f6f3ee]">
        <img src="/media/logos/logo-white-large.png" alt="Iconic Images" className="mb-8 h-8 w-auto" />
        <h1 className="max-w-xl font-medium leading-none" style={{ fontFamily: SERIF, fontSize: "clamp(3rem, 8vw, 5.5rem)" }}>This link is quiet.</h1>
        <p className="mt-4 max-w-md text-sm text-white/70">{error}</p>
      </div>
    );
  }

  if (!presentation) {
    return <div className="min-h-screen bg-[#070708]" aria-busy="true" />;
  }

  return (
    <PresentationView
      presentation={presentation}
      shareUrl={shareUrl}
      activeIndex={activeIndex}
      copied={copied}
      onCopy={copy}
    />
  );
}

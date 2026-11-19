import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { orderedGalleryMedia } from "@shared/gallerySequence";
import { ClientGalleryMediaFrame } from "./ClientGalleryMedia";
import {
  classifyClientGalleryItem,
  galleryHttpUrl,
  galleryItemName,
  galleryOffersDownload,
  type ClientGalleryItem,
  type ClientGalleryKind,
} from "./clientGalleryMedia";

type SectionId = "photos" | "video" | "reels" | "floorplans" | "tours" | "files";

const SECTION_LABEL: Record<SectionId, string> = {
  photos: "Photos",
  video: "Video",
  reels: "Reels",
  floorplans: "Floor plans",
  tours: "Tours",
  files: "Files",
};

function sectionFor(kind: ClientGalleryKind): SectionId {
  if (kind === "reel") return "reels";
  if (kind === "branded-video" || kind === "unbranded-video" || kind === "video" || kind === "aerial-video") return "video";
  if (kind === "floorplan-image" || kind === "floorplan-pdf") return "floorplans";
  if (kind === "tour") return "tours";
  if (kind === "file") return "files";
  return "photos";
}

function isStill(kind: ClientGalleryKind): boolean {
  return sectionFor(kind) === "photos" || kind === "floorplan-image";
}

export function DeliveryGallery({
  items,
  galleryId,
  zipHref,
  webZipHref,
  printZipHref,
}: {
  items: ClientGalleryItem[];
  galleryId?: string;
  zipHref?: string;
  webZipHref?: string;
  printZipHref?: string;
}) {
  const ordered = orderedGalleryMedia(items);
  const groups = (Object.keys(SECTION_LABEL) as SectionId[])
    .map((id) => ({
      id,
      label: SECTION_LABEL[id],
      items: ordered.filter((item) => sectionFor(classifyClientGalleryItem(item)) === id),
    }))
    .filter((group) => group.items.length > 0);
  const stills = ordered.filter((item) => isStill(classifyClientGalleryItem(item)) && classifyClientGalleryItem(item) !== "locked");
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = stills.findIndex((item) => (item.id || galleryItemName(item)) === openId);
  const openItem = openIndex >= 0 ? stills[openIndex] : null;
  const photos = groups.find((group) => group.id === "photos")?.items || [];
  const hero = photos[0];
  const rest = photos.slice(1);
  const canZip = Boolean(zipHref) && ordered.some((item) => galleryOffersDownload(item));

  const openStill = (item: ClientGalleryItem) => {
    if (classifyClientGalleryItem(item) === "locked") return;
    setOpenId(item.id || galleryItemName(item));
  };

  return (
    <div data-testid="client-gallery-board">
      {canZip && zipHref ? (
        <div className="mb-6 flex flex-wrap gap-2" data-testid="gallery-toolbar">
          <a href={zipHref} data-testid="gallery-download-all" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-4 text-[12px] font-semibold text-white">
            <Download className="h-3.5 w-3.5" /> Download all
          </a>
          {webZipHref ? <a href={webZipHref} data-testid="gallery-download-web" className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 text-[12px] font-semibold text-black">Web size</a> : null}
          {printZipHref ? <a href={printZipHref} data-testid="gallery-download-print" className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-4 text-[12px] font-semibold text-black">Print size</a> : null}
        </div>
      ) : null}

      {groups.length > 1 ? (
        <nav aria-label="Gallery sections" className="mb-6 flex gap-2 overflow-x-auto">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#gallery-${group.id}`}
              data-testid={`gallery-tab-${group.id}`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-white px-4 text-[12px] font-semibold text-black/80"
            >
              {group.label}
            </a>
          ))}
        </nav>
      ) : null}

      {groups.map((group) => (
        <section key={group.id} id={`gallery-${group.id}`} className="mb-10" aria-label={group.label}>
          {groups.length > 1 ? <h2 className="mb-3 text-sm font-semibold tracking-wide text-black/60">{group.label}</h2> : null}
          {group.id === "photos" ? (
            <div>
              {hero ? <PhotoTile item={hero} hero onOpen={() => openStill(hero)} /> : null}
              {rest.length ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {rest.map((item) => (
                    <PhotoTile key={item.id || galleryItemName(item)} item={item} onOpen={() => openStill(item)} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={group.id === "files" || group.id === "tours" ? "grid gap-3" : "grid grid-cols-1 gap-3 lg:grid-cols-2"}>
              {group.items.map((item) => (
                <div key={item.id || galleryItemName(item)} data-testid={`gallery-card-${item.id || classifyClientGalleryItem(item)}`} data-gallery-kind={classifyClientGalleryItem(item)} className="overflow-hidden rounded-2xl bg-black">
                  <ClientGalleryMediaFrame item={item} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {openItem ? (
        <DeliveryLightbox
          item={openItem}
          index={openIndex}
          count={stills.length}
          galleryId={galleryId}
          onClose={() => setOpenId(null)}
          onStep={(delta) => {
            const next = stills[(openIndex + delta + stills.length) % stills.length];
            setOpenId(next.id || galleryItemName(next));
          }}
        />
      ) : null}
    </div>
  );
}

function PhotoTile({ item, hero, onOpen }: { item: ClientGalleryItem; hero?: boolean; onOpen: () => void }) {
  const kind = classifyClientGalleryItem(item);
  const src = galleryHttpUrl(item.url);
  if (kind === "locked" || !src) {
    return (
      <div data-testid={`gallery-card-${item.id || kind}`} data-gallery-kind={kind} className={hero ? "mb-3" : ""}>
        <ClientGalleryMediaFrame item={item} />
      </div>
    );
  }
  return (
    <button
      type="button"
      data-testid={hero ? "gallery-hero" : `gallery-card-${item.id || kind}`}
      data-gallery-kind={kind}
      onClick={onOpen}
      className={`block w-full overflow-hidden rounded-2xl bg-[#eceae6] text-left ${hero ? "mb-3" : ""}`}
      aria-label="Open photo"
    >
      <img
        src={src}
        alt=""
        loading={hero ? "eager" : "lazy"}
        decoding="async"
        data-testid={`gallery-image-${item.id || kind}`}
        className={`w-full object-cover ${hero ? "aspect-[16/9] max-h-[70vh]" : "aspect-[3/2]"}`}
      />
    </button>
  );
}

function DeliveryLightbox({
  item,
  index,
  count,
  galleryId,
  onClose,
  onStep,
}: {
  item: ClientGalleryItem;
  index: number;
  count: number;
  galleryId?: string;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const src = galleryHttpUrl(item.url);
  const printHref = galleryOffersDownload(item) ? src : null;
  const webHref = printHref && galleryId && item.id
    ? `/api/galleries/public/${encodeURIComponent(galleryId)}/media/${encodeURIComponent(item.id)}?size=web`
    : printHref;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") onStep(1);
      else if (event.key === "ArrowLeft") onStep(-1);
      else if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const swipe = useState<{ x: number } | null>(null);
  const [start, setStart] = swipe;

  return (
    <div
      data-testid="gallery-lightbox"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Full screen photo"
      onPointerDown={(event) => setStart({ x: event.clientX })}
      onPointerUp={(event) => {
        if (!start) return;
        const delta = event.clientX - start.x;
        if (delta > 48) onStep(-1);
        else if (delta < -48) onStep(1);
        setStart(null);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium text-white/80">{index + 1} / {count}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {webHref ? <a href={webHref} data-testid="gallery-lightbox-web" className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-3 text-[12px] font-semibold">Web size</a> : null}
          {printHref ? <a href={printHref} download data-testid="gallery-lightbox-print" className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-3 text-[12px] font-semibold">Print size</a> : null}
          <button type="button" aria-label="Previous photo" onClick={() => onStep(-1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20">‹</button>
          <button type="button" aria-label="Next photo" onClick={() => onStep(1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20">›</button>
          <button type="button" data-testid="gallery-lightbox-close" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-black" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : null}
      </div>
    </div>
  );
}

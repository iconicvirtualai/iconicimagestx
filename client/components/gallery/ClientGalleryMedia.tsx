import {
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Lock,
} from "lucide-react";
import {
  classifyClientGalleryItem,
  formatGalleryFileSize,
  galleryFileSize,
  galleryFileTypeLabel,
  galleryFrameStyle,
  galleryGridClass,
  galleryHttpUrl,
  galleryItemName,
  galleryKindLabel,
  galleryOffersDownload,
  galleryPosterUrl,
  galleryShareUrl,
  galleryTourEmbedUrl,
  galleryTourLink,
  galleryVideoUrl,
  type ClientGalleryItem,
  type ClientGalleryKind,
} from "./clientGalleryMedia";

export function ClientGalleryBoard({
  items,
  onCopyLink,
}: {
  items: ClientGalleryItem[];
  onCopyLink?: (url: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      data-testid="client-gallery-board"
    >
      {items.map((item, index) => (
        <ClientGalleryMediaCard
          key={item.id || index}
          item={item}
          onCopyLink={onCopyLink}
        />
      ))}
    </div>
  );
}

export function ClientGalleryMediaCard({
  item,
  onCopyLink,
}: {
  item: ClientGalleryItem;
  onCopyLink?: (url: string) => void;
}) {
  const kind = classifyClientGalleryItem(item);
  const name = galleryItemName(item);
  const shareUrl = galleryShareUrl(item);
  const showShare =
    kind !== "locked" &&
    Boolean(shareUrl) &&
    isShareKind(kind) &&
    Boolean(onCopyLink);
  const downloadUrl = galleryOffersDownload(item)
    ? galleryHttpUrl(item.url)
    : null;

  return (
    <article
      className={galleryGridClass(kind)}
      data-testid={`gallery-card-${item.id || kind}`}
      data-gallery-kind={kind}
    >
      <ClientGalleryMediaFrame item={item} />
      {kind !== "locked" &&
        kind !== "file" &&
        kind !== "floorplan-pdf" &&
        kind !== "tour" && (
          <div className="mt-2 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              {galleryKindLabel(kind, item)}
            </p>
            <p className="truncate text-sm font-bold text-black">{name}</p>
          </div>
        )}
      {showShare && shareUrl && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onCopyLink?.(shareUrl)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-black"
          >
            Share
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${name}`}
            className="inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-black"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid={`gallery-download-${item.id || kind}`}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-black px-3 text-[10px] font-black uppercase tracking-widest text-white"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      )}
    </article>
  );
}

export function ClientGalleryMediaFrame({ item }: { item: ClientGalleryItem }) {
  const kind = classifyClientGalleryItem(item);
  const name = galleryItemName(item);

  if (kind === "locked") {
    return (
      <div
        data-gallery-kind="locked"
        className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl bg-gray-100 p-4 text-center"
      >
        <Lock className="mb-2 h-6 w-6 text-gray-400" />
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          {name}
        </p>
      </div>
    );
  }

  if (kind === "tour") return <TourFrame item={item} name={name} />;
  if (kind === "floorplan-pdf")
    return <FloorPlanPdfFrame item={item} name={name} />;
  if (kind === "file") return <FileFrame item={item} name={name} />;
  if (isVideoKind(kind))
    return <VideoFrame item={item} kind={kind} name={name} />;

  const src = galleryHttpUrl(item.url);
  return (
    <div
      data-gallery-kind={kind}
      className="overflow-hidden rounded-xl bg-gray-100"
    >
      {src && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          data-testid={`gallery-image-${item.id || kind}`}
          style={galleryFrameStyle(kind, item)}
          className="mx-auto block h-auto w-full max-w-full object-contain"
        />
      )}
    </div>
  );
}

function VideoFrame({
  item,
  kind,
  name,
}: {
  item: ClientGalleryItem;
  kind: ClientGalleryKind;
  name: string;
}) {
  const src = galleryVideoUrl(item);
  const poster = galleryPosterUrl(item);
  const style = galleryFrameStyle(kind, item);
  if (!src) {
    if (poster) {
      return (
        <div
          data-gallery-kind={kind}
          className="overflow-hidden rounded-xl bg-gray-100"
        >
          <img
            src={poster}
            alt={name}
            loading="lazy"
            data-testid={`gallery-poster-${item.id || kind}`}
            className="mx-auto block h-auto w-full max-w-full object-contain"
          />
        </div>
      );
    }
    const open = galleryShareUrl(item);
    return (
      <div
        data-gallery-kind={kind}
        className="rounded-xl border border-gray-200 bg-white p-4"
      >
        <p className="text-sm font-bold text-black">{name}</p>
        {open && (
          <a
            href={open}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[#0d9488]"
          >
            Open video
          </a>
        )}
      </div>
    );
  }
  return (
    <div
      data-gallery-kind={kind}
      className="overflow-hidden rounded-xl bg-black"
    >
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        poster={poster || undefined}
        style={style}
        data-testid={
          kind === "reel"
            ? `gallery-reel-${item.id || kind}`
            : `gallery-video-${item.id || kind}`
        }
        className="mx-auto block h-auto max-w-full bg-black object-contain"
      />
    </div>
  );
}

function TourFrame({ item, name }: { item: ClientGalleryItem; name: string }) {
  const embed = galleryTourEmbedUrl(item);
  const open = galleryTourLink(item);
  return (
    <div
      data-gallery-kind="tour"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      {embed && (
        <div className="relative aspect-video w-full bg-black">
          <iframe
            title={name}
            src={embed}
            allow="fullscreen; xr-spatial-tracking"
            allowFullScreen
            loading="lazy"
            data-testid={`gallery-tour-${item.id || "tour"}`}
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      )}
      <div className="p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
          3D tour
        </p>
        <p className="mt-1 break-words text-sm font-bold text-black">{name}</p>
        {open && (
          <a
            href={open}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`gallery-open-tour-${item.id || "tour"}`}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white"
          >
            Open 3D tour
          </a>
        )}
      </div>
    </div>
  );
}

function FloorPlanPdfFrame({
  item,
  name,
}: {
  item: ClientGalleryItem;
  name: string;
}) {
  const open = galleryHttpUrl(item.url) || galleryHttpUrl(item.shareUrl);
  const preview = galleryPosterUrl(item);
  return (
    <div
      data-gallery-kind="floorplan-pdf"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      {preview && (
        <img
          src={preview}
          alt=""
          className="max-h-[40dvh] w-full object-contain bg-gray-100"
        />
      )}
      <div className="p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
          Floor plan
        </p>
        <p className="mt-1 break-words text-sm font-bold text-black">{name}</p>
        {open && (
          <a
            href={open}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`gallery-open-floorplan-${item.id || "plan"}`}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white"
          >
            Open floor plan
          </a>
        )}
      </div>
    </div>
  );
}

function FileFrame({ item, name }: { item: ClientGalleryItem; name: string }) {
  const typeLabel = galleryFileTypeLabel(item);
  const sizeLabel = formatGalleryFileSize(galleryFileSize(item));
  const open =
    typeLabel === "PDF"
      ? galleryHttpUrl(item.url) || galleryHttpUrl(item.shareUrl)
      : null;
  const Icon = typeLabel === "ZIP" ? FileArchive : FileText;
  return (
    <div
      data-gallery-kind="file"
      data-testid={`gallery-file-${item.id || "file"}`}
      className="rounded-xl border border-gray-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#0d9488]" />
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-black">{name}</p>
          <p
            className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-500"
            data-testid={`gallery-file-meta-${item.id || "file"}`}
          >
            {`${typeLabel} · ${sizeLabel}`}
          </p>
        </div>
      </div>
      {open && (
        <a
          href={open}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`gallery-open-file-${item.id || "file"}`}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white"
        >
          Open file
        </a>
      )}
    </div>
  );
}

function isVideoKind(kind: ClientGalleryKind): boolean {
  return (
    kind === "branded-video" ||
    kind === "unbranded-video" ||
    kind === "video" ||
    kind === "reel" ||
    kind === "aerial-video"
  );
}

function isShareKind(kind: ClientGalleryKind): boolean {
  return isVideoKind(kind) || kind === "tour";
}

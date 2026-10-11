import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import {
  buildClientListingSite,
  type ClientListingPlan,
  type ClientListingSite,
  type ClientListingStill,
  type ClientListingVideo,
} from "@shared/clientPresentation";
import { ClientStudioView } from "@/components/gallery/ClientStudioView";

const SANS = "Inter, system-ui, sans-serif";
const HEADING = '"Montserrat", Inter, system-ui, sans-serif';

export function ClientListingSiteGate({
  project,
  listingId,
  galleryId,
  signedIn,
  sampleStills = false,
}: {
  project: unknown;
  listingId?: string;
  galleryId?: string | null;
  signedIn: boolean;
  sampleStills?: boolean;
}) {
  const model = buildClientListingSite(project, { galleryId, sampleStills });
  if (model.access === "public") {
    return (
      <ClientStudioView
        project={project}
        listingId={listingId}
        signedIn={signedIn}
      />
    );
  }
  return <ClientListingSiteView site={model} />;
}

export function ClientListingSiteView({
  site,
  initialPhoto = null,
}: {
  site: ClientListingSite;
  initialPhoto?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(initialPhoto);
  const frames = [...site.photos, ...site.aerials];

  useEffect(() => {
    if (open == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((current) => current == null ? current : Math.min(frames.length - 1, current + 1));
      if (event.key === "ArrowLeft") setOpen((current) => current == null ? current : Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, frames.length]);

  return (
    <div
      className="client-listing-site min-h-screen bg-[#f6f5f3] text-[#161616]"
      style={{ fontFamily: SANS, fontStyle: "normal" }}
      data-testid="client-listing-site"
      data-access="owner"
      data-locked={site.locked ? "true" : "false"}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Inter:wght@400;500;600&display=swap" />
      <style>{`
        .client-listing-site, .client-listing-site * { font-style: normal; }
        .client-listing-site h1, .client-listing-site h2, .client-listing-site .listing-heading {
          font-family: ${HEADING};
          font-weight: 600;
          letter-spacing: -0.03em;
        }
      `}</style>

      {site.locked && (
        <div
          className="sticky top-0 z-40 border-b border-white/10 bg-[#161616] text-white"
          data-testid="pay-invoice-bar"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            {site.payUrl ? (
              <a href={site.payUrl} className="text-[13px] font-medium tracking-wide text-white underline decoration-white/40 underline-offset-4">
                Pay invoice to unlock downloads
              </a>
            ) : (
              <p className="text-[13px] font-medium tracking-wide text-white/90">Pay invoice to unlock downloads</p>
            )}
            {site.galleryHref ? (
              <Link to={site.galleryHref} className="text-[12px] font-medium tracking-wide text-white/70 underline decoration-white/30 underline-offset-4">
                Your downloads & invoice
              </Link>
            ) : null}
          </div>
        </div>
      )}

      <header className="bg-[#161616] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <img src="/media/logos/logo-white-large.png" alt="Iconic Images" className="h-7 w-auto" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60">Listing</p>
        </div>
      </header>

      <section className="relative min-h-[72vh] bg-[#111]" data-testid="listing-hero">
        {site.heroUrl ? (
          <img src={site.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
      </section>

      <section className="bg-white" data-testid="listing-brand-block">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#0d9488]">Iconic Images</p>
          <h1
            className="listing-heading mt-4 max-w-4xl text-4xl leading-[1.05] text-[#161616] sm:text-6xl"
            style={{ wordBreak: "normal", overflowWrap: "normal" }}
            data-testid="listing-address"
          >
            {site.address || "Your listing"}
          </h1>
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {site.agentName ? (
                <p className="text-lg text-[#333]" data-testid="listing-agent">{site.agentName}</p>
              ) : null}
              <p className="mt-1 text-sm tracking-wide text-[#666]" data-testid="listing-brand">{site.brand}</p>
            </div>
            {site.galleryHref ? (
              <Link
                to={site.galleryHref}
                className="text-sm font-medium text-[#161616] underline decoration-[#0d9488] underline-offset-4"
                data-testid="listing-gallery-link"
              >
                Your downloads & invoice
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <StillGrid title="Photographs" testId="listing-photo-grid" items={site.photos} offset={0} onOpen={setOpen} />
      <StillGrid title="Aerials" testId="listing-aerials" items={site.aerials} offset={site.photos.length} onOpen={setOpen} />

      {site.videos.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8" data-testid="listing-video">
          <h2 className="listing-heading text-3xl">Film</h2>
          <div className="mt-8 space-y-10">
            {site.videos.map((video) => (
              <VideoBlock key={`${video.name}-${video.src || video.poster}`} video={video} />
            ))}
          </div>
        </section>
      )}

      {site.tourUrl && (
        <section className="bg-white" data-testid="listing-tour">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h2 className="listing-heading text-3xl">3D tour</h2>
            <div className="relative mt-8 aspect-video w-full overflow-hidden bg-[#111]">
              <iframe
                title="3D tour"
                src={site.tourUrl}
                allow="fullscreen; xr-spatial-tracking"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        </section>
      )}

      {site.floorPlans.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8" data-testid="listing-floor-plan">
          <h2 className="listing-heading text-3xl">Floor plan</h2>
          <div className="mt-8 space-y-8">
            {site.floorPlans.map((plan) => (
              <FloorPlanBlock key={`${plan.name}-${plan.src || plan.pdfUrl}`} plan={plan} />
            ))}
          </div>
        </section>
      )}

      {site.zipUrl && (
        <section className="bg-white" data-testid="listing-downloads">
          <div className="mx-auto flex max-w-6xl justify-center px-5 py-16 sm:px-8">
            <a
              href={site.zipUrl}
              download
              className="inline-flex items-center gap-2 rounded-full bg-[#161616] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download all
            </a>
          </div>
        </section>
      )}

      <footer className="border-t border-black/5 px-5 py-12 text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#888]">Iconic Images</p>
      </footer>

      {open != null && frames[open] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" data-testid="listing-lightbox">
          <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 p-2 text-white" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
          {open > 0 && (
            <button type="button" onClick={() => setOpen(open - 1)} className="absolute left-3 p-2 text-white" aria-label="Previous">
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}
          {open < frames.length - 1 && (
            <button type="button" onClick={() => setOpen(open + 1)} className="absolute right-3 p-2 text-white" aria-label="Next">
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
          <img src={frames[open].src} alt={frames[open].name} className="max-h-[86vh] max-w-[92vw] object-contain" />
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-4">
            <span className="text-xs text-white/80">{open + 1} / {frames.length}</span>
            {frames[open].downloadUrl ? (
              <a href={frames[open].downloadUrl} download className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black">
                Download
              </a>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function StillGrid({
  title,
  testId,
  items,
  offset,
  onOpen,
}: {
  title: string;
  testId: string;
  items: ClientListingStill[];
  offset: number;
  onOpen: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8" data-testid={testId}>
      <h2 className="listing-heading text-3xl">{title}</h2>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <figure key={`${item.name}-${item.src}`} className="bg-white">
            <button type="button" onClick={() => onOpen(offset + index)} className="block w-full" aria-label={item.name}>
              <img src={item.src} alt={item.name} className="aspect-[4/3] w-full object-cover" />
            </button>
            <figcaption className="flex items-center justify-between gap-3 px-1 py-3">
              <span className="text-sm text-[#444]">{item.name}</span>
              {item.downloadUrl ? (
                <a href={item.downloadUrl} download className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </a>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function VideoBlock({ video }: { video: ClientListingVideo }) {
  return (
    <figure>
      <p className="mb-3 text-sm text-[#444]">{video.name}</p>
      {video.src ? (
        <video
          src={video.src}
          poster={video.poster || undefined}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          className="aspect-video w-full bg-black"
        />
      ) : video.poster ? (
        <img src={video.poster} alt="" className="aspect-video w-full object-cover bg-[#111]" />
      ) : null}
      {video.downloadUrl ? (
        <a href={video.downloadUrl} download className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download
        </a>
      ) : null}
    </figure>
  );
}

function FloorPlanBlock({ plan }: { plan: ClientListingPlan }) {
  if (plan.pdfUrl) {
    return (
      <a
        href={plan.pdfUrl}
        download
        className="inline-flex items-center gap-2 border border-[#161616] px-5 py-4 text-sm font-medium"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {plan.name}
      </a>
    );
  }
  return (
    <figure>
      {plan.src ? <img src={plan.src} alt={plan.name} className="max-h-[640px] w-full bg-white object-contain" /> : null}
      <figcaption className="mt-3 flex items-center justify-between">
        <span className="text-sm text-[#444]">{plan.name}</span>
        {plan.downloadUrl ? (
          <a href={plan.downloadUrl} download className="text-[11px] font-semibold uppercase tracking-[0.16em]">Download</a>
        ) : null}
      </figcaption>
    </figure>
  );
}

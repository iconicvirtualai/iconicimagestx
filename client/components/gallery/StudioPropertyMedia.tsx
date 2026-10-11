import { ExternalLink, FileText } from "lucide-react";
import {
  blockPublicVideoMenu,
  type StudioAerialItem,
  type StudioFloorPlanItem,
  type StudioMediaView,
  type StudioPropertyMediaSet,
  type StudioTourItem,
} from "@/components/gallery/studioPropertyMedia";

export function StudioPropertyMedia({
  media,
  view,
}: {
  media: StudioPropertyMediaSet;
  view: StudioMediaView;
}) {
  if (media.tours.length + media.floorPlans.length + media.aerials.length === 0) return null;
  return (
    <div className="space-y-4" data-testid="studio-property-media">
      {media.tours.map((item) => (
        <StudioTourCard key={item.id} item={item} />
      ))}
      {media.floorPlans.map((item) => (
        <StudioFloorPlanCard key={item.id} item={item} view={view} />
      ))}
      {media.aerials.map((item) => (
        <StudioAerialCard key={item.id} item={item} view={view} />
      ))}
    </div>
  );
}

export function StudioTourCard({ item }: { item: StudioTourItem }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-6" data-studio-kind="tour">
      <p className="font-bold mb-3">{item.title}</p>
      {item.embedUrl && (
        <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            title={item.title}
            src={item.embedUrl}
            allow="fullscreen; xr-spatial-tracking"
            allowFullScreen
            loading="lazy"
            data-testid={`studio-tour-${item.id}`}
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      )}
      <a
        href={item.openUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`studio-open-tour-${item.id}`}
        className="text-[#0d9488] font-bold inline-flex items-center gap-2"
      >
        Open 3D tour <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}

export function StudioFloorPlanCard({
  item,
  view,
}: {
  item: StudioFloorPlanItem;
  view: StudioMediaView;
}) {
  return (
    <div className="bg-gray-50 rounded-2xl p-6" data-studio-kind={`floorplan-${item.kind}`}>
      <p className="font-bold mb-2">{item.title}</p>
      {item.kind === "image" && (
        <img
          src={item.url}
          alt={item.title}
          loading="lazy"
          data-testid={`studio-floorplan-image-${item.id}`}
          className="mt-3 max-h-[480px] w-full rounded-xl object-contain bg-white"
        />
      )}
      {item.kind === "pdf" && (
        <FloorPlanPdf item={item} view={view} />
      )}
      {item.kind === "video" && (
        view === "public" ? (
          <video
            src={item.url}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onContextMenu={blockPublicVideoMenu}
            className="mt-3 block h-auto w-full max-w-full rounded-xl bg-black"
          />
        ) : (
          <FloorPlanLink item={item} view="owner" />
        )
      )}
    </div>
  );
}

export function StudioAerialCard({
  item,
  view,
}: {
  item: StudioAerialItem;
  view: StudioMediaView;
}) {
  const publicView = view !== "owner";
  return (
    <div className="bg-gray-50 rounded-2xl p-6" data-studio-kind={`aerial-${item.kind}`}>
      <p className="font-bold mb-2">{item.title}</p>
      {item.kind === "photo" ? (
        <img
          src={item.url}
          alt={item.title}
          loading="lazy"
          data-testid={`studio-aerial-photo-${item.id}`}
          className="mt-3 max-h-[480px] w-full rounded-xl object-contain bg-white"
        />
      ) : (
        <video
          src={item.url}
          controls
          playsInline
          preload="metadata"
          poster={item.posterUrl || undefined}
          controlsList={publicView ? "nodownload" : undefined}
          disablePictureInPicture={publicView}
          onContextMenu={publicView ? blockPublicVideoMenu : undefined}
          data-testid={`studio-aerial-video-${item.id}`}
          className="mt-3 block h-auto max-h-[480px] w-full rounded-xl bg-black object-contain"
        />
      )}
    </div>
  );
}

function FloorPlanPdf({
  item,
  view,
}: {
  item: StudioFloorPlanItem;
  view: StudioMediaView;
}) {
  return (
    <>
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt=""
          loading="lazy"
          data-testid={`studio-floorplan-preview-${item.id}`}
          className="mt-3 max-h-[480px] w-full rounded-xl object-contain bg-white"
        />
      ) : (
        <div
          data-testid={`studio-floorplan-tile-${item.id}`}
          className="mt-3 flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 text-center"
        >
          <FileText className="mb-3 h-8 w-8 text-[#0d9488]" />
          <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">PDF floor plan</p>
          <p className="mt-2 text-sm font-bold text-black">{item.title}</p>
        </div>
      )}
      <FloorPlanLink item={item} view={view} />
    </>
  );
}

function FloorPlanLink({
  item,
  view,
}: {
  item: StudioFloorPlanItem;
  view: StudioMediaView;
}) {
  const open = {
    href: item.url,
    target: "_blank",
    rel: "noopener noreferrer",
    "data-testid": `studio-open-floorplan-${item.id}`,
    className: "mt-3 text-[#0d9488] font-bold inline-flex items-center gap-2",
  };
  if (view === "owner" && item.kind === "pdf") {
    return (
      <a {...open} download>
        Open floor plan <ExternalLink className="w-4 h-4" />
      </a>
    );
  }
  return (
    <a {...open}>
      Open floor plan <ExternalLink className="w-4 h-4" />
    </a>
  );
}

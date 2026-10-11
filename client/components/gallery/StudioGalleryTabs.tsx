import { Zap } from "lucide-react";

export const STUDIO_GALLERY_TAB_IDS = ["photos", "videos", "tours", "revisions", "ai_studio"] as const;

export type StudioGalleryTabId = (typeof STUDIO_GALLERY_TAB_IDS)[number];

export type StudioGalleryTab = {
  id: StudioGalleryTabId;
  label: string;
  count: number;
};

export function StudioGalleryTabs({
  active,
  tabs,
  onChange,
}: {
  active: StudioGalleryTabId;
  tabs: readonly StudioGalleryTab[];
  onChange: (id: StudioGalleryTabId) => void;
}) {
  return (
    <div className="sticky top-0 z-10 w-full min-w-0 max-w-full border-b border-gray-100 bg-white">
      <div
        className="mx-auto w-full min-w-0 max-w-6xl overflow-x-auto overscroll-x-contain scroll-ps-4 scroll-pe-8"
        data-testid="studio-gallery-tabs"
      >
        <div
          className="flex w-max min-w-full gap-4 ps-4 pe-8 sm:gap-6"
          role="tablist"
          aria-label="Gallery sections"
        >
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`studio-tab-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={`min-w-max shrink-0 whitespace-nowrap border-b-2 py-4 text-xs font-black uppercase tracking-wide transition-colors sm:tracking-widest ${selected ? "border-[#0d9488] text-[#0d9488]" : "border-transparent text-gray-400 hover:text-gray-700"}`}
            >
              {tab.label}
              {tab.count > 0 && <span className="ml-1 text-gray-300">({tab.count})</span>}
              {tab.id === "ai_studio" && <Zap className="ml-1 inline h-2.5 w-2.5 text-teal-500" />}
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}

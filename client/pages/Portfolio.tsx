import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { X } from "lucide-react";
import { SNAP_REELS } from "@/lib/snapReels";
import { AI_BEFORE_AFTER, AERIAL_STILLS, PRIMARY_SUITE_STILL } from "@/lib/beforeAfter";

type Category = "All" | "People" | "Families" | "Studio" | "Holiday" | "Headshots" | "Listings" | "Aerial" | "Virtual Staging";

type Photo = {
  src: string;
  alt: string;
  title: string;
  category: Exclude<Category, "All">;
};

const PHOTOS: Photo[] = [
  { src: "/media/photos/lifestyle-mtz04327.jpg", alt: "Polished corporate portrait in a royal blue suit", title: "Corporate Portrait", category: "People" },
  { src: "/media/photos/lifestyle-kennedy-mtz01127.jpg", alt: "Warm smiling lifestyle portrait", title: "Lifestyle Portrait", category: "People" },
  { src: "/media/photos/lifestyle-daughtery-mtz00636.jpg", alt: "Lifestyle portrait against a white brick wall", title: "Lifestyle Portrait", category: "People" },
  { src: "/media/photos/lifestyle-logan-dan02309.jpg", alt: "Outdoor portrait in a navy suit", title: "Lifestyle Portrait", category: "People" },
  { src: "/media/photos/lifestyle-mtz04655.jpg", alt: "Portrait seated on stone steps", title: "Lifestyle Portrait", category: "People" },
  { src: "/media/photos/lifestyle-mtz04802.jpg", alt: "Portrait leaning against a stone column", title: "Lifestyle Portrait", category: "People" },
  { src: "/media/photos/family-bryant-mtz09081.jpg", alt: "Family of four seated on a front porch", title: "Family Portrait", category: "Families" },
  { src: "/media/photos/family-bryant-mtz09154.jpg", alt: "Mother and daughter portrait outdoors", title: "Mother and Daughter", category: "Families" },
  { src: "/media/photos/family-bryant-mtz09392.jpg", alt: "Family of four standing outdoors", title: "Family Portrait", category: "Families" },
  { src: "/media/photos/studio-mtz01691.jpg", alt: "Studio portrait on a beige backdrop", title: "Studio Portrait", category: "Studio" },
  { src: "/media/photos/holiday-gregg-mtz05507.jpg", alt: "Holiday portrait in a silver sequin gown", title: "Holiday Portrait", category: "Holiday" },
  { src: "/media/photos/holiday-mtz08102.jpg", alt: "Holiday portrait in a red dress", title: "Holiday Portrait", category: "Holiday" },
  { src: "/media/photos/headshot-gracepoint-1.jpg", alt: "Headshot against a brick wall", title: "Headshot", category: "Headshots" },
  { src: "/media/photos/headshot-gracepoint-4.jpg", alt: "Headshot in front of office windows", title: "Headshot", category: "Headshots" },
  { src: "/media/photos/website-hero-dan.jpg", alt: "Aerial of a luxury estate at dusk", title: "Aerial Estate", category: "Aerial" },
  { src: "/media/photos/drone-hero.jpg", alt: "Drone view of a waterfront luxury home", title: "Drone Hero", category: "Aerial" },
  { src: "/media/photos/luxury-exterior.jpg", alt: "Luxury home exterior", title: "Luxury Exterior", category: "Listings" },
  { src: "/media/photos/luxury-interior.jpg", alt: "Luxury interior living space", title: "Luxury Interior", category: "Listings" },
  { src: "/media/photos/luxury-a7305553.jpg", alt: "Luxury listing interior detail", title: "Listing Detail", category: "Listings" },
  { src: "/media/photos/luxury-mtz02998.jpg", alt: "Vertical luxury interior", title: "Vertical Interior", category: "Listings" },
  { src: "/media/photos/listing-living-01.jpg", alt: "Bright listing living room", title: "Living Room", category: "Listings" },
  { src: "/media/photos/listing-living-02.jpg", alt: "Open listing living space", title: "Open Living", category: "Listings" },
  { src: "/media/photos/listing-living-03.jpg", alt: "Listing interior with natural light", title: "Listing Interior", category: "Listings" },
  { src: "/media/photos/listing-living-04.jpg", alt: "Listing interior in evening light", title: "Evening Interior", category: "Listings" },
  { src: "/media/photos/staged-living-room.jpg", alt: "Virtually staged living room", title: "Staged Living Room", category: "Virtual Staging" },
  { src: "/media/photos/vs-ico7432.jpg", alt: "Virtual staging interior", title: "Virtual Staging", category: "Virtual Staging" },
  ...AERIAL_STILLS,
  PRIMARY_SUITE_STILL,
  ...AI_BEFORE_AFTER.map((pair) => ({
    src: pair.after.src,
    alt: pair.after.alt,
    title: pair.label,
    category: pair.id === "twilight-pool" ? "Listings" as const : "Virtual Staging" as const,
  })),
];

const FILTERS: Category[] = ["All", "People", "Families", "Studio", "Holiday", "Headshots", "Listings", "Aerial", "Virtual Staging"];

const FILTER_LABEL: Record<Category, string> = {
  All: "All",
  People: "People / Lifestyle",
  Families: "Families",
  Studio: "Studio",
  Holiday: "Holiday / Seasonal",
  Headshots: "Headshots",
  Listings: "Listings",
  Aerial: "Aerial",
  "Virtual Staging": "Virtual Staging",
};

export default function Portfolio() {
  const [filter, setFilter] = useState<Category>("All");
  const [active, setActive] = useState<Photo | null>(null);

  const visible = filter === "All" ? PHOTOS : PHOTOS.filter((photo) => photo.category === filter);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <Layout>
      <div className="bg-black text-white">
        <section className="pt-36 pb-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">
              Selected Work
            </p>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
              Portfolio
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-300 leading-relaxed">
              People, families, studio, holiday, headshots, listings, aerials, and virtual staging from Iconic Images.
            </p>

            <div className="mt-10 flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] border transition-colors ${
                    filter === item
                      ? "bg-teal-500 text-black border-teal-500"
                      : "border-white/15 text-white/70 hover:text-white"
                  }`}
                >
                  {FILTER_LABEL[item]}
                </button>
              ))}
            </div>

            {visible.length > 0 && (
              <div className="mt-10 columns-1 sm:columns-2 lg:columns-3 gap-4">
                {visible.map((photo) => (
                  <button
                    key={photo.src}
                    type="button"
                    onClick={() => setActive(photo)}
                    className="group relative mb-4 block w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-900 text-left break-inside-avoid"
                  >
                    <img
                      src={photo.src}
                      alt={photo.alt}
                      className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                      {photo.category}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 text-[11px] font-black uppercase tracking-[0.25em] text-white">
                      {photo.title}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-20 border-t border-white/10 pt-16">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">
                AI edits
              </p>
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-4">
                Before / After
              </h2>
              <p className="mb-10 max-w-2xl text-gray-400">
                Twilight conversion, lifestyle staging, and virtual declutter from Iconic.
              </p>
              <div className="space-y-12">
                {AI_BEFORE_AFTER.map((pair) => (
                  <figure key={pair.id}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-900">
                        <img
                          src={pair.before.src}
                          alt={pair.before.alt}
                          className="aspect-[3/2] w-full object-cover"
                        />
                        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                          Before
                        </span>
                      </div>
                      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-900">
                        <img
                          src={pair.after.src}
                          alt={pair.after.alt}
                          className="aspect-[3/2] w-full object-cover"
                        />
                        <span className="absolute right-3 top-3 rounded-full bg-teal-500 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-black">
                          After
                        </span>
                      </div>
                    </div>
                    <figcaption className="mt-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400">{pair.label}</p>
                      <p className="mt-1 text-sm text-gray-400">{pair.scene}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <div className="mt-20 border-t border-white/10 pt-16">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">
                Photo to video
              </p>
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-4">
                Snap Reels
              </h2>
              <p className="mb-8 max-w-2xl text-gray-400">
                Essential Snap Reels: listing photos cut into a 9:16 vertical.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {SNAP_REELS.map((reel) => (
                  <figure key={reel.src}>
                    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
                      <video
                        src={reel.src}
                        controls
                        playsInline
                        preload="metadata"
                        aria-label={`Snap Reel — ${reel.title}`}
                        className="aspect-[9/16] w-full object-cover bg-black"
                      />
                    </div>
                    <figcaption className="mt-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400">Snap Reel</p>
                      <p className="mt-1 text-sm font-bold">{reel.title}</p>
                      <p className="text-xs text-gray-400">{reel.vibe}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <div className="mt-20 border-t border-white/10 pt-16">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">
                On Set
              </p>
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-8">
                Product Photography
              </h2>
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950 shadow-2xl">
                <video
                  src="/media/video/product-photography.mp4"
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full aspect-video object-cover bg-black"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {active && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
          aria-label={active.alt}
        >
          <button
            type="button"
            className="absolute top-6 right-6 text-white/80 hover:text-white"
            onClick={() => setActive(null)}
            aria-label="Close"
          >
            <X className="w-7 h-7" />
          </button>
          <img
            src={active.src}
            alt={active.alt}
            className="max-h-[88vh] max-w-full object-contain rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}

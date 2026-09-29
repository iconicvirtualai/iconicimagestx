import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { X } from "lucide-react";

type Category = "All" | "People" | "Families" | "Studio" | "Holiday" | "Listings" | "Aerial" | "Virtual Staging";

type Photo = {
  src: string;
  alt: string;
  title: string;
  category: Exclude<Category, "All" | "Families" | "Studio" | "Holiday">;
};

const PHOTOS: Photo[] = [
  { src: "/media/photos/lifestyle-mtz04327.jpg", alt: "Polished corporate portrait in a royal blue suit", title: "Corporate Portrait", category: "People" },
  { src: "/media/photos/lifestyle-kennedy-mtz01127.jpg", alt: "Warm smiling lifestyle portrait", title: "Lifestyle Portrait", category: "People" },
  { src: "/media/photos/website-hero-dan.jpg", alt: "Aerial of a luxury estate at dusk", title: "Aerial Estate", category: "Aerial" },
  { src: "/media/photos/drone-hero.jpg", alt: "Drone view of a waterfront luxury home", title: "Drone Hero", category: "Aerial" },
  { src: "/media/photos/luxury-exterior.jpg", alt: "Luxury home exterior", title: "Luxury Exterior", category: "Listings" },
  { src: "/media/photos/luxury-interior.jpg", alt: "Luxury interior living space", title: "Luxury Interior", category: "Listings" },
  { src: "/media/photos/luxury-a7305553.jpg", alt: "Luxury listing interior detail", title: "Listing Detail", category: "Listings" },
  { src: "/media/photos/luxury-mtz02998.jpg", alt: "Vertical luxury interior", title: "Vertical Interior", category: "Listings" },
  { src: "/media/photos/haeckerville-8.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville", category: "Listings" },
  { src: "/media/photos/haeckerville-9.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville", category: "Listings" },
  { src: "/media/photos/haeckerville-10.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville", category: "Listings" },
  { src: "/media/photos/haeckerville-17.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville", category: "Listings" },
  { src: "/media/photos/claymore-vs-final.jpg", alt: "Claymore virtual staging final", title: "Claymore Staging", category: "Virtual Staging" },
  { src: "/media/photos/vs-ico7432.jpg", alt: "Virtual staging interior", title: "Virtual Staging", category: "Virtual Staging" },
];

const FILTERS: Category[] = ["All", "People", "Families", "Studio", "Holiday", "Listings", "Aerial", "Virtual Staging"];

const COMING_SOON: { category: Category; title: string; note: string }[] = [
  { category: "Families", title: "Families", note: "Family sessions are next in the gallery." },
  { category: "Studio", title: "Studio", note: "Studio 105 portraits and product sets are on the way." },
  { category: "Holiday", title: "Holiday / Seasonal", note: "Holiday minis and seasonal sets will live here." },
];

export default function Portfolio() {
  const [filter, setFilter] = useState<Category>("All");
  const [active, setActive] = useState<Photo | null>(null);

  const visible = filter === "All" ? PHOTOS : PHOTOS.filter((photo) => photo.category === filter);
  const placeholders = filter === "All"
    ? COMING_SOON
    : COMING_SOON.filter((item) => item.category === filter);

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
              People, listings, aerials, and virtual staging from Iconic Images.
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
                  {item === "People" ? "People / Lifestyle" : item === "Holiday" ? "Holiday / Seasonal" : item}
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

            {placeholders.length > 0 && (
              <div className={`grid gap-4 ${visible.length > 0 ? "mt-6" : "mt-10"} sm:grid-cols-2 lg:grid-cols-3`}>
                {placeholders.map((item) => (
                  <div
                    key={item.category}
                    className="rounded-[1.5rem] border border-dashed border-white/20 bg-white/[0.03] p-8 min-h-[220px] flex flex-col justify-end"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-teal-400 mb-3">Coming soon</p>
                    <h2 className="text-2xl font-black uppercase tracking-tight">{item.title}</h2>
                    <p className="mt-2 text-sm text-gray-400">{item.note}</p>
                  </div>
                ))}
              </div>
            )}

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

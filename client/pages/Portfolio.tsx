import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { X } from "lucide-react";

const PHOTOS = [
  { src: "/media/photos/website-hero-dan.jpg", alt: "Aerial of a luxury estate at dusk", title: "Aerial Estate" },
  { src: "/media/photos/drone-hero.jpg", alt: "Drone view of a waterfront luxury home", title: "Drone Hero" },
  { src: "/media/photos/luxury-exterior.jpg", alt: "Luxury home exterior", title: "Luxury Exterior" },
  { src: "/media/photos/luxury-interior.jpg", alt: "Luxury interior living space", title: "Luxury Interior" },
  { src: "/media/photos/luxury-a7305553.jpg", alt: "Luxury listing interior detail", title: "Listing Detail" },
  { src: "/media/photos/luxury-mtz02998.jpg", alt: "Vertical luxury interior portrait", title: "Vertical Interior" },
  { src: "/media/photos/haeckerville-8.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville" },
  { src: "/media/photos/haeckerville-9.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville" },
  { src: "/media/photos/haeckerville-10.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville" },
  { src: "/media/photos/haeckerville-17.jpg", alt: "Haeckerville listing photograph", title: "Haeckerville" },
  { src: "/media/photos/claymore-vs-final.jpg", alt: "Claymore virtual staging final", title: "Claymore Staging" },
  { src: "/media/photos/vs-ico7432.jpg", alt: "Virtual staging interior", title: "Virtual Staging" },
  { src: "/media/photos/lifestyle-gq.jpg", alt: "Lifestyle portrait", title: "Lifestyle" },
];

export default function Portfolio() {
  const [active, setActive] = useState<(typeof PHOTOS)[number] | null>(null);

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
              Listing stills, luxury interiors, aerials, and virtual staging from Iconic Images.
            </p>

            <div className="mt-14 columns-1 sm:columns-2 lg:columns-3 gap-4">
              {PHOTOS.map((photo) => (
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
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 text-[11px] font-black uppercase tracking-[0.25em] text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    {photo.title}
                  </span>
                </button>
              ))}
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

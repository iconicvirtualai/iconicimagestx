import { SNAP_REEL_STRIP } from "@/lib/snapReels";

export default function SnapReelsStrip() {
  return (
    <section className="bg-[#f6f8f8] py-20 md:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-600 mb-3">
            Essentials
          </p>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black">
            Snap Reels
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-gray-500 text-base md:text-lg">
            Listing stills, turned into a 9:16 Snap Reel. Same-day vertical video from the photos we already shoot.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {SNAP_REEL_STRIP.map((reel) => (
            <figure key={reel.src} className="mx-auto w-full max-w-[280px]">
              <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-black shadow-xl">
                <video
                  src={reel.src}
                  className="aspect-[9/16] w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={`Snap Reel — ${reel.title}`}
                />
              </div>
              <figcaption className="mt-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-600">Snap Reel</p>
                <p className="mt-1 text-sm font-bold text-black">{reel.title}</p>
                <p className="text-xs text-gray-500">{reel.vibe}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

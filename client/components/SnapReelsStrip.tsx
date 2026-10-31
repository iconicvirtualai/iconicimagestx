import { SNAP_REEL_STRIP, scrubSnapCopy } from "@/lib/snapReels";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";

export default function SnapReelsStrip() {
  const kicker = useSiteText("home", "snapReels", "kicker", "Essentials");
  const title = useSiteText("home", "snapReels", "title", "Snap Reels");
  const body = useSiteText("home", "snapReels", "body", "Listing stills, turned into a 9:16 Snap Reel. Same-day vertical video from the photos we already shoot.");
  const items = useSiteItems("home", "snapReels");
  const reels = (items
    ? items.map((item) => ({ id: item.id, src: itemText(item, "video"), title: itemText(item, "title"), vibe: itemText(item, "vibe") }))
    : SNAP_REEL_STRIP.map((reel) => ({ id: reel.src, src: reel.src, title: reel.title, vibe: reel.vibe }))
  ).map((reel) => ({ ...reel, ...scrubSnapCopy(reel.title, reel.vibe) }));
  return (
    <section className="bg-[#f6f8f8] py-20 md:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          <p data-site-page="home" data-site-block="snapReels" data-site-field="kicker" data-site-kind="text" className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-600 mb-3">
            {kicker}
          </p>
          <h2 data-site-page="home" data-site-block="snapReels" data-site-field="title" data-site-kind="text" className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black">
            {title}
          </h2>
          <p data-site-page="home" data-site-block="snapReels" data-site-field="body" data-site-kind="text" className="mt-4 max-w-2xl mx-auto text-gray-500 text-base md:text-lg">
            {body}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {reels.map((reel) => (
            <figure key={reel.id} className="mx-auto w-full max-w-[280px]">
              <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-black shadow-xl">
                <video
                  src={reel.src}
                  data-site-page="home" data-site-block="snapReels" data-site-item={reel.id} data-site-field="video" data-site-kind="video"
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
                <p data-site-page="home" data-site-block="snapReels" data-site-item={reel.id} data-site-field="title" data-site-kind="text" className="mt-1 text-sm font-bold text-black">{reel.title}</p>
                <p data-site-page="home" data-site-block="snapReels" data-site-item={reel.id} data-site-field="vibe" data-site-kind="text" className="text-xs text-gray-500">{reel.vibe}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

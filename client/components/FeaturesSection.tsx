import { useState } from "react";
import { Link } from "react-router-dom";
import { itemText, useSiteHref, useSiteItems, useSiteText } from "@/content/siteContent";

const FEATURE_TITLE = "Go beyond basic editing with powerful add-on tools";
const FEATURE_BODY = "Turn a still into motion, stage an empty room, finish a photo, and shape the cut in Studio.";

function CompareSlider({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  itemId,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  itemId: string;
}) {
  const [position, setPosition] = useState(52);
  return (
    <div className="relative h-56 overflow-hidden bg-gray-100 sm:h-64">
      <img src={after} alt={afterLabel} data-site-page="home" data-site-block="features" data-site-item={itemId} data-site-field="after" data-site-kind="image" className="absolute inset-0 h-full w-full object-cover" />
      <img
        src={before}
        alt={beforeLabel}
        data-site-page="home"
        data-site-block="features"
        data-site-item={itemId}
        data-site-field="before"
        data-site-kind="image"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white" style={{ left: `${position}%` }} />
      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">{beforeLabel}</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-[#14b8a6] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">{afterLabel}</span>
      <input
        type="range"
        min={2}
        max={98}
        value={position}
        aria-label="Drag to compare before and after"
        onChange={(event) => setPosition(Number(event.target.value))}
        className="absolute inset-x-0 bottom-3 z-20 mx-auto w-[80%] accent-[#14b8a6]"
      />
    </div>
  );
}

export default function FeaturesSection() {
  const badge = useSiteText("home", "features", "badge", "ADDITIONAL FEATURES");
  const title = useSiteText("home", "features", "title", FEATURE_TITLE);
  const body = useSiteText("home", "features", "body", FEATURE_BODY);
  const promoHref = useSiteHref("chrome", "promo", "link", "/book");
  const saved = useSiteItems("home", "features");
  const field = (id: string, key: string, fallback: string) => {
    const item = saved?.find((entry) => entry.id === id);
    return item ? itemText(item, key, fallback) : fallback;
  };

  const snapStill = field("snap", "still", "/media/home-v2/snap-feature/snap-still.jpg");
  const snapVideo = field("snap", "video", "/media/home-v2/snap-feature/snap-motion.mp4");
  const bedroomBefore = field("staging", "bedroomBefore", "/media/home-v2/staging/vs-bedroom-before.jpg");
  const bedroomAfter = field("staging", "bedroomAfter", "/media/home-v2/staging/vs-bedroom-after.jpg");
  const moreAngles = field("staging", "moreAngles", "");
  const moreLabel = field("staging", "moreLabel", "More angles");

  return (
    <section className="bg-white py-20 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mb-14 text-center">
          <div className="mb-6 inline-flex items-center rounded-md border border-black bg-black px-3 py-1 shadow-lg">
            <span data-site-page="home" data-site-block="features" data-site-field="badge" data-site-kind="text" className="accent-text-bordered text-[10px] font-bold uppercase tracking-wider">
              {badge}
            </span>
          </div>
          <h2 data-site-page="home" data-site-block="features" data-site-field="title" data-site-kind="text" className="mx-auto mb-6 max-w-4xl text-balance text-3xl font-bold tracking-tight text-black md:text-5xl">
            {title === FEATURE_TITLE ? <>Go beyond basic editing with <span className="accent-text-bordered">powerful</span> add-on tools</> : title}
          </h2>
          <p data-site-page="home" data-site-block="features" data-site-field="body" data-site-kind="text" className="mx-auto max-w-2xl text-balance text-sm leading-relaxed text-gray-500 md:text-base">
            {body}
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-dashed border-[#99f6e4] bg-[#f8fdff] p-6 lg:col-span-2">
            <h3 data-site-page="home" data-site-block="features" data-site-item="snap" data-site-field="title" data-site-kind="text" className="text-balance text-xl font-bold text-black">
              {field("snap", "title", "Iconic Snap Reels")}
            </h3>
            <p data-site-page="home" data-site-block="features" data-site-item="snap" data-site-field="body" data-site-kind="text" className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
              {field("snap", "body", "Photo to video. One listing still on the left, and that same photo in motion on the right.")}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <figure className="overflow-hidden rounded-xl border border-gray-100 bg-black">
                <img
                  src={snapStill}
                  alt="Listing photo, still"
                  data-site-page="home"
                  data-site-block="features"
                  data-site-item="snap"
                  data-site-field="still"
                  data-site-kind="image"
                  className="aspect-[4/5] max-h-[420px] w-full object-cover"
                />
                <figcaption className="bg-white px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">Still</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-xl border border-gray-100 bg-black">
                <video
                  src={snapVideo}
                  poster={snapStill}
                  data-site-page="home"
                  data-site-block="features"
                  data-site-item="snap"
                  data-site-field="video"
                  data-site-kind="video"
                  className="aspect-[4/5] max-h-[420px] w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="The same listing photo, in motion"
                />
                <figcaption className="bg-white px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">In motion</figcaption>
              </figure>
            </div>
          </article>

          <article className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-[#99f6e4] bg-[#f8fdff] p-6">
            <h3 data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="title" data-site-kind="text" className="text-balance text-xl font-bold text-black">
              {field("staging", "title", "AI Virtual Staging")}
            </h3>
            <p data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="body" data-site-kind="text" className="mt-2 text-sm leading-relaxed text-gray-500">
              {field("staging", "body", "Empty room to furnished room, staged by Iconic. Drag the slider, then look across the angles.")}
            </p>
            <Link to={promoHref} className="mt-3 inline-flex text-sm font-bold text-[#0f766e] underline decoration-[#14b8a6] underline-offset-4">
              <span data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="callout" data-site-kind="text">
                {field("staging", "callout", "Iconic clients get FREE staging — info inside")}
              </span>
            </Link>
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-100 bg-white">
              <CompareSlider
                itemId="staging"
                before={field("staging", "before", "/media/home-v2/staging/vs-living-before.jpg")}
                after={field("staging", "after", "/media/home-v2/staging/vs-living-after.jpg")}
              />
              <div className="grid grid-cols-3 gap-1 bg-white p-2">
                <img src={bedroomBefore} alt="Second room before staging" data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="bedroomBefore" data-site-kind="image" className="aspect-[4/3] w-full rounded-md object-cover" />
                <img src={bedroomAfter} alt="Second room after staging" data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="bedroomAfter" data-site-kind="image" className="aspect-[4/3] w-full rounded-md object-cover" />
                {moreAngles ? (
                  <img src={moreAngles} alt={moreLabel} data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="moreAngles" data-site-kind="image" className="aspect-[4/3] w-full rounded-md object-cover" />
                ) : (
                  <div data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="moreAngles" data-site-kind="image" className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-[#14b8a6] bg-[#f0fdfa] px-2 text-center text-[10px] font-black uppercase tracking-[0.14em] text-[#0f766e]">
                    <span data-site-page="home" data-site-block="features" data-site-item="staging" data-site-field="moreLabel" data-site-kind="text">{moreLabel}</span>
                  </div>
                )}
              </div>
              <p className="px-3 pb-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">By Iconic</p>
            </div>
          </article>

          <article className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-[#99f6e4] bg-[#f8fdff] p-6">
            <h3 data-site-page="home" data-site-block="features" data-site-item="edits" data-site-field="title" data-site-kind="text" className="text-balance text-xl font-bold text-black">
              {field("edits", "title", "Bring your photos to life with After Iconic AI renders")}
            </h3>
            <p data-site-page="home" data-site-block="features" data-site-item="edits" data-site-field="body" data-site-kind="text" className="mt-2 text-sm leading-relaxed text-gray-500">
              {field("edits", "body", "A daylight pavilion, finished so it feels lived in. A warm-dusk pool pair is saved beside this one if you want to swap it in.")}
            </p>
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-100 bg-white">
              <CompareSlider
                itemId="edits"
                before={field("edits", "before", "/media/home-v2/photo-edits/pavilion-before.jpg")}
                after={field("edits", "after", "/media/home-v2/photo-edits/pavilion-after-iconic.jpg")}
              />
            </div>
          </article>

          <article className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-[#99f6e4] bg-[#f8fdff] p-6 lg:col-span-2">
            <h3 data-site-page="home" data-site-block="features" data-site-item="studio" data-site-field="title" data-site-kind="text" className="text-balance text-xl font-bold text-black">
              {field("studio", "title", "Studio")}
            </h3>
            <p data-site-page="home" data-site-block="features" data-site-item="studio" data-site-field="body" data-site-kind="text" className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
              {field("studio", "body", "Iconic's built-in editor for templates, music, captions, branding, and your own photos or clips.")}
            </p>
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-100 bg-white">
              <img
                src={field("studio", "image", "/media/home-v2/studio/iconic-studio-editor-snippet.jpg")}
                alt="Iconic Studio editor"
                data-site-page="home"
                data-site-block="features"
                data-site-item="studio"
                data-site-field="image"
                data-site-kind="image"
                className="max-h-[420px] w-full bg-[#f4f7f8] object-contain object-center"
              />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

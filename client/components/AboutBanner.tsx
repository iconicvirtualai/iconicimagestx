import { useState } from "react";
import HomepageBlazeLoop from "@/components/HomepageBlazeLoop";
import {
  ABOUT_BANNER_LEAD,
  ABOUT_BANNER_SUB,
  ABOUT_HERO_FALLBACK,
  ABOUT_HERO_STILL,
  ABOUT_MOSAIC,
  ABOUT_WIDE_VIDEO,
} from "@/lib/aboutBanner";

function HeroStill() {
  const [src, setSrc] = useState(ABOUT_HERO_STILL);
  return (
    <img
      src={src}
      alt="Studio smile"
      className="h-full w-full object-cover"
      onError={() => {
        if (src !== ABOUT_HERO_FALLBACK) setSrc(ABOUT_HERO_FALLBACK);
      }}
    />
  );
}

/**
 * About banner. Motion is the same homepage blaze loop.
 * The wide cut falls back to the studio still, and that still falls back to the square portrait.
 * Do not feature the former office assistant as a hero still.
 */
export default function AboutBanner() {
  const [wideOk, setWideOk] = useState(true);

  return (
    <section className="bg-black px-4 pb-16 pt-36 text-white md:pt-40" aria-label="About Iconic" data-testid="about-banner">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14">
        <div>
          <h1 className="font-archivo text-5xl leading-[0.92] tracking-tight md:text-7xl">
            {ABOUT_BANNER_LEAD}
          </h1>
          <p className="mt-6 font-montserrat text-xl font-medium text-white/80 md:text-2xl">
            {ABOUT_BANNER_SUB}
          </p>
        </div>
        <HomepageBlazeLoop embedded />
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black">
          {wideOk ? (
            <video
              src={ABOUT_WIDE_VIDEO}
              poster={ABOUT_HERO_STILL}
              className="aspect-video w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="We're here"
              onError={() => setWideOk(false)}
            />
          ) : (
            <div className="aspect-video">
              <HeroStill />
            </div>
          )}
        </div>
        <div className="aspect-video h-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-black lg:aspect-auto">
          <HeroStill />
        </div>
      </div>

      <ul className="mx-auto mt-4 grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ABOUT_MOSAIC.map((item) => (
          <li key={item.src} className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <img src={item.src} alt={item.alt} className="aspect-video w-full object-cover" />
          </li>
        ))}
      </ul>
    </section>
  );
}

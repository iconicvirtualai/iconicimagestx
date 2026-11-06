import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { itemText, useBlockHidden, useSiteHref, useSiteItems, useSiteText } from "@/content/siteContent";
import type { ContentItem } from "@shared/siteEditor";

const PAGE = "whatWeDo";
const VISIBLE_RATIO = 0.15;

const HERO_VIDEO = "/media/home-v2/services-blaze/services-blaze-v1-muted.mp4";
const HERO_POSTER = "/media/home-v2/services-blaze/services-blaze-v1-poster.jpg";
const WHO_IMAGE = "/media/home-v2/lifestyle/studio-105-sweep.jpg";
const WHY_IMAGE = "/media/photos/drone-hero.jpg";

type MediaCard = {
  id: string;
  label: string;
  image: string;
  video: string;
  poster: string;
  step?: string;
};

const SHOOT: MediaCard[] = [
  { id: "photos", label: "Listing photos", image: "/media/launch/dining_room.jpg", video: "", poster: "" },
  { id: "video", label: "Property video", image: "", video: "/media/home-v2/slider/02-premium-listing-nubenbrook.mp4", poster: "/media/home-v2/slider/02-premium-listing-nubenbrook.jpg" },
  { id: "aerial", label: "Aerial drone", image: "", video: "/media/home-v2/slider/06-aerial-lakefront.mp4", poster: "/media/home-v2/slider/06-aerial-lakefront.jpg" },
  { id: "reels", label: "Iconic Snap Reels", image: "", video: "/media/home-v2/snap-cards/woodville-blaze-v5.mp4", poster: "/media/home-v2/snap-cards/woodville-blaze-v5.jpg" },
  { id: "twilight", label: "Iconic Twilight", image: "/media/home-v2/photo-edits/alt-marias-pool-warmdusk-after.jpg", video: "", poster: "" },
  { id: "headshots", label: "Headshots", image: "/media/photos/headshot-gracepoint-1.jpg", video: "", poster: "" },
  { id: "commercial", label: "Commercial", image: "", video: "/media/home-v2/slider/04-commercial-king-metals.mp4", poster: "/media/home-v2/slider/04-commercial-king-metals.jpg" },
  { id: "staging", label: "AI Virtual Staging", image: "/media/home-v2/staging/vs-living-after.jpg", video: "", poster: "" },
];

const SERVE: MediaCard[] = [
  { id: "agents", label: "Realtors & Brokers", image: "/media/photos/lifestyle-kennedy-mtz01127.jpg", video: "", poster: "" },
  { id: "builders", label: "Developers & Builders", image: "/media/pay-at-close/luxury/pool-rd/07-front-day.jpg", video: "", poster: "" },
  { id: "business", label: "Small Business Owners", image: "/media/photos/lifestyle-daughtery-mtz00636.jpg", video: "", poster: "" },
  { id: "senior", label: "Senior living", image: "/senior-living/senior-living-01-hero.jpg", video: "", poster: "" },
];

const STEPS: MediaCard[] = [
  { id: "step-1", step: "STEP 1", label: "Book your session", image: "/media/launch/exterior_entry_day.jpg", video: "", poster: "" },
  { id: "step-2", step: "STEP 2", label: "We capture the vision", image: "/media/launch/aerial_neighborhood_drone.jpg", video: "", poster: "" },
  { id: "step-3", step: "STEP 3", label: "Rapid post-production", image: "/media/home-v2/photo-edits/pavilion-after-iconic.jpg", video: "", poster: "" },
  { id: "step-4", step: "STEP 4", label: "Delivery & launch", image: "/media/launch/primary_suite.jpg", video: "", poster: "" },
];

function cardsFrom(items: ContentItem[] | null, fallback: MediaCard[], withStep = false): MediaCard[] {
  if (!items?.length) return fallback;
  return items.map((item, index) => {
    const base = fallback[index];
    return {
      id: item.id,
      label: itemText(item, withStep ? "title" : "label", base?.label || ""),
      image: itemText(item, "image", base?.image || ""),
      video: itemText(item, "video", base?.video || ""),
      poster: itemText(item, "poster", base?.poster || ""),
      step: withStep ? itemText(item, "step", base?.step || "") : undefined,
    };
  });
}

function armVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
}

function LoopVideo({
  src,
  poster,
  label,
  block,
  item,
  eager = false,
}: {
  src: string;
  poster?: string;
  label: string;
  block: string;
  item?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    armVideo(video);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLVideoElement;
        armVideo(node);
        if (reduce || entry.intersectionRatio < VISIBLE_RATIO) {
          node.pause();
          continue;
        }
        void node.play().catch(() => undefined);
      }
    }, { threshold: [0, VISIBLE_RATIO, 0.6] });
    observer.observe(video);
    if (reduce) video.pause();
    return () => observer.disconnect();
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster || undefined}
      aria-label={label}
      data-site-page={PAGE}
      data-site-block={block}
      data-site-item={item}
      data-site-field="video"
      data-site-kind="video"
      className="absolute inset-0 h-full w-full object-cover"
      autoPlay
      muted
      loop
      playsInline
      preload={eager ? "metadata" : "none"}
      onLoadedMetadata={(event) => armVideo(event.currentTarget)}
      onPlay={(event) => armVideo(event.currentTarget)}
    />
  );
}

function Still({
  src,
  alt,
  block,
  field = "image",
  item,
  eager = false,
}: {
  src: string;
  alt: string;
  block: string;
  field?: string;
  item?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      data-site-page={PAGE}
      data-site-block={block}
      data-site-item={item}
      data-site-field={field}
      data-site-kind="image"
      className="absolute inset-0 h-full w-full object-cover"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

function MediaFill({ card, block, eager = false }: { card: MediaCard; block: string; eager?: boolean }) {
  if (card.video) {
    return <LoopVideo src={card.video} poster={card.poster || card.image} label={card.label} block={block} item={card.id} eager={eager} />;
  }
  if (!card.image) return null;
  return <Still src={card.image} alt={card.label} block={block} item={card.id} eager={eager} />;
}

function Headline({
  block,
  title,
  line,
  light = true,
}: {
  block: string;
  title: string;
  line: string;
  light?: boolean;
}) {
  const titleClass = light
    ? "text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl"
    : "text-4xl font-black tracking-tight text-black sm:text-5xl md:text-6xl";
  const lineClass = light
    ? "mt-3 max-w-xl text-lg leading-snug text-white/85 sm:text-xl"
    : "mt-3 max-w-xl text-lg leading-snug text-neutral-600 sm:text-xl";
  return (
    <div>
      <h2 data-site-page={PAGE} data-site-block={block} data-site-field="title" data-site-kind="text" className={titleClass}>
        {title}
      </h2>
      <p data-site-page={PAGE} data-site-block={block} data-site-field="line" data-site-kind="text" className={lineClass}>
        {line}
      </p>
    </div>
  );
}

export default function WhatWeDo() {
  const heroHidden = useBlockHidden(PAGE, "hero");
  const whoHidden = useBlockHidden(PAGE, "who");
  const shootHidden = useBlockHidden(PAGE, "shoot");
  const serveHidden = useBlockHidden(PAGE, "serve");
  const stepsHidden = useBlockHidden(PAGE, "steps");
  const whyHidden = useBlockHidden(PAGE, "why");
  const ctaHidden = useBlockHidden(PAGE, "cta");

  const heroTitle = useSiteText(PAGE, "hero", "title", "What does Iconic do?");
  const heroLine = useSiteText(PAGE, "hero", "line", "Photography, video, and listing media.");
  const heroVideo = useSiteText(PAGE, "hero", "video", HERO_VIDEO);
  const heroPoster = useSiteText(PAGE, "hero", "poster", HERO_POSTER);

  const whoTitle = useSiteText(PAGE, "who", "title", "Real estate media.");
  const whoLine = useSiteText(PAGE, "who", "line", "Spring, The Woodlands, and Houston.");
  const whoImage = useSiteText(PAGE, "who", "image", WHO_IMAGE);
  const whoAlt = useSiteText(PAGE, "who", "alt", "Studio 105 white sweep with strobes");

  const shootTitle = useSiteText(PAGE, "shoot", "title", "What we shoot.");
  const shootLine = useSiteText(PAGE, "shoot", "line", "Listing photos, film, and brand media.");
  const shoot = cardsFrom(useSiteItems(PAGE, "shoot"), SHOOT);

  const serveTitle = useSiteText(PAGE, "serve", "title", "Who it's for.");
  const serveLine = useSiteText(PAGE, "serve", "line", "Agents, builders, businesses, and senior living.");
  const serve = cardsFrom(useSiteItems(PAGE, "serve"), SERVE);

  const stepsTitle = useSiteText(PAGE, "steps", "title", "How it works.");
  const stepsLine = useSiteText(PAGE, "steps", "line", "Placing an order with Iconic is as simple as it gets.");
  const steps = cardsFrom(useSiteItems(PAGE, "steps"), STEPS, true);

  const whyTitle = useSiteText(PAGE, "why", "title", "Show the house.");
  const whyLine = useSiteText(PAGE, "why", "line", "The story, and the reason someone should call.");
  const whyImage = useSiteText(PAGE, "why", "image", WHY_IMAGE);
  const whyAlt = useSiteText(PAGE, "why", "alt", "Drone view of a waterfront luxury home");

  const ctaTitle = useSiteText(PAGE, "cta", "title", "Book a shoot.");
  const ctaLine = useSiteText(PAGE, "cta", "line", "Or see the packages.");
  const bookLabel = useSiteText(PAGE, "cta", "book", "Book Now");
  const bookHref = useSiteHref(PAGE, "cta", "book", "/book");
  const pricingLabel = useSiteText(PAGE, "cta", "pricing", "Pricing");
  const pricingHref = useSiteHref(PAGE, "cta", "pricing", "/pricing");

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollSnapType;
    root.style.scrollSnapType = "y proximity";
    return () => {
      root.style.scrollSnapType = previous;
    };
  }, []);

  return (
    <Layout>
      <div className="bg-black text-white">
        {heroHidden ? null : (
          <section className="flex min-h-[100svh] scroll-mt-0 flex-col justify-center px-5 pb-16 pt-36 sm:px-8 md:px-12 lg:pt-32">
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
              <div>
                <h1 data-site-page={PAGE} data-site-block="hero" data-site-field="title" data-site-kind="text" className="text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl md:text-7xl">
                  {heroTitle}
                </h1>
                <p data-site-page={PAGE} data-site-block="hero" data-site-field="line" data-site-kind="text" className="mt-5 max-w-md text-xl leading-snug text-white/85 sm:text-2xl">
                  {heroLine}
                </p>
              </div>
              <div className="mx-auto w-full max-w-[420px]">
                <div className="relative aspect-[3/4] overflow-hidden rounded-[1.75rem] border border-white/10 bg-neutral-900 shadow-2xl">
                  <LoopVideo src={heroVideo} poster={heroPoster} label="Iconic services" block="hero" eager />
                </div>
              </div>
            </div>
          </section>
        )}

        {whoHidden ? null : (
          <section className="relative flex min-h-[100svh] items-end scroll-mt-0">
            <div className="absolute inset-0">
              <Still src={whoImage} alt={whoAlt} block="who" eager />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
            </div>
            <div className="relative z-10 w-full px-5 pb-16 sm:px-8 md:px-12 md:pb-20">
              <div className="mx-auto max-w-6xl">
                <Headline block="who" title={whoTitle} line={whoLine} />
              </div>
            </div>
          </section>
        )}

        {shootHidden ? null : (
          <section className="scroll-mt-28 bg-black py-20 md:py-28">
            <div className="mx-auto mb-8 max-w-6xl px-5 sm:px-8 md:px-12">
              <Headline block="shoot" title={shootTitle} line={shootLine} />
            </div>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden md:mx-auto md:grid md:max-w-6xl md:grid-cols-4 md:overflow-visible md:px-12">
              {shoot.map((card) => (
                <figure key={card.id} className="relative aspect-[3/4] w-[78vw] max-w-[380px] shrink-0 snap-start overflow-hidden rounded-[1.75rem] bg-neutral-900 md:w-auto md:max-w-none">
                  <MediaFill card={card} block="shoot" />
                  <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-5 pb-5 pt-16">
                    <span data-site-page={PAGE} data-site-block="shoot" data-site-item={card.id} data-site-field="label" data-site-kind="text" className="text-xl font-black tracking-tight text-white">
                      {card.label}
                    </span>
                  </figcaption>
                </figure>
              ))}
              <div className="w-1 shrink-0 md:hidden" aria-hidden="true" />
            </div>
          </section>
        )}

        {serveHidden ? null : (
          <section className="scroll-mt-28 bg-black py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 md:px-12">
              <Headline block="serve" title={serveTitle} line={serveLine} />
              <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                {serve.map((card) => (
                  <figure key={card.id} className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem] bg-neutral-900">
                    <MediaFill card={card} block="serve" />
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-4 pt-14">
                      <span data-site-page={PAGE} data-site-block="serve" data-site-item={card.id} data-site-field="label" data-site-kind="text" className="text-base font-black leading-tight tracking-tight text-white sm:text-lg">
                        {card.label}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {stepsHidden ? null : (
          <section className="scroll-mt-28 bg-black py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 md:px-12">
              <Headline block="steps" title={stepsTitle} line={stepsLine} />
              <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                {steps.map((card) => (
                  <figure key={card.id} className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem] bg-neutral-900">
                    <MediaFill card={card} block="steps" />
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-16">
                      {card.step ? (
                        <span data-site-page={PAGE} data-site-block="steps" data-site-item={card.id} data-site-field="step" data-site-kind="text" className="text-[11px] font-black uppercase tracking-[0.22em] text-teal-300">
                          {card.step}
                        </span>
                      ) : null}
                      <span data-site-page={PAGE} data-site-block="steps" data-site-item={card.id} data-site-field="title" data-site-kind="text" className="mt-1 block text-base font-black leading-tight tracking-tight text-white sm:text-lg">
                        {card.label}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {whyHidden ? null : (
          <section className="relative flex min-h-[100svh] items-end scroll-mt-0">
            <div className="absolute inset-0">
              <Still src={whyImage} alt={whyAlt} block="why" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10" />
            </div>
            <div className="relative z-10 w-full px-5 pb-16 sm:px-8 md:px-12 md:pb-20">
              <div className="mx-auto max-w-6xl">
                <Headline block="why" title={whyTitle} line={whyLine} />
              </div>
            </div>
          </section>
        )}

        {ctaHidden ? null : (
          <section className="scroll-mt-28 bg-black px-5 py-24 sm:px-8 md:px-12 md:py-32">
            <div className="mx-auto w-full max-w-3xl text-center">
              <h2 data-site-page={PAGE} data-site-block="cta" data-site-field="title" data-site-kind="text" className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                {ctaTitle}
              </h2>
              <p data-site-page={PAGE} data-site-block="cta" data-site-field="line" data-site-kind="text" className="mt-4 text-xl text-white/80">
                {ctaLine}
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to={bookHref}
                  data-site-page={PAGE}
                  data-site-block="cta"
                  data-site-field="book"
                  data-site-kind="link"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#0d9488] px-8 text-base font-bold text-white transition-colors hover:bg-teal-600 sm:w-auto"
                >
                  {bookLabel}
                </Link>
                <Link
                  to={pricingHref}
                  data-site-page={PAGE}
                  data-site-block="cta"
                  data-site-field="pricing"
                  data-site-kind="link"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/25 px-8 text-base font-bold text-white transition-colors hover:bg-white/10 sm:w-auto"
                >
                  {pricingLabel}
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}

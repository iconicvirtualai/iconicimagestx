import { useEffect, useRef } from "react";
import { DECADE_MASHUPS, DECADE_PLAYBACK_RATE, type DecadeMashup } from "@shared/decadeMashups";

const VISIBLE_RATIO = 0.15;

export function armDecadeVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.playbackRate = DECADE_PLAYBACK_RATE;
  video.defaultPlaybackRate = DECADE_PLAYBACK_RATE;
}

function playIfVisible(video: HTMLVideoElement, ratio: number) {
  armDecadeVideo(video);
  if (ratio >= VISIBLE_RATIO) {
    void video.play().catch(() => undefined);
    return;
  }
  video.pause();
}

export default function DecadeMashupCarousel({ cards = DECADE_MASHUPS }: { cards?: DecadeMashup[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const row = cards.length ? cards : DECADE_MASHUPS;
  const signature = row.map((card) => `${card.id}|${card.video}|${card.poster}|${card.label}`).join(";");
  const loop = [...row, ...row];

  useEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll("video"));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        playIfVisible(entry.target as HTMLVideoElement, entry.intersectionRatio);
      }
    }, { threshold: [0, VISIBLE_RATIO, 0.6] });
    for (const video of videos) {
      armDecadeVideo(video);
      observer.observe(video);
    }
    return () => observer.disconnect();
  }, [signature]);

  return (
    <div className="relative w-full overflow-hidden py-12" data-testid="decade-mashup-carousel">
      <div ref={trackRef} className="decade-mashup-scroll flex whitespace-nowrap">
        {loop.map((card, index) => {
          const clone = index >= row.length;
          return (
            <div
              key={`${card.id}-${index}`}
              data-testid="decade-mashup-card"
              aria-hidden={clone ? true : undefined}
              className="group relative mx-2 h-[184px] w-[184px] flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gray-900 md:h-[268px] md:w-[268px]"
            >
              {card.video ? (
                <video
                  src={card.video}
                  poster={card.poster || undefined}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  data-site-page="about"
                  data-site-block="hero"
                  data-site-item={card.id}
                  data-site-field="video"
                  data-site-kind="video"
                  aria-label={card.label || "Decade mashup"}
                  onLoadedMetadata={(event) => armDecadeVideo(event.currentTarget)}
                  onPlay={(event) => armDecadeVideo(event.currentTarget)}
                />
              ) : (
                <img
                  src={card.poster}
                  alt={card.label}
                  className="absolute inset-0 h-full w-full object-cover"
                  data-site-page="about"
                  data-site-block="hero"
                  data-site-item={card.id}
                  data-site-field="poster"
                  data-site-kind="image"
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span
                data-site-page="about"
                data-site-block="hero"
                data-site-item={card.id}
                data-site-field="label"
                data-site-kind="text"
                className="absolute bottom-6 left-6 z-10 text-[10px] font-bold uppercase tracking-widest text-white/90"
              >
                {card.label}
              </span>
            </div>
          );
        })}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes decade-mashup-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .decade-mashup-scroll {
          animation: decade-mashup-marquee 42s linear infinite;
          width: max-content;
        }
        .decade-mashup-scroll:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

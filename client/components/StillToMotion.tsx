import { useEffect, useRef, useState } from "react";

export const STILL_TO_MOTION_SCENES = [
  {
    id: "kitchen",
    label: "Kitchen",
    still: "/media/home-v2/still-to-motion/kitchen.webp",
    avif: "/media/home-v2/still-to-motion/kitchen.avif",
    poster: "/media/home-v2/still-to-motion/kitchen-poster.jpg",
    clips: [
      { mp4: "/media/home-v2/still-to-motion/kitchen-1.mp4", webm: "/media/home-v2/still-to-motion/kitchen-1.webm" },
      { mp4: "/media/home-v2/still-to-motion/kitchen-2.mp4", webm: "/media/home-v2/still-to-motion/kitchen-2.webm" },
    ],
  },
  {
    id: "living",
    label: "Living room",
    still: "/media/home-v2/still-to-motion/living.webp",
    avif: "/media/home-v2/still-to-motion/living.avif",
    poster: "/media/home-v2/still-to-motion/living-poster.jpg",
    clips: [
      { mp4: "/media/home-v2/still-to-motion/living-1.mp4", webm: "/media/home-v2/still-to-motion/living-1.webm" },
      { mp4: "/media/home-v2/still-to-motion/living-2.mp4", webm: "/media/home-v2/still-to-motion/living-2.webm" },
    ],
  },
  {
    id: "front",
    label: "Front elevation",
    still: "/media/home-v2/still-to-motion/front.webp",
    avif: "/media/home-v2/still-to-motion/front.avif",
    poster: "/media/home-v2/still-to-motion/front-poster.jpg",
    clips: [
      { mp4: "/media/home-v2/still-to-motion/front-1.mp4", webm: "/media/home-v2/still-to-motion/front-1.webm" },
      { mp4: "/media/home-v2/still-to-motion/front-2.mp4", webm: "/media/home-v2/still-to-motion/front-2.webm" },
    ],
  },
  {
    id: "pool",
    label: "Pool and patio",
    still: "/media/home-v2/still-to-motion/pool.webp",
    avif: "/media/home-v2/still-to-motion/pool.avif",
    poster: "/media/home-v2/still-to-motion/pool-poster.jpg",
    clips: [
      { mp4: "/media/home-v2/still-to-motion/pool-1.mp4", webm: "/media/home-v2/still-to-motion/pool-1.webm" },
      { mp4: "/media/home-v2/still-to-motion/pool-2.mp4", webm: "/media/home-v2/still-to-motion/pool-2.webm" },
      { mp4: "/media/home-v2/still-to-motion/pool-3.mp4", webm: "/media/home-v2/still-to-motion/pool-3.webm" },
      { mp4: "/media/home-v2/still-to-motion/pool-4.mp4", webm: "/media/home-v2/still-to-motion/pool-4.webm" },
    ],
  },
] as const;

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduce;
}

export default function StillToMotion() {
  const reduce = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const advanceRef = useRef<number | null>(null);
  const [seen, setSeen] = useState(false);
  const [active, setActive] = useState(0);
  const [clip, setClip] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scene = STILL_TO_MOTION_SCENES[active];
  const current = scene.clips[Math.min(clip, scene.clips.length - 1)];

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      setSeen(entry.isIntersecting);
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (advanceRef.current) window.clearTimeout(advanceRef.current);
    setClip(0);
    setPlaying(false);
    if (!seen || reduce) return;
    const hold = window.setTimeout(() => setPlaying(true), 1100);
    return () => window.clearTimeout(hold);
  }, [active, seen, reduce]);

  useEffect(() => () => {
    if (advanceRef.current) window.clearTimeout(advanceRef.current);
  }, []);

  function showScene(index: number) {
    if (advanceRef.current) window.clearTimeout(advanceRef.current);
    setActive(index);
  }

  function onEnded() {
    if (clip + 1 < scene.clips.length) {
      setClip(clip + 1);
      return;
    }
    setPlaying(false);
    advanceRef.current = window.setTimeout(() => {
      setActive((index) => (index + 1) % STILL_TO_MOTION_SCENES.length);
    }, 900);
  }

  return (
    <div ref={stageRef} className="mt-6" data-testid="still-to-motion">
      <div className="mb-3 flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.22em]">
        <span className={playing ? "text-gray-400" : "text-teal-700"}>Still Shots</span>
        <span aria-hidden="true" className="text-teal-500">→</span>
        <span className={playing ? "text-teal-700" : "text-gray-400"}>To Motion</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-black">
        <div className="relative aspect-video">
          {seen && !reduce && playing ? (
            <video
              key={`${scene.id}-${clip}`}
              poster={scene.poster}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              playsInline
              preload="metadata"
              aria-label={`${scene.label}, still shot turned to motion`}
              ref={(node) => {
                if (!node) return;
                node.muted = true;
                node.defaultMuted = true;
              }}
              onEnded={onEnded}
              onError={() => setPlaying(false)}
            >
              <source src={current.webm} type="video/webm" />
              <source src={current.mp4} type="video/mp4" />
            </video>
          ) : null}
          <picture className="pointer-events-none absolute inset-0">
            <source srcSet={scene.avif} type="image/avif" />
            <img
              src={scene.still}
              alt={`${scene.label} listing still`}
              width={1600}
              height={1066}
              className="h-full w-full object-cover transition-[clip-path] duration-1000 ease-in-out"
              style={{ clipPath: playing ? "inset(0 100% 0 0)" : "inset(0 0 0 0)" }}
            />
          </picture>
          <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">
            {playing ? "To Motion" : "Still Shots"}
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {STILL_TO_MOTION_SCENES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={index === active}
            onMouseEnter={() => showScene(index)}
            onFocus={() => showScene(index)}
            onClick={() => showScene(index)}
            className={`overflow-hidden rounded-lg border bg-black text-left ${index === active ? "border-teal-500" : "border-gray-100"}`}
          >
            <img src={item.still} alt="" width={320} height={180} loading="lazy" className="aspect-video w-full object-cover" />
            <span className="block truncate bg-white px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-teal-800">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

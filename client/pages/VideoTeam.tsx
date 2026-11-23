import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Maximize2, Play, Volume2, VolumeX } from "lucide-react";
import Layout from "@/components/Layout";
import {
  CREW,
  SAMPLE_CATEGORIES,
  TEAM_REELS,
  type CrewMember,
  type TeamReel,
  type VideoSample,
} from "@/data/videoTeam";

const PAGE_FONT = '"Montserrat", Inter, ui-sans-serif, system-ui, sans-serif';

function useMontserrat() {
  useEffect(() => {
    const id = "video-team-montserrat";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);
}

function TeamReelCard({
  reel,
  soundOn,
  onToggleSound,
}: {
  reel: TeamReel;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = !soundOn;
    if (soundOn && video.paused) void video.play().catch(() => undefined);
  }, [soundOn]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      video.pause();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLVideoElement;
        node.muted = !soundRef.current;
        if (entry.intersectionRatio < 0.4) node.pause();
        else void node.play().catch(() => undefined);
      }
    }, { threshold: [0, 0.4, 0.8] });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reel.src]);

  async function openFullScreen(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const video = ref.current;
    if (!video) return;
    if (!soundOn) onToggleSound();
    video.muted = false;
    const ios = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (typeof ios.webkitEnterFullscreen === "function") {
      ios.webkitEnterFullscreen();
      return;
    }
    const frame = video.parentElement;
    if (frame?.requestFullscreen) await frame.requestFullscreen();
    else if (video.requestFullscreen) await video.requestFullscreen();
  }

  return (
    <figure data-testid="team-reel" className="flex h-full flex-col">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[1.75rem] bg-[#141414] shadow-[0_18px_40px_rgba(20,20,20,0.12)] ring-1 ring-[#e4dacb]">
        <video
          ref={ref}
          src={reel.src}
          poster={reel.poster}
          aria-label={reel.title}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted={!soundOn}
          loop
          playsInline
          preload="metadata"
          onClick={onToggleSound}
          onLoadedMetadata={(event) => {
            event.currentTarget.muted = !soundRef.current;
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? `Mute ${reel.title}` : `Unmute ${reel.title}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
          >
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={openFullScreen}
            aria-label={`Full screen ${reel.title}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </figure>
  );
}

function SampleCard({ sample }: { sample: VideoSample }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const portrait = sample.height > sample.width;
  const posterFit = "object-cover";
  const videoFit = portrait ? "object-contain" : "object-cover";

  useEffect(() => {
    if (!active) return;
    const video = ref.current;
    if (!video) return;
    video.muted = false;
    void video.play().catch(() => {
      video.muted = true;
      void video.play().catch(() => undefined);
    });
  }, [active]);

  return (
    <figure data-testid="sample-card" className="min-w-0">
      <div className="relative aspect-video overflow-hidden rounded-[1.35rem] bg-[#141414] shadow-[0_12px_32px_rgba(20,20,20,0.08)] ring-1 ring-[#e4dacb]">
        {active ? (
          <video
            ref={ref}
            src={sample.src}
            poster={sample.poster}
            aria-label={sample.title}
            className={`absolute inset-0 h-full w-full bg-[#141414] ${videoFit}`}
            controls
            playsInline
            preload="none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setActive(true)}
            aria-label={`Play ${sample.title}`}
            className="absolute inset-0"
          >
            <img
              src={sample.poster}
              alt=""
              loading="lazy"
              decoding="async"
              className={`h-full w-full ${posterFit}`}
            />
            <span className="absolute left-1/2 top-1/2 inline-flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#141414] shadow-lg">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-sm font-bold leading-snug text-[#141414] sm:text-base">{sample.title}</figcaption>
    </figure>
  );
}

function CrewPortrait({ person }: { person: CrewMember }) {
  const [failed, setFailed] = useState(!person.image);

  return (
    <li className="flex w-28 shrink-0 snap-start flex-col items-center text-center lg:w-auto">
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[#0f8f80]/10 ring-2 ring-white lg:h-[6.5rem] lg:w-[6.5rem]">
        {failed ? (
          <span className="text-2xl font-extrabold tracking-wide text-[#0f8f80]" aria-hidden="true">{person.initials}</span>
        ) : (
          <img
            src={person.image}
            alt={person.name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-center"
          />
        )}
      </div>
      <p className="mt-3 whitespace-nowrap text-xs font-bold leading-tight text-[#141414] lg:text-sm">{person.name}</p>
    </li>
  );
}

export default function VideoTeam() {
  useMontserrat();
  const [soundId, setSoundId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState(SAMPLE_CATEGORIES[0].id);
  const category = SAMPLE_CATEGORIES.find((item) => item.id === categoryId) ?? SAMPLE_CATEGORIES[0];

  return (
    <Layout>
      <div data-testid="video-team-page" className="bg-[#f4eee4] text-[#141414]" style={{ fontFamily: PAGE_FONT }}>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-40 sm:px-6 sm:pt-44">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0f8f80]">Iconic Images</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">Meet our Video Team</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#5b5249] sm:text-lg">
            Listing films, on-camera reels, commercial, events, product, and brand video from the crew in Spring, The Woodlands, and Houston.
          </p>
          <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {TEAM_REELS.map((reel) => (
              <div key={reel.id} className="w-[58vw] max-w-[250px] shrink-0 snap-center sm:w-[240px] lg:w-auto lg:max-w-none">
                <TeamReelCard
                  reel={reel}
                  soundOn={soundId === reel.id}
                  onToggleSound={() => setSoundId((current) => (current === reel.id ? null : reel.id))}
                />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[#5b5249]">Tap a reel for sound, or open it full screen. Samples below stay still until you press play.</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="video-crew-heading">
          <h2 id="video-crew-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">The crew</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[#5b5249]">The people who film with Iconic Images.</p>
          <ul className="mt-8 flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:gap-3 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {CREW.map((person) => (
              <CrewPortrait key={person.name} person={person} />
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="what-we-film-heading">
          <h2 id="what-we-film-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">What we film</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[#5b5249]">A few films from the library. Press play when you want the picture to move.</p>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="What we film">
            {SAMPLE_CATEGORIES.map((item) => {
              const active = item.id === category.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`film-tab-${item.id}`}
                  aria-selected={active}
                  aria-controls="film-panel"
                  onClick={() => setCategoryId(item.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    active ? "bg-[#0f8f80] text-white" : "bg-[#fffdf9] text-[#5b5249] ring-1 ring-[#e4dacb]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div
            key={category.id}
            id="film-panel"
            role="tabpanel"
            aria-labelledby={`film-tab-${category.id}`}
            className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2"
          >
            {category.samples.map((sample) => (
              <SampleCard key={sample.id} sample={sample} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-[2rem] bg-[#141414] px-6 py-12 text-center text-white sm:px-10">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Book your video shoot</h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-white/75">Tell us the property, the event, or the brand. We will put a crew on it.</p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
              <Link
                to="/book"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0f8f80] px-8 text-base font-bold text-white transition-colors hover:bg-[#0c7569]"
              >
                Book your video shoot
              </Link>
              <Link
                to="/contact"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 px-8 text-base font-bold text-white transition-colors hover:bg-white/10"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

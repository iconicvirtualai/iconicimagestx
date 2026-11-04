import { useEffect, useState, useRef } from "react";
import { Play, Volume2, VolumeX, ChevronLeft, ChevronRight } from "lucide-react";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";

type Slide = {
  id: string;
  url: string;
  aspect: string;
  title: string;
};

const FALLBACK_SLIDES: Slide[] = [
  { id: "slide-1", url: "/media/video/product-photography.mp4", aspect: "16/9", title: "Listing film" },
  { id: "slide-2", url: "/media/videos/snap-reels/bayonne-snap.mp4", aspect: "9/16", title: "Premium listing" },
  { id: "slide-3", url: "/media/blaze/02_US_v3.mp4", aspect: "9/16", title: "Emily Aguilar" },
  { id: "slide-4", url: "/media/videos/snap-reels/forest-heights-blaze.mp4", aspect: "9/16", title: "King Metals" },
  { id: "slide-5", url: "/media/videos/snap-reels/arcane-court-blaze.mp4", aspect: "9/16", title: "Blaze reel" },
  { id: "slide-6", url: "/media/videos/snap-reels/tall-trees-blaze.mp4", aspect: "9/16", title: "Aerial" },
  { id: "slide-7", url: "/media/blaze/01_BUILT_v2.mp4", aspect: "9/16", title: "Agent reel" },
];

function ratioFromAspect(aspect: string): number {
  const [w, h] = aspect.split("/").map((part) => Number(part));
  if (!w || !h) return 9 / 16;
  return w / h;
}

export default function SolutionSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [measured, setMeasured] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const saved = useSiteItems("home", "solution");
  const videos: Slide[] = saved?.length
    ? saved.map((item) => ({
      id: item.id,
      url: itemText(item, "video"),
      aspect: itemText(item, "aspect", "9/16"),
      title: itemText(item, "title"),
    })).filter((item) => item.url)
    : FALLBACK_SLIDES;

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % videos.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length);
  };

  useEffect(() => {
    setMeasured(null);
    const node = videoRef.current;
    if (!node) return;
    node.load();
    node.play().catch(() => undefined);
  }, [currentIndex, videos.length]);

  const currentVideo = videos[currentIndex] ?? videos[0];
  const ratio = measured && measured > 0 ? measured : ratioFromAspect(currentVideo?.aspect || "9/16");
  const wide = ratio >= 1;

  const badge = useSiteText("home", "solution", "badge", "Built for Creative Excellence");
  const title = useSiteText("home", "solution", "title", "Your All-in-One Solution for High-Impact Media Content");
  const body = useSiteText("home", "solution", "body", "Transform your raw ideas into engaging cinematic media in minutes. Whether you're a high-growth startup serving multiple clients or an established enterprise, Iconic helps you create professional-grade visual content seamlessly.");

  if (!currentVideo) return null;

  return (
    <section className="bg-black pt-12 pb-24 md:pt-16 md:pb-32 border-t border-white/5">
      <div className="container mx-auto px-4 text-center">
        <div className="mb-8 inline-flex items-center rounded-full border border-teal-500/20 bg-teal-500/10 px-4 py-1.5 shadow-lg">
          <span data-site-page="home" data-site-block="solution" data-site-field="badge" data-site-kind="text" className="text-[12px] font-bold uppercase tracking-wider text-teal-400">
            {badge}
          </span>
        </div>
        <h2 data-site-page="home" data-site-block="solution" data-site-field="title" data-site-kind="text" className="mx-auto mb-8 max-w-4xl text-balance text-4xl font-black uppercase leading-[1.15] tracking-tight text-white md:text-5xl lg:text-6xl">
          {title}
        </h2>
        <p data-site-page="home" data-site-block="solution" data-site-field="body" data-site-kind="text" className="mx-auto mb-16 max-w-3xl text-balance text-lg font-medium leading-relaxed text-gray-400 md:text-xl">
          {body}
        </p>
        <div className="relative flex flex-col items-center">
          <div
            className={`relative overflow-hidden border-[6px] border-[#111] bg-black shadow-2xl shadow-teal-900/20 transition-[max-width] duration-500 ease-out md:border-[8px] ${
              wide ? "w-full max-w-5xl rounded-[1.5rem] md:rounded-[2rem]" : "w-full max-w-[400px] rounded-[2rem] md:rounded-[2.5rem]"
            }`}
            style={{ aspectRatio: String(ratio) }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <video
                key={currentVideo.id}
                ref={videoRef}
                src={currentVideo.url}
                data-site-page="home"
                data-site-block="solution"
                data-site-item={currentVideo.id}
                data-site-field="video"
                data-site-kind="video"
                className="h-full w-full object-cover"
                autoPlay
                loop
                muted={isMuted}
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const node = event.currentTarget;
                  if (node.videoWidth > 0 && node.videoHeight > 0) {
                    setMeasured(node.videoWidth / node.videoHeight);
                  }
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? "Unmute video" : "Mute video"}
              className="absolute top-4 right-4 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/20 text-white backdrop-blur-md transition-all hover:bg-black/40 md:top-8 md:right-8 md:h-12 md:w-12"
            >
              {isMuted ? <VolumeX className="h-4 w-4 md:h-6 md:w-6" /> : <Volume2 className="h-4 w-4 md:h-6 md:w-6" />}
            </button>

            <div className="absolute bottom-4 left-4 z-30 md:bottom-8 md:left-8">
              <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-xl md:gap-3 md:rounded-2xl md:px-6 md:py-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-500 text-white md:h-8 md:w-8 md:rounded-lg">
                  <Play className="h-2.5 w-2.5 translate-x-0.5 fill-white md:h-4 md:w-4" />
                </div>
                <span className="text-[10px] font-bold tracking-tight text-white md:text-base">Iconic Media</span>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 md:gap-8">
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous video"
              className="p-2 text-gray-500 transition-colors hover:text-teal-400"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <div className="flex gap-2" role="tablist" aria-label="Hero videos">
              {videos.map((video, idx) => (
                <button
                  key={video.id}
                  type="button"
                  role="tab"
                  aria-label={`Show ${video.title || `video ${idx + 1}`}`}
                  aria-selected={idx === currentIndex}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex ? "w-6 bg-teal-500" : "w-2 bg-gray-800 hover:bg-gray-700"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next video"
              className="p-2 text-gray-500 transition-colors hover:text-teal-400"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
          <p
            data-site-page="home"
            data-site-block="solution"
            data-site-item={currentVideo.id}
            data-site-field="title"
            data-site-kind="text"
            className="mt-4 text-balance text-[11px] font-black uppercase tracking-[0.28em] text-teal-400"
          >
            {currentVideo.title}
          </p>
        </div>
      </div>
    </section>
  );
}

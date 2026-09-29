import { useState, useRef, useEffect } from "react";
import { Play, Volume2, VolumeX, ChevronLeft, ChevronRight } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { SNAP_REELS } from "@/lib/snapReels";

export default function SolutionSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const settings = useSiteSettings();

  const videos = [
    {
      id: 1,
      url: "/media/video/product-photography.mp4",
      aspect: "16/9",
      title: "Product Photography"
    },
    {
      id: 2,
      url: "/media/reels/superpower-jaz-12s.mp4",
      aspect: "9/16",
      title: "Vertical Reel"
    },
    {
      id: 3,
      url: "/media/video/content-web-clip.mp4",
      aspect: "9/16",
      title: "Content Package"
    },
    ...SNAP_REELS.map((reel, index) => ({
      id: 4 + index,
      url: reel.src,
      aspect: "9/16" as const,
      title: `Snap Reel · ${reel.agent}`,
    })),
  ];

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % videos.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length);
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(e => console.log("Auto-play blocked", e));
    }
  }, [currentIndex]);

  const currentVideo = videos[currentIndex];

  return (
    <section className="bg-black pt-12 pb-24 md:pt-16 md:pb-32 border-t border-white/5">
      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 mb-8 shadow-lg">
          <span className="text-[12px] font-bold tracking-wider uppercase text-teal-400">
            Built for Creative Excellence
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-8 leading-[1.2] tracking-tight text-white max-w-4xl mx-auto uppercase">
          Your All-in-One <span className="text-teal-400 italic">Solution</span> for <br className="hidden md:block" />
          High-Impact Media Content
        </h2>

        {/* Description */}
        <p className="text-lg md:text-xl text-gray-400 mb-16 max-w-3xl mx-auto leading-relaxed font-medium">
          Transform your raw ideas into <strong>engaging cinematic media</strong> in minutes.
          Whether you're a high-growth startup serving multiple clients or an established
          enterprise, Iconic helps you create <strong>professional-grade visual content</strong> seamlessly.
        </p>

        {/* Carousel Container */}
        <div className="relative flex flex-col items-center">
          <div
            className={`relative rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-teal-900/20 border-[6px] md:border-[8px] border-[#111] bg-black group transition-all duration-700 ease-in-out ${
              currentVideo.aspect === "16/9"
                ? "w-full max-w-5xl aspect-video"
                : "w-full max-w-[320px] md:max-w-[360px] aspect-[9/16]"
            }`}
          >
            {/* Active Video */}
            <div className="absolute inset-0 flex items-center justify-center">
              <video
                key={currentVideo.id}
                ref={videoRef}
                src={currentVideo.url}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted={isMuted}
                playsInline
              />
            </div>

            {/* Mute Toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="absolute top-4 right-4 md:top-8 md:right-8 z-30 w-8 h-8 md:w-12 md:h-12 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white transition-all hover:bg-black/40"
            >
              {isMuted ? <VolumeX className="w-4 h-4 md:w-6 md:h-6" /> : <Volume2 className="w-4 h-4 md:w-6 md:h-6" />}
            </button>

            {/* Branding Overlay */}
            <div className="absolute bottom-4 left-4 md:bottom-10 md:left-10 z-30">
               <div className="bg-white/10 backdrop-blur-xl px-3 py-1.5 md:px-6 md:py-3 rounded-lg md:rounded-2xl border border-white/20 flex items-center gap-2 md:gap-3">
                  <div className="w-5 h-5 md:w-8 md:h-8 rounded-md md:rounded-lg flex items-center justify-center text-white bg-teal-500">
                    <Play className="w-2.5 h-2.5 md:w-4 md:h-4 fill-white translate-x-0.5" />
                  </div>
                  <span className="text-white font-bold tracking-tight text-[10px] md:text-base">Iconic Media</span>
               </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-center mt-8 gap-6 md:gap-8">
            <button
              onClick={prevSlide}
              className="p-2 text-gray-500 hover:text-teal-400 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Pagination Dots */}
            <div className="flex gap-2">
              {videos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? "w-6 bg-teal-500"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextSlide}
              className="p-2 text-gray-500 hover:text-teal-400 transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.28em] text-teal-400">
            {currentVideo.title}
          </p>
        </div>
      </div>
    </section>
  );
}

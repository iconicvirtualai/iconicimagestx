import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight } from "lucide-react";

export default function SolutionSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videos = [
    {
      id: 1,
      url: "https://videos.pexels.com/video-files/30067640/12896699_640_360_30fps.mp4",
      aspect: "16/9",
      title: "Luxury Exterior"
    },
    {
      id: 2,
      url: "https://videos.pexels.com/video-files/31548166/13445880_360_640_30fps.mp4",
      aspect: "9/16",
      title: "Vertical Showcase"
    },
    {
      id: 3,
      url: "https://videos.pexels.com/video-files/19403229/19403229-hd_1280_720_25fps.mp4",
      aspect: "16/9",
      title: "Designer Interior"
    },
    {
      id: 4,
      url: "https://videos.pexels.com/video-files/34236991/14509265_360_640_24fps.mp4",
      aspect: "9/16",
      title: "Portrait View"
    }
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

  return (
    <section className="bg-white pt-12 pb-24 md:pt-16 md:pb-32">
      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
          <span className="text-[12px] font-bold tracking-wider text-[#0f766e] uppercase">
            Built for Creative Excellence
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          Your All-in-One <span className="text-[#0d9488]">Solution</span> for <br className="hidden md:block" />
          High-Impact Media Content
        </h2>

        {/* Description */}
        <p className="text-lg md:text-xl text-gray-500 mb-16 max-w-3xl mx-auto leading-relaxed">
          Transform your raw ideas into <strong>engaging cinematic media</strong> in minutes. 
          Whether you're a high-growth startup serving multiple clients or an established 
          enterprise, Iconic helps you create <strong>professional-grade visual content</strong> seamlessly.
        </p>

        {/* Carousel Container */}
        <div className="relative max-w-5xl mx-auto">
          <div className="relative rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-teal-100/50 border-[8px] border-[#f0fdfa] aspect-video bg-black group">
            {/* Active Video */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* If it's 9/16, we might want a blurred background for the landscape container */}
              {videos[currentIndex].aspect === "9/16" && (
                <div className="absolute inset-0 scale-110 blur-2xl opacity-30 pointer-events-none">
                   <video
                    src={videos[currentIndex].url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                  />
                </div>
              )}
              
              <video
                key={videos[currentIndex].id}
                ref={videoRef}
                src={videos[currentIndex].url}
                className={`h-full ${videos[currentIndex].aspect === "16/9" ? "w-full" : "w-auto max-w-full"} object-contain md:object-cover relative z-10`}
                autoPlay
                loop
                muted={isMuted}
                playsInline
              />
            </div>

            {/* Mute Toggle */}
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="absolute top-6 right-6 md:top-8 md:right-8 z-30 w-10 h-10 md:w-12 md:h-12 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white transition-all hover:bg-black/40"
            >
              {isMuted ? <VolumeX className="w-5 h-5 md:w-6 md:h-6" /> : <Volume2 className="w-5 h-5 md:w-6 md:h-6" />}
            </button>

            {/* Branding Overlay */}
            <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-30">
               <div className="bg-white/10 backdrop-blur-xl px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl border border-white/20 flex items-center gap-3">
                  <div className="w-6 h-6 md:w-8 md:h-8 bg-[#0d9488] rounded-lg flex items-center justify-center text-white">
                    <Play className="w-3 h-3 md:w-4 md:h-4 fill-white translate-x-0.5" />
                  </div>
                  <span className="text-white font-bold tracking-tight text-sm md:text-base">Iconic Media</span>
               </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-center mt-8 gap-8">
            <button 
              onClick={prevSlide}
              className="p-2 text-gray-400 hover:text-[#0d9488] transition-colors"
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
                      ? "bg-[#0d9488] w-6" 
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                />
              ))}
            </div>

            <button 
              onClick={nextSlide}
              className="p-2 text-gray-400 hover:text-[#0d9488] transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function MediaCarousel() {
  const settings = useSiteSettings();
  const mediaItems = [
    {
      id: 1,
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
      video: "https://videos.pexels.com/video-files/6007440/6007440-sd_426_240_24fps.mp4",
      aspect: "16/9",
    },
    {
      id: 2,
      image: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=1200&q=80",
      video: "https://videos.pexels.com/video-files/31548166/13445880_360_640_30fps.mp4",
      aspect: "9/16",
    },
    {
      id: 3,
      image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1200&q=80",
      video: "https://videos.pexels.com/video-files/19403229/19403229-hd_1280_720_25fps.mp4",
      aspect: "16/9",
    },
    {
      id: 4,
      image: "https://images.unsplash.com/photo-1600585154526-990dcea4db0d?w=1200&q=80",
      video: "https://videos.pexels.com/video-files/34236991/14509265_360_640_24fps.mp4",
      aspect: "9/16",
    },
    {
      id: 5,
      image: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=1200&q=80",
      video: "https://videos.pexels.com/video-files/6007440/6007440-sd_426_240_24fps.mp4",
      aspect: "16/9",
    },
    {
      id: 6,
      image: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1200&q=80",
      video: "https://videos.pexels.com/video-files/31548166/13445880_360_640_30fps.mp4",
      aspect: "9/16",
    },
  ];

  // Double the items for seamless loop
  const displayItems = [...mediaItems, ...mediaItems];

  const CarouselTrack = ({ isAfter }: { isAfter: boolean }) => (
    <div className={`flex animate-scroll whitespace-nowrap py-8 ${!isAfter ? "grayscale brightness-75 opacity-70" : ""}`}>
      {displayItems.map((item, index) => (
        <div
          key={`${item.id}-${index}`}
          className={`flex-shrink-0 mx-2 md:mx-3 rounded-[20px] md:rounded-[24px] overflow-hidden shadow-xl relative group bg-gray-900 border border-gray-100 ${
            item.aspect === "16/9" 
              ? "w-[240px] h-[135px] md:w-[400px] md:h-[225px]" 
              : "w-[76px] h-[135px] md:w-[126px] md:h-[225px]"
          }`}
        >
          {isAfter ? (
            <video
              src={item.video}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={item.image}
              alt="Raw capture"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative w-full overflow-hidden bg-white py-4 md:py-6">
      {/* Gradient Mask for edges */}
      <div className="absolute inset-y-0 left-0 w-32 md:w-64 bg-gradient-to-r from-white via-white/80 to-transparent z-[35] pointer-events-none"></div>
      <div className="absolute inset-y-0 right-0 w-32 md:w-64 bg-gradient-to-l from-white via-white/80 to-transparent z-[35] pointer-events-none"></div>

      {/* Before/After Label */}
      <div className="flex items-center justify-center gap-4 text-gray-400 text-xs font-bold uppercase tracking-[0.2em] mb-2">
        <span>RAW</span>
        <div className="flex items-center gap-1">
           <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
           <div className="w-8 h-px bg-gray-200"></div>
           <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: settings.global.primaryColor }}></div>
        </div>
        <span className="text-gray-900">ICONIC</span>
      </div>

      {/* Track Layers Container */}
      <div className="relative">
        {/* Middle Bar (Visual) - Constrained to Media height */}
        <div className="absolute left-1/2 top-8 bottom-8 w-px z-[40] -translate-x-1/2 flex items-center justify-center pointer-events-none" style={{ backgroundColor: `${settings.global.primaryColor}4D` }}>
          <div className="w-[2px] h-full" style={{ backgroundImage: `linear-gradient(to bottom, transparent, ${settings.global.primaryColor}80, transparent)` }}></div>
          <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg border" style={{ borderColor: `${settings.global.primaryColor}33` }}>
             <div className="flex gap-0.5">
                <div className="w-0.5 h-2 rounded-full opacity-40" style={{ backgroundColor: settings.global.primaryColor }}></div>
                <div className="w-0.5 h-2 rounded-full" style={{ backgroundColor: settings.global.primaryColor }}></div>
                <div className="w-0.5 h-2 rounded-full opacity-40" style={{ backgroundColor: settings.global.primaryColor }}></div>
             </div>
          </div>
        </div>

        {/* Before Layer (Bottom) */}
        <div className="relative z-10">
          <CarouselTrack isAfter={false} />
        </div>

        {/* After Layer (Top) */}
        <div className="absolute inset-0 z-20 pointer-events-none" style={{ clipPath: "inset(0 0 0 50.1%)" }}>
          <CarouselTrack isAfter={true} />
        </div>
      </div>

      {/* Pricing CTA */}
      <div className="flex flex-col items-center justify-center mt-12 pb-8 relative z-40">
        <Link to="/pricing">
          <Button className="text-white font-bold text-xl px-12 py-8 rounded-2xl shadow-xl shadow-teal-100/50 transition-all hover:scale-105 active:scale-95" style={{ backgroundColor: settings.global.primaryColor }}>
            View Pricing
          </Button>
        </Link>
        <p className="mt-6 text-gray-900 font-bold text-lg md:text-xl tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-1000">
          We’re not competing. <span style={{ color: settings.global.primaryColor }}>We’re setting the pace.</span>
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-scroll {
          animation: scroll 25s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

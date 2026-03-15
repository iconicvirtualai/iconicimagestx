import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import BeforeAfterTile from "./BeforeAfterTile";

export default function MediaCarousel() {
  const settings = useSiteSettings();
  
  // Media items with before/after sources
  // We explicitly define before/after as either image or video
  const mediaPairs = [
    {
      id: 1,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&fm=webp" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/6007440/6007440-sd_426_240_24fps.mp4" },
      aspect: "16/9" as const,
    },
    {
      id: 2,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=1200&q=80&fm=webp" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/31548166/13445880_360_640_30fps.mp4" },
      aspect: "9/16" as const,
    },
    {
      id: 3,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1200&q=80&fm=webp" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/19403229/19403229-hd_1280_720_25fps.mp4" },
      aspect: "16/9" as const,
    },
    {
      id: 4,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600585154526-990dcea4db0d?w=1200&q=80&fm=webp" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/34236991/14509265_360_640_24fps.mp4" },
      aspect: "9/16" as const,
    },
    {
      id: 5,
      before: { type: 'video' as const, url: "https://videos.pexels.com/video-files/34236991/14509265_360_640_24fps.mp4" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/6007440/6007440-sd_426_240_24fps.mp4" },
      aspect: "16/9" as const,
    },
    {
      id: 6,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1200&q=80&fm=webp" },
      after: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=1200&q=80&fm=webp" },
      aspect: "16/9" as const,
    },
  ];

  // Double the items for seamless loop
  const displayPairs = [...mediaPairs, ...mediaPairs];

  return (
    <div className="relative w-full overflow-hidden bg-white py-12 md:py-20 border-y border-gray-50">
      {/* Edge Gradient Mask */}
      <div className="absolute inset-y-0 left-0 w-32 md:w-96 bg-gradient-to-r from-white via-white/80 to-transparent z-[35] pointer-events-none"></div>
      <div className="absolute inset-y-0 right-0 w-32 md:w-96 bg-gradient-to-l from-white via-white/80 to-transparent z-[35] pointer-events-none"></div>

      {/* Section Labels */}
      <div className="flex flex-col items-center justify-center gap-4 mb-12">
         <div className="flex items-center gap-8 text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-gray-400">
           <span>RAW / BEFORE</span>
           <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
              <div className="w-12 h-px bg-gray-100"></div>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: settings.global.primaryColor }}></div>
           </div>
           <span className="text-black">ICONIC / AFTER</span>
         </div>
         <h2 className="text-2xl md:text-4xl font-black text-black tracking-tighter uppercase text-center max-w-2xl px-4">
            Side by Side. No <span style={{ color: settings.global.primaryColor }}>Comparison</span>.
         </h2>
      </div>

      {/* Main Carousel Track - Single Layer, Side-by-Side Pairs */}
      <div className="relative overflow-hidden group/track">
        <div className="flex animate-scroll whitespace-nowrap py-4">
          {displayPairs.map((pair, index) => (
            <BeforeAfterTile 
              key={`${pair.id}-${index}`}
              before={pair.before}
              after={pair.after}
              aspect={pair.aspect}
              primaryColor={settings.global.primaryColor}
            />
          ))}
        </div>
      </div>

      {/* Call to Action Section */}
      <div className="mt-16 text-center px-4 relative z-40">
        <Link to="/pricing">
          <Button 
            className="group text-white font-bold text-lg md:text-xl px-12 py-8 rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 overflow-hidden relative" 
            style={{ backgroundColor: settings.global.primaryColor }}
          >
            <span className="relative z-10 uppercase">Upgrade My Media</span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          </Button>
        </Link>
        
        <div className="mt-8 flex flex-col gap-2">
           <p className="text-black font-black text-xl md:text-2xl uppercase tracking-tighter">
              The <span style={{ color: settings.global.primaryColor }}>Iconic</span> Finish
           </p>
           <p className="text-gray-400 text-[10px] md:text-xs font-bold uppercase tracking-widest max-w-md mx-auto leading-relaxed px-6">
              Standard photos tell a story. Iconic media builds an empire. 
              Stop settling for basic.
           </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 60s linear infinite;
          display: flex;
          width: fit-content;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

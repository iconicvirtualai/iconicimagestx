import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function MediaCarousel() {
  const mediaItems = [
    {
      id: 1,
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
      type: "luxury estate",
      aspect: "16/9",
    },
    {
      id: 2,
      image: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=1200&q=80",
      type: "modern interior",
      aspect: "9/16",
    },
    {
      id: 3,
      image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1200&q=80",
      type: "designer kitchen",
      aspect: "16/9",
    },
    {
      id: 4,
      image: "https://images.unsplash.com/photo-1600585154526-990dcea4db0d?w=1200&q=80",
      type: "prime suite",
      aspect: "9/16",
    },
    {
      id: 5,
      image: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=1200&q=80",
      type: "living space",
      aspect: "16/9",
    },
    {
      id: 6,
      image: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1200&q=80",
      type: "premium bath",
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
          <img
            src={item.image}
            alt={item.type}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4">
            <div className="bg-black/30 backdrop-blur-xl px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-[0.1em] border border-white/20 scale-75 md:scale-100 origin-bottom-left">
              {item.type}
            </div>
          </div>
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
        <span>Raw Content</span>
        <div className="flex items-center gap-1">
           <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
           <div className="w-8 h-px bg-gray-200"></div>
           <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
        </div>
        <span className="text-gray-900">Iconic Edit</span>
      </div>

      {/* Track Layers Container */}
      <div className="relative">
        {/* Middle Bar (Visual) - Constrained to Media height */}
        <div className="absolute left-1/2 top-8 bottom-8 w-px bg-teal-500/30 z-[40] -translate-x-1/2 flex items-center justify-center pointer-events-none">
          <div className="w-[2px] h-full bg-gradient-to-b from-transparent via-teal-500/50 to-transparent"></div>
          <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.3)] border border-teal-500/20">
             <div className="flex gap-0.5">
                <div className="w-0.5 h-2 bg-teal-500 rounded-full opacity-40"></div>
                <div className="w-0.5 h-2 bg-teal-500 rounded-full"></div>
                <div className="w-0.5 h-2 bg-teal-500 rounded-full opacity-40"></div>
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
      <div className="flex justify-center mt-4 pb-2 relative z-40">
        <Link to="/pricing">
          <Button className="bg-[#0f766e] text-white hover:bg-[#0d9488] font-bold text-base px-6 py-5 rounded-lg shadow-lg shadow-teal-100 transition-all hover:scale-105">
            View Pricing
          </Button>
        </Link>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
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

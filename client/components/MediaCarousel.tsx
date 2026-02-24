import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function MediaCarousel() {
  const mediaItems = [
    {
      id: 1,
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
      type: "luxury estate",
    },
    {
      id: 2,
      image: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=1200&q=80",
      type: "modern interior",
    },
    {
      id: 3,
      image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1200&q=80",
      type: "designer kitchen",
    },
    {
      id: 4,
      image: "https://images.unsplash.com/photo-1600585154526-990dcea4db0d?w=1200&q=80",
      type: "prime suite",
    },
    {
      id: 5,
      image: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=1200&q=80",
      type: "living space",
    },
    {
      id: 6,
      image: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1200&q=80",
      type: "premium bath",
    },
  ];

  // Double the items for seamless loop
  const displayItems = [...mediaItems, ...mediaItems];

  const CarouselTrack = ({ isAfter }: { isAfter: boolean }) => (
    <div className={`flex animate-scroll whitespace-nowrap py-12 md:py-16 ${!isAfter ? "grayscale brightness-75 opacity-70" : ""}`}>
      {displayItems.map((item, index) => (
        <div
          key={`${item.id}-${index}`}
          className="flex-shrink-0 w-[300px] h-[200px] md:w-[600px] md:h-[400px] mx-3 md:mx-4 rounded-[30px] md:rounded-[40px] overflow-hidden shadow-2xl relative group bg-gray-900 border border-gray-100"
        >
          <img
            src={item.image}
            alt={item.type}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-8 left-8">
            <div className="bg-black/30 backdrop-blur-xl px-5 py-2 rounded-full text-[12px] font-bold text-white uppercase tracking-[0.15em] border border-white/20">
              {item.type}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative w-full overflow-hidden bg-white">
      {/* Gradient Mask for edges */}
      <div className="absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-white via-white/80 to-transparent z-[35] pointer-events-none"></div>
      <div className="absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-white via-white/80 to-transparent z-[35] pointer-events-none"></div>

      {/* Middle Bar (Visual) */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-teal-500/30 z-[40] -translate-x-1/2 flex items-center justify-center pointer-events-none">
        <div className="w-[2px] h-full bg-gradient-to-b from-transparent via-teal-500/50 to-transparent"></div>
        <div className="absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-[0_0_20px_rgba(20,184,166,0.3)] border border-teal-500/20">
           <div className="flex gap-1">
              <div className="w-1 h-3 bg-teal-500 rounded-full opacity-40"></div>
              <div className="w-1 h-3 bg-teal-500 rounded-full"></div>
              <div className="w-1 h-3 bg-teal-500 rounded-full opacity-40"></div>
           </div>
        </div>
      </div>

      {/* Before/After Label */}
      <div className="flex items-center justify-center gap-4 text-gray-400 text-xs font-bold uppercase tracking-[0.2em] mb-4">
        <span className={!true ? "text-teal-600" : ""}>Raw Content</span>
        <div className="flex items-center gap-1">
           <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
           <div className="w-8 h-px bg-gray-200"></div>
           <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
        </div>
        <span className="text-gray-900">Iconic Edit</span>
      </div>

      {/* Track Layers Container */}
      <div className="relative">
        {/* Before Layer (Bottom) */}
        <div className="relative z-10">
          <CarouselTrack isAfter={false} />
        </div>

        <div className="absolute inset-0 z-20 pointer-events-none" style={{ clipPath: "inset(0 0 0 50.1%)" }}>
          <CarouselTrack isAfter={true} />
        </div>
      </div>

      {/* Pricing CTA */}
      <div className="flex justify-center pb-12 relative z-40">
        <Link to="/pricing">
          <Button className="bg-[#0f766e] text-white hover:bg-[#0d9488] font-bold text-lg px-8 py-6 rounded-xl shadow-lg shadow-teal-100 transition-all hover:scale-105">
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
          animation: scroll 15s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

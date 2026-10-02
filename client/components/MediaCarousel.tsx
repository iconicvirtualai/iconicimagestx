import { AI_BEFORE_AFTER } from "@/lib/beforeAfter";
import BeforeAfterTile from "./BeforeAfterTile";

export default function MediaCarousel() {
  const carouselPairs = AI_BEFORE_AFTER.map((pair) => ({
    id: pair.id,
    before: { type: "image" as const, url: pair.before.src, alt: pair.before.alt },
    after: { type: "image" as const, url: pair.after.src, alt: pair.after.alt },
    aspect: "16/9" as const,
  }));

  // Double the items for seamless loop
  const displayPairs = [...carouselPairs, ...carouselPairs, ...carouselPairs];

  const renderTrack = (type: 'before' | 'after') => (
    <div className="flex animate-scroll whitespace-nowrap py-4">
      {displayPairs.map((pair, index) => {
        const media = type === 'before' ? pair.before : pair.after;
        if (!media) return null;
        return (
          <BeforeAfterTile
            key={`${pair.id}-${index}-${type}`}
            media={media}
            aspect={pair.aspect}
          />
        );
      })}
    </div>
  );

  return (
    <div className="relative w-full overflow-hidden bg-black pb-24">
      {/* Before / After Centered Indicator Above Tracks */}
      <div className="flex items-center justify-center gap-6 mb-12 animate-pulse-slow">
        <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.5em] text-gray-500">Before</span>
        <div className="w-16 h-[1px] bg-white/10"></div>
        <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.5em] text-white">After</span>
      </div>

      {/* Separation Bar - Fixed in Center */}
      <div className="absolute top-24 bottom-24 left-1/2 w-[2px] bg-white/30 backdrop-blur-3xl z-50 pointer-events-none -translate-x-1/2 shadow-[0_0_30px_rgba(255,255,255,0.4)]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 flex items-center justify-center shadow-2xl border border-white">
          <div className="flex gap-1.5">
            <div className="w-[1.5px] h-4 bg-black/30 rounded-full"></div>
            <div className="w-[1.5px] h-4 bg-black/30 rounded-full"></div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden group/track h-[180px] md:h-[280px]">
        {/* Before Track (Photo) - Clipped to left side */}
        <div
          className="absolute inset-0"
          style={{ clipPath: 'inset(0 50% 0 0)' }}
        >
          {renderTrack('before')}
        </div>

        {/* After Track — clipped to the right side */}
        <div
          className="absolute inset-0 z-10 select-none pointer-events-none"
          style={{ clipPath: 'inset(0 0 0 50%)' }}
        >
          {renderTrack('after')}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scrollRight {
          0% { transform: translateX(-33.333%); }
          100% { transform: translateX(0); }
        }
        .animate-scroll {
          animation: scrollRight 35s linear infinite;
          display: flex;
          width: max-content;
        }
        .group\\/track:hover .animate-scroll {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

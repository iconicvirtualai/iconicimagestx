import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import BeforeAfterTile from "./BeforeAfterTile";

export default function MediaCarousel() {
  const settings = useSiteSettings();

  // Use settings from site_settings.json if available, otherwise fallback to these defaults
  const mediaPairs = settings.homepage.mediaCarousel?.length > 0
    ? settings.homepage.mediaCarousel
    : [
        {
          id: 1,
          before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F7b6f0520916943fbb79cd44614a1ab77?format=webp&width=800&height=1200" },
          after: { type: 'video' as const, url: "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4ea5feebdab84ee585ffaa811d803379?alt=media&token=dda6499e-44a2-47a4-a456-1cacb39b6ae4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c" },
          aspect: "16/9" as const,
        },
        {
          id: 2,
          before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F72b1daa259ee41fca399923cfd811959?format=webp&width=800&height=1200" },
          after: { type: 'video' as const, url: "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fba0e88982aa140c2bd2a033055391c4a?alt=media&token=2faaf53d-9e02-4887-aa85-08c6f971cee4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c" },
          aspect: "9/16" as const,
        },
        {
          id: 3,
          before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F28ba4cca4f9a4fc3bc259e984c8012fd?format=webp&width=800&height=1200" },
          after: { type: 'video' as const, url: "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4203b3fa6d2046f6b3aebe85986706ad?alt=media&token=60e7a23a-12d3-45d9-8063-8fa212dc4c4c&apiKey=0ed22311ac6a4dbebeda1b4230c2746c" },
          aspect: "16/9" as const,
        },
        {
          id: 4,
          before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F54911d726f0a43b684406564dac1e5e8?format=webp&width=800&height=1200" },
          after: { type: 'video' as const, url: "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4be86e27da6548d59c567aa0bdfc66e9?alt=media&token=927f0df1-6342-47f7-809f-131e4df074d6&apiKey=0ed22311ac6a4dbebeda1b4230c2746c" },
          aspect: "9/16" as const,
        },
      ];

  // Double the items for seamless loop
  const displayPairs = [...mediaPairs, ...mediaPairs, ...mediaPairs];

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
    <div className="relative w-full overflow-hidden bg-black pb-12">
      {/* Separation Bar - Fixed in Center */}
      <div className="absolute top-0 bottom-0 left-1/2 w-1.5 bg-white/20 backdrop-blur-xl z-50 pointer-events-none -translate-x-1/2 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg border border-gray-200">
          <div className="flex gap-1">
            <div className="w-[1px] h-3 bg-gray-300"></div>
            <div className="w-[1px] h-3 bg-gray-300"></div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden group/track h-[232px] md:h-[352px]">
        {/* Before Track (Photo) - Clipped to left side */}
        <div
          className="absolute inset-0"
          style={{ clipPath: 'inset(0 50% 0 0)' }}
        >
          {renderTrack('before')}
        </div>

        {/* After Track (Video) - Clipped to right side */}
        <div
          className="absolute inset-0 z-10 select-none pointer-events-none"
          style={{ clipPath: 'inset(0 0 0 50%)' }}
        >
          {renderTrack('after')}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scrollLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .animate-scroll {
          animation: scrollLeft 35s linear infinite;
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

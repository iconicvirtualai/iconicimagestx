import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import BeforeAfterTile from "./BeforeAfterTile";

export default function MediaCarousel() {
  const settings = useSiteSettings();

  // Updated media items with mix of 16:9 and 9:16
  // Before is always photo, After is always video
  const mediaPairs = [
    {
      id: 1,
      before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Faecac2467163410db0180e8fdd8a98f7?format=webp&width=800&height=1200" },
      after: { type: 'video' as const, url: "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fba0e88982aa140c2bd2a033055391c4a?alt=media&token=2faaf53d-9e02-4887-aa85-08c6f971cee4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c" },
      aspect: "16/9" as const,
    },
    {
      id: 2,
      before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fe7a04734046e4171bfccc96600f0870f?format=webp&width=800&height=1200" },
      after: { type: 'video' as const, url: "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4ea5feebdab84ee585ffaa811d803379?alt=media&token=dda6499e-44a2-47a4-a456-1cacb39b6ae4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c" },
      aspect: "9/16" as const,
    },
    {
      id: 3,
      before: { type: 'image' as const, url: "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F1bc44dc912bd4cd4848b7cbe64db7001?format=webp&width=800&height=1200" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/32821434/13990151_640_360_30fps.mp4" },
      aspect: "16/9" as const,
    },
    {
      id: 4,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/34236991/14509265_360_640_24fps.mp4" },
      aspect: "9/16" as const,
    },
    {
      id: 5,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600566752355-35792bedca5d?w=1200&q=80" },
      after: { type: 'video' as const, url: "https://videos.pexels.com/video-files/32821434/13990151_640_360_30fps.mp4" },
      aspect: "16/9" as const,
    },
  ];

  // Double the items for seamless loop
  const displayPairs = [...mediaPairs, ...mediaPairs, ...mediaPairs];

  const renderTrack = (type: 'before' | 'after') => (
    <div className="flex animate-scroll whitespace-nowrap py-4">
      {displayPairs.map((pair, index) => {
        const media = type === 'before' ? pair.before : pair.after;
        if (!media) {
          console.warn(`[MediaCarousel] Missing media for track ${type} at index ${index}`, pair);
          return null;
        }
        return (
          <BeforeAfterTile
            key={`${pair.id}-${index}-${type}`}
            media={media}
            aspect={pair.aspect}
            isGrayscale={type === 'before'}
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

      <div className="relative overflow-hidden group/track">
        {/* Before Track (Photo) */}
        <div className="w-full">
          {renderTrack('before')}
        </div>

        {/* After Track (Video) - Clipped to show only on right side */}
        <div
          className="absolute inset-0 z-10 select-none pointer-events-none"
          style={{ clipPath: 'inset(0 0 0 50%)' }}
        >
          {renderTrack('after')}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scrollRight {
          0% { transform: translateX(-33.33%); }
          100% { transform: translateX(0); }
        }
        .animate-scroll {
          animation: scrollRight 40s linear infinite;
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

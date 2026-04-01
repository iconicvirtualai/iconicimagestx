import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import BeforeAfterTile from "./BeforeAfterTile";

export default function MediaCarousel() {
  const settings = useSiteSettings();

  // Media items with before/after sources
  const mediaPairs = settings.homepage.mediaCarousel || [
    {
      id: 1,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&fm=webp" },
      after: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=1200&q=80&fm=webp" },
      aspect: "9/16" as const,
    },
    {
      id: 2,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=1200&q=80&fm=webp" },
      after: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1200&q=80&fm=webp" },
      aspect: "9/16" as const,
    },
    {
      id: 3,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600585154526-990dcea4db0d?w=1200&q=80&fm=webp" },
      after: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600047522568-f1d200d034c4?w=1200&q=80&fm=webp" },
      aspect: "9/16" as const,
    },
    {
      id: 4,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80&fm=webp" },
      after: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&fm=webp" },
      aspect: "9/16" as const,
    },
    {
      id: 5,
      before: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600566752355-35792bedca5d?w=1200&q=80&fm=webp" },
      after: { type: 'image' as const, url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&fm=webp" },
      aspect: "9/16" as const,
    },
  ];

  // Double the items for seamless loop
  const displayPairs = [...mediaPairs, ...mediaPairs, ...mediaPairs];

  return (
    <div className="relative w-full overflow-hidden bg-black pb-12">
      {/* Main Carousel Track */}
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

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-scroll {
          animation: scroll 40s linear infinite;
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

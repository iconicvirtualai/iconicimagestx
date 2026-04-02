import { motion } from "framer-motion";

interface MediaSource {
  type: 'image' | 'video';
  url: string;
}

interface BeforeAfterTileProps {
  media: MediaSource;
  aspect: "16/9" | "9/16";
}

function MediaContent({ media, className }: { media: MediaSource; className?: string }) {
  if (!media) return null;
  if (media.type === 'video') {
    return (
      <video
        src={media.url}
        autoPlay
        loop
        muted
        playsInline
        className={`w-full h-full object-cover ${className || ""}`}
      />
    );
  }
  return (
    <img
      src={media.url}
      alt="Media content"
      className={`w-full h-full object-cover ${className || ""}`}
    />
  );
}

export default function BeforeAfterTile({ media, aspect }: BeforeAfterTileProps) {
  if (!media) return null;
  // Respect the aspect ratio for width, while maintaining a consistent height level
  const widthClass = aspect === "16/9"
    ? "w-[200px] md:w-[400px]"
    : "w-[100px] md:w-[160px]";

  return (
    <div className={`flex-shrink-0 mx-1 md:mx-2 ${widthClass}`}>
      <div
        className="relative w-full h-[160px] md:h-[260px] rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden bg-gray-900 shadow-2xl transition-all duration-500"
      >
        <MediaContent media={media} />
      </div>
    </div>
  );
}

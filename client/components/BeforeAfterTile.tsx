import { motion } from "framer-motion";

interface MediaSource {
  type: 'image' | 'video';
  url: string;
}

interface BeforeAfterTileProps {
  before: MediaSource;
  after: MediaSource;
  aspect: "16/9" | "9/16";
  primaryColor?: string;
}

function MediaContent({ media, className }: { media: MediaSource; className?: string }) {
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

export default function BeforeAfterTile({ before, after, aspect, primaryColor }: BeforeAfterTileProps) {
  // We'll ignore the passed aspect and force a compact vertical card style for the AutoReel look
  return (
    <div className="flex-shrink-0 mx-2 md:mx-3 group">
      <div className="relative w-[140px] h-[200px] md:w-[220px] md:h-[320px] rounded-[32px] md:rounded-[48px] overflow-hidden bg-gray-900 shadow-2xl transition-all duration-500 hover:scale-[1.02]">
        {/* Before Layer (Always visible, but potentially masked) */}
        <div className="absolute inset-0 grayscale brightness-75">
          <MediaContent media={before} />
        </div>

        {/* After Layer (Sliding effect mimicking the screenshot) */}
        <motion.div
          initial={{ width: "50%" }}
          whileHover={{ width: "100%" }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="absolute inset-0 z-10 border-l border-white/30 overflow-hidden"
        >
          <div className="absolute inset-0 w-[140px] h-[200px] md:w-[220px] md:h-[320px]">
            <MediaContent media={after} />
          </div>
        </motion.div>

        {/* Decorative Divider Line */}
        <motion.div
          initial={{ left: "50%" }}
          whileHover={{ left: "100%" }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="absolute inset-y-0 z-20 w-px bg-white/50"
        />
      </div>
    </div>
  );
}

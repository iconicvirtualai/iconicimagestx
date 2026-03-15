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
  const isHorizontal = aspect === "16/9";

  return (
    <div className="flex-shrink-0 mx-3 md:mx-4 group">
      <div className="flex flex-col gap-3">
        {/* Main Side-by-Side Container */}
        <div
          className={`flex gap-1.5 md:gap-2 p-1.5 bg-white border border-gray-100 rounded-[28px] md:rounded-[32px] shadow-xl transition-all duration-500 hover:shadow-2xl hover:scale-[1.01] overflow-hidden ${
            isHorizontal
              ? "w-[320px] h-[100px] md:w-[720px] md:h-[220px]"
              : "w-[160px] h-[160px] md:w-[360px] md:h-[360px]"
          }`}
        >
          {/* Before Column */}
          <div className="relative flex-1 rounded-[22px] md:rounded-[26px] overflow-hidden bg-gray-900 group/before">
            <div className="absolute inset-0 grayscale brightness-75 opacity-90 transition-all duration-500 group-hover/before:grayscale-0 group-hover/before:brightness-100 group-hover/before:opacity-100">
               <MediaContent media={before} />
            </div>
            
            {/* Label Overlay */}
            <div className="absolute top-4 left-4 z-10">
              <div className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">RAW</span>
              </div>
            </div>
          </div>

          {/* After Column */}
          <div className="relative flex-1 rounded-[22px] md:rounded-[26px] overflow-hidden bg-gray-900 group/after">
            <MediaContent media={after} />
            
            {/* Label Overlay */}
            <div className="absolute top-4 right-4 z-10">
              <div 
                className="px-2.5 py-1 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2"
                style={{ backgroundColor: `${primaryColor || '#0d9488'}99` }}
              >
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">ICONIC</span>
                 <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Optional: Subtle comparison line indicator */}
        <div className="h-1 w-full flex gap-1 px-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
           <div className="flex-1 h-full rounded-full bg-gray-100"></div>
           <div className="flex-1 h-full rounded-full" style={{ backgroundColor: primaryColor || '#0d9488' }}></div>
        </div>
      </div>
    </div>
  );
}

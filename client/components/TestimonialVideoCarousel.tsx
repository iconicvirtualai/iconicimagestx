import { Quote } from "lucide-react";

export default function TestimonialVideoCarousel() {
  const testimonials = [
    {
      id: 1,
      name: "Sarah Jenkins",
      role: "Luxury Realtor",
      story: "Closed $2M deal in 48 hours",
      video: "https://videos.pexels.com/video-files/7647241/7647241-sd_640_360_24fps.mp4",
      aspect: "9/16",
    },
    {
      id: 2,
      name: "Marcus Thorne",
      role: "Property Developer",
      story: "100% pre-sold with Iconic video",
      video: "https://videos.pexels.com/video-files/35898045/15226527_640_360_24fps.mp4",
      aspect: "9/16",
    },
    {
      id: 3,
      name: "Elena Rodriguez",
      role: "Media Agency Owner",
      story: "Scaled revenue 3x in 6 months",
      video: "https://videos.pexels.com/video-files/35898043/15226530_640_360_24fps.mp4",
      aspect: "9/16",
    },
    {
      id: 4,
      name: "David Chen",
      role: "Real Estate Broker",
      story: "Dominating the local market",
      video: "https://videos.pexels.com/video-files/34992109/14824805_640_360_30fps.mp4",
      aspect: "9/16",
    },
    {
      id: 5,
      name: "Jessica Wu",
      role: "Home Builder",
      story: "Visual storytelling that sells",
      video: "https://videos.pexels.com/video-files/35898043/15226530_640_360_24fps.mp4",
      aspect: "9/16",
    }
  ];

  // Double the items for seamless loop
  const displayItems = [...testimonials, ...testimonials];

  return (
    <div className="relative w-full overflow-hidden bg-[#fafafa] py-16">
      {/* Background Section Title */}
      <div className="container mx-auto px-4 text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-100 mb-4 shadow-sm">
           <Quote className="w-3 h-3 text-[#0d9488]" />
           <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Success Stories</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-black tracking-tight">
          Join the Elite: <span className="text-[#0d9488]">The Iconic Result</span>
        </h2>
      </div>

      {/* Gradient Mask for edges */}
      <div className="absolute inset-y-0 left-0 w-32 md:w-64 bg-gradient-to-r from-[#fafafa] via-[#fafafa]/80 to-transparent z-[35] pointer-events-none"></div>
      <div className="absolute inset-y-0 right-0 w-32 md:w-64 bg-gradient-to-l from-[#fafafa] via-[#fafafa]/80 to-transparent z-[35] pointer-events-none"></div>

      {/* Carousel Track */}
      <div className="relative">
        <div className="flex animate-scroll-slow whitespace-nowrap py-4">
          {displayItems.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="flex-shrink-0 mx-3 md:mx-4 w-[200px] h-[356px] md:w-[260px] md:h-[462px] rounded-[24px] md:rounded-[32px] overflow-hidden shadow-2xl relative group bg-black border-4 border-white"
            >
              <video
                src={item.video}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
              />
              
              {/* Overlay Content */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-5 md:p-8">
                <div className="bg-[#0d9488] w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
                   <Quote className="w-4 h-4 md:w-5 md:h-5 text-white fill-white" />
                </div>
                <h3 className="text-white font-bold text-lg md:text-xl mb-1 truncate">{item.name}</h3>
                <p className="text-teal-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2">{item.role}</p>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 px-3 py-2 rounded-xl">
                   <p className="text-white text-[11px] md:text-[13px] font-medium leading-tight whitespace-normal italic">
                     "{item.story}"
                   </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll-slow {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll-slow {
          animation: scroll-slow 40s linear infinite;
        }
        .animate-scroll-slow:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

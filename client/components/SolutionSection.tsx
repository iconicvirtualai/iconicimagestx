import { Play } from "lucide-react";

export default function SolutionSection() {
  return (
    <section className="bg-white py-24 md:py-32">
      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
          <span className="text-[12px] font-bold tracking-wider text-[#0f766e] uppercase">
            Built for Creative Excellence
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          Your All-in-One <span className="text-[#0d9488]">Solution</span> for <br className="hidden md:block" />
          High-Impact Media Content
        </h2>

        {/* Description */}
        <p className="text-lg md:text-xl text-gray-500 mb-16 max-w-3xl mx-auto leading-relaxed">
          Transform your raw ideas into <strong>engaging cinematic media</strong> in minutes. 
          Whether you're a high-growth startup serving multiple clients or an established 
          enterprise, Iconic helps you create <strong>professional-grade visual content</strong> seamlessly.
        </p>

        {/* Media Placeholder */}
        <div className="relative max-w-5xl mx-auto rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-teal-100/50 border-[8px] border-[#f0fdfa] aspect-video group cursor-pointer">
          <img 
            src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1600&q=80" 
            alt="Iconic Images Production Example"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          
          {/* Play Button Overlay */}
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity group-hover:bg-black/30">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 transition-transform group-hover:scale-110">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center shadow-xl">
                <Play className="w-8 h-8 md:w-10 md:h-10 text-[#0d9488] fill-[#0d9488] translate-x-1" />
              </div>
            </div>
          </div>

          {/* Bottom Branding Bar (Mimicking the logo in the screenshot) */}
          <div className="absolute bottom-6 left-6 right-6 md:bottom-10 md:left-10 md:right-10 flex items-center justify-between">
             <div className="bg-white/10 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/20 flex items-center gap-3">
                <div className="w-8 h-8 bg-[#0d9488] rounded-lg flex items-center justify-center text-white">
                  <Play className="w-4 h-4 fill-white translate-x-0.5" />
                </div>
                <span className="text-white font-bold tracking-tight">Iconic Media</span>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}

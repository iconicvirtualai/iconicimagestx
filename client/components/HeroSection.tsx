import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pt-12 pb-6">
      {/* Background Grid & Layered Glows */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Subtle Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(#0f766e 0.5px, transparent 0.5px)`,
            backgroundSize: '32px 32px'
          }}
        ></div>

        {/* Layered Interactive-feeling Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full">
          <div className="absolute top-[-15%] left-[-20%] w-[60%] h-[60%] bg-[#ccfbf1] rounded-full blur-[140px] opacity-40 animate-pulse-slow"></div>
          <div className="absolute top-[-10%] right-[-15%] w-[55%] h-[55%] bg-[#ecfeff] rounded-full blur-[120px] opacity-30 animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-[10%] left-[15%] w-[40%] h-[40%] bg-[#f0fdfa] rounded-full blur-[100px] opacity-20 animate-pulse-slow" style={{ animationDelay: '4s' }}></div>
        </div>

        {/* Very subtle linear gradient for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white"></div>

        {/* Subtle Noise Texture Overlay */}
        <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay" style={{ backgroundImage: `url("https://www.transparenttextures.com/patterns/carbon-fibre.png")` }}></div>
      </div>

      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="text-[12px] font-bold tracking-wider text-[#0f766e] uppercase">
            #1 Media Partner for Growing Brands
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 leading-[1.1] tracking-tight text-black max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
          Create Stunning Brand Media{" "}
          <span className="text-[#0d9488]">Instantly</span> with Iconic
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-gray-500 mb-6 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-900">
          Transforming your vision into high-impact media content. Join the top
          brands leveraging strategic visual storytelling to dominate their market.
        </p>

        {/* Main CTA */}
        <div className="mb-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Link to="/book">
            <Button className="bg-[#0f766e] text-white hover:bg-[#0d9488] font-bold text-lg px-12 py-7 rounded-xl shadow-lg shadow-teal-100 transition-all hover:scale-105">
              Book a Consultation
            </Button>
          </Link>
        </div>

        {/* Social Proof */}
        <div className="flex flex-col items-center gap-4 mb-4 animate-in fade-in slide-in-from-bottom-10 duration-1100">
          <div className="flex -space-x-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-gray-200"
              >
                <img
                  src={`https://i.pravatar.cc/150?u=${i}`}
                  alt="User avatar"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <Star className="w-5 h-5 fill-[#22c55e] text-[#22c55e]" />
              <span className="font-bold text-lg ml-1">4.9</span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-5 h-5 bg-[#22c55e] rounded-[2px] flex items-center justify-center">
                  <Star className="w-3 h-3 text-white fill-white" />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

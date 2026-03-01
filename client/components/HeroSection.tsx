import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function HeroSection() {
  const settings = useSiteSettings();

  return (
    <section className="relative overflow-hidden bg-white pt-32 pb-6">
      {/* Background Grid & Layered Glows */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Hero Background Image if provided in customizer */}
        {settings.homepage.heroImage && (
          <div className="absolute inset-0 opacity-[0.03] grayscale mix-blend-multiply">
            <img src={settings.homepage.heroImage} className="w-full h-full object-cover" alt="" />
          </div>
        )}

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
          <span className="text-[12px] font-bold tracking-wider uppercase" style={{ color: settings.global.primaryColor }}>
            ICONIC® #1 Media Partner for Growing Brands
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 leading-[1.1] tracking-tight text-black max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 whitespace-pre-line">
          We Turn <span style={{ color: settings.global.primaryColor }}>Ordinary</span> Into Iconic.
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-gray-500 mb-8 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-900">
          Scroll-stopping visuals. Smart marketing. Media that moves.
        </p>

        {/* Main CTA */}
        <div className="flex flex-col items-center gap-4 mb-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Link to="/book">
            <Button className="text-white font-bold text-lg px-12 py-7 rounded-xl shadow-lg shadow-teal-100 transition-all hover:scale-105" style={{ backgroundColor: settings.global.primaryColor }}>
              Let’s Make It Iconic
            </Button>
          </Link>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" className="rounded-xl px-6 py-6 border-2 font-semibold hover:bg-gray-50 transition-all active:scale-95">
              I'm in Real Estate
            </Button>
            <Button variant="outline" className="rounded-xl px-6 py-6 border-2 font-semibold hover:bg-gray-50 transition-all active:scale-95">
              I Own a Business
            </Button>
          </div>
        </div>

        {/* Social Proof */}
        <div className="flex flex-col items-center gap-3 mb-4 animate-in fade-in slide-in-from-bottom-10 duration-1100">
          <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-5 h-5 fill-[#22c55e] text-[#22c55e]" />
                ))}
              </div>
              <span className="font-bold text-lg ml-1">4.9</span>
            </div>
          </div>
          <p className="text-gray-500 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
            ⭐ 4.9 on Google
            <br />
            Loved by agents, founders, and brands who refuse to blend in.
          </p>
        </div>

      </div>
    </section>
  );
}

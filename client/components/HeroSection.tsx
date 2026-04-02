import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const CAPABILITIES = [
  "Cinematic Filmmakers",
  "Social Architects",
  "REEL Producers",
  "Your Private Editing Studio",
  "Content Managers",
  "Personal Production Team"
];

export default function HeroSection() {
  const settings = useSiteSettings();
  const [capabilityIndex, setCapabilityIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCapabilityIndex((prev) => (prev + 1) % CAPABILITIES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden bg-black py-20">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F6529795874414a1e9fe845f3eb948e94?format=webp&width=1600&height=900"
          alt="Luxury Real Estate Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Left Column: Text Content */}
          <div className="w-full lg:w-1/2 text-left">
            {/* Headline */}
            <div className="mb-6 animate-in fade-in slide-in-from-left-4 duration-700">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2 uppercase opacity-90">
                Your Brand, Made
              </h2>
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-black leading-none tracking-tighter text-white uppercase drop-shadow-2xl">
                ICONIC
              </h1>
            </div>

            {/* Subheadline from Screenshot */}
            <p className="text-lg md:text-xl text-gray-200 mb-6 max-w-xl leading-relaxed animate-in fade-in slide-in-from-left-6 duration-900 font-medium drop-shadow-lg">
              Media Production. Virtual Staging. Content Management.<br />
              <span className="font-bold">ICONIC</span> is the dedicated creative crew for businesses and agents who demand more than "good enough".
            </p>

            {/* Auto-scrolling Capabilities */}
            <div className="flex items-center gap-2 mb-10 h-8 animate-in fade-in slide-in-from-left-8 duration-1000">
              <span className="text-sm font-black uppercase tracking-widest text-teal-400">We Are:</span>
              <div className="relative overflow-hidden h-full flex-1">
                {CAPABILITIES.map((capability, index) => (
                  <span
                    key={capability}
                    className={`absolute inset-0 text-sm font-bold uppercase tracking-wider text-white transition-all duration-700 transform ${
                      index === capabilityIndex
                        ? "translate-y-0 opacity-100"
                        : "translate-y-full opacity-0"
                    }`}
                  >
                    [ {capability} ]
                  </span>
                ))}
              </div>
            </div>

            {/* CTA Buttons from Screenshot */}
            <div className="flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1100">
              <Link to="/book?type=real-estate">
                <Button className="bg-white text-black hover:bg-gray-100 font-bold text-sm px-8 py-6 rounded-full transition-all hover:scale-105 border-none shadow-xl">
                  I'm in Real Estate
                </Button>
              </Link>
              <Link to="/book?type=business">
                <Button className="bg-white text-black hover:bg-gray-100 font-bold text-sm px-8 py-6 rounded-full transition-all hover:scale-105 border-none shadow-xl">
                  I own a Business
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Device Mockups */}
          <div className="w-full lg:w-1/2 relative h-[400px] md:h-[500px] hidden lg:block animate-in fade-in slide-in-from-right-8 duration-1000">
            {/* Monitor Mockup */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/4 -translate-y-1/2 w-[450px] aspect-[16/10] bg-gray-900 rounded-lg border-[10px] border-gray-800 shadow-2xl overflow-hidden z-10">
              <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
                <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80" className="w-full h-full object-cover opacity-80" alt="Screen content" />
                <div className="absolute inset-0 bg-teal-500/10 mix-blend-overlay"></div>
              </div>
              {/* Stand */}
              <div className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-800 rounded-b-lg"></div>
            </div>

            {/* Tablet Mockup */}
            <div className="absolute bottom-10 right-0 w-[200px] aspect-[3/4] bg-gray-900 rounded-[2rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden z-20 transform -rotate-3">
               <img src="https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=300&q=80" className="w-full h-full object-cover opacity-80" alt="Tablet content" />
               <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-gray-700"></div>
            </div>

            {/* Phone Mockup */}
            <div className="absolute bottom-20 left-1/4 w-[100px] aspect-[9/19] bg-gray-900 rounded-[1.5rem] border-[6px] border-gray-800 shadow-2xl overflow-hidden z-30 transform rotate-6 translate-x-10">
               <img src="https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=200&q=80" className="w-full h-full object-cover opacity-80" alt="Phone content" />
               <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-3 bg-gray-800 rounded-b-md"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
